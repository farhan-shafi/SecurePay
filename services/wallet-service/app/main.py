"""Wallet service: create a wallet, check balance, deposit (mock), statement,
and manage saved beneficiaries (payees)."""

from datetime import datetime, timezone

from fastapi import Body, Depends, FastAPI, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.schemas import (
    AddBeneficiaryRequest,
    BeneficiaryOut,
    CreateWalletRequest,
    DepositRequest,
    LookupOut,
    StatementEntry,
    WalletOut,
)
from shared.database import get_db
from shared.models import Beneficiary, Transaction, User, Wallet
from shared.security import get_current_user_id

app = FastAPI(title="SecurePay Wallet Service")


def _require_wallet(
    db: Session, user_id: int, wallet_id: int | None = None, *, lock: bool = False
) -> Wallet:
    """The user's wallet: a specific one (ownership enforced) when `wallet_id`
    is given, otherwise their primary (oldest) wallet."""
    query = select(Wallet).where(Wallet.user_id == user_id)
    if wallet_id is not None:
        query = query.where(Wallet.id == wallet_id)
    query = query.order_by(Wallet.id)
    if lock:
        # SELECT ... FOR UPDATE: lock the row so concurrent deposits/transfers
        # can't read a stale balance and overwrite each other.
        query = query.with_for_update()
    wallet = db.scalars(query).first()
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No wallet for this user. Create one first.",
        )
    return wallet


@app.get("/health")
def health():
    return {"status": "ok", "service": "wallet-service"}


@app.post("/create", response_model=WalletOut, status_code=status.HTTP_201_CREATED)
def create_wallet(
    payload: CreateWalletRequest | None = Body(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # Gate: a wallet can only be opened once the user's email is verified.
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.kyc_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before creating a wallet.",
        )

    # Body is optional (an empty POST defaults to USD); the schema validates the
    # currency against the allowed set. One wallet per currency per user.
    currency = (payload or CreateWalletRequest()).currency
    existing = db.scalar(
        select(Wallet).where(Wallet.user_id == user_id, Wallet.currency == currency)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a {currency} wallet",
        )
    wallet = Wallet(user_id=user_id, currency=currency)
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return wallet


@app.get("/mine", response_model=list[WalletOut])
def my_wallets(
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    """All of the user's wallets (one per currency), oldest first."""
    return db.scalars(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.id)
    ).all()


@app.get("/me", response_model=WalletOut)
def my_wallet(
    wallet_id: int | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return _require_wallet(db, user_id, wallet_id)


@app.post("/me/deposit", response_model=WalletOut)
def deposit(
    payload: DepositRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    wallet = _require_wallet(db, user_id, payload.wallet_id, lock=True)
    wallet.balance += payload.amount
    db.add(
        Transaction(
            wallet_id=wallet.id,
            transaction_type="deposit",
            amount=payload.amount,
            status="completed",
            description="Mock deposit",
            completed_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(wallet)
    return wallet


@app.get("/me/statement", response_model=list[StatementEntry])
def statement(
    wallet_id: int | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    wallet = _require_wallet(db, user_id, wallet_id)
    rows = db.scalars(
        select(Transaction)
        .where(
            or_(
                Transaction.wallet_id == wallet.id,
                Transaction.recipient_wallet_id == wallet.id,
            )
        )
        .order_by(Transaction.created_at.desc())
    ).all()

    entries: list[StatementEntry] = []
    for tx in rows:
        is_deposit = tx.transaction_type == "deposit"
        # Money is a credit (incoming) if it landed in this wallet: either a
        # top-up/deposit, or a transfer where we're the recipient. Anything else
        # recorded against our own wallet_id (e.g. a p2p we sent) is a debit.
        received = tx.recipient_wallet_id == wallet.id or is_deposit
        # The amount is always shown in THIS wallet's currency: when we received
        # a cross-currency transfer, that's `recipient_amount` (what we were
        # credited); otherwise it's `amount` (what we sent or deposited).
        if tx.recipient_wallet_id == wallet.id and tx.recipient_amount is not None:
            shown_amount = tx.recipient_amount
        else:
            shown_amount = tx.amount

        counterparty_name = None
        counterparty_wallet_id = None
        from_amount = from_currency = to_amount = to_currency = None
        if not is_deposit:
            sender_wallet = db.get(Wallet, tx.wallet_id)
            recipient_wallet = (
                db.get(Wallet, tx.recipient_wallet_id)
                if tx.recipient_wallet_id
                else None
            )
            # The "other" party is whichever wallet isn't ours.
            other = recipient_wallet if tx.wallet_id == wallet.id else sender_wallet
            if other is not None:
                counterparty_wallet_id = other.id
                owner = db.get(User, other.user_id)
                counterparty_name = (
                    f"{owner.first_name} {owner.last_name}" if owner else None
                )
            from_amount = tx.amount
            from_currency = sender_wallet.currency if sender_wallet else None
            to_amount = tx.recipient_amount if tx.recipient_amount is not None else tx.amount
            to_currency = recipient_wallet.currency if recipient_wallet else from_currency

        entries.append(
            StatementEntry(
                id=tx.id,
                transaction_type=tx.transaction_type,
                amount=shown_amount,
                currency=wallet.currency,
                direction="credit" if received else "debit",
                status=tx.status,
                description=tx.description,
                created_at=tx.created_at,
                completed_at=tx.completed_at,
                counterparty_name=counterparty_name,
                counterparty_wallet_id=counterparty_wallet_id,
                from_amount=from_amount,
                from_currency=from_currency,
                to_amount=to_amount,
                to_currency=to_currency,
                exchange_rate=tx.exchange_rate,
            )
        )
    return entries


# --- Look up a person (before saving them or sending) ----------------------

@app.get("/lookup", response_model=LookupOut)
def lookup(
    email: str | None = Query(default=None),
    wallet_id: int | None = Query(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Resolve someone by email or wallet id to their name + wallet currency, so
    the app can show who they are before the user adds them or sends money."""
    if email:
        owner = db.scalar(select(User).where(User.email == email.strip().lower()))
        if owner is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account with that email.",
            )
        # With multiple wallets, resolve to their primary (oldest) one.
        wallet = db.scalars(
            select(Wallet).where(Wallet.user_id == owner.id).order_by(Wallet.id)
        ).first()
        if wallet is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="That person hasn't created a wallet yet.",
            )
    elif wallet_id is not None:
        wallet = db.get(Wallet, wallet_id)
        if wallet is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No wallet with that id.",
            )
        owner = db.get(User, wallet.user_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide an email or a wallet id.",
        )

    if wallet.user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That's your own account.",
        )

    return LookupOut(
        wallet_id=wallet.id,
        name=f"{owner.first_name} {owner.last_name}" if owner else "Unknown",
        currency=wallet.currency,
    )


# --- Beneficiaries (saved payees) ------------------------------------------

def _beneficiary_out(db: Session, ben: Beneficiary) -> BeneficiaryOut:
    """Expand a beneficiary row with the payee's real name + wallet currency."""
    wallet = db.get(Wallet, ben.wallet_id)
    owner = db.get(User, wallet.user_id) if wallet else None
    name = f"{owner.first_name} {owner.last_name}" if owner else "Unknown"
    return BeneficiaryOut(
        id=ben.id,
        wallet_id=ben.wallet_id,
        name=name,
        nickname=ben.nickname,
        currency=wallet.currency if wallet else "USD",
        created_at=ben.created_at,
    )


@app.get("/me/beneficiaries", response_model=list[BeneficiaryOut])
def list_beneficiaries(
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    rows = db.scalars(
        select(Beneficiary)
        .where(Beneficiary.owner_user_id == user_id)
        .order_by(Beneficiary.created_at.desc())
    ).all()
    return [_beneficiary_out(db, b) for b in rows]


@app.post(
    "/me/beneficiaries",
    response_model=BeneficiaryOut,
    status_code=status.HTTP_201_CREATED,
)
def add_beneficiary(
    payload: AddBeneficiaryRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    target = db.get(Wallet, payload.wallet_id)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No wallet with that id. Check the number and try again.",
        )
    own = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if own and target.id == own.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't add your own wallet as a beneficiary.",
        )
    duplicate = db.scalar(
        select(Beneficiary).where(
            Beneficiary.owner_user_id == user_id,
            Beneficiary.wallet_id == payload.wallet_id,
        )
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That payee is already in your beneficiaries.",
        )
    ben = Beneficiary(
        owner_user_id=user_id,
        wallet_id=payload.wallet_id,
        nickname=payload.nickname,
    )
    db.add(ben)
    db.commit()
    db.refresh(ben)
    return _beneficiary_out(db, ben)


@app.delete("/me/beneficiaries/{beneficiary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_beneficiary(
    beneficiary_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    ben = db.get(Beneficiary, beneficiary_id)
    if ben is None or ben.owner_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Beneficiary not found"
        )
    db.delete(ben)
    db.commit()
