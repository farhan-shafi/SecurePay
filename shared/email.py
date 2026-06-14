"""Send transactional email.

Prefers Resend (better deliverability when sending from a verified domain),
falls back to Brevo, and if neither is configured just logs the email — so the
project always runs, with or without credentials.

Best-effort: this never raises. Email is a side effect — a failed send must not
break a verification or a money transfer.
"""

import logging

import httpx

from shared.config import settings

log = logging.getLogger(__name__)

# Reused across calls; httpx clients are safe to keep around.
_client = httpx.Client(timeout=10.0)


def _send_resend(to_email: str, subject: str, html: str, to_name, text) -> None:
    resp = _client.post(
        settings.resend_api_url,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": f"{settings.email_sender_name} <{settings.email_sender}>",
            "to": [to_email],
            "subject": subject,
            "html": html,
            **({"text": text} if text else {}),
        },
    )
    resp.raise_for_status()


def _send_brevo(to_email: str, subject: str, html: str, to_name, text) -> None:
    recipient = {"email": to_email}
    if to_name:
        recipient["name"] = to_name
    body: dict = {
        "sender": {"name": settings.email_sender_name, "email": settings.email_sender},
        "to": [recipient],
        "subject": subject,
        "htmlContent": html,
    }
    if text:
        body["textContent"] = text
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


def send_email(
    to_email: str,
    subject: str,
    html: str,
    to_name: str | None = None,
    text: str | None = None,
) -> bool:
    """Send one email. Returns True if a provider accepted it, False otherwise.

    Pass `text` (a plain-text version) when you can — having both an HTML and a
    text part improves deliverability.
    """
    if settings.resend_api_key:
        provider, send = "resend", _send_resend
    elif settings.brevo_api_key:
        provider, send = "brevo", _send_brevo
    else:
        log.info("[email mock] to=%s subject=%r", to_email, subject)
        return False

    try:
        send(to_email, subject, html, to_name, text)
        log.info("email sent via %s to %s (%r)", provider, to_email, subject)
        return True
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        log.warning("email send failed (%s) to %s: %s", provider, to_email, exc)
        return False
