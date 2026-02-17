from __future__ import annotations

from functools import lru_cache
from typing import Callable, Optional

from fastapi import Depends, Header, HTTPException, status

from .models import AuthPrincipal
from .service import AuthService


@lru_cache(maxsize=1)
def get_auth_service() -> AuthService:
    return AuthService()


def require_auth_principal(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    auth_service: AuthService = Depends(get_auth_service),
) -> AuthPrincipal:
    return auth_service.resolve_principal(authorization=authorization, x_user_id=x_user_id)


def require_user_id(principal: AuthPrincipal = Depends(require_auth_principal)) -> str:
    return principal.user_id


def resolve_user_id_from_headers(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    auth_service = get_auth_service()
    principal = auth_service.resolve_principal(authorization=authorization, x_user_id=x_user_id)
    return principal.user_id


def require_role(role: str) -> Callable[[AuthPrincipal], AuthPrincipal]:
    def _require(principal: AuthPrincipal = Depends(require_auth_principal)) -> AuthPrincipal:
        if role not in principal.roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return principal

    return _require
