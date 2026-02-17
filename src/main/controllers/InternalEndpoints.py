from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, UploadFile, File, Form

from ..dtos.UploadRequest import UploadRequest
from ..dtos.DeleteRequest import DeleteRequest
from ..dtos.ListDocumentsRequest import ListDocumentsRequest
from src.main.auth.dependencies import require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_dependencies import get_context_service, get_s3_upload_service
from src.main.controllers.controller_helpers import _assert_instructor_access
from src.main.service.ContextVectorService import ContextVectorService
from src.main.service.FileToTextService import FileToTextService
from src.main.service.S3UploadService import S3UploadService, S3UploadServiceError

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/internal/context", tags=["context"])
s3_router = APIRouter(prefix="/api/s3", tags=["s3"])


# --- Endpoints -----------------------------------------------------------------

@router.post("/upload", status_code=201)
def upload_context(dto: UploadRequest = Body(...), svc: ContextVectorService = Depends(get_context_service)):
    try:
        result = svc.upload_document(
            document_name=dto.DocumentName,
            description=dto.Description,
            text=dto.Text,
            scope=dto.Scope
        )
        return {"ok": True, **result}
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="context_upload_failed", message=str(error))

@router.delete("/delete")
def delete_context(dto: DeleteRequest = Body(...), svc: ContextVectorService = Depends(get_context_service)):
    try:
        result = svc.delete_document(document_id=dto.document_id)
        return {"ok": True, **result}
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="context_delete_failed", message=str(error))

@router.post("/list")
def list_documents(
    body: ListDocumentsRequest = Body(...),
    svc: ContextVectorService = Depends(get_context_service)
):
    try:
        docs = svc.list_documents(
            offset=body.Offset,
            limit=body.Limit,
            scope=body.Scope
        )
        return {"documents": docs}
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="context_list_failed", message=str(error))

@router.post("/uploadFile", status_code=201)
def upload_file_context(
    File: UploadFile = File(...),
    DocumentName: str = Form(...),
    Description: str = Form(""),
    Scope: str = Form("default"),
    svc: ContextVectorService = Depends(get_context_service)
):
    """
    Upload a PDF file, extract its text using FileToTextService, and process as a document upload.
    """
    try:
        text = FileToTextService().extract_text_from_uploadfile(File)
        upload_dto = UploadRequest(
            DocumentName=DocumentName,
            Description=Description,
            Text=text,
            Scope=Scope
        )
        result = svc.upload_document(
            document_name=upload_dto.DocumentName,
            description=upload_dto.Description,
            text=upload_dto.Text,
            scope=upload_dto.Scope
        )
        return {"ok": True, **result}
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="context_file_upload_failed", message=str(error))


# =============================================================================
# S3 Upload Endpoints
# =============================================================================

@s3_router.post("/upload-url")
async def get_upload_url(
    filename: str,
    content_type: str = "audio/webm",
    _principal: AuthPrincipal = Depends(require_auth_principal),
    s3_service: S3UploadService = Depends(get_s3_upload_service),
):
    """
    Generate a presigned URL for uploading audio files to S3.
    
    This allows the client to upload files directly to S3 without
    going through the backend server, improving performance and scalability.
    
    Parameters:
    - filename: The S3 key/path for the file (e.g., "audio/S001/question-123_timestamp.webm")
    - content_type: MIME type of the file (default: audio/webm)
    
    Returns:
    - uploadUrl: Presigned URL for PUT request (valid for 1 hour)
    - fileUrl: Public URL to access the file after upload
    
    Example usage:
    1. Client calls this endpoint to get presigned URL
    2. Client uploads file directly to S3 using PUT request to uploadUrl
    3. Client stores fileUrl in database for later playback
    """
    _assert_instructor_access(_principal)

    try:
        return s3_service.generate_upload_url(filename=filename, content_type=content_type)
    except S3UploadServiceError as error:
        raise ApiError(status_code=500, code="s3_upload_url_failed", message=str(error))
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_upload_url: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
