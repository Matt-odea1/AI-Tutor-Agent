from __future__ import annotations

import json
import os
import secrets
import importlib
from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac
from hmac import compare_digest
from typing import Any, Dict, List, Optional

import boto3
import jwt
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from .models import AuthPrincipal


class AuthService:
    def __init__(self):
        self.jwt_secret = os.getenv("AUTH_JWT_SECRET", "").strip()
        self.jwt_algorithm = os.getenv("AUTH_JWT_ALGORITHM", "HS256").strip() or "HS256"
        self.google_oauth_client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
        self.allow_header_fallback = os.getenv("AUTH_ALLOW_HEADER_FALLBACK", "false").lower() == "true"
        self.access_token_minutes = self._parse_positive_int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES"), default=60)
        self.password_hash_iterations = self._parse_positive_int(os.getenv("AUTH_PASSWORD_HASH_ITERATIONS"), default=200_000)
        self.signup_default_roles = [
            role.strip()
            for role in os.getenv("AUTH_SIGNUP_DEFAULT_ROLES", "instructor").split(",")
            if role.strip()
        ]
        self.persist_users = os.getenv("AUTH_PERSIST_USERS", os.getenv("USE_DYNAMODB", "false")).lower() == "true"
        self.auth_users_table_name = os.getenv("DYNAMODB_AUTH_USERS_TABLE", "auth_users")
        self.auth_users_region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        self.auth_users_table = self._init_auth_users_table() if self.persist_users else None
        self._login_users = self._load_login_users()

    def _init_auth_users_table(self):
        try:
            dynamodb = boto3.resource("dynamodb", region_name=self.auth_users_region)
            table = dynamodb.Table(self.auth_users_table_name)
            table.load()
            return table
        except Exception:
            self.persist_users = False
            return None

    @staticmethod
    def _parse_positive_int(raw: Optional[str], default: int) -> int:
        if raw is None:
            return default
        try:
            value = int(raw)
            return value if value > 0 else default
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _is_hashed_password(value: str) -> bool:
        return value.startswith("pbkdf2_sha256$")

    def _hash_password(self, raw_password: str) -> str:
        salt = secrets.token_hex(16)
        digest = pbkdf2_hmac(
            "sha256",
            raw_password.encode("utf-8"),
            salt.encode("utf-8"),
            self.password_hash_iterations,
        ).hex()
        return f"pbkdf2_sha256${self.password_hash_iterations}${salt}${digest}"

    @staticmethod
    def _verify_hashed_password(raw_password: str, stored_password: str) -> bool:
        try:
            _, iterations_raw, salt, expected_digest = stored_password.split("$", 3)
            iterations = int(iterations_raw)
            candidate_digest = pbkdf2_hmac(
                "sha256",
                raw_password.encode("utf-8"),
                salt.encode("utf-8"),
                iterations,
            ).hex()
            return compare_digest(candidate_digest, expected_digest)
        except (TypeError, ValueError):
            return False

    def _load_login_users(self) -> Dict[str, Dict[str, Any]]:
        configured: Dict[str, Dict[str, Any]] = {}

        users_json = os.getenv("AUTH_USERS_JSON", "").strip()
        if users_json:
            try:
                parsed = json.loads(users_json)
                if isinstance(parsed, list):
                    for item in parsed:
                        if not isinstance(item, dict):
                            continue
                        email = item.get("email")
                        if not isinstance(email, str) or not email.strip():
                            continue
                        configured[self._normalize_email(email)] = item
                elif isinstance(parsed, dict):
                    for key, value in parsed.items():
                        if not isinstance(key, str) or not isinstance(value, dict):
                            continue
                        configured[self._normalize_email(key)] = {
                            "email": key,
                            **value,
                        }
            except json.JSONDecodeError:
                pass

        fallback_email = os.getenv("AUTH_LOGIN_EMAIL", "").strip()
        fallback_password = os.getenv("AUTH_LOGIN_PASSWORD", "")
        if fallback_email and fallback_password and self._normalize_email(fallback_email) not in configured:
            fallback_user_id = os.getenv("AUTH_LOGIN_USER_ID", "").strip() or fallback_email
            fallback_roles = [
                role.strip()
                for role in os.getenv("AUTH_LOGIN_ROLES", "instructor").split(",")
                if role.strip()
            ]
            configured[self._normalize_email(fallback_email)] = {
                "email": fallback_email,
                "password": fallback_password,
                "user_id": fallback_user_id,
                "roles": fallback_roles,
            }

        return configured

    @staticmethod
    def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
        if not authorization:
            return None
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        return token.strip()

    def _decode_jwt(self, token: str) -> Dict[str, Any]:
        if not self.jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="JWT authentication is not configured",
            )

        try:
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=[self.jwt_algorithm],
                options={"verify_aud": False},
            )
            if not isinstance(payload, dict):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    @staticmethod
    def _extract_roles(payload: Dict[str, Any]) -> List[str]:
        roles_value = payload.get("roles")
        if isinstance(roles_value, list):
            return [str(role) for role in roles_value if str(role).strip()]

        role_value = payload.get("role")
        if isinstance(role_value, str) and role_value.strip():
            return [role_value.strip()]

        return []

    def _principal_from_payload(self, payload: Dict[str, Any]) -> AuthPrincipal:
        user_id = payload.get("sub") or payload.get("user_id")
        if not user_id or not str(user_id).strip():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")

        email_value = payload.get("email")
        email = str(email_value).strip().lower() if isinstance(email_value, str) else None

        return AuthPrincipal(
            user_id=str(user_id),
            email=email,
            roles=self._extract_roles(payload),
            source="jwt",
        )

    @staticmethod
    def _password_matches(raw_password: str, user_record: Dict[str, Any]) -> bool:
        expected_password = user_record.get("password")
        if isinstance(expected_password, str) and expected_password:
            if expected_password.startswith("pbkdf2_sha256$"):
                return AuthService._verify_hashed_password(raw_password, expected_password)
            return compare_digest(raw_password, expected_password)

        return False

    def _load_user_from_store(self, normalized_email: str) -> Optional[Dict[str, Any]]:
        if not self.auth_users_table:
            return None

        try:
            response = self.auth_users_table.get_item(Key={"email": normalized_email})
            item = response.get("Item")
            if not item:
                return None

            roles = item.get("roles")
            normalized_roles = [str(role).strip() for role in roles] if isinstance(roles, list) else []
            return {
                "email": normalized_email,
                "password": str(item.get("password") or ""),
                "user_id": str(item.get("user_id") or normalized_email),
                "roles": [role for role in normalized_roles if role],
            }
        except Exception:
            return None

    def _save_user_to_store(self, user_record: Dict[str, Any]) -> None:
        if not self.auth_users_table:
            return

        now = datetime.now(timezone.utc).isoformat()
        try:
            self.auth_users_table.put_item(
                Item={
                    "email": user_record["email"],
                    "password": user_record["password"],
                    "user_id": user_record["user_id"],
                    "roles": user_record.get("roles", []),
                    "created_at": now,
                    "updated_at": now,
                },
                ConditionExpression="attribute_not_exists(email)",
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to create user")

    def register_user(self, email: str, password: str) -> AuthPrincipal:
        normalized_email = self._normalize_email(email)
        if not normalized_email or "@" not in normalized_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email address")

        if len(password.strip()) < 8:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

        if normalized_email in self._login_users or self._load_user_from_store(normalized_email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

        user_record = {
            "email": normalized_email,
            "password": self._hash_password(password),
            "user_id": normalized_email,
            "roles": list(self.signup_default_roles),
        }
        self._save_user_to_store(user_record)
        self._login_users[normalized_email] = user_record

        return AuthPrincipal(
            user_id=user_record["user_id"],
            email=normalized_email,
            roles=list(self.signup_default_roles),
            source="signup",
        )

    def authenticate_credentials(self, email: str, password: str) -> AuthPrincipal:
        normalized_email = self._normalize_email(email)
        user_record = self._login_users.get(normalized_email)
        if not user_record:
            user_record = self._load_user_from_store(normalized_email)
            if user_record:
                self._login_users[normalized_email] = user_record

        if not user_record or not self._password_matches(password, user_record):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        user_id = str(user_record.get("user_id") or normalized_email).strip()
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user configuration")

        roles = user_record.get("roles")
        normalized_roles = [str(role).strip() for role in roles] if isinstance(roles, list) else []

        return AuthPrincipal(
            user_id=user_id,
            email=normalized_email,
            roles=[role for role in normalized_roles if role],
            source="password",
        )

    def authenticate_google_id_token(self, id_token_value: str) -> AuthPrincipal:
        if not self.google_oauth_client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google OAuth is not configured",
            )

        token = id_token_value.strip()
        if not token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Google ID token")

        try:
            google_requests_module = importlib.import_module("google.auth.transport.requests")
            google_id_token_module = importlib.import_module("google.oauth2.id_token")
            google_request = google_requests_module.Request()
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google auth dependency is not installed",
            )

        try:
            payload = google_id_token_module.verify_oauth2_token(token, google_request, self.google_oauth_client_id)
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google ID token")

        email_value = payload.get("email")
        normalized_email = self._normalize_email(str(email_value)) if email_value else ""
        if not normalized_email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account email is required")

        if not bool(payload.get("email_verified", False)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account email is not verified")

        user_record = self._login_users.get(normalized_email)
        if not user_record:
            user_record = self._load_user_from_store(normalized_email)
            if user_record:
                self._login_users[normalized_email] = user_record

        google_sub = str(payload.get("sub") or "").strip()
        user_id = str((user_record or {}).get("user_id") or google_sub or normalized_email).strip()
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google account identity")

        roles_value = (user_record or {}).get("roles")
        roles = [str(role).strip() for role in roles_value] if isinstance(roles_value, list) else []
        roles = [role for role in roles if role]
        if not roles:
            roles = list(self.signup_default_roles)

        if not user_record:
            generated_password = self._hash_password(secrets.token_urlsafe(32))
            new_user = {
                "email": normalized_email,
                "password": generated_password,
                "user_id": user_id,
                "roles": roles,
            }

            if self.auth_users_table:
                try:
                    self._save_user_to_store(new_user)
                except HTTPException as error:
                    if error.status_code != status.HTTP_409_CONFLICT:
                        raise
                    stored_user = self._load_user_from_store(normalized_email)
                    if stored_user:
                        new_user = stored_user

            self._login_users[normalized_email] = new_user
            user_id = str(new_user.get("user_id") or user_id)
            roles = [str(role).strip() for role in new_user.get("roles", []) if str(role).strip()]

        return AuthPrincipal(
            user_id=user_id,
            email=normalized_email,
            roles=roles,
            source="google",
        )

    def issue_access_token(self, principal: AuthPrincipal) -> Dict[str, Any]:
        if not self.jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="JWT authentication is not configured",
            )

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=self.access_token_minutes)
        payload: Dict[str, Any] = {
            "sub": principal.user_id,
            "email": principal.email,
            "roles": principal.roles,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        token = jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": self.access_token_minutes * 60,
            "user_id": principal.user_id,
            "email": principal.email,
            "roles": principal.roles,
        }

    def resolve_principal(self, authorization: Optional[str], x_user_id: Optional[str]) -> AuthPrincipal:
        token = self._extract_bearer_token(authorization)
        if token:
            payload = self._decode_jwt(token)
            return self._principal_from_payload(payload)

        if self.allow_header_fallback and x_user_id and x_user_id.strip():
            return AuthPrincipal(user_id=x_user_id.strip(), source="x-user-id")

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
