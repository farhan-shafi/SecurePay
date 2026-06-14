"""Send transactional email via Brevo's HTTP API.

Best-effort: this never raises. Email is a side effect — a failed send must not
break a verification or a money transfer. If no API key is configured we just
log the email (the same mock behaviour the project had before), so everything
still works without credentials.
"""

import logging

import httpx

from shared.config import settings

log = logging.getLogger(__name__)

# Reused across calls; httpx clients are safe to keep around.
_client = httpx.Client(timeout=10.0)


def send_email(
    to_email: str,
    subject: str,
    html: str,
    to_name: str | None = None,
    text: str | None = None,
) -> bool:
    """Send one email. Returns True if Brevo accepted it, False otherwise.

    Pass `text` (a plain-text version) when you can — having both an HTML and a
    text part is one of the things spam filters look for, so it improves
    deliverability.
    """
    if not settings.brevo_api_key:
        log.info("[email mock] to=%s subject=%r", to_email, subject)
        return False

    recipient = {"email": to_email}
    if to_name:
        recipient["name"] = to_name

    body: dict = {
        "sender": {
            "name": settings.email_sender_name,
            "email": settings.email_sender,
        },
        "to": [recipient],
        "subject": subject,
        "htmlContent": html,
    }
    if text:
        body["textContent"] = text

    try:
        resp = _client.post(
            settings.brevo_api_url,
            headers={
                "api-key": settings.brevo_api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        log.info("email sent to %s (%r)", to_email, subject)
        return True
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        log.warning("email send failed to %s: %s", to_email, exc)
        return False
