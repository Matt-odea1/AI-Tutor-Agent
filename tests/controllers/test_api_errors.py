import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from src.main.controllers.api_errors import ApiError, register_exception_handlers


class Payload(BaseModel):
    name: str


def _build_client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/auth")
    def auth_error():
        raise HTTPException(status_code=401, detail="Authentication required")

    @app.get("/forbidden")
    def forbidden_error():
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    @app.get("/missing")
    def missing_error():
        raise HTTPException(status_code=404, detail="Not found")

    @app.get("/bad")
    def bad_error():
        raise HTTPException(status_code=400, detail="Bad request")

    @app.get("/dependency")
    def dependency_error():
        raise HTTPException(status_code=503, detail="Dependency unavailable")

    @app.get("/custom")
    def custom_error():
        raise ApiError(status_code=418, code="teapot", message="short and stout")

    @app.get("/crash")
    def unhandled_error():
        raise RuntimeError("boom")

    @app.post("/validate")
    def validate(payload: Payload):
        return {"ok": True, "name": payload.name}

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client() -> TestClient:
    return _build_client()


@pytest.mark.parametrize(
    "path,expected_code",
    [
        ("/auth", "auth_error"),
        ("/forbidden", "auth_error"),
        ("/missing", "not_found"),
        ("/bad", "validation_error"),
        ("/dependency", "dependency_failure"),
    ],
)
def test_http_exception_mapped_codes(client: TestClient, path: str, expected_code: str):
    response = client.get(path)

    assert response.status_code >= 400
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == expected_code


def test_request_validation_error_uses_validation_code(client: TestClient):
    response = client.post("/validate", json={})

    assert response.status_code == 422
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "validation_error"
    assert isinstance(body["error"]["details"]["errors"], list)


def test_api_error_preserves_explicit_code(client: TestClient):
    response = client.get("/custom")

    assert response.status_code == 418
    body = response.json()
    assert body["error"]["code"] == "teapot"
    assert body["error"]["message"] == "short and stout"


def test_unhandled_exception_returns_internal_error(client: TestClient):
    response = client.get("/crash")

    assert response.status_code == 500
    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "internal_error"
