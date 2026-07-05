#!/usr/bin/env python3
"""Demonstrate the rule-based fraud service end to end.

Normal transfers sail through; a burst of rapid sends followed by a large
payment to a brand-new recipient trips three rules at once (high velocity +
unusual amount + new large recipient), pushing the score past the block
threshold so the transfer is rejected with HTTP 403.

Run the stack first (`docker compose up --build`), then:
    python3 scripts/fraud_demo.py

Uses only the Python standard library. Talks to the API gateway on :8000 for
the normal endpoints, and to the fraud service directly on :8004 to read back
the fraud logs (the fraud service is internal and not routed through the
gateway).
"""

import json
import time
import re
import subprocess
import urllib.error
import urllib.request

GATEWAY = "http://localhost:8000"
FRAUD = "http://localhost:8004"


def call(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or "null")


def _otp_from_logs(email):
    """Read the latest verification code user-service logged for `email` (wallets
    require a verified email; the code is normally emailed)."""
    try:
        out = subprocess.run(
            ["docker", "compose", "logs", "--tail=400", "user-service"],
            capture_output=True, text=True, timeout=15,
        ).stdout
    except Exception:
        return None
    found = re.findall(rf"\({re.escape(email)}\): (\d{{6}})", out)
    return found[-1] if found else None


def verify_email(token, email):
    _, body = call("POST", f"{GATEWAY}/api/users/me/verify/start", token=token)
    code = (body or {}).get("dev_code") or _otp_from_logs(email)
    if code:
        call("POST", f"{GATEWAY}/api/users/me/verify/confirm", {"code": code}, token=token)


def setup_user(email, phone):
    """Register (idempotently), log in, verify email, ensure a wallet."""
    call("POST", f"{GATEWAY}/api/users/register", {
        "email": email, "phone_number": phone, "password": "Password123!",
        "first_name": email.split("@")[0].title(), "last_name": "Demo",
    })
    _, login = call("POST", f"{GATEWAY}/api/users/login", {"email": email, "password": "Password123!"})
    token = login["access_token"]
    verify_email(token, email)  # wallets require a verified email
    call("POST", f"{GATEWAY}/api/wallets/create", token=token)
    _, wallet = call("GET", f"{GATEWAY}/api/wallets/me", token=token)
    return token, wallet["id"]


def send(token, recipient_wallet_id, amount, key):
    return call("POST", f"{GATEWAY}/api/transactions/p2p", {
        "recipient_wallet_id": recipient_wallet_id,
        "amount": amount,
        "idempotency_key": key,
    }, token=token)


def main():
    # Fresh users + keys per run: on a persistent database, re-using emails and
    # idempotency keys would just REPLAY the first run's transactions (no new
    # rows -> the velocity rule never fires and the "block" can't reproduce).
    run = str(int(time.time()))[-7:]
    print(f"Setting up carol (sender) + two recipients (dave, eve) [run {run}]")
    carol, carol_wallet = setup_user(f"carol{run}@example.com", f"+1333{run}1")
    _, dave_wallet = setup_user(f"dave{run}@example.com", f"+1333{run}2")
    _, eve_wallet = setup_user(f"eve{run}@example.com", f"+1333{run}3")

    print("Funding carol with 10000")
    call("POST", f"{GATEWAY}/api/wallets/me/deposit", {"amount": "10000.00"}, token=carol)

    print("\n6 small, normal transfers to dave (these should all be ALLOWED):")
    for i in range(1, 7):
        status, _ = send(carol, dave_wallet, "10.00", f"fraud-demo-{run}-dave-{i}")
        print(f"  transfer {i}: 10.00 -> dave  HTTP {status}")

    print("\nNow a large 600.00 transfer to a brand-new recipient (eve).")
    print("Expected signals: high_velocity (6 recent), unusual_amount (>2x avg),")
    print("new_large_recipient (first time, >=500) -> score 75 -> BLOCK.")
    status, body = send(carol, eve_wallet, "600.00", f"fraud-demo-{run}-eve-1")
    print(f"  transfer -> eve  HTTP {status}")
    detail = body.get("detail", body) if isinstance(body, dict) else body
    print(f"  response: {json.dumps(detail)}")

    print("\nFraud logs recorded for carol's wallet:")
    _, rows = call("GET", f"{FRAUD}/logs?wallet_id={carol_wallet}")
    for r in rows:
        print(f"  score={r['fraud_score']:>6}  {r['risk_level']:>8}  "
              f"{r['action_taken']:>7}  signals={r['detected_signals']}")

    ok = status == 403
    print(f"\n{'PASS' if ok else 'FAIL'}: large rapid transfer to a new recipient was "
          f"{'blocked' if ok else 'NOT blocked'} as expected.")


if __name__ == "__main__":
    main()
