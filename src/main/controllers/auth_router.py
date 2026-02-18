from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from src.main.auth.dependencies import get_auth_service
from src.main.auth.service import AuthService
from src.main.dtos.AuthDTOs import GoogleLoginRequest, LoginRequest, LoginResponse, SignupRequest


auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/login", response_model=LoginResponse)
def login_with_email_password(
    request: LoginRequest = Body(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    principal = auth_service.authenticate_credentials(request.email, request.password)
    token_payload = auth_service.issue_access_token(principal)
    return LoginResponse(**token_payload)


@auth_router.post("/signup", response_model=LoginResponse, status_code=201)
def signup_with_email_password(
    request: SignupRequest = Body(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    principal = auth_service.register_user(request.email, request.password)
    token_payload = auth_service.issue_access_token(principal)
    return LoginResponse(**token_payload)


@auth_router.post("/google", response_model=LoginResponse)
def login_with_google(
    request: GoogleLoginRequest = Body(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    principal = auth_service.authenticate_google_id_token(request.id_token)
    token_payload = auth_service.issue_access_token(principal)
    return LoginResponse(**token_payload)
