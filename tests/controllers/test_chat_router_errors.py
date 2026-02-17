from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import create_app
from src.main.controllers.controller_dependencies import get_chat_service
from src.main.service.ChatService import ChatServiceError


def _build_client(chat_service=None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_chat_service] = lambda: chat_service or MagicMock()
    return TestClient(app)


@pytest.mark.parametrize(
    "side_effect,expected_code",
    [
        (ChatServiceError("chat failed"), "chat_failed"),
        (RuntimeError("boom"), "unexpected_error"),
    ],
)
def test_chat_endpoint_error_mappings(side_effect, expected_code):
    svc = MagicMock()
    svc.chat.side_effect = side_effect
    client = _build_client(svc)

    response = client.post("/internal/chat", json={"query": "hello"})

    assert response.status_code == 500
    assert response.json()["error"]["code"] == expected_code


def test_transcribe_rejects_non_wav_upload():
    client = _build_client(MagicMock())

    response = client.post(
        "/internal/chat/transcribe",
        data={"DocumentTitle": "Doc"},
        files={"File": ("audio.mp3", b"fake", "audio/mpeg")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_audio_format"
