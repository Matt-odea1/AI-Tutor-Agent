from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import create_app
from src.main.auth.dependencies import require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.controller_dependencies import get_context_service, get_s3_upload_service
from src.main.service.S3UploadService import S3UploadServiceError


def _build_client(context_service=None, s3_service=None, principal=None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_context_service] = lambda: context_service or MagicMock()
    app.dependency_overrides[get_s3_upload_service] = lambda: s3_service or MagicMock()
    app.dependency_overrides[require_auth_principal] = lambda: principal or AuthPrincipal(
        user_id="inst-1", roles=["instructor"], source="jwt"
    )
    return TestClient(app)


def test_context_upload_maps_error_code():
    svc = MagicMock()
    svc.upload_document.side_effect = RuntimeError("boom")
    client = _build_client(context_service=svc)

    response = client.post(
        "/internal/context/upload",
        json={
            "DocumentName": "doc-1",
            "Description": "desc",
            "Text": "hello",
            "Scope": "default",
        },
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "context_upload_failed"


def test_context_upload_file_maps_error_code(monkeypatch):
    svc = MagicMock()
    svc.upload_document.side_effect = RuntimeError("boom")
    client = _build_client(context_service=svc)

    monkeypatch.setattr(
        "src.main.controllers.InternalEndpoints.FileToTextService.extract_text_from_uploadfile",
        lambda self, upload: "hello",
    )

    response = client.post(
        "/internal/context/uploadFile",
        data={"DocumentName": "Doc", "Description": "D", "Scope": "default"},
        files={"File": ("test.pdf", b"fake", "application/pdf")},
    )

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "context_file_upload_failed"


def test_s3_upload_url_maps_service_error():
    s3 = MagicMock()
    s3.generate_upload_url.side_effect = S3UploadServiceError("denied")
    client = _build_client(s3_service=s3)

    response = client.post("/api/s3/upload-url?filename=a.webm&content_type=audio/webm")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "s3_upload_url_failed"


def test_s3_upload_url_forbidden_maps_to_auth_error():
    s3 = MagicMock()
    client = _build_client(
        s3_service=s3,
        principal=AuthPrincipal(user_id="s-1", roles=["student"], source="jwt"),
    )

    response = client.post("/api/s3/upload-url?filename=a.webm")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth_error"
