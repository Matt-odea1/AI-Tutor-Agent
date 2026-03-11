# Frontend Analytics Logging

This document describes the usage analytics pipeline implemented for Chat9021.

## Goals

- Understand product usage patterns without collecting message content.
- Diagnose reliability issues (auth drops, API errors, response latency).
- Keep data privacy-safe: no email addresses, no raw chat content.

## End-to-end flow

1. Frontend emits events via `trackEvent(...)` helpers in `ai-tutor-frontend/src/utils/analytics.ts`.
2. Events are queued and batched in-browser.
3. Frontend sends batches to `POST /internal/analytics/events/batch`.
4. Backend stores events in:
   - DynamoDB (when `USE_DYNAMODB=true`), or
   - in-memory fallback (local/dev).
5. Usage summary is available at `GET /internal/analytics/summary?window_days=7`.

## Privacy constraints

- No chat message body text is tracked.
- No student email address is sent in analytics payloads.
- Analytics is disabled when browser Do Not Track is enabled.

## Frontend event catalog

### Core events

- `page_view`
  - `path`, `title`, `referrer`
- `message_sent`
  - `experience_mode`, `message_length_bucket`, `has_editor_context`
- `chat_response_received`
  - `latency_ms`, `is_error`, `token_bucket`
- `code_executed`
  - `has_error`, `execution_time_ms`, `error_type`
- `mode_changed`
  - `from_mode`, `to_mode`
- `session_created`
- `session_resumed`
- `auth_event`
  - `action` (`login_success` | `login_failed` | `logout`)
  - `provider` (`password` | `google`)
  - `reason` (e.g. `401`, `manual`)
- `ui_event`
  - `action`, `value`

### Existing compatibility events

- `api_error`
- `network_status_changed`
- `code_editor_toggled`
- `file_uploaded`

## API contract

### POST `/internal/analytics/events/batch`

Request body:

```json
{
  "sent_at": "2026-03-11T10:00:00Z",
  "events": [
    {
      "event_name": "message_sent",
      "occurred_at": "2026-03-11T10:00:00Z",
      "session_id": "...",
      "app_mode": "chat",
      "properties": {
        "experience_mode": "chat",
        "message_length_bucket": "medium"
      }
    }
  ]
}
```

Response body:

```json
{
  "accepted": 1
}
```

### GET `/internal/analytics/summary?window_days=7`

Response body:

```json
{
  "window_days": 7,
  "total_events": 123,
  "active_users": 16,
  "event_counts": {
    "message_sent": 50,
    "chat_response_received": 45
  }
}
```

## Environment knobs

Frontend (`ai-tutor-frontend`):

- `VITE_ANALYTICS_ENABLED` (default: prod only)
- `VITE_ANALYTICS_BATCH_SIZE` (default: `20`)
- `VITE_ANALYTICS_FLUSH_MS` (default: `10000`)

Backend:

- `USE_DYNAMODB`
- `DYNAMODB_TABLE_NAME`
- `DYNAMODB_REGION`

## Quick verification checklist

- Send chat messages and run code in frontend.
- Confirm `POST /internal/analytics/events/batch` receives events.
- Hit `GET /internal/analytics/summary?window_days=7` with auth headers.
- Verify event counts increase for `message_sent`, `chat_response_received`, `code_executed`.
