FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Shared library used by every service, then this service's own code.
COPY shared ./shared
COPY services/notification-service/app ./app

# This service is a background consumer, not an HTTP server — no port, no
# uvicorn. It connects to RabbitMQ and blocks in start_consuming().
CMD ["python", "-m", "app.main"]
