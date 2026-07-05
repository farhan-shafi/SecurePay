"""API gateway: the single public entrypoint.

It does two jobs:
  1. Rate limiting per client IP (a fixed window counter stored in Redis).
  2. Reverse proxying /api/<service>/<path> to the matching internal service.

Auth is NOT done here: each service validates the JWT itself, and the gateway
simply forwards the Authorization header.
"""

import time
from contextlib import asynccontextmanager

import httpx
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Request, Response, status

from shared.config import settings

# Map the first path segment to an internal service base URL.
SERVICE_ROUTES = {
    "users": settings.user_service_url,
    "wallets": settings.wallet_service_url,
    "transactions": settings.transaction_service_url,
    "fraud": settings.fraud_service_url,
}

# For some services only part of the API is public. The fraud service's
# /analyze and /logs are internal (called service-to-service, no user auth), so
# the gateway only forwards its authenticated "me/..." endpoints.
PUBLIC_PATH_PREFIXES = {"fraud": ("me/",)}

# Hop-by-hop headers we must not forward verbatim to the upstream service.
_SKIP_REQUEST_HEADERS = {"host", "content-length"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=10.0)
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=True)
    yield
    await app.state.http.aclose()
    await app.state.redis.aclose()


app = FastAPI(title="SecurePay API Gateway", lifespan=lifespan)


async def _enforce_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    window = int(time.time() // 60)  # one bucket per minute
    key = f"ratelimit:{client_ip}:{window}"

    count = await request.app.state.redis.incr(key)
    if count == 1:
        # First hit in this window: expire the counter when the window ends.
        await request.app.state.redis.expire(key, 60)
    if count > settings.rate_limit_per_minute:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}


@app.api_route(
    "/api/{service}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy(service: str, path: str, request: Request):
    base_url = SERVICE_ROUTES.get(service)
    if base_url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown service '{service}'"
        )

    allowed = PUBLIC_PATH_PREFIXES.get(service)
    if allowed is not None and not path.startswith(allowed):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
        )

    await _enforce_rate_limit(request)

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _SKIP_REQUEST_HEADERS
    }
    try:
        upstream = await request.app.state.http.request(
            method=request.method,
            url=f"{base_url}/{path}",
            params=request.query_params,
            content=await request.body(),
            headers=headers,
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"'{service}' service is unavailable",
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )
