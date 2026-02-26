from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, Body, Depends, File, Form, UploadFile

from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_helpers import _resolve_pedagogy_mode
from src.main.controllers.controller_dependencies import get_chat_service
from src.main.dtos.ChatRequest import ChatRequest
from src.main.dtos.ChatResponse import ChatResponse
from src.main.service.ChatService import ChatService, ChatServiceError
from src.main.service.SpeechToTextService import DeepgramTranscribeService


chat_router = APIRouter(prefix="/internal/chat", tags=["chat"])


@chat_router.post("/transcribe", status_code=200)
async def transcribe_uploaded_audio(
    DocumentTitle: str = Form(...),
    File: UploadFile = File(...),
):
    contents = await File.read()
    ext = os.path.splitext(File.filename)[1].lower()
    if ext != ".wav":
        raise ApiError(status_code=400, code="invalid_audio_format", message="Only .wav files are accepted for this endpoint")

    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.write(contents)
        tmp.flush()
        tmp_path = tmp.name
    finally:
        tmp.close()

    try:
        svc = DeepgramTranscribeService()
        transcript = svc.transcribe(tmp_path)
        return {"documentTitle": DocumentTitle, "transcript": transcript}
    except Exception as error:
        raise ApiError(status_code=500, code="transcription_failed", message=str(error))
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@chat_router.post("", response_model=ChatResponse, deprecated=True)
def chat_endpoint(request: ChatRequest = Body(...), svc: ChatService = Depends(get_chat_service)):
    try:
        result = svc.chat(
            query=request.query,
            top_k=request.top_k or 5,
            session_id=request.session_id,
            include_history=request.include_history,
            context_scope=request.context_scope,
            pedagogy_mode=_resolve_pedagogy_mode(request.pedagogy_mode, "explanatory"),
            editor_code=request.editor_code,
            editor_selection=request.editor_selection,
            last_stdout=request.last_stdout,
            last_error=request.last_error,
            language=request.language,
        )
        return ChatResponse(**result)
    except ChatServiceError as error:
        raise ApiError(status_code=500, code="chat_failed", message=str(error))
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
