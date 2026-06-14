"""User service: registration, login (JWT issuance), profile, and a phone-OTP
identity-verification (mock KYC) flow."""

import random

import redis
from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.schemas import (
    EmailChangeStartOut,
    EmailChangeStartRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    VerifyConfirmRequest,
    VerifyStartOut,
)
from shared.config import settings
from shared.database import get_db
from shared.email import send_email
from shared.models import User
from shared.security import (
    create_access_token,
    create_refresh_token,
    get_current_user_id,
    hash_password,
    verify_password,
)

app = FastAPI(title="SecurePay User Service")

# One-time codes live in Redis with a TTL, so they expire on their own — exactly
# what you want for an OTP. We reuse the stack's Redis (also used by the gateway).
_redis = redis.from_url(settings.redis_url, decode_responses=True)
OTP_TTL_SECONDS = 300  # 5 minutes


def _otp_key(user_id: int) -> str:
    return f"kyc_otp:{user_id}"


EMAIL_CHANGE_TTL_SECONDS = 600  # 10 minutes


def _email_change_key(user_id: int) -> str:
    return f"email_change:{user_id}"


def _mask_email(email: str) -> str:
    """Keep the first/last letter of the name part, e.g. farhan@x.com -> f••••n@x.com."""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = (local[:1] or "•") + "•"
    else:
        masked = local[0] + "•" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"


@app.get("/health")
def health():
    return {"status": "ok", "service": "user-service"}


@app.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    already_exists = db.scalar(
        select(User).where(
            or_(User.email == payload.email, User.phone_number == payload.phone_number)
        )
    )
    if already_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or phone number already registered",
        )

    user = User(
        email=payload.email,
        phone_number=payload.phone_number,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    # Same error whether the email or the password is wrong, so we don't leak
    # which accounts exist.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
    )


@app.get("/me", response_model=UserOut)
def me(
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@app.post("/me/verify/start", response_model=VerifyStartOut)
def verify_start(
    user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    """Begin identity verification by sending a one-time code to the user's phone.

    A real system would hand the code to an SMS provider (e.g. Twilio) for
    delivery. Here we generate it, stash it in Redis with a 5-minute expiry, log
    it, and return it as `dev_code` so the demo is completable without SMS.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.kyc_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Already verified"
        )

    code = f"{random.randint(0, 999999):06d}"
    _redis.setex(_otp_key(user_id), OTP_TTL_SECONDS, code)

    html = (
        f"<p>Hi {user.first_name},</p>"
        f"<p>Your SecurePay verification code is:</p>"
        f"<p style='font-size:30px;font-weight:bold;letter-spacing:4px'>{code}</p>"
        f"<p>It expires in 5 minutes. If you didn't request this, ignore this email.</p>"
    )
    email_sent = send_email(
        user.email, "Your SecurePay verification code", html, to_name=user.first_name
    )
    print(f"[KYC] code for user {user_id} ({user.email}): {code} (email_sent={email_sent})")

    return VerifyStartOut(
        masked_destination=_mask_email(user.email),
        channel="email",
        expires_in=OTP_TTL_SECONDS,
        # Only reveal the code in-app when we couldn't actually email it.
        dev_code=None if email_sent else code,
    )


@app.post("/me/verify/confirm", response_model=UserOut)
def verify_confirm(
    payload: VerifyConfirmRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Finish verification by checking the code. Marks the user verified on match."""
    stored = _redis.get(_otp_key(user_id))
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your code expired. Request a new one.",
        )
    if payload.code.strip() != stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect code."
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.kyc_verified = True
    db.commit()
    db.refresh(user)
    _redis.delete(_otp_key(user_id))
    return user


@app.post("/me/email/change/start", response_model=EmailChangeStartOut)
def email_change_start(
    payload: EmailChangeStartRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Start changing the email: send a code to the NEW address to prove the user
    owns it. The change only takes effect once that code is confirmed."""
    new_email = payload.new_email.strip().lower()
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if new_email == user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="That's already your email."
        )
    if db.scalar(select(User).where(User.email == new_email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That email is already in use."
        )

    code = f"{random.randint(0, 999999):06d}"
    # Stash the code AND the pending new email together, with a 10-minute expiry.
    _redis.setex(_email_change_key(user_id), EMAIL_CHANGE_TTL_SECONDS, f"{code}:{new_email}")

    html = (
        f"<p>Hi {user.first_name},</p>"
        f"<p>Use this code to confirm <b>{new_email}</b> as your new SecurePay email:</p>"
        f"<p style='font-size:30px;font-weight:bold;letter-spacing:4px'>{code}</p>"
        f"<p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>"
    )
    email_sent = send_email(new_email, "Confirm your new SecurePay email", html, to_name=user.first_name)
    print(f"[EMAIL-CHANGE] user {user_id} -> {new_email}: {code} (email_sent={email_sent})")

    return EmailChangeStartOut(
        masked_destination=_mask_email(new_email),
        expires_in=EMAIL_CHANGE_TTL_SECONDS,
        dev_code=None if email_sent else code,
    )


@app.post("/me/email/change/confirm", response_model=UserOut)
def email_change_confirm(
    payload: VerifyConfirmRequest,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Finish the email change: verify the code, then update the email."""
    stored = _redis.get(_email_change_key(user_id))
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your code expired. Start the email change again.",
        )
    code, _, new_email = stored.partition(":")
    if payload.code.strip() != code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect code."
        )
    # Re-check uniqueness in case someone took the email in the meantime.
    if db.scalar(select(User).where(User.email == new_email, User.id != user_id)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="That email is already in use."
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.email = new_email
    user.kyc_verified = True  # they just proved they own the new email
    db.commit()
    db.refresh(user)
    _redis.delete(_email_change_key(user_id))
    return user
