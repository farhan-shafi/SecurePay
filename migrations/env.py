"""Alembic migration environment.

Wires Alembic to the same models and database URL the services use, so
`alembic revision --autogenerate` can diff the live database against our ORM
models, and `alembic upgrade head` applies the result.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from shared.config import settings
from shared.database import Base

# Importing the models registers every table on Base.metadata. Autogenerate
# compares THIS metadata to the live database to decide what changed, so the
# import must happen before target_metadata is read (the noqa silences the
# "imported but unused" lint — the import is for its side effect).
from shared import models  # noqa: F401

config = context.config

# Single source of truth for the connection string: the DATABASE_URL env var.
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live connection (`alembic upgrade --sql`)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations against a live database connection (the normal path)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
