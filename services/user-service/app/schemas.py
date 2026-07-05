from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordOut(BaseModel):
    # Always the same shape whether or not the account exists, so the endpoint
    # can't be used to probe which emails are registered.
    message: str
    dev_code: str | None = None  # set only when no email provider is configured


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8, max_length=128)


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    channel: str
    message: str
    transaction_id: int | None
    status: str
    created_at: datetime


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
    """Response to starting identity verification: where we sent the code."""

    masked_destination: str  # where we emailed it, masked (e.g. f••••n@gmail.com)
    channel: str  # "email"
    expires_in: int
    # Fallback only: set when no real email could be sent (e.g. no API key), so
    # the flow is still completable. Null when a real email went out.
    dev_code: str | None


class VerifyConfirmRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class EmailChangeStartRequest(BaseModel):
    new_email: EmailStr


class EmailChangeStartOut(BaseModel):
    masked_destination: str  # the NEW email, masked
    expires_in: int
    dev_code: str | None  # set only when no real email could be sent
