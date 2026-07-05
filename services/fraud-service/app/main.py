"""Fraud service: rule-based, real-time transfer screening.

The transaction service calls POST /analyze *before* it moves any money. We
score the proposed transfer against a few simple rules that read the shared
database (transaction history for the sender), decide a risk level, and write a
fraud_logs row when anything fires. This is the rule-based first pass; the
architecture doc layers an ML model on top of the same score later.

This service is internal: it is called service-to-service inside the Docker
network and is not routed through the public API gateway.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import Depends, FastAPI, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.schemas import AnalyzeRequest, AnalyzeResponse, FraudLogOut
from shared.config import settings
from shared.database import get_db
from shared.models import FraudLog, Transaction, Wallet
from shared.security import get_current_user_id

# Each rule that fires adds its score. Keeping the numbers here (rather than
# scattered through the code) makes the policy easy to read and tune.
VELOCITY_WINDOW = timedelta(minutes=5)
VELOCITY_MAX_TXNS = 5  # more than this many in the window is suspicious
VELOCITY_SCORE = 30

AMOUNT_ANOMALY_MULTIPLE = 2  # amount above this * the wallet's average
AMOUNT_ANOMALY_SCORE = 25

NEW_RECIPIENT_MIN_AMOUNT = Decimal("500.00")  # large first-time payment
NEW_RECIPIENT_SCORE = 20

# Statistical anomaly (ML-lite): how many standard deviations above the wallet's
# own historical mean an amount must be to look anomalous. Rule 2 catches "more
# than 2x the average"; this catches "wildly outside this wallet's NORMAL
# variation", which adapts to each user (a z-score is the first feature a real
# ML fraud model would use — this is the stepping stone to that model).
ZSCORE_THRESHOLD = 3.0
ZSCORE_MIN_HISTORY = 5  # need enough transfers for mean/stddev to mean anything
ZSCORE_SCORE = 15


app = FastAPI(title="SecurePay Fraud Service")


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

    # Rule 3 — statistical anomaly: z-score of the amount against this wallet's
    # own history. Uses population stddev; skipped until there's enough history.
    stats = db.execute(
        select(
            func.count(Transaction.amount),
            func.avg(Transaction.amount),
            func.stddev_pop(Transaction.amount),
        ).where(
            Transaction.wallet_id == req.wallet_id,
            Transaction.transaction_type == "p2p",
        )
    ).one()
    n, mean, std = stats[0] or 0, stats[1], stats[2]
    if n >= ZSCORE_MIN_HISTORY and mean is not None and std and std > 0:
        z = float((Decimal(str(req.amount)) - mean) / std)
        if z > ZSCORE_THRESHOLD:
            score += ZSCORE_SCORE
            signals.append("amount_zscore_anomaly")

    # Rule 4 — large payment to a never-seen recipient.
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


@app.get("/me/logs", response_model=list[FraudLogOut])
def my_logs(
    user_id: int = Depends(get_current_user_id),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    """The authenticated user's own fraud events (for the app's security
    center). This is the only fraud endpoint the gateway exposes publicly."""
    wallet_ids = select(Wallet.id).where(Wallet.user_id == user_id)
    return db.scalars(
        select(FraudLog)
        .where(FraudLog.wallet_id.in_(wallet_ids))
        .order_by(FraudLog.created_at.desc())
        .limit(limit)
    ).all()
