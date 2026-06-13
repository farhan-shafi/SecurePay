# SecurePay — Digital Wallet (MVP)

A microservices digital wallet built with **FastAPI**, **PostgreSQL**, **Redis**,
and **Docker Compose**. This repo is the first runnable slice of the larger
[architecture design](../SecurePay_Architecture_v1.md): users can register, log
in, fund a wallet, and send money to each other.

> This README doubles as a learning guide for Docker and Postgres — it explains
> not just *what* to run but *why* each piece exists.

---

## What's in this MVP

| Service | Host port | What it does |
|---------|-----------|--------------|
| **api-gateway** | 8000 | Single public entrypoint. Rate-limits per IP (Redis) and proxies to the services below. |
| **user-service** | 8001 | Register, login (issues JWT), profile (`/me`). |
| **wallet-service** | 8002 | Create wallet, check balance, mock deposit, statement. |
| **transaction-service** | 8003 | Atomic peer-to-peer transfers. |
| **postgres** | 5432 | The single shared database. |
| **redis** | 6379 | Backs the gateway's rate limiter. |

You normally only call **port 8000** (the gateway). The other ports are exposed
so you can poke individual services directly while learning.

Not in this pass yet (next steps): the fraud service, merchant/bill payments,
RabbitMQ notifications, and the React frontend.

---

## Prerequisites: install Docker Desktop

Docker isn't installed on this machine yet. On macOS:

1. Download **Docker Desktop for Mac** from https://www.docker.com/products/docker-desktop/
   (pick the Apple Silicon or Intel build to match your Mac).
2. Open the `.dmg`, drag Docker to Applications, then launch it.
3. Wait for the whale icon in the menu bar to stop animating — that means the
   Docker engine is running.
4. Verify in a terminal:
   ```bash
   docker --version
   docker compose version
   ```

> Homebrew alternative: `brew install --cask docker` then launch Docker Desktop
> once to finish setup.

---

## Run it

```bash
cd securepay

# 1. Create your local env file (compose reads it for passwords & secrets)
cp .env.example .env

# 2. Build images and start everything (first run downloads images: a few GB)
docker compose up --build

# ...wait until logs settle. In a SECOND terminal, run the end-to-end test:
python3 scripts/smoke_test.py
```

To stop: `Ctrl+C`, then `docker compose down`.
To also wipe the database: `docker compose down -v`.

If you prefer shortcuts, a `Makefile` is included: `make up`, `make down`,
`make logs`, `make test`, `make psql`.

---

## Try it by hand (curl)

```bash
# Register + log in
curl -s -X POST localhost:8000/api/users/register -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","phone_number":"+15551234","password":"Password123!","first_name":"Me","last_name":"User"}'

TOKEN=$(curl -s -X POST localhost:8000/api/users/login -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"Password123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# Create a wallet, deposit, check balance
curl -s -X POST localhost:8000/api/wallets/create -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/api/wallets/me/deposit -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":"500.00"}'
curl -s localhost:8000/api/wallets/me -H "Authorization: Bearer $TOKEN"
```

Each service also serves interactive API docs (Swagger UI) at, e.g.,
http://localhost:8001/docs.

---

## Inspecting Postgres (learning Postgres)

Open a `psql` shell inside the running database container:

```bash
docker compose exec postgres psql -U securepay -d securepay
```

Then try:

```sql
\dt                      -- list tables
\d wallets               -- describe the wallets table (columns, constraints)
SELECT * FROM users;
SELECT id, user_id, balance FROM wallets;
SELECT * FROM transactions ORDER BY created_at DESC;
\q                       -- quit
```

Notice the `balance >= 0` CHECK constraint on `wallets` and the unique
`idempotency_key` on `transactions` — the database enforces correctness even if
application code has a bug.

---

## How it fits together

```
client ──> api-gateway (8000) ──┬──> user-service        ┐
        rate limit + routing    ├──> wallet-service      ├──> postgres (shared DB)
                                └──> transaction-service  ┘
                                  redis (rate limiter)
```

A few design choices worth understanding:

- **Shared database.** All services talk to one Postgres database. This is a
  deliberate, common pattern for an MVP: a transfer debits one wallet and credits
  another inside a *single* ACID transaction (`transaction-service`), which is
  far simpler and safer than coordinating money across separate databases.
- **Stateless JWT auth.** `user-service` signs tokens with `JWT_SECRET`; every
  other service verifies them with the same secret. The gateway just forwards the
  `Authorization` header — no shared session store needed.
- **Row locking for money.** Deposits and transfers use `SELECT ... FOR UPDATE`
  so two concurrent operations on the same wallet can't corrupt the balance.
  Transfers lock wallets in id order to avoid deadlocks.
- **Idempotency keys.** Sending the same transfer twice (e.g. after a network
  retry) is safe: the unique `idempotency_key` makes the second call return the
  original transaction instead of moving money again.

---

## Project layout

```
securepay/
├── docker-compose.yml        # defines all 6 containers + healthchecks
├── requirements.txt          # shared Python deps for every service
├── .env.example              # copy to .env (passwords, JWT secret)
├── shared/                   # code reused by every service
│   ├── config.py             # env-driven settings
│   ├── database.py           # SQLAlchemy engine/session + table bootstrap
│   ├── models.py             # User, Wallet, Transaction ORM models
│   └── security.py           # password hashing + JWT
├── services/
│   ├── api-gateway/          # proxy + rate limiting
│   ├── user-service/         # auth
│   ├── wallet-service/       # wallets
│   └── transaction-service/  # transfers
└── scripts/smoke_test.py     # end-to-end check
```

Each service's `Dockerfile` uses the **repo root** as its build context so the
image can include both `shared/` and that service's `app/`.

---

## Suggested next steps

1. **Fraud service** (rule-based first): `transaction-service` calls it before
   completing a transfer, following the signals in the architecture doc.
2. **Alembic migrations** to replace `create_all()` once the schema stabilises.
3. **RabbitMQ + notification-service** for async email/SMS on completed transfers.
4. **React/Next.js frontend** wired to the gateway.
5. **Tests** with `pytest` + a throwaway Postgres container.
