# src/main/controller/ContextController.py
from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Body, Depends, UploadFile, File, Form, HTTPException

from ..dtos.UploadRequest import UploadRequest
from ..dtos.DeleteRequest import DeleteRequest
from ..dtos.ListDocumentsRequest import ListDocumentsRequest
from src.main.service.ContextVectorService import ContextVectorService
from src.main.service.ChatService import ChatService, ChatServiceError
from src.main.dtos.ChatRequest import ChatRequest
from src.main.dtos.ChatResponse import ChatResponse
from src.main.dtos.ChatHistoryResponse import ChatHistoryResponse, ChatMessage
from src.main.dtos.SessionListResponse import SessionListResponse, SessionInfo
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
questions_router = APIRouter(prefix="/internal/questions", tags=["questions"])
evaluations_router = APIRouter(prefix="/internal/evaluations", tags=["evaluations"])
student_router = APIRouter(prefix="/api/student", tags=["student"])
assessment_router = APIRouter(prefix="/api/assessment", tags=["assessment"])
s3_router = APIRouter(prefix="/api/s3", tags=["s3"])


# --- Endpoints -----------------------------------------------------------------

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

@chat_router.post("", response_model=ChatResponse)
def chat_endpoint(request: ChatRequest = Body(...), svc: ChatService = Depends(get_chat_service)):
    try:
        result = svc.chat(
            query=request.query, 
            top_k=request.top_k or 5, 
            session_id=request.session_id,
            include_history=request.include_history,
            pedagogy_mode=request.pedagogy_mode,
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


# --- Conversation History Endpoints -------------------------------------------

@chat_router.get("/history/{session_id}", response_model=ChatHistoryResponse)
def get_history_endpoint(
    session_id: str,
    max_messages: int = None,
    memory: ConversationMemory = Depends(get_memory_service)
):
    """
    Retrieve conversation history for a specific session.
    
    Args:
        session_id: Session identifier
        max_messages: Optional limit on number of messages to return (most recent first)
    
    Returns:
        ChatHistoryResponse with session info and message history
    """
    # Check if session exists
    if not memory.session_exists(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    
    # Get history and stats
    messages = memory.get_history(session_id, max_messages=max_messages)
    stats = memory.get_session_stats(session_id)
    
    # Convert to ChatMessage DTOs
    message_dtos = [
        ChatMessage(
            role=msg["role"],
            content=msg["content"],
            timestamp=msg["timestamp"],
            tokens=msg.get("tokens"),
            context_ids=msg.get("context_ids", [])
        )
        for msg in messages
    ]
    
    return ChatHistoryResponse(
        session_id=session_id,
        messages=message_dtos,
        total_messages=stats["message_count"],
        created_at=stats["created_at"],
        last_accessed=stats["last_accessed"],
        total_tokens=stats["total_tokens"]
    )


@chat_router.get("/sessions", response_model=SessionListResponse)
def list_sessions_endpoint(memory: ConversationMemory = Depends(get_memory_service)):
    """
    List all active conversation sessions.
    
    Returns:
        SessionListResponse with list of all sessions and their metadata
    """
    sessions = memory.list_sessions()
    
    # Convert to SessionInfo DTOs
    session_dtos = [
        SessionInfo(
            session_id=s["session_id"],
            message_count=s["message_count"],
            created_at=s["created_at"],
            last_accessed=s["last_accessed"],
            total_tokens=s["total_tokens"],
            title=s.get("title", "New Chat")
        )
        for s in sessions
    ]
    
    return SessionListResponse(
        sessions=session_dtos,
        total=len(session_dtos)
    )


@chat_router.delete("/history/{session_id}")
def clear_history_endpoint(
    session_id: str,
    memory: ConversationMemory = Depends(get_memory_service)
):
    """
    Clear conversation history for a specific session.
    
    Args:
        session_id: Session identifier to clear
    
    Returns:
        Confirmation message
    """
    memory.clear_session(session_id)
    return {
        "ok": True,
        "session_id": session_id,
        "message": f"Session '{session_id}' cleared successfully"
    }


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
    svc: OralAssessmentService = Depends(get_oral_assessment_service)
):
    """
    Get all questions for a specific student and assessment.
    
    Authentication: STUBBED - Direct access via URL params
    
    Returns:
    - List of questions with metadata
    - Empty list if questions not yet generated
    """
    try:
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
    svc: OralAssessmentService = Depends(get_oral_assessment_service)
):
    """
    Submit an audio answer for a specific question.
    
    Authentication: STUBBED - Direct access via student_id
    
    Args:
    - question_id: Question identifier
    - audio_url: S3 URL of uploaded audio file
    - duration: Recording duration in seconds
    
    Returns:
    - Confirmation with answer details
    """
    try:
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
    svc: OralAssessmentService = Depends(get_oral_assessment_service)
):
    """
    Mark an assessment as completed/submitted.
    
    Authentication: STUBBED - Direct access via student_id
    
    Validates that all questions have been answered before allowing submission.
    
    Returns:
    - Confirmation with submission details
    """
    try:
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
    svc: OralAssessmentService = Depends(get_oral_assessment_service)
):
    """
    Get current progress for a student in an assessment.
    
    Authentication: STUBBED - Direct access via URL params
    
    Returns:
    - Progress data including answered/total questions
    - Status (not-started, in-progress, submitted)
    - Timestamps for start and submission
    """
    try:
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
    svc: OralAssessmentService = Depends(get_oral_assessment_service)
):
    """
    Get evaluation results for a completed assessment.
    
    Authentication: STUBBED - Direct access via URL params
    
    Returns:
    - Complete results including scores, grades, and feedback
    - Per-question breakdown with AI evaluation
    - Only available after instructor runs evaluation
    
    Raises:
    - 404: If results not yet available (evaluation not complete)
    """
    try:
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Create a new oral assessment.
    
    Authentication: STUBBED - No auth required for MVP
    
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
        result = svc.create_assessment(
            title=request.title,
            course=request.course,
            description=request.description,
            due_date=request.dueDate,
            total_questions=request.totalQuestions,
            time_limit=request.timeLimit
        )
        
        return AssessmentResponse(**result)
        
    except InstructorAssessmentServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in create_assessment: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@assessment_router.get("/list", response_model=AssessmentListResponse)
async def list_assessments(
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    List all assessments (sorted by creation date, newest first).
    
    Authentication: STUBBED - Returns all assessments
    
    Returns:
    - List of all assessments with metadata
    """
    try:
        assessments = svc.list_assessments()
        
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Get a specific assessment by ID.
    
    Authentication: STUBBED - Direct access via ID
    
    Returns:
    - Assessment details
    
    Raises:
    - 404: If assessment not found
    """
    try:
        assessment = svc.get_assessment(id)
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Upload/enroll students to an assessment.
    
    Authentication: STUBBED - No auth required
    
    Args:
    - students: List of student objects with name, email, studentId, code, assignmentFile
    
    Returns:
    - Confirmation with number of students uploaded
    """
    try:
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Get all students enrolled in an assessment.
    
    Authentication: STUBBED - Direct access via assessment ID
    
    Returns:
    - List of enrolled students with enrollment details
    """
    try:
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
    question_svc: QuestionGenerationService = Depends(get_question_service)
):
    """
    Start batch question generation for all (or specific) students in an assessment.
    
    Authentication: STUBBED - No auth required
    
    Args:
    - studentIds: Optional list of specific students (or all if empty)
    
    Returns:
    - Job ID for status polling
    """
    try:
        # Get assessment details
        assessment = instructor_svc.get_assessment(id)
        
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Check status of a question generation job.
    
    Authentication: STUBBED - Direct access via IDs
    
    Returns:
    - Job status and progress
    """
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Get progress summary for all students in an assessment.
    
    Authentication: STUBBED - Direct access via assessment ID
    
    Returns:
    - List of student progress with completion stats
    - Summary statistics (total, not-started, in-progress, completed)
    """
    try:
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
    evaluation_svc: ResponseEvaluationService = Depends(get_evaluation_service)
):
    """
    Start batch evaluation for all (or specific) students in an assessment.
    
    Authentication: STUBBED - No auth required
    
    Args:
    - studentIds: Optional list of specific students (or all if empty)
    
    Returns:
    - Job ID for status polling
    """
    try:
        # Get assessment details
        assessment = instructor_svc.get_assessment(id)
        
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Check status of an evaluation job.
    
    Authentication: STUBBED - Direct access via IDs
    
    Returns:
    - Job status and progress
    """
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
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service)
):
    """
    Get evaluation results for all students in an assessment.
    
    Authentication: STUBBED - Direct access via assessment ID
    
    Returns:
    - List of student results with scores and grades
    - Summary statistics (average score, grade distribution)
    
    Note: Only returns results for students who have been evaluated
    """
    try:
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
    content_type: str = "audio/webm"
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
