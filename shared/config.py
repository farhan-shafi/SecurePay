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

    # JWT / auth
    jwt_secret: str = "dev-secret-change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
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


settings = Settings()
