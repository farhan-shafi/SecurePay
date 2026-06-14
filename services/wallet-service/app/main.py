"""Wallet service: create a wallet, check balance, deposit (mock), statement,
and manage saved beneficiaries (payees)."""

from datetime import datetime, timezone

from fastapi import Body, Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.schemas import (
    AddBeneficiaryRequest,
    BeneficiaryOut,
    CreateWalletRequest,
    DepositRequest,
    StatementEntry,
    WalletOut,
)
from shared.database import get_db
from shared.models import Beneficiary, Transaction, User, Wallet
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
    payload: CreateWalletRequest | None = Body(default=None),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    existing = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Wallet already exists"
        )
    # Body is optional (an empty POST defaults to USD); the schema validates the
    # currency against the allowed set.
    currency = (payload or CreateWalletRequest()).currency
    wallet = Wallet(user_id=user_id, currency=currency)
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
        # The amount is always shown in THIS wallet's currency: when we received
        # a cross-currency transfer, that's `recipient_amount` (what we were
        # credited); otherwise it's `amount` (what we sent or deposited).
        if tx.recipient_wallet_id == wallet.id and tx.recipient_amount is not None:
            shown_amount = tx.recipient_amount
        else:
            shown_amount = tx.amount
        entries.append(
            StatementEntry(
                id=tx.id,
                transaction_type=tx.transaction_type,
                amount=shown_amount,
                direction="credit" if received else "debit",
                status=tx.status,
                description=tx.description,
                created_at=tx.created_at,
            )
        )
    return entries


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
