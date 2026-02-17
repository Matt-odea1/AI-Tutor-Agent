from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import create_app
from src.main.controllers.controller_dependencies import get_question_service
from src.main.service.QuestionGenerationService import QuestionGenerationError


def _build_client(question_service=None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_question_service] = lambda: question_service or MagicMock()
    return TestClient(app)


def _files(assignment_content: bytes = b"brief", student_content: bytes = b"print('x')"):
    return {
        "assignment_brief": ("assignment.txt", assignment_content, "text/plain"),
        "student_submission": ("student.py", student_content, "text/x-python"),
    }


def test_generate_questions_maps_service_error():
    svc = MagicMock()
    svc.generate_questions.side_effect = QuestionGenerationError("generation failed")
    client = _build_client(svc)

    response = client.post(
        "/internal/questions/generate",
        data={"student_name": "s1"},
        files=_files(),
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "question_generation_failed"


def test_generate_questions_maps_upload_encoding_error():
    svc = MagicMock()
    client = _build_client(svc)

    response = client.post(
        "/internal/questions/generate",
        data={"student_name": "s1"},
        files=_files(assignment_content=b"\xff\xfe"),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_upload_encoding"


def test_generate_questions_success_shape():
    svc = MagicMock()
    svc.generate_questions.return_value = {
        "questions": [{"id": "q1", "text": "Explain this"}],
        "csv_file_path": "out/questions.csv",
        "json_file_path": "out/questions.json",
        "questions_count": 1,
        "tokens_used": 10,
    }
    client = _build_client(svc)

    response = client.post(
        "/internal/questions/generate",
        data={"student_name": "s1"},
        files=_files(),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["ok"] is True
    assert body["questions_count"] == 1
