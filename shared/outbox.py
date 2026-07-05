"""Transactional outbox (the reliability upgrade over fire-and-forget events).

The problem with publishing straight to RabbitMQ after a commit: if the broker
is down at that moment, the event is lost forever — the transfer happened but
nobody was ever notified. The outbox pattern fixes this in two steps:

  1. `record_event(db, ...)` adds the event as a ROW in the same database
     transaction as the business change. Either both commit or neither does.
  2. `drain_outbox(...)` publishes pending rows to RabbitMQ and marks them
     sent. It runs right after each commit (so the happy path is instant) and
     again on a background timer (so a broker outage only delays delivery).

That gives at-least-once delivery: a row is only marked sent after the broker
accepted it. The consumer may occasionally see a duplicate (e.g. a crash
between publish and mark-sent), which is the standard trade-off of this
pattern.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.events import publish_event
from shared.models import OutboxEvent

log = logging.getLogger(__name__)

DRAIN_BATCH = 50


def record_event(db: Session, routing_key: str, payload: dict) -> None:
    """Stage an event inside the caller's open transaction (no commit here)."""
    db.add(OutboxEvent(routing_key=routing_key, payload=payload, status="pending"))


def drain_outbox(db: Session) -> int:
    """Publish pending events; returns how many were sent.

    `skip_locked` lets the request path and the background timer drain
    concurrently without ever double-publishing the same row.
    """
    rows = db.scalars(
        select(OutboxEvent)
        .where(OutboxEvent.status == "pending")
        .order_by(OutboxEvent.id)
        .limit(DRAIN_BATCH)
        .with_for_update(skip_locked=True)
    ).all()

    sent = 0
    for row in rows:
        if publish_event(row.routing_key, row.payload):
            row.status = "sent"
            row.sent_at = datetime.now(timezone.utc)
            sent += 1
        else:
            break  # broker is down; leave the rest pending for the next drain
    db.commit()
    if sent:
        log.info("outbox: published %d event(s)", sent)
    return sent
