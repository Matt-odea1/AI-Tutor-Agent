from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from src.main.service.S3UploadService import S3UploadService, S3UploadServiceError


def test_generate_upload_url_success(monkeypatch):
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://signed.example/upload"
    monkeypatch.setattr("src.main.service.S3UploadService.boto3.client", lambda *a, **k: mock_client)

    service = S3UploadService(bucket_name="bucket-a", region="us-east-1")
    result = service.generate_upload_url(filename="audio/test.webm", content_type="audio/webm")

    assert result["uploadUrl"] == "https://signed.example/upload"
    assert result["fileUrl"] == "https://bucket-a.s3.us-east-1.amazonaws.com/audio/test.webm"


def test_generate_upload_url_client_error_raises_service_error(monkeypatch):
    mock_client = MagicMock()
    mock_client.generate_presigned_url.side_effect = ClientError(
        {"Error": {"Message": "denied", "Code": "AccessDenied"}},
        "PutObject",
    )
    monkeypatch.setattr("src.main.service.S3UploadService.boto3.client", lambda *a, **k: mock_client)

    service = S3UploadService(bucket_name="bucket-a", region="us-east-1")

    with pytest.raises(S3UploadServiceError) as error:
        service.generate_upload_url(filename="audio/test.webm")

    assert "denied" in str(error.value)
