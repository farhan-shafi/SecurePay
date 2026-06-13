"""Publish domain events to RabbitMQ.

Services emit events (e.g. "a transfer completed") to a durable topic exchange;
interested consumers — currently the notification-service — bind their own
queues to it. This decouples the producer from the consumer: the
transaction-service doesn't know or care who reacts to a transfer, and a slow or
absent consumer never slows down a payment.

Publishing is **best-effort**: the event is emitted *after* the business
operation has already committed, so if the broker is down we log and move on
rather than failing (or worse, reversing) a transfer that really happened. A
production system that needs an at-least-once guarantee would use a
transactional outbox instead; that's a deliberate later step.
"""

import json
import logging
import threading

import pika

from shared.config import settings

log = logging.getLogger(__name__)

# All SecurePay events flow through one topic exchange. A topic exchange routes
# by a dotted routing key (e.g. "transaction.completed"), so new consumers can
# subscribe to patterns like "transaction.*" without the producer changing.
EXCHANGE = "securepay.events"

# A BlockingConnection (and its channel) is not safe to share across threads,
# and FastAPI runs sync endpoints in a thread pool — so we guard the shared
# connection with a lock and reuse it, reconnecting if it has dropped.
_lock = threading.Lock()
_connection: pika.BlockingConnection | None = None
_channel = None


def _connect() -> None:
    global _connection, _channel
    params = pika.URLParameters(settings.rabbitmq_url)
    params.heartbeat = 600  # generous: this connection is mostly idle
    params.blocked_connection_timeout = 300
    _connection = pika.BlockingConnection(params)
    _channel = _connection.channel()
    _channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)


def _reset() -> None:
    global _connection, _channel
    try:
        if _connection is not None and _connection.is_open:
            _connection.close()
    except Exception:  # noqa: BLE001 - closing a broken connection may itself fail
        pass
    _connection = None
    _channel = None


def publish_event(routing_key: str, payload: dict) -> None:
    """Publish a JSON event. Best-effort — never raises to the caller."""
    body = json.dumps(payload).encode()
    with _lock:
        try:
            if _channel is None or _channel.is_closed:
                _connect()
            _channel.basic_publish(
                exchange=EXCHANGE,
                routing_key=routing_key,
                body=body,
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # persist the message to disk
                ),
            )
        except Exception:  # noqa: BLE001 - publishing must never break the caller
            log.exception("Failed to publish '%s' event", routing_key)
            _reset()  # drop the bad connection so the next publish reconnects
