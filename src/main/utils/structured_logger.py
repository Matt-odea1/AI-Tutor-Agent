"""
Structured logging utilities for the AI Tutor API.

In production (LOG_FORMAT=json) all records are emitted as single-line JSON objects
with a consistent schema:

  {
    "timestamp": "2026-03-18T12:34:56.789Z",
    "level": "INFO",
    "logger": "src.main.controllers.assessment_router",
    "message": "...",
    ...extra fields from LogRecord.extra...
  }

In development the default Python formatter is used for human-readable output.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge any extra fields attached via logger.info("...", extra={...})
        for key, value in record.__dict__.items():
            if key not in (
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
                "taskName",
            ):
                payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """
    Configure root logger based on LOG_FORMAT env var.

    LOG_FORMAT=json  → JSON output (production)
    LOG_FORMAT=text  → human-readable (default for local dev)
    LOG_LEVEL        → override log level (default INFO)
    """
    log_format = os.getenv("LOG_FORMAT", "text").lower()
    log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)

    if log_format == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

    root = logging.getLogger()
    # Remove any existing handlers (e.g. from pytest / uvicorn default setup)
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # Silence noisy third-party loggers in production
    for noisy in ("boto3", "botocore", "urllib3", "httpx", "neo4j"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
