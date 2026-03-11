from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import create_app
from src.main.auth.dependencies import require_user_id
from src.main.controllers.controller_dependencies import get_analytics_service


def _build_client(mock_service: MagicMock) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_analytics_service] = lambda: mock_service
    app.dependency_overrides[require_user_id] = lambda: "user-1"
    return TestClient(app)


def _headers():
    return {"X-User-Id": "user-1"}


def test_ingest_analytics_events_batch():
    mock_service = MagicMock()
    mock_service.ingest_events.return_value = 2
    client = _build_client(mock_service)

    response = client.post(
        "/internal/analytics/events/batch",
        headers=_headers(),
        json={
            "events": [
                {"event_name": "message_sent", "properties": {"experience_mode": "chat"}},
                {"event_name": "code_executed", "properties": {"has_error": False}},
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["accepted"] == 2
    kwargs = mock_service.ingest_events.call_args.kwargs
    assert kwargs["user_id"] == "user-1"
    assert len(kwargs["events"]) == 2


def test_analytics_summary_endpoint():
    mock_service = MagicMock()
    mock_service.summarize.return_value = {
        "window_days": 7,
        "total_events": 42,
        "active_users": 9,
        "event_counts": {"message_sent": 20, "chat_response_received": 18},
    }
    client = _build_client(mock_service)

    response = client.get("/internal/analytics/summary?window_days=7", headers=_headers())

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_events"] == 42
    assert payload["active_users"] == 9
    assert payload["event_counts"]["message_sent"] == 20
