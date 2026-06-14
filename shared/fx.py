"""Foreign-exchange helper: live rates for cross-currency transfers.

Rates come from a free, key-less provider (open.er-api.com) and are cached
in-process for an hour so a burst of transfers doesn't hammer the API. Rates are
quoted against a base currency, so converting A->B fetches base=A and reads B.

Used by the transaction service to credit the recipient in *their* currency, and
by its /quote endpoint to preview a conversion before the user sends.
"""

from __future__ import annotations

import time
from decimal import ROUND_HALF_UP, Decimal

import httpx

from shared.config import settings

# The currencies a wallet may use. Small and explicit on purpose.
ALLOWED_CURRENCIES: tuple[str, ...] = ("USD", "EUR", "GBP", "PKR")

_client = httpx.Client(timeout=5.0)
# base_currency -> (fetched_at_epoch, {quote_currency: rate})
_cache: dict[str, tuple[float, dict[str, float]]] = {}


class RateUnavailable(RuntimeError):
    """Raised when a rate can't be fetched for a cross-currency transfer."""


def _rates_for(base: str) -> dict[str, float]:
    now = time.time()
    cached = _cache.get(base)
    if cached and now - cached[0] < settings.exchange_rate_cache_ttl_seconds:
        return cached[1]
    try:
        resp = _client.get(f"{settings.exchange_rate_api_url}/{base}")
        resp.raise_for_status()
        data = resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise RateUnavailable(f"could not fetch rates for {base}") from exc
    if data.get("result") != "success" or "rates" not in data:
        raise RateUnavailable(f"rate provider returned no rates for {base}")
    rates = data["rates"]
    _cache[base] = (now, rates)
    return rates


def get_rate(base: str, quote: str) -> Decimal:
    """Rate to convert 1 unit of `base` into `quote` (1 when they're equal)."""
    if base == quote:
        return Decimal("1")
    rate = _rates_for(base).get(quote)
    if rate is None:
        raise RateUnavailable(f"no rate for {base}->{quote}")
    return Decimal(str(rate))


def convert(amount: Decimal, base: str, quote: str) -> tuple[Decimal, Decimal]:
    """Convert `amount` from `base` to `quote`.

    Returns (converted_amount rounded to 2dp, rate_used).
    """
    rate = get_rate(base, quote)
    converted = (amount * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return converted, rate
