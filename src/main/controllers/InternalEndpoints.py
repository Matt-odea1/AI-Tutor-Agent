# src/main/controller/ContextController.py
from __future__ import annotations

from typing import Optional

from functools import lru_cache

from fastapi import APIRouter, Body, Depends, UploadFile, File, Form, HTTPException, Header

from ..dtos.UploadRequest import UploadRequest
from ..dtos.DeleteRequest import DeleteRequest
from ..dtos.ListDocumentsRequest import ListDocumentsRequest
from src.main.service.ContextVectorService import ContextVectorService
from src.main.service.ChatService import ChatService, ChatServiceError
from src.main.dtos.ChatRequest import ChatRequest
from src.main.dtos.ChatResponse import ChatResponse
from src.main.dtos.HistoryModels import (
    WorkspaceCreateRequest,
    WorkspaceResponse,
    ViewCreateRequest,
    ViewSessionResponse,
    ViewHistoryResponse,
    ViewSessionListResponse,
    CodeMemoryCreateRequest,
    CodeMemoryUpdateRequest,
    CodeMemoryResponse,
    ProgramCreateRequest,
    ProgramUpdateRequest,
    ProgramResponse,
    ProgramListResponse,
    AssistantThreadCreateRequest,
    AssistantThreadResponse,
    AssistantThreadListResponse,
    AssistantHistoryResponse,
)
from src.main.dtos.EditProposalDTOs import EditProposalRequest, EditProposalResponse
from src.main.dtos.AuthDTOs import LoginRequest, LoginResponse, SignupRequest
from src.main.service.FileToTextService import FileToTextService

# Add Deepgram Speech-to-Text import and tempfile/os
import tempfile
import os
import logging
from src.main.service.SpeechToTextService import DeepgramTranscribeService

logger = logging.getLogger(__name__)

# Question Generation Service imports
from src.main.service.QuestionGenerationService import QuestionGenerationService, QuestionGenerationError
from src.main.dtos.GenerateQuestionsResponse import GenerateQuestionsResponse

# Response Evaluation Service imports
from src.main.service.ResponseEvaluationService import ResponseEvaluationService, ResponseEvaluationError
from src.main.dtos.EvaluateResponsesRequest import EvaluateResponsesRequest
from src.main.dtos.EvaluateResponsesResponse import (
    EvaluationJobResponse, 
    EvaluationStatusResponse
)

# Oral Assessment Service imports (Student operations)
from src.main.service.OralAssessmentService import OralAssessmentService, OralAssessmentServiceError
from src.main.dtos.StudentAssessmentDTOs import (
    SubmitAnswerRequest,
    SubmitAssessmentRequest,
    QuestionResponse,
    StudentQuestionsResponse,
    SubmitAnswerResponse,
    SubmitAssessmentResponse,
    StudentProgressResponse,
    StudentResultsResponse
)

# Instructor Assessment Service imports
from src.main.service.InstructorAssessmentService import InstructorAssessmentService, InstructorAssessmentServiceError
from src.main.dtos.InstructorAssessmentDTOs import (
    CreateAssessmentRequest,
    AssessmentResponse,
    AssessmentListResponse,
    UploadStudentsRequest,
    StudentListResponse,
    ProgressSummaryResponse,
    ResultsSummaryResponse,
    GenerateQuestionsBatchRequest,
    QuestionGenerationJobResponse,
    QuestionGenerationStatusResponse,
    EvaluateBatchRequest,
    EvaluationJobResponse,
    EvaluationStatusResponse
)

# Batch Job Manager
from src.main.service.BatchJobManager import get_batch_job_manager, JobType, JobStatus

# Conversation Memory
from src.main.agentcore_setup.memory import ConversationMemory
from src.main.agentcore_setup.dynamodb_memory import DynamoDBConversationMemory
from src.main.agentcore_setup.history import HistoryStore
from src.main.agentcore_setup.dynamodb_history import DynamoDBHistoryStore
from src.main.auth.models import AuthPrincipal
from src.main.auth.dependencies import require_auth_principal
from src.main.auth.dependencies import resolve_user_id_from_headers
from src.main.auth.dependencies import get_auth_service
from src.main.auth.service import AuthService


# --- Dependency injection ------------------------------------------------------

@lru_cache(maxsize=1)
def _service_singleton() -> ContextVectorService:
    # Build once from env and reuse (keeps a single Neo4j driver instance)
    return ContextVectorService()

def get_context_service() -> ContextVectorService:
    return _service_singleton()


# --- ConversationMemory DI ----------------------------------------------------
@lru_cache(maxsize=1)
def _memory_singleton():
    """
    Factory for conversation memory.
    Uses DynamoDB if USE_DYNAMODB=true, otherwise falls back to in-memory.
    """
    use_dynamodb = os.getenv('USE_DYNAMODB', 'false').lower() == 'true'
    
    if use_dynamodb:
        logger.info("Using DynamoDB for conversation persistence")
        return DynamoDBConversationMemory(
            table_name=os.getenv('DYNAMODB_TABLE_NAME', 'chat_sessions'),
            region=os.getenv('DYNAMODB_REGION', 'us-east-1'),
            ttl_days=30
        )
    else:
        logger.info("Using in-memory conversation storage")
        return ConversationMemory(max_sessions=1000)

def get_memory_service():
    return _memory_singleton()


# --- History Store DI -------------------------------------------------------
@lru_cache(maxsize=1)
def _history_singleton():
    use_dynamodb = os.getenv('USE_DYNAMODB', 'false').lower() == 'true'
    if use_dynamodb:
        logger.info("Using DynamoDB for history persistence")
        return DynamoDBHistoryStore(
            table_name=os.getenv('DYNAMODB_TABLE_NAME', 'chat_sessions'),
            region=os.getenv('DYNAMODB_REGION', 'us-east-1')
        )
    logger.info("Using in-memory history storage")
    return HistoryStore()

def get_history_store():
    return _history_singleton()


# --- ChatService DI -----------------------------------------------------------
from src.main.llm.AgentCoreProvider import AgentCoreProvider

@lru_cache(maxsize=1)
def _chat_service_singleton() -> ChatService:
    vector_service = _service_singleton()
    agent_client = AgentCoreProvider()
    memory = _memory_singleton()  # NEW: Inject memory
    return ChatService(vector_service, agent_client, memory)

def get_chat_service() -> ChatService:
    return _chat_service_singleton()


# --- QuestionGenerationService DI ---------------------------------------------
@lru_cache(maxsize=1)
def _question_service_singleton() -> QuestionGenerationService:
    return QuestionGenerationService()

def get_question_service() -> QuestionGenerationService:
    return _question_service_singleton()


# --- ResponseEvaluationService DI ---------------------------------------------
@lru_cache(maxsize=1)
def _evaluation_service_singleton() -> ResponseEvaluationService:
    return ResponseEvaluationService()

def get_evaluation_service() -> ResponseEvaluationService:
    return _evaluation_service_singleton()


# --- OralAssessmentService DI -------------------------------------------------
@lru_cache(maxsize=1)
def _oral_assessment_service_singleton() -> OralAssessmentService:
    return OralAssessmentService()

def get_oral_assessment_service() -> OralAssessmentService:
    return _oral_assessment_service_singleton()


# --- InstructorAssessmentService DI -------------------------------------------
@lru_cache(maxsize=1)
def _instructor_assessment_service_singleton() -> InstructorAssessmentService:
    return InstructorAssessmentService()

def get_instructor_assessment_service() -> InstructorAssessmentService:
    return _instructor_assessment_service_singleton()


router = APIRouter(prefix="/internal/context", tags=["context"])
chat_router = APIRouter(prefix="/internal/chat", tags=["chat"])
history_router = APIRouter(prefix="/internal/history", tags=["history"])
questions_router = APIRouter(prefix="/internal/questions", tags=["questions"])
evaluations_router = APIRouter(prefix="/internal/evaluations", tags=["evaluations"])
student_router = APIRouter(prefix="/api/student", tags=["student"])
assessment_router = APIRouter(prefix="/api/assessment", tags=["assessment"])
s3_router = APIRouter(prefix="/api/s3", tags=["s3"])
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


def _require_user_id(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> str:
    return resolve_user_id_from_headers(authorization=authorization, x_user_id=x_user_id)


def _assert_workspace_owner(store, workspace_id: str, user_id: str) -> dict:
    workspace = store.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if workspace.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return workspace


def _assert_code_memory_owner(store, code_memory_id: str, user_id: str) -> dict:
    memory = store.get_code_memory(code_memory_id)
    if not memory:
        raise HTTPException(status_code=404, detail="Code memory not found")
    _assert_workspace_owner(store, memory["workspace_id"], user_id)
    return memory


def _assert_program_owner(store, program_id: str, user_id: str) -> dict:
    program = store.get_program(program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    _assert_workspace_owner(store, program["workspace_id"], user_id)
    return program


def _assert_view_owner(store, view_session_id: str, user_id: str) -> dict:
    view = store.get_view_session(view_session_id)
    if not view:
        raise HTTPException(status_code=404, detail="View session not found")
    _assert_workspace_owner(store, view["workspace_id"], user_id)
    return view


def _assert_thread_owner(store, thread_id: str, user_id: str) -> dict:
    thread = store.get_thread(thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    _assert_code_memory_owner(store, thread["code_memory_id"], user_id)
    return thread


def _resolve_pedagogy_mode(requested_mode: Optional[str], default_mode: str) -> str:
    if requested_mode is None or requested_mode == "":
        return default_mode
    return requested_mode


def _has_role(principal: AuthPrincipal, roles: set[str]) -> bool:
    principal_roles = {role.lower() for role in principal.roles}
    return not roles.isdisjoint(principal_roles)


def _assert_instructor_access(principal: AuthPrincipal) -> None:
    if _has_role(principal, {"instructor", "admin"}):
        return

    if principal.source == "x-user-id":
        return

    raise HTTPException(status_code=403, detail="Instructor access required")


def _assert_student_access(principal: AuthPrincipal, student_id: str) -> None:
    if principal.user_id == student_id:
        return

    if _has_role(principal, {"instructor", "admin"}):
        return

    raise HTTPException(status_code=403, detail="Student access denied")


def _assert_assessment_owner(principal: AuthPrincipal, assessment: dict) -> None:
    if _has_role(principal, {"admin"}):
        return

    created_by = assessment.get("createdBy")
    if created_by:
        if principal.user_id == created_by:
            return
        raise HTTPException(status_code=403, detail="Assessment access denied")

    if principal.source == "x-user-id":
        return

    raise HTTPException(status_code=403, detail="Assessment ownership metadata missing")


# --- Endpoints -----------------------------------------------------------------

@auth_router.post("/login", response_model=LoginResponse)
def login_with_email_password(
    request: LoginRequest = Body(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    principal = auth_service.authenticate_credentials(request.email, request.password)
    token_payload = auth_service.issue_access_token(principal)
    return LoginResponse(**token_payload)


@auth_router.post("/signup", response_model=LoginResponse, status_code=201)
def signup_with_email_password(
    request: SignupRequest = Body(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    principal = auth_service.register_user(request.email, request.password)
    token_payload = auth_service.issue_access_token(principal)
    return LoginResponse(**token_payload)

@router.post("/upload", status_code=201)
def upload_context(dto: UploadRequest = Body(...), svc: ContextVectorService = Depends(get_context_service)):
    result = svc.upload_document(
        document_name=dto.DocumentName,
        description=dto.Description,
        text=dto.Text,
        scope=dto.Scope
    )
    return {"ok": True, **result}

@router.delete("/delete")
def delete_context(dto: DeleteRequest = Body(...), svc: ContextVectorService = Depends(get_context_service)):
    result = svc.delete_document(document_id=dto.document_id)
    return {"ok": True, **result}

@router.post("/list")
def list_documents(
    body: ListDocumentsRequest = Body(...),
    svc: ContextVectorService = Depends(get_context_service)
):
    docs = svc.list_documents(
        offset=body.Offset,
        limit=body.Limit,
        scope=body.Scope
    )
    return {"documents": docs}

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


# --- New endpoint: transcribe uploaded WAV and return transcript -----------------
@chat_router.post("/transcribe", status_code=200)
async def transcribe_uploaded_audio(
    DocumentTitle: str = Form(...),
    File: UploadFile = File(...),
):
    """
    Minimal endpoint that accepts a document title and an uploaded WAV file (.wav),
    streams the upload to a temporary file, calls the Deepgram transcription service,
    and returns the transcript.

    Returns JSON: {"documentTitle": str, "transcript": str}
    """
    # Save upload to a temporary file because DeepgramTranscribeService expects a file path
    contents = await File.read()
    # Require .wav files
    ext = os.path.splitext(File.filename)[1].lower()
    if ext != ".wav":
        raise HTTPException(status_code=400, detail="Only .wav files are accepted for this endpoint")

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
    except Exception as e:
        return {"error": f"Transcription failed: {e}"}
    finally:
        # Clean up temp file
        try:
            os.remove(tmp_path)
        except Exception:
            pass


# --- Chat API models ----------------------------------------------------------
# (ChatRequest and ChatResponse now imported from DTOs)

@chat_router.post("", response_model=ChatResponse, deprecated=True)
def chat_endpoint(request: ChatRequest = Body(...), svc: ChatService = Depends(get_chat_service)):
    try:
        result = svc.chat(
            query=request.query, 
            top_k=request.top_k or 5, 
            session_id=request.session_id,
            include_history=request.include_history,
            pedagogy_mode=_resolve_pedagogy_mode(request.pedagogy_mode, "explanatory"),
            editor_code=request.editor_code,
            editor_selection=request.editor_selection,
            last_stdout=request.last_stdout,
            last_error=request.last_error,
            language=request.language,
        )
        return ChatResponse(**result)
    except ChatServiceError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Unexpected error: {e}"}


# --- History v2 Endpoints -----------------------------------------------------

@history_router.post("/workspaces", response_model=WorkspaceResponse)
def create_workspace_endpoint(
    request: WorkspaceCreateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    workspace = store.create_workspace(request.title or "New Workspace", user_id)
    return WorkspaceResponse(
        workspace_id=workspace["workspace_id"],
        title=workspace.get("title", "New Workspace"),
        created_at=workspace["created_at"],
        last_accessed=workspace["last_accessed"],
        user_id=workspace.get("user_id")
    )


@history_router.post("/views", response_model=ViewSessionResponse)
def create_view_session_endpoint(
    request: ViewCreateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_workspace_owner(store, request.workspace_id, user_id)
    default_mode = "explanatory" if request.view_type == "chat" else None
    resolved_mode = _resolve_pedagogy_mode(request.pedagogy_mode, default_mode)
    view = store.create_view_session(request.workspace_id, request.view_type, resolved_mode)
    return ViewSessionResponse(
        view_session_id=view["view_session_id"],
        workspace_id=view["workspace_id"],
        view_type=view["view_type"],
        title=view.get("title"),
        created_at=view["created_at"],
        last_accessed=view["last_accessed"],
        message_count=view.get("message_count", 0),
        total_tokens=view.get("total_tokens", 0),
        pedagogy_mode=view.get("pedagogy_mode")
    )


@history_router.get("/workspaces/{workspace_id}/views", response_model=ViewSessionListResponse)
def list_view_sessions_endpoint(
    workspace_id: str,
    view_type: Optional[str] = None,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_workspace_owner(store, workspace_id, user_id)
    views = store.list_view_sessions(workspace_id, view_type)
    return ViewSessionListResponse(
        workspace_id=workspace_id,
        view_type=view_type,
        views=views,
    )


@history_router.get("/views/{view_session_id}/history", response_model=ViewHistoryResponse)
def get_view_history_endpoint(
    view_session_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    view = _assert_view_owner(store, view_session_id, user_id)
    messages = store.get_view_history(view_session_id)
    return ViewHistoryResponse(
        view_session_id=view_session_id,
        messages=messages,
        message_count=view.get("message_count", len(messages)),
        created_at=view.get("created_at", ""),
        last_accessed=view.get("last_accessed", ""),
        total_tokens=view.get("total_tokens", 0),
        view_type=view.get("view_type", "chat")
    )


@history_router.delete("/views/{view_session_id}")
def delete_view_session_endpoint(
    view_session_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_view_owner(store, view_session_id, user_id)
    store.delete_view_session(view_session_id)
    return {"ok": True, "view_session_id": view_session_id}


@history_router.post("/views/{view_session_id}/message", response_model=ChatResponse)
def post_view_message_endpoint(
    view_session_id: str,
    request: ChatRequest = Body(...),
    store=Depends(get_history_store),
    svc: ChatService = Depends(get_chat_service),
    user_id: str = Depends(_require_user_id),
):
    view = _assert_view_owner(store, view_session_id, user_id)
    existing_history = store.get_view_history(view_session_id)
    initial_message_count = view.get("message_count", 0)

    result = svc.chat(
        query=request.query,
        top_k=request.top_k or 5,
        session_id=view_session_id,
        include_history=request.include_history,
        pedagogy_mode=_resolve_pedagogy_mode(request.pedagogy_mode, "explanatory"),
        editor_code=request.editor_code,
        editor_selection=request.editor_selection,
        last_stdout=request.last_stdout,
        last_error=request.last_error,
        language=request.language,
        history_override=existing_history,
        persist_history=False,
    )

    store.add_view_message(view_session_id, "user", request.query, tokens=result.get("tokens_input"))
    store.add_view_message(
        view_session_id,
        "assistant",
        result.get("answer", ""),
        tokens=result.get("tokens_output"),
        context_ids=result.get("context_ids")
    )

    if initial_message_count == 0 and view.get("title") in {None, "", "New Chat", "New Session"}:
        try:
            title = svc._generate_session_title(request.query)
            store.update_view_title(view_session_id, title)
        except Exception as e:
            logger.warning(f"Failed to generate view title: {e}")

    return ChatResponse(**result)


@history_router.post("/codememory", response_model=CodeMemoryResponse)
def create_code_memory_endpoint(
    request: CodeMemoryCreateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_workspace_owner(store, request.workspace_id, user_id)
    memory = store.create_code_memory(request.workspace_id, request.language, request.current_code)
    return CodeMemoryResponse(**memory)


@history_router.patch("/codememory/{code_memory_id}", response_model=CodeMemoryResponse)
def update_code_memory_endpoint(
    code_memory_id: str,
    request: CodeMemoryUpdateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_code_memory_owner(store, code_memory_id, user_id)
    memory = store.update_code_memory(code_memory_id, request.current_code, request.last_output, request.last_error)
    return CodeMemoryResponse(**memory)


@history_router.get("/codememory/{code_memory_id}", response_model=CodeMemoryResponse)
def get_code_memory_endpoint(
    code_memory_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    memory = _assert_code_memory_owner(store, code_memory_id, user_id)
    return CodeMemoryResponse(**memory)


@history_router.post("/programs", response_model=ProgramResponse)
def create_program_endpoint(
    request: ProgramCreateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_workspace_owner(store, request.workspace_id, user_id)
    title = request.title or "Untitled Program"
    memory = store.create_code_memory(request.workspace_id, request.language, request.current_code)
    program = store.create_program(
        request.workspace_id,
        memory["code_memory_id"],
        request.language,
        title,
        request.current_code,
    )
    return ProgramResponse(**program)


@history_router.get("/workspaces/{workspace_id}/programs", response_model=ProgramListResponse)
def list_programs_endpoint(
    workspace_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_workspace_owner(store, workspace_id, user_id)
    programs = store.list_programs(workspace_id)
    return ProgramListResponse(
        workspace_id=workspace_id,
        programs=[ProgramResponse(**program) for program in programs],
    )


@history_router.get("/programs/{program_id}", response_model=ProgramResponse)
def get_program_endpoint(
    program_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    program = _assert_program_owner(store, program_id, user_id)
    return ProgramResponse(**program)


@history_router.patch("/programs/{program_id}", response_model=ProgramResponse)
def update_program_endpoint(
    program_id: str,
    request: ProgramUpdateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    program = _assert_program_owner(store, program_id, user_id)
    updated = store.update_program(program_id, request.title, request.current_code, request.last_output, request.last_error)
    if request.current_code is not None or request.last_output is not None or request.last_error is not None:
        store.update_code_memory(program["code_memory_id"], request.current_code, request.last_output, request.last_error)
    return ProgramResponse(**updated)


@history_router.delete("/programs/{program_id}")
def delete_program_endpoint(
    program_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_program_owner(store, program_id, user_id)
    store.delete_program(program_id)
    return {"ok": True, "program_id": program_id}


@history_router.post("/codememory/{code_memory_id}/threads", response_model=AssistantThreadResponse)
def create_thread_endpoint(
    code_memory_id: str,
    request: AssistantThreadCreateRequest = Body(...),
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_code_memory_owner(store, code_memory_id, user_id)
    thread = store.create_thread(code_memory_id, request.title or "New Assistant Thread")
    return AssistantThreadResponse(
        thread_id=thread["thread_id"],
        code_memory_id=thread["code_memory_id"],
        title=thread.get("title", "New Assistant Thread"),
        created_at=thread["created_at"],
        last_accessed=thread["last_accessed"],
    )


@history_router.get("/codememory/{code_memory_id}/threads", response_model=AssistantThreadListResponse)
def list_threads_endpoint(
    code_memory_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    _assert_code_memory_owner(store, code_memory_id, user_id)
    threads = store.list_threads(code_memory_id)
    return AssistantThreadListResponse(
        code_memory_id=code_memory_id,
        threads=[
            AssistantThreadResponse(
                thread_id=t["thread_id"],
                code_memory_id=t["code_memory_id"],
                title=t.get("title", "New Assistant Thread"),
                created_at=t.get("created_at", ""),
                last_accessed=t.get("last_accessed", ""),
            )
            for t in threads
        ]
    )


@history_router.get("/threads/{thread_id}/history", response_model=AssistantHistoryResponse)
def get_thread_history_endpoint(
    thread_id: str,
    store=Depends(get_history_store),
    user_id: str = Depends(_require_user_id),
):
    thread = _assert_thread_owner(store, thread_id, user_id)
    messages = store.get_thread_history(thread_id)
    return AssistantHistoryResponse(
        thread_id=thread_id,
        messages=messages,
        message_count=thread.get("message_count", len(messages)),
        created_at=thread.get("created_at", ""),
        last_accessed=thread.get("last_accessed", ""),
        code_memory_id=thread.get("code_memory_id", "")
    )


@history_router.post("/threads/{thread_id}/message", response_model=ChatResponse)
def post_thread_message_endpoint(
    thread_id: str,
    request: ChatRequest = Body(...),
    store=Depends(get_history_store),
    svc: ChatService = Depends(get_chat_service),
    user_id: str = Depends(_require_user_id),
):
    thread = _assert_thread_owner(store, thread_id, user_id)
    existing_history = store.get_thread_history(thread_id)
    initial_message_count = thread.get("message_count", 0)

    result = svc.chat(
        query=request.query,
        top_k=request.top_k or 5,
        session_id=thread_id,
        include_history=request.include_history,
        pedagogy_mode=_resolve_pedagogy_mode(request.pedagogy_mode, "concise"),
        editor_code=request.editor_code,
        editor_selection=request.editor_selection,
        last_stdout=request.last_stdout,
        last_error=request.last_error,
        language=request.language,
        history_override=existing_history,
        persist_history=False,
    )

    store.add_thread_message(thread_id, "user", request.query, tokens=result.get("tokens_input"))
    store.add_thread_message(
        thread_id,
        "assistant",
        result.get("answer", ""),
        tokens=result.get("tokens_output"),
        context_ids=result.get("context_ids")
    )

    if initial_message_count == 0 and thread.get("title") in {"New Assistant Thread", "New Thread"}:
        try:
            title = svc._generate_session_title(request.query)
            store.update_thread_title(thread_id, title)
        except Exception as e:
            logger.warning(f"Failed to generate thread title: {e}")

    return ChatResponse(**result)


@history_router.post("/edit-proposal", response_model=EditProposalResponse)
def create_edit_proposal(
    request: EditProposalRequest = Body(...),
    store=Depends(get_history_store),
    svc: ChatService = Depends(get_chat_service),
    user_id: str = Depends(_require_user_id),
):
    thread = None
    existing_history = []
    initial_message_count = 0
    if request.thread_id:
        thread = _assert_thread_owner(store, request.thread_id, user_id)
        existing_history = store.get_thread_history(request.thread_id)
        initial_message_count = thread.get("message_count", 0)

    result = svc.chat(
        query=request.query,
        top_k=5,
        session_id=request.thread_id,
        include_history=request.include_history,
        pedagogy_mode=_resolve_pedagogy_mode(request.pedagogy_mode, "concise"),
        editor_code=request.editor_code,
        editor_selection=request.editor_selection,
        last_stdout=request.last_stdout,
        last_error=request.last_error,
        language=request.language,
        history_override=existing_history,
        persist_history=False,
    )

    answer = result.get("answer", "")
    edit_block = _extract_edit_block(answer)

    if thread:
        store.add_thread_message(request.thread_id, "user", request.query, tokens=result.get("tokens_input"))
        store.add_thread_message(
            request.thread_id,
            "assistant",
            answer,
            tokens=result.get("tokens_output"),
            context_ids=result.get("context_ids")
        )
        if initial_message_count == 0 and thread.get("title") in {"New Assistant Thread", "New Thread"}:
            try:
                title = svc._generate_session_title(request.query)
                store.update_thread_title(request.thread_id, title)
            except Exception as e:
                logger.warning(f"Failed to generate thread title: {e}")

    return EditProposalResponse(answer=answer, edit_block=edit_block, buffer_hash=request.buffer_hash)


def _extract_edit_block(answer: str):
    if not answer:
        return None
    import json
    import re

    match = re.search(r"```edit\s*([\s\S]*?)```", answer, re.IGNORECASE)
    if not match:
        return None
    payload = match.group(1).strip()
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    if not _is_valid_edit_block(parsed):
        logger.warning("Invalid edit block payload received")
        return None
    return parsed


def _is_valid_edit_block(payload: dict) -> bool:
    version = payload.get("version")
    if version != "1":
        return False
    scope = payload.get("scope")
    replacement = payload.get("replacement")
    if scope not in {"selection", "file"}:
        return False
    if replacement is None:
        return False
    if scope == "selection":
        return bool(payload.get("target"))
    return True


# --- Question Generation Endpoints --------------------------------------------

@questions_router.post("/generate", response_model=GenerateQuestionsResponse, status_code=201)
async def generate_questions_endpoint(
    assignment_brief: UploadFile = File(..., description="Assignment brief/description file"),
    student_submission: UploadFile = File(..., description="Student's Python code submission"),
    student_name: str = Form(..., description="Student identifier for filename"),
    svc: QuestionGenerationService = Depends(get_question_service)
):
    """
    Generate oral exam questions from an assignment brief and student code submission.
    
    Accepts:
    - assignment_brief: Text/markdown file with assignment description
    - student_submission: Python (.py) file with student's code
    - student_name: Student identifier (used for output filenames)
    
    Returns:
    - JSON with generated questions
    - Saves questions to both JSON and CSV files in outputs/questions/
    """
    try:
        # Read file contents
        assignment_content = (await assignment_brief.read()).decode('utf-8')
        student_code_content = (await student_submission.read()).decode('utf-8')
        
        # Generate questions
        result = svc.generate_questions(
            assignment_brief=assignment_content,
            student_code=student_code_content,
            student_name=student_name
        )
        
        return GenerateQuestionsResponse(
            ok=True,
            questions=result["questions"],
            csv_file_path=result["csv_file_path"],
            json_file_path=result["json_file_path"],
            questions_count=result["questions_count"],
            tokens_used=result.get("tokens_used")
        )
        
    except QuestionGenerationError as e:
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file as UTF-8: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# --- Response Evaluation Endpoints -------------------------------------------

@evaluations_router.post("/evaluate", response_model=EvaluationJobResponse, status_code=202)
async def start_evaluation(
    request: EvaluateResponsesRequest = Body(...),
    svc: ResponseEvaluationService = Depends(get_evaluation_service)
):
    """
    Start async evaluation of student responses to oral exam questions.
    
    Accepts:
    - student_name: Student identifier
    - responses_file_name: CSV file name in outputs/questions/
    
    Returns:
    - Job ID for tracking the evaluation
    - Use /status/{job_id} to check progress and get results
    """
    try:
        result = svc.start_evaluation(
            student_name=request.student_name,
            responses_file_name=request.responses_file_name
        )
        
        return EvaluationJobResponse(
            ok=True,
            job_id=result["job_id"],
            status=result["status"],
            message="Evaluation started. Use the job_id to check status.",
            student_name=result["student_name"],
            total_questions=result["total_questions"],
            estimated_time_seconds=result["estimated_time_seconds"]
        )
        
    except ResponseEvaluationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@evaluations_router.get("/status/{job_id}", response_model=EvaluationStatusResponse)
async def get_evaluation_status(
    job_id: str,
    svc: ResponseEvaluationService = Depends(get_evaluation_service)
):
    """
    Get the current status of an evaluation job.
    
    Returns:
    - Processing: Progress information
    - Completed: Full evaluation results with file paths
    - Failed: Error information
    """
    try:
        status = svc.get_job_status(job_id)
        return EvaluationStatusResponse(**status)
        
    except ResponseEvaluationError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# --- Student Assessment Endpoints ---------------------------------------------

@student_router.get("/{student_id}/assessment/{assessment_id}/questions", response_model=StudentQuestionsResponse)
async def get_student_questions(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get all questions for a specific student and assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - List of questions with metadata
    - Empty list if questions not yet generated
    """
    try:
        _assert_student_access(_principal, student_id)
        questions = svc.get_student_questions(student_id, assessment_id)
        
        # Convert to response DTOs
        question_dtos = [
            QuestionResponse(
                id=q["id"],
                text=q["text"],
                codeContext=q.get("codeContext"),
                assessmentId=q["assessmentId"],
                studentId=q["studentId"],
                difficulty=q.get("difficulty"),
                topic=q.get("topic"),
                createdAt=q["createdAt"]
            )
            for q in questions
        ]
        
        return StudentQuestionsResponse(
            studentId=student_id,
            assessmentId=assessment_id,
            questions=question_dtos,
            totalQuestions=len(question_dtos)
        )
        
    except OralAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_student_questions: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@student_router.post("/{student_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    student_id: str,
    request: SubmitAnswerRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Submit an audio answer for a specific question.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Args:
    - question_id: Question identifier
    - audio_url: S3 URL of uploaded audio file
    - duration: Recording duration in seconds
    
    Returns:
    - Confirmation with answer details
    """
    try:
        _assert_student_access(_principal, student_id)
        result = svc.submit_answer(
            student_id=student_id,
            question_id=request.question_id,
            audio_url=request.audio_url,
            duration=request.duration
        )
        
        return SubmitAnswerResponse(**result)
        
    except OralAssessmentServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in submit_answer: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@student_router.put("/{student_id}/submit", response_model=SubmitAssessmentResponse)
async def submit_assessment(
    student_id: str,
    request: SubmitAssessmentRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Mark an assessment as completed/submitted.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Validates that all questions have been answered before allowing submission.
    
    Returns:
    - Confirmation with submission details
    """
    try:
        _assert_student_access(_principal, student_id)
        result = svc.submit_assessment(
            student_id=student_id,
            assessment_id=request.assessment_id
        )
        
        return SubmitAssessmentResponse(**result)
        
    except OralAssessmentServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in submit_assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@student_router.get("/{student_id}/assessment/{assessment_id}/progress", response_model=StudentProgressResponse)
async def get_student_progress(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get current progress for a student in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - Progress data including answered/total questions
    - Status (not-started, in-progress, submitted)
    - Timestamps for start and submission
    """
    try:
        _assert_student_access(_principal, student_id)
        progress = svc.get_student_progress(student_id, assessment_id)
        return StudentProgressResponse(**progress)
        
    except OralAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_student_progress: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@student_router.get("/{student_id}/assessment/{assessment_id}/results", response_model=StudentResultsResponse)
async def get_student_results(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get evaluation results for a completed assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - Complete results including scores, grades, and feedback
    - Per-question breakdown with AI evaluation
    - Only available after instructor runs evaluation
    
    Raises:
    - 404: If results not yet available (evaluation not complete)
    """
    try:
        _assert_student_access(_principal, student_id)
        results = svc.get_student_results(student_id, assessment_id)
        return StudentResultsResponse(**results)
        
    except OralAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_student_results: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# --- Instructor Assessment Endpoints ------------------------------------------

@assessment_router.post("/create", response_model=AssessmentResponse, status_code=201)
async def create_assessment(
    request: CreateAssessmentRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Create a new oral assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Args:
    - title: Assessment title
    - course: Course name/code
    - description: Assessment description
    - dueDate: Due date (ISO format)
    - totalQuestions: Number of questions to generate per student
    - timeLimit: Optional time limit per question (minutes)
    
    Returns:
    - Created assessment with generated UUID
    """
    try:
        _assert_instructor_access(_principal)
        result = svc.create_assessment(
            title=request.title,
            course=request.course,
            description=request.description,
            due_date=request.dueDate,
            total_questions=request.totalQuestions,
            time_limit=request.timeLimit,
            owner_user_id=_principal.user_id,
        )
        
        return AssessmentResponse(**result)
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in create_assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/list", response_model=AssessmentListResponse)
async def list_assessments(
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    List all assessments (sorted by creation date, newest first).
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - List of all assessments with metadata
    """
    try:
        _assert_instructor_access(_principal)
        if _principal.source == "x-user-id":
            assessments = svc.list_assessments()
        else:
            assessments = svc.list_assessments(owner_user_id=_principal.user_id)
        
        return AssessmentListResponse(
            ok=True,
            assessments=[AssessmentResponse(**a) for a in assessments],
            total=len(assessments)
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in list_assessments: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/{id}", response_model=AssessmentResponse)
async def get_assessment(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get a specific assessment by ID.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - Assessment details
    
    Raises:
    - 404: If assessment not found
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        return AssessmentResponse(**assessment)
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.post("/{id}/upload-students", status_code=201)
async def upload_students(
    id: str,
    request: UploadStudentsRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Upload/enroll students to an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Args:
    - students: List of student objects with name, email, studentId, code, assignmentFile
    
    Returns:
    - Confirmation with number of students uploaded
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        # Convert Pydantic models to dicts
        students = [student.model_dump() for student in request.students]
        
        svc.upload_students(id, students)
        
        return {
            "ok": True,
            "assessmentId": id,
            "studentsUploaded": len(students)
        }
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in upload_students: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/{id}/students", response_model=StudentListResponse)
async def get_assessment_students(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get all students enrolled in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - List of enrolled students with enrollment details
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        students = svc.get_assessment_students(id)
        
        from src.main.dtos.InstructorAssessmentDTOs import StudentResponse
        return StudentListResponse(
            ok=True,
            assessmentId=id,
            students=[StudentResponse(**s) for s in students],
            total=len(students)
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_assessment_students: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.post("/{id}/generate-questions-batch", response_model=QuestionGenerationJobResponse, status_code=202)
async def generate_questions_batch(
    id: str,
    request: GenerateQuestionsBatchRequest = Body(...),
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    question_svc: QuestionGenerationService = Depends(get_question_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Start batch question generation for all (or specific) students in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Args:
    - studentIds: Optional list of specific students (or all if empty)
    
    Returns:
    - Job ID for status polling
    """
    try:
        _assert_instructor_access(_principal)
        # Get assessment details
        assessment = instructor_svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        
        # Get students to process
        all_students = instructor_svc.get_assessment_students(id)
        if request.studentIds:
            students_to_process = [s for s in all_students if s['studentId'] in request.studentIds]
        else:
            students_to_process = all_students
        
        if not students_to_process:
            raise HTTPException(status_code=400, detail="No students found to process")
        
        # Create batch job
        job_manager = get_batch_job_manager()
        job_id = job_manager.create_job(
            job_type=JobType.QUESTION_GENERATION,
            assessment_id=id,
            total_items=len(students_to_process),
            metadata={"assessment_title": assessment["title"]}
        )
        
        # Define processing function
        def process_student(student):
            try:
                logger.info(f"[Job {job_id}] Generating questions for {student['studentId']}")
                
                # Read assignment file (would come from S3 in production)
                assignment_brief = assessment.get('description', 'No assignment brief provided')
                student_code = student.get('code', '# No code provided')
                
                # Generate questions
                result = question_svc.generate_questions(
                    assignment_brief=assignment_brief,
                    student_code=student_code,
                    student_name=student['name'],
                    student_id=student['studentId'],
                    assessment_id=id
                )
                
                logger.info(f"[Job {job_id}] Generated {result['questions_count']} questions for {student['studentId']}")
                return True
            except Exception as e:
                logger.error(f"[Job {job_id}] Failed to generate questions for {student['studentId']}: {e}")
                return False
        
        # Run batch job async
        job_manager.run_batch_job(job_id, students_to_process, process_student)
        
        return QuestionGenerationJobResponse(
            ok=True,
            jobId=job_id,
            assessmentId=id,
            status="running",
            totalStudents=len(students_to_process),
            processedCount=0,
            message=f"Started question generation for {len(students_to_process)} students"
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in generate_questions_batch: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/{id}/generation-status/{jobId}", response_model=QuestionGenerationStatusResponse)
async def get_generation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Check status of a question generation job.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - Job status and progress
    """
    _assert_instructor_access(_principal)
    assessment = svc.get_assessment(id)
    _assert_assessment_owner(_principal, assessment)
    job_manager = get_batch_job_manager()
    job = job_manager.get_job(jobId)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {jobId} not found")
    
    if job["assessment_id"] != id:
        raise HTTPException(status_code=400, detail="Job does not belong to this assessment")
    
    return QuestionGenerationStatusResponse(
        jobId=job["job_id"],
        assessmentId=job["assessment_id"],
        status=job["status"],
        totalStudents=job["total_items"],
        processedCount=job["processed_count"],
        startedAt=job["started_at"],
        completedAt=job.get("completed_at"),
        error=job.get("error")
    )


@assessment_router.get("/{id}/progress", response_model=ProgressSummaryResponse)
async def get_assessment_progress(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get progress summary for all students in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - List of student progress with completion stats
    - Summary statistics (total, not-started, in-progress, completed)
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        progress_list = svc.get_assessment_progress(id)
        
        # Calculate summary stats
        total = len(progress_list)
        not_started = sum(1 for p in progress_list if p["status"] == "not-started")
        in_progress = sum(1 for p in progress_list if p["status"] == "in-progress")
        completed = sum(1 for p in progress_list if p["status"] == "completed")
        
        from src.main.dtos.InstructorAssessmentDTOs import StudentProgressItem
        return ProgressSummaryResponse(
            ok=True,
            assessmentId=id,
            students=[StudentProgressItem(**p) for p in progress_list],
            summary={
                "total": total,
                "notStarted": not_started,
                "inProgress": in_progress,
                "completed": completed
            }
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_assessment_progress: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.post("/{id}/evaluate-batch", response_model=EvaluationJobResponse, status_code=202)
async def evaluate_batch(
    id: str,
    request: EvaluateBatchRequest = Body(...),
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    evaluation_svc: ResponseEvaluationService = Depends(get_evaluation_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Start batch evaluation for all (or specific) students in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Args:
    - studentIds: Optional list of specific students (or all if empty)
    
    Returns:
    - Job ID for status polling
    """
    try:
        _assert_instructor_access(_principal)
        # Get assessment details
        assessment = instructor_svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        
        # Get students to process
        all_students = instructor_svc.get_assessment_students(id)
        if request.studentIds:
            students_to_process = [s for s in all_students if s['studentId'] in request.studentIds]
        else:
            students_to_process = all_students
        
        if not students_to_process:
            raise HTTPException(status_code=400, detail="No students found to process")
        
        # Create batch job
        job_manager = get_batch_job_manager()
        job_id = job_manager.create_job(
            job_type=JobType.EVALUATION,
            assessment_id=id,
            total_items=len(students_to_process),
            metadata={"assessment_title": assessment["title"]}
        )
        
        # Define processing function
        def process_student(student):
            try:
                logger.info(f"[Job {job_id}] Evaluating {student['studentId']}")
                
                # Use DynamoDB-based evaluation
                result = evaluation_svc.start_evaluation_from_dynamodb(
                    student_id=student['studentId'],
                    assessment_id=id
                )
                
                # Wait for evaluation to complete (synchronous for now)
                # In production, would poll the evaluation service job status
                import time
                eval_job_id = result['job_id']
                max_wait = 300  # 5 minutes max
                waited = 0
                
                while waited < max_wait:
                    eval_status = evaluation_svc.get_job_status(eval_job_id)
                    if eval_status['status'] in ['completed', 'failed']:
                        break
                    time.sleep(5)
                    waited += 5
                
                logger.info(f"[Job {job_id}] Completed evaluation for {student['studentId']}")
                return eval_status['status'] == 'completed'
            except Exception as e:
                logger.error(f"[Job {job_id}] Failed to evaluate {student['studentId']}: {e}")
                return False
        
        # Run batch job async
        job_manager.run_batch_job(job_id, students_to_process, process_student)
        
        return EvaluationJobResponse(
            ok=True,
            jobId=job_id,
            assessmentId=id,
            status="running",
            totalStudents=len(students_to_process),
            processedCount=0,
            message=f"Started evaluation for {len(students_to_process)} students"
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in evaluate_batch: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/{id}/evaluation-status/{jobId}", response_model=EvaluationStatusResponse)
async def get_evaluation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Check status of an evaluation job.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - Job status and progress
    """
    _assert_instructor_access(_principal)
    assessment = svc.get_assessment(id)
    _assert_assessment_owner(_principal, assessment)
    job_manager = get_batch_job_manager()
    job = job_manager.get_job(jobId)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {jobId} not found")
    
    if job["assessment_id"] != id:
        raise HTTPException(status_code=400, detail="Job does not belong to this assessment")
    
    return EvaluationStatusResponse(
        jobId=job["job_id"],
        assessmentId=job["assessment_id"],
        status=job["status"],
        totalStudents=job["total_items"],
        processedCount=job["processed_count"],
        startedAt=job["started_at"],
        completedAt=job.get("completed_at"),
        error=job.get("error")
    )


@assessment_router.get("/{id}/results", response_model=ResultsSummaryResponse)
async def get_assessment_results(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Get evaluation results for all students in an assessment.
    
    Authentication: REQUIRED - Authenticated principal required
    
    Returns:
    - List of student results with scores and grades
    - Summary statistics (average score, grade distribution)
    
    Note: Only returns results for students who have been evaluated
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        results_list = svc.get_assessment_results(id)
        
        # Calculate summary stats
        if results_list:
            avg_percentage = sum(r["percentage"] for r in results_list) / len(results_list)
            grade_counts = {}
            for r in results_list:
                grade = r["grade"]
                grade_counts[grade] = grade_counts.get(grade, 0) + 1
        else:
            avg_percentage = 0
            grade_counts = {}
        
        from src.main.dtos.InstructorAssessmentDTOs import StudentResultItem
        return ResultsSummaryResponse(
            ok=True,
            assessmentId=id,
            results=[StudentResultItem(**r) for r in results_list],
            summary={
                "averageScore": round(avg_percentage, 2),
                "gradeDistribution": grade_counts
            }
        )
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_assessment_results: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# =============================================================================
# S3 Upload Endpoints
# =============================================================================

@s3_router.post("/upload-url")
async def get_upload_url(
    filename: str,
    content_type: str = "audio/webm",
    _principal: AuthPrincipal = Depends(require_auth_principal),
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
    import boto3
    from botocore.exceptions import ClientError
    
    # Get S3 configuration from environment
    bucket_name = os.getenv("S3_ASSESSMENT_BUCKET", "c9-oral-assessments")
    region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    
    try:
        # Initialize S3 client
        s3_client = boto3.client('s3', region_name=region)
        
        # Generate presigned URL for PUT operation
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket_name,
                'Key': filename,
                'ContentType': content_type
            },
            ExpiresIn=3600  # URL valid for 1 hour
        )
        
        # Construct the public file URL
        file_url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{filename}"
        
        logger.info(f"Generated presigned URL for: {filename}")
        
        return {
            "uploadUrl": presigned_url,
            "fileUrl": file_url
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"S3 error ({error_code}): {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate upload URL: {error_message}"
        )
    except Exception as e:
        logger.error(f"Unexpected error in get_upload_url: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate upload URL: {str(e)}"
        )
