FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Same dependency layer as the services (alembic lives in requirements.txt).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The migrator needs the ORM models (shared) plus the Alembic project.
COPY shared ./shared
COPY alembic.ini .
COPY migrations ./migrations

# Run all pending migrations, then exit. The application services wait for this
# container to finish successfully before they boot (see docker-compose.yml).
CMD ["alembic", "upgrade", "head"]
