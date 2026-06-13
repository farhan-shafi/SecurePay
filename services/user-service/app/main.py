"""User service: registration, login (JWT issuance), and profile lookup."""

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from shared.database import get_db
from shared.models import User
from shared.security import (
    create_access_token,
    create_refresh_token,
    get_current_user_id,
    hash_password,
    verify_password,
)

app = FastAPI(title="SecurePay User Service")


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
