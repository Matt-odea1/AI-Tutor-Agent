# Auth: Current State and Plan

## Current State

### Backend

- Authentication dependency: `require_auth_principal`
- Login/signup endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
- Principal model includes `user_id`, `email`, `roles`, `source`
- Protected routers use principal-based authorization checks

### Frontends

- Main frontend uses backend-issued JWT and sends `Authorization: Bearer ...`
- Unauthorized responses (`401/403`) trigger local session clear behavior
- Instructor and student frontends are expected to use the same token contract

### Error Semantics

Central HTTP/status mapping is implemented in `api_errors.py`:

- `401/403` -> `auth_error`
- `404` -> `not_found`
- `400/422` -> `validation_error`

## Required Auth Environment Variables

- `AUTH_JWT_SECRET`
- `AUTH_JWT_ALGORITHM` (default `HS256`)
- `AUTH_ACCESS_TOKEN_MINUTES`

Optional local credential bootstrap:

- `AUTH_LOGIN_EMAIL`
- `AUTH_LOGIN_PASSWORD`
- `AUTH_LOGIN_USER_ID`
- `AUTH_LOGIN_ROLES`
- `AUTH_USERS_JSON`

Optional persisted auth users:

- `AUTH_PERSIST_USERS`
- `DYNAMODB_AUTH_USERS_TABLE`

## Maintenance Checklist

When adding/changing protected endpoints:

1. Require `AuthPrincipal` dependency.
2. Enforce role/ownership checks server-side.
3. Return typed `ApiError` codes for expected failures.
4. Add route-level tests for:
   - unauthorized (401/403)
   - forbidden ownership/role cases
   - success path

## Remaining Hardening

- Reduce legacy compatibility paths that trust non-token identity sources.
- Tighten CORS defaults per environment.
- Add explicit auth audit logging and rate-limiting policy for sensitive routes.
# Auth: Current State and Plan

## Current State

### Backend

- Authentication dependency: `require_auth_principal`
- Login/signup endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/signup`
- Principal model includes `user_id`, `email`, `roles`, `source`
- Protected routers use principal-based authorization checks

### Frontends

- Main frontend uses backend-issued JWT and sends `Authorization: Bearer ...`
- Unauthorized responses (`401/403`) trigger local session clear behavior
- Instructor and student frontends are expected to use the same token contract

### Error Semantics

Central HTTP/status mapping is implemented in `api_errors.py`:

- `401/403` -> `auth_error`
- `404` -> `not_found`
- `400/422` -> `validation_error`

## Required Auth Environment Variables

- `AUTH_JWT_SECRET`
- `AUTH_JWT_ALGORITHM` (default `HS256`)
- `AUTH_ACCESS_TOKEN_MINUTES`

Optional local credential bootstrap:

- `AUTH_LOGIN_EMAIL`
- `AUTH_LOGIN_PASSWORD`
- `AUTH_LOGIN_USER_ID`
- `AUTH_LOGIN_ROLES`
- `AUTH_USERS_JSON`

Optional persisted auth users:

- `AUTH_PERSIST_USERS`
- `DYNAMODB_AUTH_USERS_TABLE`

## Maintenance Checklist

When adding/changing protected endpoints:

1. Require `AuthPrincipal` dependency.
2. Enforce role/ownership checks server-side.
3. Return typed `ApiError` codes for expected failures.
4. Add route-level tests for:
   - unauthorized (401/403)
   - forbidden ownership/role cases
   - success path

## Remaining Hardening

- Reduce legacy compatibility paths that trust non-token identity sources.
- Tighten CORS defaults per environment.
- Add explicit auth audit logging and rate-limiting policy for sensitive routes.
# Auth Current State & Change Plan

Last updated: 2026-02-17

## Update Log
- 2026-02-17: Added separate signup/login gates + persisted-user support.
  - Added backend `POST /api/auth/signup`.
  - Main frontend auth gate now has explicit `Log in` and `Sign up` modes.
  - Added DynamoDB-backed auth user persistence (optional) so signed-up users survive backend restarts.
  - Added setup script: `test_scripts/create_auth_users_table.py`.
- 2026-02-17: Added backend credential login endpoint and frontend credential flow.
  - New endpoint: `POST /api/auth/login` (email + password -> JWT access token).
  - Main frontend `LoginGate` now uses email/password and exchanges credentials server-side for JWT.
  - New environment options for local credential users:
    - `AUTH_LOGIN_EMAIL`, `AUTH_LOGIN_PASSWORD`, optional `AUTH_LOGIN_USER_ID`, `AUTH_LOGIN_ROLES`
    - optional multi-user `AUTH_USERS_JSON`
    - `AUTH_ACCESS_TOKEN_MINUTES` controls token TTL.
  - Google SSO is planned as the next auth provider step and can plug into the same JWT contract.
- 2026-02-17: Phase 1 started (auth foundation scaffolded).
  - Added backend auth module at `src/main/auth/` with principal model, JWT verification service, and FastAPI dependencies.
  - Added transitional compatibility helper to resolve user identity from `Authorization` Bearer token or `X-User-Id` fallback.
  - Wired history auth dependency wrapper in `InternalEndpoints` to use the shared auth resolver.
  - Added `PyJWT` to requirements.
- 2026-02-17: Phase 2 started (high-risk route protection).
  - Added required authenticated principal dependency to all `student`, `assessment`, and `s3/upload-url` routes in `InternalEndpoints`.
  - Updated route docstrings from `Authentication: STUBBED` to `Authentication: REQUIRED` for these protected endpoints.
- 2026-02-17: Added initial authorization guards.
  - Student routes now enforce principal-to-student access (`principal.user_id == student_id`) with instructor/admin override.
  - Instructor and S3 routes now enforce instructor/admin access, with transitional `X-User-Id` compatibility for migration.
- 2026-02-17: Added assessment ownership persistence + enforcement.
  - New assessments now persist `createdBy` (owner user id).
  - Instructor assessment APIs now enforce owner checks for assessment-scoped operations.
  - Assessment list is owner-filtered for JWT principals; transitional fallback mode (`X-User-Id`) remains permissive for legacy compatibility.
- 2026-02-17: Added legacy ownership backfill utility.
  - Script: `test_scripts/backfill_assessment_created_by.py`
  - Supports dry run by default and `--apply` for writes.

## Purpose
This document captures the **current authentication/authorization state** across apps and defines a **phased implementation plan** to move from MVP/stubbed auth to enforceable, consistent auth.

---

## 1) Current State (as of today)

### Main app (`ai-tutor-frontend`)
- Login uses email/password and exchanges credentials with backend `POST /api/auth/login`.
- Signup uses email/password and exchanges credentials with backend `POST /api/auth/signup`.
- Backend-issued JWT is stored in localStorage session data and attached as `Authorization: Bearer <token>`.
- Session expiry follows JWT `exp` when present (with local fallback expiry if missing).
- Logout handling is now implemented in frontend:
  - User menu includes `Log out` action.
  - Session clear events update app shell reactively.
  - API client auto-clears session on `401`/`403`.

### Backend history endpoints (`/internal/history/*`)
- `X-User-Id` is required via dependency.
- Workspace/program/thread ownership checks are enforced against that user_id.
- This protects cross-user access **if header is truthful**, but identity is still asserted by client header.

### Backend assessment/student endpoints (`/api/assessment/*`, `/api/student/*`)
- Many endpoints are explicitly marked as **Authentication: STUBBED** in route docs.
- Several routes rely on URL IDs without server-verified caller identity.

### Instructor/Student frontend apps
- Instructor app has optional Bearer token injection from `localStorage.authToken`.
- Student app API client currently has no equivalent auth header/token strategy.
- Net effect: auth behavior is inconsistent across frontend surfaces.

### Platform config
- CORS is permissive in local/dev defaults.
- No unified backend auth middleware/dependency used across all protected routes.
- Optional persisted auth users are enabled when `AUTH_PERSIST_USERS=true` (defaults to `USE_DYNAMODB` behavior), with table `DYNAMODB_AUTH_USERS_TABLE` (default `auth_users`).

---

## 2) Gaps / Risks

### Critical
1. **Client-asserted identity** (`X-User-Id`) can be spoofed without server token verification.
2. **Stubbed assessment/student auth** leaves high-value endpoints under-protected.

### High
3. **Cross-app inconsistency** (main app header-based identity vs instructor token vs student none).
4. **No centralized auth contract** (claims model, token lifecycle, role checks).

### Medium
5. CORS defaults are too broad for production posture.
6. Session expiration is mostly UX-side; no server revocation semantics yet.

---

## 3) Target State

A single authentication model across all surfaces:
- Backend verifies identity per request (JWT or secure session cookie).
- Backend resolves canonical `user_id` from verified claims (not trusted from client payload/header).
- Role/scope checks enforce access (`student`, `instructor`, `owner`).
- All protected routes require auth dependency.
- Frontends share consistent login/logout/session-expiry behavior.

---

## 4) Phased Plan

## Phase 0 (Completed)
- Frontend auth handling improvements in `ai-tutor-frontend`:
  - reactive session updates,
  - logout action in UI,
  - session clear on `401/403`.

## Phase 1 (Backend auth foundation)
- Add auth module/service on backend:
  - token validation,
  - claim extraction,
  - `get_current_user` dependency.
- Introduce canonical user model for request context:
  - `user_id`, `email`, `roles`, optional `tenant/course` claims.
- Add structured 401/403 error responses.

Status:
- In progress.
- Implemented: shared auth scaffolding (`AuthService`, `AuthPrincipal`, dependency helpers).
- Remaining: enforce role dependencies and migrate non-history routes off stubbed auth.

Deliverable:
- Shared auth dependency usable by all routers.

## Phase 2 (Protect high-risk endpoints)
- Apply auth dependency to all assessment/student routes.
- Replace direct trust in path IDs with ownership/enrollment checks tied to authenticated principal.
- Keep history ownership checks but source user identity from verified principal.

Deliverable:
- No route remains “Authentication: STUBBED” for production paths.

Status:
- In progress.
- Implemented: authenticated principal dependency on assessment/student route surface.
- Implemented: initial principal-to-resource authorization guards in controller layer.
- Implemented: ownership persistence/enforcement for newly created assessments (`createdBy`).
- Remaining: backfill legacy assessments without `createdBy` and migrate history ownership from header fallback to JWT-only principal.

## Phase 3 (Frontend alignment across apps)
- Main app:
  - migrate from client-generated identity to backend-verified identity source.
- Instructor app:
  - keep Bearer flow but align token storage/refresh/error handling.
- Student app:
  - add same auth integration pattern and unauthorized-state UX.

Deliverable:
- Consistent auth/session behavior across all frontends.

## Phase 4 (Hardening)
- Restrict CORS per environment with explicit allowed origins.
- Add token/session expiry + refresh policy.
- Add audit logging for auth failures and access denials.
- Add rate limiting / abuse controls for sensitive routes.

Deliverable:
- Production-ready auth posture and observability.

---

## 5) Implementation Notes

### Suggested backend structure
- `src/main/auth/`
  - `AuthService.py` (verify/parse token)
  - `AuthModels.py` (principal claims DTO)
  - `dependencies.py` (`require_auth`, `require_role`)

### Migration strategy
- Introduce auth dependencies behind feature flag (if needed).
- Roll out by router group in this order:
  1) assessment + student,
  2) history,
  3) remaining internal APIs.
- Keep backwards compatibility only in dev mode where explicitly needed.

---

## 6) Validation Plan

### Automated
- Add route-level tests for:
  - missing token -> 401,
  - invalid token -> 401,
  - wrong role/owner -> 403,
  - valid principal -> 200.

### Manual smoke checks
- Login/logout across all frontends.
- Session expiry behavior.
- Access isolation between users/students/instructors.

### Ownership backfill runbook
- Dry run:
  - `python test_scripts/backfill_assessment_created_by.py --owner-user-id <USER_ID>`
- Apply all missing owners:
  - `python test_scripts/backfill_assessment_created_by.py --owner-user-id <USER_ID> --apply`
- Apply one assessment:
  - `python test_scripts/backfill_assessment_created_by.py --owner-user-id <USER_ID> --assessment-id <ASSESSMENT_ID> --apply`

After backfill:
- JWT-only is the default in all environments (`AUTH_ALLOW_HEADER_FALLBACK=false` when unset).
- Enable `AUTH_ALLOW_HEADER_FALLBACK=true` only when intentionally testing legacy header-based flows.

---

## 7) Open Decisions

1. Auth provider choice (managed IdP vs custom JWT issuer).
2. Token transport (Authorization Bearer vs secure httpOnly cookies).
3. Role model granularity (`student`, `instructor`, `admin`) and claim source.
4. Backward compatibility policy for existing local demo flows.

---

## 8) Definition of Done

- All non-public API routes require verified auth principal.
- No trust in raw client `X-User-Id` for authorization decisions.
- Student/instructor/main frontends follow one auth contract.
- Auth tests cover success/failure/authorization boundaries.
- CORS and security defaults are production-safe by environment.
