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
| **transaction-service** | 8003 | Atomic peer-to-peer transfers. Calls the fraud service before moving money. |
| **fraud-service** | 8004 | Rule-based, real-time fraud screening. Scores each transfer and can block it. |
| **postgres** | 5432 | The single shared database. |
| **redis** | 6379 | Backs the gateway's rate limiter. |

You normally only call **port 8000** (the gateway). The other ports are exposed
so you can poke individual services directly while learning. The **fraud-service
is internal** — it's called service-to-service by the transaction-service and is
deliberately *not* routed through the public gateway. Port 8004 is exposed only
so you can read its fraud logs while learning.

Not in this pass yet (next steps): merchant/bill payments, RabbitMQ
notifications, and the React frontend.

---

## Prerequisites: install Docker Desktop

You need Docker Desktop (it bundles both `docker` and `docker compose`). If you
don't have it yet, on macOS:

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
client ──> api-gateway (8000) ──┬──> user-service          ┐
        rate limit + routing    ├──> wallet-service        ├──> postgres (shared DB)
                                └──> transaction-service ──┤
                                          │               │
                                          └──> fraud-service (internal, 8004)
                                  redis (rate limiter)
```

The fraud-service sits *behind* the transaction-service, not behind the gateway:
a client never calls it directly. Before a transfer commits, the
transaction-service asks the fraud-service "is this transfer suspicious?" and
acts on the answer.

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

## Fraud screening (how it works)

Every peer-to-peer transfer is screened **before any money moves**. The flow is:

```
transaction-service                 fraud-service
   │  POST /p2p (you send $600)
   │
   │  "score this transfer" ───────────>  runs 3 rules against transfer history
   │                                       returns a score + an action
   │  <─────────── { score: 75, action: "block" }
   │
   ├─ action == "block"  ─> reject the transfer with HTTP 403, no money moves
   └─ otherwise          ─> debit sender, credit recipient, commit
```

### The rules

The fraud-service is **rule-based** (no machine learning yet — that's a later
step). Each rule that fires adds points to a risk score. The rules and their
points live in one place at the top of
[`services/fraud-service/app/main.py`](services/fraud-service/app/main.py) so the
policy is easy to read and tune:

| Rule | Fires when… | Points |
|------|-------------|--------|
| **high_velocity** | More than **5** transfers from this wallet in the last **5 minutes** | +30 |
| **unusual_amount** | The transfer is more than **2×** this wallet's average transfer | +25 |
| **new_large_recipient** | First-ever payment to this recipient **and** it's **≥ $500** | +20 |

The points are summed into a 0–100 score, which maps to a risk level and an
action:

| Score | Risk level | Action | Meaning |
|-------|------------|--------|---------|
| 0–29 | low | **approve** | Looks normal, let it through. |
| 30–59 | medium | **review** | Allowed, but logged for a human to look at later. |
| 60–84 | high | **block** | Stopped with HTTP 403. |
| 85–100 | critical | **block** | Stopped with HTTP 403. |

The block threshold (**60**) is configurable via `FRAUD_BLOCK_THRESHOLD`. Only
transfers that trip at least one rule are written to the `fraud_logs` table — a
clean transfer leaves no row, keeping the log focused on what actually mattered.

Worked example (the demo below): 6 rapid $10 transfers, then a $600 transfer to
someone brand-new trips **all three** rules at once → 30 + 25 + 20 = **75** →
high → **blocked**.

### Two design choices worth understanding

- **Fail-open, not fail-closed.** If the fraud-service is down or slow, the
  transaction-service lets the transfer proceed rather than freezing all payments
  during a fraud outage. For an MVP that's the right availability tradeoff;
  a production system might "fail closed" for large amounts. See
  [`_fraud_check`](services/transaction-service/app/main.py) for the comment that
  explains this.
- **Never hold a database lock across a network call.** This one bit us, and it's
  a great lesson. The transfer locks both wallet rows with `SELECT … FOR UPDATE`
  so balances can't be corrupted. *Originally* the fraud check ran while those
  locks were held. But the fraud-service writes a `fraud_logs` row that
  references the same wallet — and that INSERT needs its own lock on that wallet
  row. So the two sides waited on each other. Postgres couldn't even report it as
  a deadlock, because one side was waiting on a **network socket**, not a lock;
  it just stalled until the 2-second HTTP timeout fired, which (fail-open) let
  the bad transfer through. **The fix:** run the fraud check *before* taking any
  row locks. Rule of thumb: don't make a network call while holding a DB lock.

### Try it

With the stack running:

```bash
python3 scripts/fraud_demo.py
```

It funds a sender, makes 6 normal transfers (all allowed), then makes one rapid
large transfer to a new recipient — which gets **blocked with HTTP 403** — and
prints the fraud log that was recorded.

You can also read the fraud logs directly (the service is internal, so this hits
port 8004, not the gateway):

```bash
curl -s 'localhost:8004/logs' | python3 -m json.tool
```

Or in `psql`:

```sql
SELECT wallet_id, fraud_score, risk_level, action_taken, detected_signals
FROM fraud_logs ORDER BY created_at DESC;
```

---

## Project layout

```
securepay/
├── docker-compose.yml        # defines all 7 containers + healthchecks
├── requirements.txt          # shared Python deps for every service
├── .env.example              # copy to .env (passwords, JWT secret)
├── shared/                   # code reused by every service
│   ├── config.py             # env-driven settings (incl. fraud thresholds)
│   ├── database.py           # SQLAlchemy engine/session + table bootstrap
│   ├── models.py             # User, Wallet, Transaction, FraudLog ORM models
│   └── security.py           # password hashing + JWT
├── services/
│   ├── api-gateway/          # proxy + rate limiting
│   ├── user-service/         # auth
│   ├── wallet-service/       # wallets
│   ├── transaction-service/  # transfers (calls fraud-service)
│   └── fraud-service/        # rule-based fraud screening (internal)
└── scripts/
    ├── smoke_test.py         # end-to-end check
    └── fraud_demo.py         # demonstrates a transfer getting blocked
```

Each service's `Dockerfile` uses the **repo root** as its build context so the
image can include both `shared/` and that service's `app/`.

---

## Suggested next steps

1. ~~**Fraud service** (rule-based first).~~ ✅ Done — see *Fraud screening* above.
   Next here: layer an ML model on top of the same score.
2. **Alembic migrations** to replace `create_all()` once the schema stabilises.
3. **RabbitMQ + notification-service** for async email/SMS on completed transfers.
4. **React/Next.js frontend** wired to the gateway.
5. **Tests** with `pytest` + a throwaway Postgres container.
