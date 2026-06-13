"""Fraud service: rule-based, real-time transfer screening.

The transaction service calls POST /analyze *before* it moves any money. We
score the proposed transfer against a few simple rules that read the shared
database (transaction history for the sender), decide a risk level, and write a
fraud_logs row when anything fires. This is the rule-based first pass; the
architecture doc layers an ML model on top of the same score later.

This service is internal: it is called service-to-service inside the Docker
network and is not routed through the public API gateway.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import Depends, FastAPI, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.schemas import AnalyzeRequest, AnalyzeResponse, FraudLogOut
from shared.config import settings
from shared.database import get_db, init_db
from shared.models import FraudLog, Transaction

# Each rule that fires adds its score. Keeping the numbers here (rather than
# scattered through the code) makes the policy easy to read and tune.
VELOCITY_WINDOW = timedelta(minutes=5)
VELOCITY_MAX_TXNS = 5  # more than this many in the window is suspicious
VELOCITY_SCORE = 30

AMOUNT_ANOMALY_MULTIPLE = 2  # amount above this * the wallet's average
AMOUNT_ANOMALY_SCORE = 25

NEW_RECIPIENT_MIN_AMOUNT = Decimal("500.00")  # large first-time payment
NEW_RECIPIENT_SCORE = 20


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SecurePay Fraud Service", lifespan=lifespan)


def _risk_level(score: float) -> str:
    if score >= 85:
        return "critical"
    if score >= settings.fraud_block_threshold:  # 60 by default
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def _action(score: float) -> str:
    # At or above the block threshold we stop the transfer; medium scores are
    # allowed through but recorded for review; low scores are auto-approved.
    if score >= settings.fraud_block_threshold:
        return "block"
    if score >= 30:
        return "review"
    return "approve"


def _score_transfer(db: Session, req: AnalyzeRequest) -> tuple[float, list[str]]:
    """Run the rules and return (total_score, signals_that_fired)."""
    score = 0.0
    signals: list[str] = []

    # We screen against outgoing transfers only (transaction_type == "p2p"), not
    # deposits/top-ups, which would otherwise skew the average and velocity.
    cutoff = datetime.now(timezone.utc) - VELOCITY_WINDOW

    # Rule 1 — velocity: too many transfers from this wallet in a short window.
    recent = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.wallet_id == req.wallet_id,
            Transaction.transaction_type == "p2p",
            Transaction.created_at >= cutoff,
        )
    )
    if recent and recent > VELOCITY_MAX_TXNS:
        score += VELOCITY_SCORE
        signals.append("high_velocity")

    # Rule 2 — amount anomaly: much larger than this wallet's typical transfer.
    avg_amount = db.scalar(
        select(func.avg(Transaction.amount)).where(
            Transaction.wallet_id == req.wallet_id,
            Transaction.transaction_type == "p2p",
        )
    )
    if avg_amount is not None and req.amount > avg_amount * AMOUNT_ANOMALY_MULTIPLE:
        score += AMOUNT_ANOMALY_SCORE
        signals.append("unusual_amount")

    # Rule 3 — large payment to a never-seen recipient.
    seen_before = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.wallet_id == req.wallet_id,
            Transaction.recipient_wallet_id == req.recipient_wallet_id,
        )
    )
    if not seen_before and req.amount >= NEW_RECIPIENT_MIN_AMOUNT:
        score += NEW_RECIPIENT_SCORE
        signals.append("new_large_recipient")

    return score, signals


@app.get("/health")
def health():
    return {"status": "ok", "service": "fraud-service"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
    score, signals = _score_transfer(db, req)
    risk_level = _risk_level(score)
    action = _action(score)

    # Record anything noteworthy. A clean transfer (no signals) isn't logged.
    if signals:
        db.add(
            FraudLog(
                transaction_id=None,  # transfer isn't committed yet
                wallet_id=req.wallet_id,
                fraud_score=Decimal(str(score)),
                risk_level=risk_level,
                detected_signals=signals,
                action_taken=action,
            )
        )
        db.commit()

    return AnalyzeResponse(
        fraud_score=score,
        risk_level=risk_level,
        signals_detected=signals,
        recommended_action=action,
    )


@app.get("/logs", response_model=list[FraudLogOut])
def logs(
    wallet_id: int | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
):
    """Recent fraud logs, newest first — handy for inspecting what fired."""
    query = select(FraudLog).order_by(FraudLog.created_at.desc()).limit(limit)
    if wallet_id is not None:
        query = query.where(FraudLog.wallet_id == wallet_id)
    return db.scalars(query).all()
