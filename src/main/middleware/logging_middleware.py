"""
Request/response logging middleware.

Emits one structured log line per request including:
  method, path, status_code, duration_ms, request_id

The request_id (first 8 chars of a UUID) is attached to the log record so it
can be correlated in CloudWatch Insights:

  fields @timestamp, request_id, method, path, status, duration_ms
  | filter status >= 500
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("access")

# Paths that are too noisy to log at INFO (polled every few seconds)
_SKIP_PATHS = {"/health", "/openapi.json", "/docs", "/redoc"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured access log: one line per completed request."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        request_id = uuid.uuid4().hex[:8]
        start = time.monotonic()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.monotonic() - start) * 1000)
            logger.error(
                "Unhandled exception",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "duration_ms": duration_ms,
                },
            )
            raise

        duration_ms = round((time.monotonic() - start) * 1000)
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            level,
            "%s %s %d (%dms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
