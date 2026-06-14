#!/usr/bin/env python3
"""End-to-end smoke test for the SecurePay MVP.

Runs entirely through the API gateway on http://localhost:8000 using only the
Python standard library (no pip installs needed on your machine).

Usage:
    docker compose up --build      # in one terminal, wait until services are up
    python3 scripts/smoke_test.py  # in another terminal
"""

import json
import re
import subprocess
import urllib.error
import urllib.request

GATEWAY = "http://localhost:8000"


def call(method, path, body=None, token=None, expect=(200, 201)):
    url = f"{GATEWAY}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            payload = json.loads(resp.read() or "null")
            status = resp.status
    except urllib.error.HTTPError as err:
        payload = json.loads(err.read() or "null")
        status = err.code

    ok = "OK " if status in expect else "ERR"
    print(f"  [{ok}] {method} {path} -> {status}")
    if status not in expect:
        print(f"        response: {payload}")
    return status, payload


def register(email, phone):
    # 409 is fine: it just means the user already exists from a previous run.
    call(
        "POST",
        "/api/users/register",
        {
            "email": email,
            "phone_number": phone,
            "password": "Password123!",
            "first_name": email.split("@")[0].title(),
            "last_name": "Test",
        },
        expect=(201, 409),
    )


def login(email):
    _, payload = call("POST", "/api/users/login", {"email": email, "password": "Password123!"})
    return payload["access_token"]


def _otp_from_logs(email):
    """Read the latest verification code the user-service logged for `email`.

    Wallets now require a verified email. The code is normally emailed (and the
    API returns dev_code only when no email provider is configured), so for this
    local test we fall back to reading it from the container logs.
    """
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
    """Complete email verification so this user can create a wallet."""
    status, body = call(
        "POST", "/api/users/me/verify/start", token=token, expect=(200, 400)
    )
    if status != 200:
        return  # 400 = already verified from a previous run; nothing to do
    code = (body or {}).get("dev_code") or _otp_from_logs(email)
    if not code:
        print("        could not obtain a verification code — is the stack running?")
        return
    call("POST", "/api/users/me/verify/confirm", {"code": code}, token=token, expect=(200,))


def ensure_wallet(token):
    call("POST", "/api/wallets/create", token=token, expect=(201, 409))
    _, wallet = call("GET", "/api/wallets/me", token=token)
    return wallet


def main():
    print("1. Register two users")
    register("alice@example.com", "+10000000001")
    register("bob@example.com", "+10000000002")

    print("2. Log in")
    alice = login("alice@example.com")
    bob = login("bob@example.com")

    print("   Verify email (required before a wallet can be created)")
    verify_email(alice, "alice@example.com")
    verify_email(bob, "bob@example.com")

    print("3. Create / fetch wallets")
    alice_wallet = ensure_wallet(alice)
    bob_wallet = ensure_wallet(bob)
    print(f"     alice wallet #{alice_wallet['id']} balance={alice_wallet['balance']}")
    print(f"     bob   wallet #{bob_wallet['id']} balance={bob_wallet['balance']}")

    print("4. Deposit 1000 into Alice's wallet (mock top-up)")
    call("POST", "/api/wallets/me/deposit", {"amount": "1000.00"}, token=alice)

    print("5. Alice sends 250 to Bob")
    call(
        "POST",
        "/api/transactions/p2p",
        {
            "recipient_wallet_id": bob_wallet["id"],
            "amount": "250.00",
            "description": "Smoke test transfer",
            "idempotency_key": "smoke-test-key-1",
        },
        token=alice,
        expect=(201,),
    )

    print("6. Retry the SAME transfer (idempotency key should prevent a double send)")
    call(
        "POST",
        "/api/transactions/p2p",
        {
            "recipient_wallet_id": bob_wallet["id"],
            "amount": "250.00",
            "idempotency_key": "smoke-test-key-1",
        },
        token=alice,
        expect=(201,),
    )

    print("7. Final balances")
    _, alice_final = call("GET", "/api/wallets/me", token=alice)
    _, bob_final = call("GET", "/api/wallets/me", token=bob)
    print(f"     alice balance={alice_final['balance']}  (started 0, +1000, -250 once)")
    print(f"     bob   balance={bob_final['balance']}")

    print("8. Alice's statement")
    _, statement = call("GET", "/api/wallets/me/statement", token=alice)
    for entry in statement:
        print(f"     {entry['direction']:>6} {entry['amount']:>10}  {entry['transaction_type']}")

    print("\nDone. If balances look right and the retry didn't double-charge, the MVP works.")


if __name__ == "__main__":
    main()
