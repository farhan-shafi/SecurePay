from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    phone_number: str = Field(min_length=5, max_length=20)
    # bcrypt only uses the first 72 bytes, so we cap the length here.
    password: str = Field(min_length=8, max_length=72)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    phone_number: str
    first_name: str
    last_name: str
    kyc_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class VerifyStartOut(BaseModel):
    """Response to starting identity verification: where we 'sent' the code."""

    phone_masked: str
    expires_in: int
    # DEMO ONLY: in production the code is delivered by SMS and never returned
    # here. We surface it so the flow is completable without an SMS provider.
    dev_code: str


class VerifyConfirmRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)
