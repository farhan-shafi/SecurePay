"""Notification service: consume transfer events and 'send' notifications.

Unlike the other services this is **not** an HTTP API — it is a background
worker. It subscribes to the `securepay.events` topic exchange, and whenever the
transaction-service publishes a `transaction.completed` event it writes a
notification row for each party (sender + recipient). "Sending" is mocked: we
log the message and record it in the `notifications` table, which is the audit
trail a real email/SMS sender would update.

Running this as its own process is the point of a message queue: notifications
happen asynchronously, so they never slow down (or fail) a payment, and we could
scale consumers independently if the volume grew.
"""

import json
import logging
import time

import pika

from shared.config import settings
from shared.database import SessionLocal
from shared.events import EXCHANGE
from shared.models import Notification, Wallet

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [notification-service] %(message)s",
)
log = logging.getLogger(__name__)

QUEUE = "notifications"
# Bind to every "transaction.*" event so future event types (e.g.
# transaction.reversed) are delivered here too without a code change.
BINDING_KEY = "transaction.*"


def _notify(db, wallet_id: int, message: str, transaction_id: int) -> None:
    """Create one notification row for the user who owns `wallet_id`."""
    wallet = db.get(Wallet, wallet_id)
    if wallet is None or wallet.user is None:
        return
    db.add(
        Notification(
            user_id=wallet.user_id,
            channel="email",
            destination=wallet.user.email,
            message=message,
            transaction_id=transaction_id,
            status="sent",
        )
    )
    log.info("email -> %s: %s", wallet.user.email, message)


def _handle_transaction_completed(payload: dict) -> None:
    tx_id = payload["transaction_id"]
    amount = payload["amount"]
    with SessionLocal() as db:
        _notify(db, payload["sender_wallet_id"], f"You sent ${amount}.", tx_id)
        _notify(db, payload["recipient_wallet_id"], f"You received ${amount}.", tx_id)
        db.commit()


def _on_message(channel, method, _properties, body: bytes) -> None:
    try:
        payload = json.loads(body)
        if method.routing_key == "transaction.completed":
            _handle_transaction_completed(payload)
        channel.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:  # noqa: BLE001
        log.exception("Failed to handle message; dropping it")
        # Don't requeue: a message we can't parse would loop forever ("poison
        # message"). Acking it off the queue is the safe choice for this MVP.
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def _connect_with_retry(retries: int = 30, delay: float = 2.0) -> pika.BlockingConnection:
    """RabbitMQ may still be starting when we boot, so retry the connection."""
    for attempt in range(1, retries + 1):
        try:
            return pika.BlockingConnection(pika.URLParameters(settings.rabbitmq_url))
        except pika.exceptions.AMQPConnectionError:
            log.info("RabbitMQ not ready (attempt %d/%d), retrying...", attempt, retries)
            time.sleep(delay)
    raise RuntimeError("RabbitMQ not reachable")


def main() -> None:
    connection = _connect_with_retry()
    channel = connection.channel()

    # Declare the same durable topic exchange the producer uses, plus a durable
    # queue bound to it. Durable + acked messages survive a broker restart.
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
    channel.queue_declare(queue=QUEUE, durable=True)
    channel.queue_bind(queue=QUEUE, exchange=EXCHANGE, routing_key=BINDING_KEY)

    # Only hand us a few messages at a time instead of the whole backlog.
    channel.basic_qos(prefetch_count=10)
    channel.basic_consume(queue=QUEUE, on_message_callback=_on_message)

    log.info("Waiting for events on '%s' (binding '%s')", QUEUE, BINDING_KEY)
    channel.start_consuming()


if __name__ == "__main__":
    main()
