"""Transaction service: peer-to-peer transfers.

The transfer runs inside a single database transaction with both wallet rows
locked, so the debit and credit either both happen or neither does.
"""

import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import BillerOut, BillRequest, P2PRequest, QuoteOut, TransactionOut
from shared import fx
from shared.config import settings
from shared.database import SessionLocal, get_db
from shared.models import Biller, Transaction, Wallet
from shared.outbox import drain_outbox, record_event
from shared.security import get_current_user_id

# A short-lived client for the synchronous call to the fraud service. The whole
# transfer is a sync request, so we use httpx's sync client here.
_fraud_client = httpx.Client(timeout=2.0)

OUTBOX_DRAIN_INTERVAL_SECONDS = 10
_drainer_stop = threading.Event()


def _outbox_drainer() -> None:
    """Background safety net: retries any outbox events whose immediate publish
    failed (e.g. the broker was briefly down), every few seconds, forever."""
    while not _drainer_stop.wait(OUTBOX_DRAIN_INTERVAL_SECONDS):
        try:
            with SessionLocal() as db:
                drain_outbox(db)
        except Exception:  # noqa: BLE001 - the drainer must never die
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    thread = threading.Thread(target=_outbox_drainer, daemon=True, name="outbox-drainer")
    thread.start()
    yield
    _drainer_stop.set()


app = FastAPI(title="SecurePay Transaction Service", lifespan=lifespan)


def _fraud_check(sender_wallet_id: int, amount: Decimal, recipient_wallet_id: int) -> None:
    """Ask the fraud service to screen this transfer; raise 403 if it blocks.

    Fail-open: if the fraud service is unreachable or errors, we let the
    transfer proceed rather than halting all payments during a fraud outage.
    That's the right availability tradeoff for this MVP; a production system
    might fail closed for large amounts.
    """
    try:
        resp = _fraud_client.post(
            f"{settings.fraud_service_url}/analyze",
            json={
                "wallet_id": sender_wallet_id,
                "amount": str(amount),
                "recipient_wallet_id": recipient_wallet_id,
            },
        )
        resp.raise_for_status()
        verdict = resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError):
        return  # fail open

    if verdict.get("recommended_action") == "block":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Transfer blocked by fraud screening",
                "fraud_score": verdict.get("fraud_score"),
                "risk_level": verdict.get("risk_level"),
                "signals": verdict.get("signals_detected", []),
            },
        )


def _convert_for_transfer(amount, sender_currency: str, recipient_currency: str):
    """Return (recipient_amount, rate) for a transfer, converting if currencies
    differ. Raises 503 if a cross-currency rate can't be fetched — we never move
    money at the wrong value."""
    if sender_currency == recipient_currency:
        return amount, Decimal("1")
    try:
        return fx.convert(amount, sender_currency, recipient_currency)
    except fx.RateUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Exchange rate unavailable right now. Please try again shortly.",
        )


@app.get("/health")
def health():
    return {"status": "ok", "service": "transaction-service"}


@app.get("/quote", response_model=QuoteOut)
def quote(
    recipient_wallet_id: int = Query(...),
    amount: Decimal = Query(..., gt=0),
    sender_wallet_id: int | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Preview a transfer: how much the recipient receives in their currency.
    Lets the app show the conversion before the user commits to sending."""
    sender = _sender_wallet(db, user_id, sender_wallet_id)
    recipient = db.get(Wallet, recipient_wallet_id)
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recipient wallet not found"
        )
    amount = amount.quantize(Decimal("0.01"))
    recipient_amount, rate = _convert_for_transfer(
        amount, sender.currency, recipient.currency
    )
    return QuoteOut(
        amount=amount,
        currency=sender.currency,
        recipient_amount=recipient_amount,
        recipient_currency=recipient.currency,
        exchange_rate=rate,
        same_currency=sender.currency == recipient.currency,
    )


def _sender_wallet(db: Session, user_id: int, wallet_id: int | None) -> Wallet:
    """The wallet the user pays from: a specific one (ownership enforced) or
    their primary (oldest)."""
    query = select(Wallet).where(Wallet.user_id == user_id)
    if wallet_id is not None:
        query = query.where(Wallet.id == wallet_id)
    wallet = db.scalars(query.order_by(Wallet.id)).first()
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sender has no wallet"
        )
    return wallet


def _do_transfer(
    db: Session,
    user_id: int,
    recipient_wallet_id: int,
    amount: Decimal,
    description: str | None,
    idempotency_key: str | None,
    transaction_type: str = "p2p",
    sender_wallet_id: int | None = None,
) -> Transaction:
    """The one money-movement path. P2P transfers and bill payments both run
    through here, so locking, FX, fraud screening, idempotency and the outbox
    event work identically for both."""
    # 1. Idempotency: if we've already processed this key, return the original
    #    transaction instead of creating a second transfer.
    if idempotency_key:
        existing = db.scalar(
            select(Transaction).where(
                Transaction.idempotency_key == idempotency_key
            )
        )
        if existing:
            return existing

    sender = _sender_wallet(db, user_id, sender_wallet_id)

    recipient = db.get(Wallet, recipient_wallet_id)
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recipient wallet not found"
        )
    if recipient.id == sender.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer to your own wallet",
        )

    # 2. Screen the transfer for fraud *before* we take any row locks. The
    #    fraud service writes a fraud_logs row keyed to this wallet, and that
    #    INSERT's foreign-key check needs a lock on the same wallet row. If we
    #    held a FOR UPDATE lock here, that INSERT would block until our httpx
    #    timeout fired (fail-open) and the block would never take effect. A
    #    blocked transfer raises 403 here and never debits the sender.
    _fraud_check(sender.id, amount, recipient.id)

    # 2b. Work out the conversion BEFORE taking locks, so we never hold row
    #     locks during the (possibly slow) exchange-rate fetch. The recipient is
    #     credited in their own currency; same-currency transfers use rate 1.
    recipient_amount, rate = _convert_for_transfer(
        amount, sender.currency, recipient.currency
    )

    # 3. Lock both wallet rows. We lock in a deterministic order (lowest id
    #    first) so two opposite transfers can never deadlock each other.
    first_id, second_id = sorted((sender.id, recipient.id))
    locked = {
        w.id: w
        for w in db.scalars(
            select(Wallet)
            .where(Wallet.id.in_((first_id, second_id)))
            .order_by(Wallet.id)
            .with_for_update()
        ).all()
    }
    sender = locked[sender.id]
    recipient = locked[recipient.id]

    # 4. Re-check funds now that we hold the lock (balance may have changed).
    if sender.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient funds"
        )

    # 5. Move the money and record it, all in one commit. The sender is debited
    #    in their currency; the recipient is credited the converted amount.
    sender.balance -= amount
    recipient.balance += recipient_amount
    tx = Transaction(
        wallet_id=sender.id,
        transaction_type=transaction_type,
        amount=amount,
        recipient_wallet_id=recipient.id,
        recipient_amount=recipient_amount,
        exchange_rate=rate,
        status="completed",
        description=description,
        idempotency_key=idempotency_key,
        completed_at=datetime.now(timezone.utc),
    )
    # Capture the ids before commit; afterwards the ORM objects are expired and
    # reading them would trigger a reload.
    sender_id, recipient_id = sender.id, recipient.id
    db.add(tx)
    db.flush()  # assign tx.id so the event row can reference it

    # 6. Announce the completed transfer via the OUTBOX: the event is a row in
    #    the SAME transaction as the transfer, so it can never be lost — if the
    #    broker is down, the drainer retries until it gets through.
    record_event(
        db,
        "transaction.completed",
        {
            "transaction_id": tx.id,
            "sender_wallet_id": sender_id,
            "recipient_wallet_id": recipient_id,
            "amount": str(amount),  # what the sender paid (sender currency)
            "recipient_amount": str(recipient_amount),  # what the recipient got
        },
    )
    db.commit()
    db.refresh(tx)

    # Happy path: deliver immediately (failures just wait for the timer).
    try:
        drain_outbox(db)
    except Exception:  # noqa: BLE001 - delivery must never fail the transfer
        pass
    return tx


@app.post("/p2p", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def transfer(
    payload: P2PRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return _do_transfer(
        db,
        user_id,
        payload.recipient_wallet_id,
        payload.amount,
        payload.description,
        payload.idempotency_key,
        sender_wallet_id=payload.sender_wallet_id,
    )


@app.get("/billers", response_model=list[BillerOut])
def billers(db: Session = Depends(get_db)):
    """The bill payees a user can pay (seeded system wallets)."""
    rows = db.scalars(select(Biller).order_by(Biller.id)).all()
    return [
        BillerOut(id=b.id, name=b.name, category=b.category, currency=b.wallet.currency)
        for b in rows
    ]


@app.post("/bill", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def pay_bill(
    payload: BillRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Pay a bill: exactly a transfer into the biller's wallet, with the bill's
    reference number recorded on the transaction."""
    biller = db.get(Biller, payload.biller_id)
    if biller is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biller not found")
    return _do_transfer(
        db,
        user_id,
        biller.wallet_id,
        payload.amount,
        f"{biller.name} · ref {payload.reference}",
        payload.idempotency_key,
        transaction_type="bill",
        sender_wallet_id=payload.sender_wallet_id,
    )
