"""SQLAlchemy engine and session factory.

All services share a single Postgres database (the "shared database"
microservices pattern). This keeps money movement correct and simple: a
transfer can debit and credit two wallets inside one ACID transaction instead
of coordinating a distributed transaction across services.

The schema is created and versioned by Alembic, applied once by the `migrator`
container before any service boots (see `migrations/` and docker-compose.yml).
Services here never create tables themselves.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from shared.config import settings

# pool_pre_ping recycles connections that the database dropped while idle.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
