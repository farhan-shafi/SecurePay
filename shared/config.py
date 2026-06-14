"""Central configuration, loaded from environment variables.

pydantic-settings reads each field from an environment variable of the same
name (case-insensitive), so `DATABASE_URL` in the environment fills
`database_url` here. The defaults point at the Docker Compose service names
(`postgres`, `redis`, `user-service`, ...) so the stack works out of the box.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Infrastructure
    database_url: str = (
        "postgresql+psycopg2://securepay:securepay_dev_password@postgres:5432/securepay"
    )
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://securepay:securepay_dev_password@rabbitmq:5672/"

    # JWT / auth
    jwt_secret: str = "dev-secret-change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    # How long a login lasts. In production this should be SHORT (e.g. 15 min)
    # and paired with a refresh-token flow that silently issues a new access
    # token. We don't have that flow yet, so for development/demos we use a long
    # access token (7 days) so you're not logged out mid-session. Lower it (or
    # set ACCESS_TOKEN_TTL_MINUTES in the env) once refresh tokens are added.
    access_token_ttl_minutes: int = 60 * 24 * 7  # 7 days
    refresh_token_ttl_days: int = 7

    # Internal service URLs (used by the API gateway to route requests)
    user_service_url: str = "http://user-service:8000"
    wallet_service_url: str = "http://wallet-service:8000"
    transaction_service_url: str = "http://transaction-service:8000"
    fraud_service_url: str = "http://fraud-service:8000"

    # Gateway rate limiting
    rate_limit_per_minute: int = 100

    # Fraud: a transfer is blocked when its fraud score reaches this threshold
    # (HIGH/CRITICAL). Lower scores are allowed through, though MEDIUM ones are
    # still logged for review. See the fraud service for the scoring rules.
    fraud_block_threshold: int = 60

    # Foreign exchange: live rates for cross-currency transfers. open.er-api.com
    # is free and needs no API key. Fetched rates are cached in-process (see
    # shared/fx.py) so a burst of transfers doesn't hammer the provider.
    exchange_rate_api_url: str = "https://open.er-api.com/v6/latest"
    exchange_rate_cache_ttl_seconds: int = 3600

    # Email. shared/email.py prefers Resend (better deliverability via a verified
    # sending domain), falls back to Brevo, and otherwise just logs — so the
    # project runs fine without any key.
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com/emails"
    brevo_api_key: str = ""
    brevo_api_url: str = "https://api.brevo.com/v3/smtp/email"
    email_sender: str = "no-reply@securepay.local"
    email_sender_name: str = "SecurePay"


settings = Settings()
