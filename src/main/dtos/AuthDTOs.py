from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., min_length=20)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    email: str
    roles: list[str] = Field(default_factory=list)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordValidateRequest(BaseModel):
    token: str = Field(..., min_length=20)


class ResetPasswordValidateResponse(BaseModel):
    valid: bool


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=20)
    new_password: str = Field(..., min_length=8)


# --- Student invite auth ---

class StudentInviteExchangeRequest(BaseModel):
    invite_token: str = Field(..., min_length=20)


class StudentInviteExchangeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    student_id: str
    assessment_id: str


# --- Instructor refresh tokens ---

class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
