from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import create_app
from src.main.controllers.controller_dependencies import get_evaluation_service
from src.main.service.ResponseEvaluationService import ResponseEvaluationError


def _build_client(evaluation_service=None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_evaluation_service] = lambda: evaluation_service or MagicMock()
    return TestClient(app)


def test_start_evaluation_maps_service_error():
    svc = MagicMock()
    svc.start_evaluation.side_effect = ResponseEvaluationError("bad input")
    client = _build_client(svc)

    response = client.post(
        "/internal/evaluations/evaluate",
        json={"student_name": "s1", "responses_file_name": "responses.csv"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "evaluation_start_failed"


def test_get_status_maps_not_found_error():
    svc = MagicMock()
    svc.get_job_status.side_effect = ResponseEvaluationError("not found")
    client = _build_client(svc)

    response = client.get("/internal/evaluations/status/job-1")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "evaluation_job_not_found"


def test_start_evaluation_success_shape():
    svc = MagicMock()
    svc.start_evaluation.return_value = {
        "job_id": "job-1",
        "status": "processing",
        "student_name": "s1",
        "total_questions": 3,
        "estimated_time_seconds": 30,
    }
    client = _build_client(svc)

    response = client.post(
        "/internal/evaluations/evaluate",
        json={"student_name": "s1", "responses_file_name": "responses.csv"},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["ok"] is True
    assert body["job_id"] == "job-1"
