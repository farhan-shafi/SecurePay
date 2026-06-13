"""Wallet service: create a wallet, check balance, deposit (mock), statement."""

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.schemas import DepositRequest, StatementEntry, WalletOut
from shared.database import get_db
from shared.models import Transaction, Wallet
from shared.security import get_current_user_id

app = FastAPI(title="SecurePay Wallet Service")


def _require_wallet(db: Session, user_id: int, *, lock: bool = False) -> Wallet:
    query = select(Wallet).where(Wallet.user_id == user_id)
    if lock:
        # SELECT ... FOR UPDATE: lock the row so concurrent deposits/transfers
        # can't read a stale balance and overwrite each other.
        query = query.with_for_update()
    wallet = db.scalar(query)
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
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    existing = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Wallet already exists"
        )
    wallet = Wallet(user_id=user_id)
    db.add(wallet)
    db.commit()
    db.refresh(wallet)
    return wallet


@app.get("/me", response_model=WalletOut)
def my_wallet(
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    return _require_wallet(db, user_id)


@app.post("/me/deposit", response_model=WalletOut)
def deposit(
    payload: DepositRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    wallet = _require_wallet(db, user_id, lock=True)
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
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    wallet = _require_wallet(db, user_id)
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
        # Money is a credit (incoming) if it landed in this wallet: either a
        # top-up/deposit, or a transfer where we're the recipient. Anything else
        # recorded against our own wallet_id (e.g. a p2p we sent) is a debit.
        received = tx.recipient_wallet_id == wallet.id or tx.transaction_type == "deposit"
        entries.append(
            StatementEntry(
                id=tx.id,
                transaction_type=tx.transaction_type,
                amount=tx.amount,
                direction="credit" if received else "debit",
                status=tx.status,
                description=tx.description,
                created_at=tx.created_at,
            )
        )
    return entries
