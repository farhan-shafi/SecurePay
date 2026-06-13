"""SQLAlchemy engine, session factory, and table bootstrap.

All four services share a single Postgres database (the "shared database"
microservices pattern). This keeps money movement correct and simple: a
transfer can debit and credit two wallets inside one ACID transaction instead
of coordinating a distributed transaction across services.
"""

import time

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from shared.config import settings

# pool_pre_ping recycles connections that the database dropped while idle.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Arbitrary constant every service agrees on, used as the key for the advisory
# lock below. Any fixed integer works as long as all services use the same one.
_SCHEMA_LOCK_KEY = 0x5EC0_5EC0


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(retries: int = 15, delay: float = 2.0) -> None:
    """Create tables if they don't exist, retrying until Postgres is ready.

    On a fresh `docker compose up` a service can start before Postgres has
    finished accepting connections, so we retry rather than crash.

    All services share one database and each runs create_all() on startup.
    create_all() checks "does this table exist?" and then issues CREATE TABLE,
    but those two steps are not atomic across connections: two services starting
    together can both pass the check and then race to CREATE the same table, and
    the loser crashes on a duplicate-key error. A Postgres transaction-level
    advisory lock serializes that section so only one service builds the schema
    at a time; the others then see the tables already exist and create nothing.
    """
    # Importing models registers them on Base.metadata before create_all runs.
    from shared import models  # noqa: F401

    last_error: Exception | None = None
    for _ in range(retries):
        try:
            with engine.begin() as conn:
                # Held until this transaction commits (end of the with-block),
                # which is exactly when create_all has finished.
                conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _SCHEMA_LOCK_KEY})
                Base.metadata.create_all(bind=conn)
            return
        except OperationalError as error:
            last_error = error
            time.sleep(delay)
    raise RuntimeError(f"Database not reachable after {retries} attempts") from last_error
