# SecurePay — Digital Wallet (MVP)

A microservices digital wallet built with **FastAPI**, **PostgreSQL**, **Redis**,
**RabbitMQ**, and **Docker Compose**. This repo is a runnable slice of the larger
[architecture design](../SecurePay_Architecture_v1.md). Users can register and
**verify their email** (OTP), open a wallet in **USD/EUR/GBP/PKR**, fund it, save
**beneficiaries**, and **send money** — including **across currencies**, converted
at the live exchange rate and screened for fraud. Completed transfers and
verification codes are delivered by **real email**. A **React Native** mobile app
([`mobile/`](mobile/)) is the user-facing client (multi-currency UI, statements,
PDF export, identity verification).

> This README doubles as a learning guide for Docker and Postgres — it explains
> not just *what* to run but *why* each piece exists.

---

## What's in this MVP

| Service | Host port | What it does |
|---------|-----------|--------------|
| **api-gateway** | 8000 | Single public entrypoint. Rate-limits per IP (Redis) and proxies to the services below. |
| **user-service** | 8001 | Register, login (issues JWT), profile (`/me`), **email verification (OTP)** and **email change**. |
| **wallet-service** | 8002 | Create wallet (currency-typed, **email-verified only**), balance, mock deposit, **statement with counterparty + FX detail**, **beneficiaries**, payee lookup. |
| **transaction-service** | 8003 | Atomic peer-to-peer transfers. **Converts cross-currency** at the live rate, screens for fraud, and exposes a `/quote` preview. |
| **fraud-service** | 8004 | Rule-based, real-time fraud screening. Scores each transfer and can block it. |
| **notification-service** | — | Background worker. Consumes "transfer completed" events from RabbitMQ and **sends a real email** per party (currency-aware). |
| **migrator** | — | One-shot: runs the Alembic database migrations at startup, then exits. |
| **postgres** | 5432 | The single shared database. |
| **redis** | 6379 | Backs the gateway's rate limiter. |
| **rabbitmq** | 5672 / 15672 | Message broker. Carries transfer events to the notification-service. 15672 is the management UI. |

You normally only call **port 8000** (the gateway). The other ports are exposed
so you can poke individual services directly while learning. The **fraud-service
is internal** — it's called service-to-service by the transaction-service and is
deliberately *not* routed through the public gateway. Port 8004 is exposed only
so you can read its fraud logs while learning.

There's also a **React Native (Expo) mobile app** in [`mobile/`](mobile/) that
drives this backend — register, open a wallet, deposit, send money, view activity.
See [`mobile/README.md`](mobile/README.md) to run it on your phone.

Not in this pass yet (next steps): merchant/bill payments.

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

# Verify your email first — a wallet can't be created until you do. This sends a
# 6-digit code by email (see "Email" below); start returns dev_code only when no
# email provider is configured, otherwise read it from `docker compose logs
# user-service`.
curl -s -X POST localhost:8000/api/users/me/verify/start -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/api/users/me/verify/confirm -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"code":"123456"}'

# Create a wallet (in a currency), deposit, check balance
curl -s -X POST localhost:8000/api/wallets/create -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"currency":"USD"}'
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

## Database schema & migrations (Alembic)

The schema is **versioned with Alembic** — the migration tool most
Python/Postgres projects use. Rather than each service calling `create_all()` on
startup (which races when several boot at once, and can't express changes like
"add a column" or "rename a table"), there is one ordered history of migration
files in [`migrations/versions/`](migrations/versions/).

**How it runs.** A dedicated one-shot **migrator** container runs `alembic
upgrade head` *before* any application service boots, then exits. Every service
that touches the database waits for it to finish:

```yaml
depends_on:
  migrator:
    condition: service_completed_successfully
```

So exactly one process ever builds the schema — no more concurrent `create_all()`
races. You don't run anything by hand: `docker compose up` applies migrations
automatically. Alembic records the applied version in an `alembic_version`
table, so on the next `up` it sees the database is already current and does
nothing.

**Changing the schema later.** When you edit the ORM models in
[`shared/models.py`](shared/models.py), generate a migration that captures the
diff between your models and the live database:

```bash
# 1. Edit shared/models.py (add a column, table, index, ...).
# 2. Autogenerate a migration. The -v mount makes the new file land on your
#    host (in migrations/versions/), not just inside the container:
docker compose run --rm -v "$PWD/migrations:/app/migrations" migrator \
  alembic revision --autogenerate -m "add merchants table"
# 3. READ the generated file, then apply it:
docker compose up -d migrator       # re-runs the one-shot migrator
```

Always review the generated file before applying — autogenerate is an excellent
first draft, not gospel (it can miss data backfills and some constraint
changes). Handy read-only commands (run them the same `docker compose run` way):
`alembic current`, `alembic history`.

---

## How it fits together

```
client ──> api-gateway (8000) ──┬──> user-service          ┐
        rate limit + routing    ├──> wallet-service        ├──> postgres (shared DB)
                                └──> transaction-service ──┤
                                          │   │           │
                                          │   └──> fraud-service (internal, 8004)
                                          │
                                          └─ publishes "transaction.completed"
                                                   │
                                              rabbitmq (broker) ──> notification-service
                                                                       (writes notifications)
                                  redis (rate limiter)
```

The fraud-service sits *behind* the transaction-service, not behind the gateway:
a client never calls it directly. Before a transfer commits, the
transaction-service asks the fraud-service "is this transfer suspicious?" and
acts on the answer.

After a transfer commits, the transaction-service *publishes an event* to
RabbitMQ and returns immediately — it does not wait for anyone to react. The
notification-service consumes those events on its own schedule. This is the
opposite of the fraud call: fraud screening is **synchronous** (the transfer
waits for the answer because it changes the outcome), while notifications are
**asynchronous** (the money has already moved, so they must never slow down or
fail the payment).

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

## Notifications (RabbitMQ, async events)

When a transfer completes, both people should be told ("you sent $X", "you
received $X"). We *could* write those notifications inline at the end of the
transfer, but that would couple a payment to a side effect: if the email step
were slow or broke, it would slow down or fail a payment that already succeeded.
Instead we use a **message broker** (RabbitMQ) to do the work **asynchronously**.

### The flow

```
transaction-service                rabbitmq                 notification-service
   │  (transfer already committed)
   │
   ├─ publish "transaction.completed" ──> [ securepay.events ] ──> [ notifications ]
   │   {tx_id, sender, recipient, amount}     topic exchange          durable queue
   │                                                                       │
   └─ return 201 to the client immediately            consume, write a notification
       (does NOT wait for the notification)            row per party, log "email -> …"
```

1. **Publish.** After the money moves and the database commit succeeds, the
   transaction-service calls
   [`publish_event("transaction.completed", …)`](shared/events.py). This is
   **fire-and-forget**: if the broker is momentarily down, it logs the failure
   and moves on — it must *never* reverse or fail a transfer that already
   happened. (A system needing an at-least-once guarantee would use a
   *transactional outbox*; that's a deliberate later step.)
2. **Route.** The event goes to a **topic exchange** named `securepay.events`
   with a routing key like `transaction.completed`. A topic exchange routes by a
   dotted key, so new consumers can subscribe to patterns (the
   notification-service binds `transaction.*`) without the producer changing.
3. **Consume.** The [notification-service](services/notification-service/app/main.py)
   is a **background worker** — not an HTTP server (no port, no uvicorn). It
   blocks in `start_consuming()`, and for each event **sends a real email** to
   each party (via Resend/Brevo — see *Email* below) and writes one row to the
   `notifications` table as the audit trail. The amount is shown in **each
   wallet's own currency**, so the sender sees what they paid and the recipient
   sees the converted amount they received (e.g. `You sent £100.00` /
   `You received $134.03`). With no email key configured it just logs instead —
   so the project still runs without credentials.

### Why a separate process / queue at all?

- **Decoupling.** The transaction-service doesn't know or care who reacts to a
  transfer. You could add an SMS service, an analytics consumer, or a fraud
  back-test later — each just binds its own queue to the same exchange. The
  producer never changes.
- **Resilience.** The queue is **durable** and messages are **persisted to disk**
  (`delivery_mode=2`), and the consumer **acks** a message only after it's
  handled. So if the notification-service is down when a transfer happens, the
  event waits in the queue and is delivered when it comes back — notifications
  aren't lost.
- **Poison messages.** If a message can't be parsed/handled, the consumer
  `nack`s it **without** requeueing, so one bad message can't loop forever.
- **Independent scaling.** If notification volume grew, you'd run more
  notification-service replicas pulling from the same queue — without touching
  the payment path. `basic_qos(prefetch_count=10)` hands each worker a few
  messages at a time rather than the whole backlog.

> **Gotcha worth knowing:** RabbitMQ's built-in `guest` user can only connect
> from *localhost*. Across the Docker network that fails, so we set an explicit
> `RABBITMQ_USER` / `RABBITMQ_PASSWORD` (see `.env.example`) that both the broker
> and the services use.

### Try it

With the stack running, make any transfer (the smoke test does), then watch the
worker react and inspect the rows it wrote:

```bash
python3 scripts/smoke_test.py                       # makes a transfer
docker compose logs notification-service | grep 'email ->'
```

```sql
-- in psql
SELECT user_id, channel, destination, message, transaction_id, status
FROM notifications ORDER BY id;
```

You can also open the **RabbitMQ management UI** at http://localhost:15672
(log in with the `RABBITMQ_USER` / `RABBITMQ_PASSWORD` from your `.env`) to watch
the `securepay.events` exchange and the `notifications` queue in real time.

---

## Multi-currency & exchange rates

A wallet is opened in one currency — **USD, EUR, GBP, or PKR** (validated against
`ALLOWED_CURRENCIES` in [`shared/fx.py`](shared/fx.py)). You can still pay someone
who holds a *different* currency: the **transaction-service converts** the
transfer at the live rate.

- Rates come from a free, key-less provider (`open.er-api.com`), cached
  in-process for an hour so a burst of transfers doesn't hammer it.
- On a cross-currency transfer the sender is **debited in their currency** and
  the recipient is **credited the converted amount in theirs**; the rate and the
  recipient amount are stored on the `transactions` row.
- If a rate can't be fetched for a cross-currency transfer, the transfer is
  rejected (HTTP 503) — we never move money at the wrong value.
- `GET /api/transactions/quote?recipient_wallet_id=…&amount=…` previews a
  conversion so the app can show "they receive ≈ X" *before* you send.

```bash
# Preview converting 100 (your currency) to a recipient's wallet:
curl -s "localhost:8000/api/transactions/quote?recipient_wallet_id=2&amount=100" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Beneficiaries (saved payees)

Like a bank's payee list: you save someone once, then send to them by name. The
**wallet-service** owns these (`/api/wallets/me/beneficiaries`).

- **Add** a payee by wallet id; the API resolves and stores nothing extra — it
  returns the payee's **real name** (from their account) and their wallet
  currency, so the app shows "To Alice Smith", not a bare number.
- **Look up** anyone first with `GET /api/wallets/lookup?email=…` (or
  `?wallet_id=…`) — this powers the app's "add by email **or** wallet id" and the
  choice to *save* the payee or just *send once*.
- A `beneficiaries` table (migration `0003`) stores `(owner_user_id, wallet_id,
  nickname)`, unique per owner+wallet.

---

## Email: verification & sending

**Email verification (OTP).** A user must verify their email before they can open
a wallet — `wallet-service` returns **403** until then.

- `POST /api/users/me/verify/start` generates a 6-digit code, stores it in
  **Redis with a 5-minute TTL** (auto-expiry — the right tool for one-time
  codes), and **emails** it. `POST /me/verify/confirm` checks it and flips
  `kyc_verified` to true.
- **Change email** the same safe way: `/me/email/change/start` sends a code to
  the **new** address; `/me/email/change/confirm` switches it only once that code
  is confirmed — so you can't move your account to an address you don't own.

**Sending email (Resend / Brevo).** Both the OTP and the transfer notifications go
out as real email from [`shared/email.py`](shared/email.py), which **prefers
[Resend](https://resend.com)** (set `RESEND_API_KEY`), **falls back to
[Brevo](https://www.brevo.com)** (`BREVO_API_KEY`), and otherwise just **logs** the
email — so the stack runs fine without any credentials. It's **best-effort**: a
failed send never breaks a verification or a payment. Set one provider's key plus
`EMAIL_SENDER` (an address on a domain you've verified with that provider) in
`.env` (see `.env.example`).

> **Deliverability (so email doesn't land in spam).** Authenticate your *sending
> domain* with the provider: **SPF** (add the provider's `include:` to your SPF
> TXT record), **DKIM** (the CNAME/TXT records the provider gives you), and a
> **DMARC** record. With all three passing, mailbox providers trust your mail.
> Sending from a dedicated subdomain (e.g. `send.example.com`) also helps. A
> brand-new domain still needs a short reputation "warm-up". SMS is *not* wired
> up — truly free SMS doesn't exist — so the OTP is delivered by email.

---

## Project layout

```
securepay/
├── docker-compose.yml        # defines all 10 containers + healthchecks
├── requirements.txt          # shared Python deps for every service
├── .env.example              # copy to .env (passwords, JWT, RabbitMQ + Brevo)
├── alembic.ini               # Alembic config (schema migrations)
├── migrations/               # the ordered migration history
│   ├── env.py                # wires Alembic to the models + DATABASE_URL
│   └── versions/             # one file per schema change (0001_initial…, 0002_notifications, 0003_beneficiaries_and_fx)
├── shared/                   # code reused by every service
│   ├── config.py             # env-driven settings (fraud, rabbitmq, fx, email)
│   ├── database.py           # SQLAlchemy engine + session (schema = Alembic)
│   ├── events.py             # best-effort RabbitMQ event publisher
│   ├── fx.py                 # live currency rates + conversion
│   ├── email.py              # best-effort email sender (Brevo)
│   ├── models.py             # User, Wallet, Transaction, FraudLog, Notification, Beneficiary
│   └── security.py           # password hashing + JWT
├── services/
│   ├── api-gateway/          # proxy + rate limiting
│   ├── user-service/         # auth
│   ├── wallet-service/       # wallets
│   ├── transaction-service/  # transfers (calls fraud-service, publishes events)
│   ├── fraud-service/        # rule-based fraud screening (internal)
│   ├── notification-service/ # background worker: consumes events, writes notifications
│   └── migrator/             # one-shot: runs `alembic upgrade head`
├── scripts/
│   ├── smoke_test.py         # end-to-end check
│   └── fraud_demo.py         # demonstrates a transfer getting blocked
└── mobile/                   # React Native (Expo) wallet app — see mobile/README.md
```

Each service's `Dockerfile` uses the **repo root** as its build context so the
image can include both `shared/` and that service's `app/`.

---

## Suggested next steps

1. ~~**Fraud service** (rule-based first).~~ ✅ Done — see *Fraud screening* above.
   Next here: layer an ML model on top of the same score.
2. ~~**Alembic migrations** to replace `create_all()`.~~ ✅ Done — see
   *Database schema & migrations* above.
3. ~~**RabbitMQ + notification-service** for async notifications on completed
   transfers.~~ ✅ Done — see *Notifications (RabbitMQ)* above. Next here: a
   transactional outbox for an at-least-once delivery guarantee.
4. ~~**Frontend** wired to the gateway.~~ ✅ Done — a **React Native (Expo)**
   mobile app in [`mobile/`](mobile/) (auth, multi-currency wallet, deposit, P2P
   send, statement + PDF). Next here: push notifications and a web build.
5. ~~**Multi-currency wallets + live FX conversion.**~~ ✅ Done — see
   *Multi-currency & exchange rates* above.
6. ~~**Beneficiaries** (saved payees) with email/wallet-id lookup.~~ ✅ Done —
   see *Beneficiaries* above.
7. ~~**Email verification (OTP)** + **real email sending** (Brevo) for codes and
   transfer notifications.~~ ✅ Done — see *Email* above. Next here: real SMS
   (paid) so the OTP can also go to a phone.
8. **Tests** with `pytest` + a throwaway Postgres container.
9. **Merchant / bill payments** (deferred from the architecture doc).
