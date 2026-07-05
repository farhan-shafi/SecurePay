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
from shared.email import send_email
from shared.events import EXCHANGE
from shared.fx import format_money
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


def _owner_name(db, wallet_id) -> str | None:
    """Full name of the person who owns `wallet_id`, if any."""
    if not wallet_id:
        return None
    w = db.get(Wallet, wallet_id)
    if w and w.user:
        return f"{w.user.first_name} {w.user.last_name}"
    return None


def _notify(db, wallet_id: int, amount, verb: str, other_wallet_id, transaction_id: int) -> None:
    """Email the user who owns `wallet_id` and record the notification.

    `amount` is in THAT wallet's own currency, and the message names the other
    party — "You sent £100.00 to Bob Smith" / "You received $134.03 from Alice".
    """
    wallet = db.get(Wallet, wallet_id)
    if wallet is None or wallet.user is None:
        return
    user = wallet.user
    money = format_money(amount, wallet.currency)
    other_name = _owner_name(db, other_wallet_id)
    preposition = "to" if verb == "sent" else "from"
    who = f" {preposition} {other_name}" if other_name else ""
    message = f"You {verb} {money}{who}."
    html = (
        f"<p>Hi {user.first_name},</p>"
        f"<p>{message}</p>"
        f"<p style='color:#6B6E86'>Reference: TXN-{transaction_id}</p>"
        f"<p style='color:#6B6E86'>— SecurePay</p>"
    )
    text = (
        f"Hi {user.first_name},\n\n{message}\n"
        f"Reference: TXN-{transaction_id}\n\n— SecurePay"
    )
    # Best-effort send (never raises); we record the row regardless.
    sent = send_email(
        user.email, "SecurePay — transaction update", html, to_name=user.first_name, text=text
    )
    db.add(
        Notification(
            user_id=user.id,
            channel="email",
            destination=user.email,
            message=message,
            transaction_id=transaction_id,
            status="sent" if sent else "logged",
        )
    )
    log.info("email -> %s: %s (sent=%s)", user.email, message, sent)


def _handle_transaction_completed(payload: dict) -> None:
    tx_id = payload["transaction_id"]
    amount = payload["amount"]
    # For cross-currency transfers the recipient received a converted amount.
    recipient_amount = payload.get("recipient_amount", amount)
    sender_w = payload["sender_wallet_id"]
    recipient_w = payload["recipient_wallet_id"]
    with SessionLocal() as db:
        _notify(db, sender_w, amount, "sent", recipient_w, tx_id)
        _notify(db, recipient_w, recipient_amount, "received", sender_w, tx_id)
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


def run_forever() -> None:
    """Keep the worker alive across broker restarts: if the connection drops
    (e.g. RabbitMQ restarted), wait a few seconds and reconnect instead of
    dying. The queue is durable, so no events are lost while we're away."""
    while True:
        try:
            main()
        except pika.exceptions.AMQPError:
            log.warning("Broker connection lost; reconnecting in 5s…")
            time.sleep(5)


if __name__ == "__main__":
    run_forever()
