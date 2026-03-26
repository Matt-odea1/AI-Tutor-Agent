from __future__ import annotations

import logging
import os

import asyncio

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from src.main.auth.dependencies import get_auth_service, require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.auth.service import AuthService
from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_dependencies import (
    get_evaluation_service,
    get_instructor_assessment_service,
    get_instructor_question_bank_service,
    get_instructor_submission_service,
    get_question_service,
    get_sqs_job_dispatcher,
)
from src.main.controllers.controller_helpers import (
    _assert_assessment_owner,
    _assert_instructor_access,
)
from src.main.dtos.InstructorAssessmentDTOs import (
    AddStudentQuestionRequest,
    AssessmentListResponse,
    AssessmentResponse,
    BankQuestionListResponse,
    BankQuestionRequest,
    BankQuestionResponse,
    CodeUploadResponse,
    CreateAssessmentRequest,
    CsvEnrollmentResponse,
    DeleteStudentQuestionResponse,
    EvaluateBatchRequest,
    EvaluationJobResponse,
    EvaluationStatusResponse,
    GenerateQuestionsBatchRequest,
    InstructorStudentDetailResponse,
    ProgressSummaryResponse,
    ProctorChunkHealthResponse,
    ProctorChunkItem,
    QuestionGenerationJobResponse,
    QuestionGenerationStatusResponse,
    ReleaseResultsResponse,
    ResultsSummaryResponse,
    ScoreOverrideRequest,
    ScoreOverrideResponse,
    SendReminderResponse,
    StudentQuestionItem,
    StudentQuestionListResponse,
    StudentQuestionResponse,
    StudentListResponse,
    StudentProgressItem,
    StudentResponse,
    StudentResultItem,
    BankQuestionSuggestion,
    SuggestBankQuestionsRequest,
    SuggestBankQuestionsResponse,
    UpdateBriefRequest,
    UpdateStudentQuestionRequest,
    UpdateQuestionTimeLimitRequest,
    UpdateScheduleRequest,
    UpdateStatusRequest,
    UploadStudentsRequest,
    ZipUploadResponse,
)
from src.main.service.BatchJobManager import JobType, get_batch_job_manager
from src.main.service.InstructorAssessmentService import InstructorAssessmentService, InstructorAssessmentServiceError
from src.main.service.InstructorQuestionBankService import InstructorQuestionBankService, InstructorQuestionBankServiceError
from src.main.service.InstructorSubmissionService import InstructorSubmissionService, InstructorSubmissionServiceError
from src.main.service.SQSJobDispatcher import SQSJobDispatcher
from src.main.service.QuestionGenerationService import QuestionGenerationService
from src.main.service.ResponseEvaluationService import ResponseEvaluationService
from src.main.service.ResponseEvaluationRepository import ResponseEvaluationRepository


logger = logging.getLogger(__name__)


assessment_router = APIRouter(prefix="/api/assessment", tags=["assessment"])


@assessment_router.post("/create", response_model=AssessmentResponse, status_code=201)
async def create_assessment(
    request: CreateAssessmentRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
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
            access_mode=request.accessMode,
            scheduled_window_start=request.scheduledWindowStart,
            scheduled_window_end=request.scheduledWindowEnd,
            auto_evaluate=request.autoEvaluate,
            rubric=request.rubric,
        )
        return AssessmentResponse(**result)

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="assessment_create_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in create_assessment: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/list", response_model=AssessmentListResponse)
async def list_assessments(
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        if _principal.source == "x-user-id":
            assessments = svc.list_assessments()
        else:
            assessments = svc.list_assessments(owner_user_id=_principal.user_id)

        return AssessmentListResponse(
            ok=True,
            assessments=[AssessmentResponse(**item) for item in assessments],
            total=len(assessments),
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=500, code="assessment_list_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in list_assessments: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}", response_model=AssessmentResponse)
async def get_assessment(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        return AssessmentResponse(**assessment)

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_assessment: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/upload-students", status_code=201)
async def upload_students(
    id: str,
    request: UploadStudentsRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        students = [student.model_dump() for student in request.students]

        svc.upload_students(id, students)

        return {
            "ok": True,
            "assessmentId": id,
            "studentsUploaded": len(students),
        }

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="upload_students_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in upload_students: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/students", response_model=StudentListResponse)
async def get_assessment_students(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        students = svc.get_assessment_students(id)

        return StudentListResponse(
            ok=True,
            assessmentId=id,
            students=[StudentResponse(**item) for item in students],
            total=len(students),
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_students_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_assessment_students: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.delete("/{id}", status_code=204)
async def delete_assessment(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Delete a draft assessment and all its data. Only works for status='draft'."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        svc.delete_assessment(id)
        return None  # 204 No Content

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="delete_assessment_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in delete_assessment: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/schedule", response_model=AssessmentResponse)
async def update_assessment_schedule(
    id: str,
    request: UpdateScheduleRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Set or update the assessment access mode and scheduling window."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = svc.update_schedule(
            assessment_id=id,
            access_mode=request.accessMode,
            scheduled_window_start=request.scheduledWindowStart,
            scheduled_window_end=request.scheduledWindowEnd,
        )
        return AssessmentResponse(**result)

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="update_schedule_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in update_assessment_schedule: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/status", response_model=AssessmentResponse)
async def update_assessment_status(
    id: str,
    request: UpdateStatusRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Transition assessment status: draft→open, open→closed."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = svc.update_status(id, request.status)
        return AssessmentResponse(**result)
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="update_status_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in update_assessment_status: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/window-status")
async def get_window_status(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
):
    """
    Public endpoint — no auth required.
    Returns the current window state so the student frontend can show
    a countdown before directing the student to exchange their invite token.
    """
    try:
        assessment = svc.get_assessment(id)
        access_mode = assessment.get("accessMode", "open")

        if access_mode == "open":
            return {"assessmentId": id, "accessMode": "open", "state": "open"}

        from datetime import datetime, timezone
        window_start = assessment.get("scheduledWindowStart")
        window_end = assessment.get("scheduledWindowEnd")

        if not window_start or not window_end:
            return {"assessmentId": id, "accessMode": "scheduled", "state": "open"}

        now = datetime.now(timezone.utc)

        def _parse(dt_str):
            parsed = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

        start = _parse(window_start)
        end = _parse(window_end)

        if now < start:
            state = "upcoming"
        elif now > end:
            state = "closed"
        else:
            state = "open"

        return {
            "assessmentId": id,
            "accessMode": "scheduled",
            "state": state,
            "scheduledWindowStart": window_start,
            "scheduledWindowEnd": window_end,
        }

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except Exception as error:
        logger.error(f"Unexpected error in get_window_status: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/students/{student_id}/invite")
async def generate_student_invite(
    id: str,
    student_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    auth_service: AuthService = Depends(get_auth_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Generate a single-use invitation link for a specific student."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        students = svc.get_assessment_students(id)
        if not any(s["studentId"] == student_id for s in students):
            raise ApiError(
                status_code=404,
                code="student_not_enrolled",
                message=f"Student {student_id} is not enrolled in assessment {id}",
            )

        token = auth_service.generate_student_invite_token(student_id, id)
        base_url = os.getenv("STUDENT_ASSESSMENT_BASE_URL", "http://localhost:5176")
        invite_link = f"{base_url}/invite?token={token}"

        # Send invite email (non-blocking — logs warning on failure)
        student = next((s for s in students if s["studentId"] == student_id), {})
        auth_service.send_student_invite_email(
            student_email=student.get("email", ""),
            student_name=student.get("name", student_id),
            assessment_title=assessment.get("title", id),
            invite_link=invite_link,
        )

        return {
            "ok": True,
            "studentId": student_id,
            "assessmentId": id,
            "inviteToken": token,
            "inviteLink": invite_link,
            "emailSent": bool(student.get("email")),
        }

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in generate_student_invite: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/upload-csv", response_model=CsvEnrollmentResponse, status_code=201)
async def upload_students_csv(
    id: str,
    file: UploadFile = File(..., description="CSV file with columns: student_id, name, email"),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    submission_svc: InstructorSubmissionService = Depends(get_instructor_submission_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Bulk-enrol students from a CSV file.
    Required columns (case-insensitive): student_id / studentId, name, email.
    Per-row validation errors are returned rather than failing the whole upload.
    Duplicate student IDs within the file are rejected.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        csv_bytes = await file.read()
        valid_rows, error_rows = submission_svc.parse_csv_enrollment(csv_bytes)

        if valid_rows:
            svc.upload_students(id, valid_rows)

        return CsvEnrollmentResponse(
            ok=True,
            assessmentId=id,
            enrolledCount=len(valid_rows),
            errorCount=len(error_rows),
            errors=error_rows,
        )

    except InstructorSubmissionServiceError as error:
        raise ApiError(status_code=400, code="csv_parse_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="csv_enrollment_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in upload_students_csv: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post(
    "/{id}/students/{student_id}/upload-code",
    response_model=CodeUploadResponse,
    status_code=201,
)
async def upload_student_code(
    id: str,
    student_id: str,
    files: list[UploadFile] = File(..., description="One or more code files (≤500 KB each)"),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    submission_svc: InstructorSubmissionService = Depends(get_instructor_submission_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Upload one or more code files for a specific student.
    Accepted extensions: .py .js .ts .java .cpp .c .go .rb .txt
    Files are concatenated with filename separator headers and stored in S3.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        students = svc.get_assessment_students(id)
        if not any(s["studentId"] == student_id for s in students):
            raise ApiError(
                status_code=404,
                code="student_not_found",
                message=f"Student {student_id} is not enrolled in assessment {id}",
            )

        file_tuples = [(f.filename or "upload.txt", await f.read()) for f in files]
        result = submission_svc.upload_student_code_files(id, student_id, file_tuples)

        return CodeUploadResponse(**result)

    except InstructorSubmissionServiceError as error:
        raise ApiError(status_code=400, code="code_upload_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in upload_student_code: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/upload-zip", response_model=ZipUploadResponse, status_code=201)
async def upload_zip_submissions(
    id: str,
    file: UploadFile = File(..., description="Zip archive with one file per student, named by student ID"),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    submission_svc: InstructorSubmissionService = Depends(get_instructor_submission_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Upload a zip archive of student submissions.
    Each file in the zip should be named by student ID (e.g., s12345.py).
    Matched by filename stem (case-insensitive) against enrolled student IDs.
    Unmatched files are reported as warnings; errors do not abort the whole upload.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        students = svc.get_assessment_students(id)
        enrolled_ids = [s["studentId"] for s in students]

        zip_bytes = await file.read()
        result = submission_svc.upload_zip_submissions(id, zip_bytes, enrolled_ids)

        return ZipUploadResponse(**result)

    except InstructorSubmissionServiceError as error:
        raise ApiError(status_code=400, code="zip_upload_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in upload_zip_submissions: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/brief", response_model=AssessmentResponse)
async def update_assessment_brief(
    id: str,
    request: UpdateBriefRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Update the assignment brief for an assessment.
    The brief must be at least 50 characters.
    Only editable while the assessment is in draft or scheduled status.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = svc.update_brief(id, request.brief)
        return AssessmentResponse(**result)

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="update_brief_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in update_assessment_brief: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/generate-questions-batch", response_model=QuestionGenerationJobResponse, status_code=202)
async def generate_questions_batch(
    id: str,
    request: GenerateQuestionsBatchRequest = Body(...),
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    dispatcher: SQSJobDispatcher = Depends(get_sqs_job_dispatcher),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Trigger batch question generation for all (or specified) enrolled students.
    One SQS message is enqueued per student; the in-process consumer processes
    them asynchronously. Job state is persisted to DynamoDB so it survives
    server restarts.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = instructor_svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        all_students = instructor_svc.get_assessment_students(id)
        if request.studentIds:
            students_to_process = [s for s in all_students if s["studentId"] in request.studentIds]
        else:
            students_to_process = all_students

        if not students_to_process:
            raise ApiError(status_code=400, code="no_students_to_process", message="No students found to process")

        # Prefer the dedicated assignmentBrief field; fall back to description
        assignment_brief = (
            assessment.get("assignmentBrief")
            or assessment.get("description")
            or "No assignment brief provided"
        )

        job_manager = get_batch_job_manager()
        job_id = job_manager.create_job(
            job_type=JobType.QUESTION_GENERATION,
            assessment_id=id,
            total_items=len(students_to_process),
            metadata={"assessment_title": assessment["title"]},
        )

        enqueued = dispatcher.enqueue_question_generation(
            job_id=job_id,
            assessment_id=id,
            students=students_to_process,
            assignment_brief=assignment_brief,
        )

        return QuestionGenerationJobResponse(
            ok=True,
            jobId=job_id,
            assessmentId=id,
            status="pending",
            totalStudents=len(students_to_process),
            processedCount=0,
            message=f"Enqueued question generation for {enqueued}/{len(students_to_process)} students",
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="question_generation_batch_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in generate_questions_batch: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/generation-status/{jobId}/stream")
async def stream_generation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    SSE endpoint — streams real-time job progress from DynamoDB.
    Emits an event every 2 seconds until the job is completed or failed,
    then sends a final event and closes the stream.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
    except (InstructorAssessmentServiceError, ApiError, HTTPException) as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))

    job_manager = get_batch_job_manager()

    async def event_stream():
        import json as _json
        terminal = {"completed", "failed"}
        while True:
            job = job_manager.get_job(jobId)
            if not job:
                yield f"event: error\ndata: {_json.dumps({'message': 'Job not found'})}\n\n"
                break

            payload = _json.dumps({
                "jobId": job["job_id"],
                "status": job["status"],
                "totalStudents": job["total_items"],
                "processedCount": job["processed_count"],
                "successfulCount": job.get("successful_count", 0),
                "failedCount": job.get("failed_count", 0),
                "completedAt": job.get("completed_at"),
            })
            yield f"data: {payload}\n\n"

            if job["status"] in terminal:
                break
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@assessment_router.get("/{id}/students/{studentId}/evaluation-progress")
async def stream_student_evaluation_progress(
    id: str,
    studentId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """SSE stream for per-question evaluation progress for a single student.

    Emits one event per poll cycle (2 s) with:
      { questionsEvaluated, totalQuestions, percentage, status }

    Closes when status is 'completed' or 'failed', or after 10 min (300 polls).
    """
    import json as _json
    _assert_instructor_access(_principal)
    assessment = svc.get_assessment(id)
    _assert_assessment_owner(_principal, assessment)

    repo = ResponseEvaluationRepository()
    terminal = {"completed", "failed"}

    async def event_stream():
        for _ in range(300):  # max 10 min
            item = repo.get_evaluation_progress(studentId, id)
            if item is None:
                yield f"data: {_json.dumps({'status': 'not_started', 'questionsEvaluated': 0, 'totalQuestions': 0, 'percentage': 0})}\n\n"
                await asyncio.sleep(2)
                continue

            payload = _json.dumps({
                "questionsEvaluated": int(item.get("questionsEvaluated", 0)),
                "totalQuestions": int(item.get("totalQuestions", 0)),
                "percentage": float(item.get("percentage", 0)),
                "status": item.get("status", "evaluating"),
                "updatedAt": item.get("updatedAt"),
            })
            yield f"data: {payload}\n\n"
            if item.get("status") in terminal:
                break
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@assessment_router.get("/{id}/generation-status/{jobId}", response_model=QuestionGenerationStatusResponse)
async def get_generation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        job_manager = get_batch_job_manager()
        job = job_manager.get_job(jobId)

        if not job:
            raise ApiError(status_code=404, code="job_not_found", message=f"Job {jobId} not found")

        if job["assessment_id"] != id:
            raise ApiError(status_code=400, code="job_assessment_mismatch", message="Job does not belong to this assessment")

        return QuestionGenerationStatusResponse(
            jobId=job["job_id"],
            assessmentId=job["assessment_id"],
            status=job["status"],
            totalStudents=job["total_items"],
            processedCount=job["processed_count"],
            startedAt=job["started_at"],
            completedAt=job.get("completed_at"),
            error=job.get("error"),
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_generation_status: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/progress", response_model=ProgressSummaryResponse)
async def get_assessment_progress(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        progress_list = svc.get_assessment_progress(id)

        total = len(progress_list)
        not_started = sum(1 for p in progress_list if p["status"] == "not-started")
        in_progress = sum(1 for p in progress_list if p["status"] == "in-progress")
        completed = sum(1 for p in progress_list if p["status"] == "completed")

        return ProgressSummaryResponse(
            ok=True,
            assessmentId=id,
            students=[StudentProgressItem(**item) for item in progress_list],
            summary={
                "total": total,
                "notStarted": not_started,
                "inProgress": in_progress,
                "completed": completed,
            },
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_progress_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_assessment_progress: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/evaluate-batch", response_model=EvaluationJobResponse, status_code=202)
async def evaluate_batch(
    id: str,
    request: EvaluateBatchRequest = Body(...),
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    dispatcher: SQSJobDispatcher = Depends(get_sqs_job_dispatcher),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = instructor_svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        all_students = instructor_svc.get_assessment_students(id)
        if request.studentIds:
            students_to_process = [s for s in all_students if s["studentId"] in request.studentIds]
        else:
            students_to_process = all_students

        if not students_to_process:
            raise ApiError(status_code=400, code="no_students_to_process", message="No students found to process")

        job_manager = get_batch_job_manager()
        job_id = job_manager.create_job(
            job_type=JobType.EVALUATION,
            assessment_id=id,
            total_items=len(students_to_process),
            metadata={"assessment_title": assessment["title"]},
        )

        enqueued = dispatcher.enqueue_evaluation_batch(
            job_id=job_id,
            assessment_id=id,
            students=students_to_process,
        )
        logger.info("[Job %s] Enqueued %d/%d evaluation messages", job_id, enqueued, len(students_to_process))

        return EvaluationJobResponse(
            ok=True,
            jobId=job_id,
            assessmentId=id,
            status="running",
            totalStudents=len(students_to_process),
            processedCount=0,
            message=f"Started evaluation for {len(students_to_process)} students",
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="evaluation_batch_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in evaluate_batch: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/evaluation-status/{jobId}", response_model=EvaluationStatusResponse)
async def get_evaluation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        job_manager = get_batch_job_manager()
        job = job_manager.get_job(jobId)

        if not job:
            raise ApiError(status_code=404, code="job_not_found", message=f"Job {jobId} not found")

        if job["assessment_id"] != id:
            raise ApiError(status_code=400, code="job_assessment_mismatch", message="Job does not belong to this assessment")

        return EvaluationStatusResponse(
            jobId=job["job_id"],
            assessmentId=job["assessment_id"],
            status=job["status"],
            totalStudents=job["total_items"],
            processedCount=job["processed_count"],
            startedAt=job["started_at"],
            completedAt=job.get("completed_at"),
            error=job.get("error"),
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_evaluation_status: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/results", response_model=ResultsSummaryResponse)
async def get_assessment_results(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        results_list = svc.get_assessment_results(id)

        if results_list:
            avg_percentage = sum(item["percentage"] for item in results_list) / len(results_list)
            grade_counts = {}
            for item in results_list:
                grade = item["grade"]
                grade_counts[grade] = grade_counts.get(grade, 0) + 1
        else:
            avg_percentage = 0
            grade_counts = {}

        return ResultsSummaryResponse(
            ok=True,
            assessmentId=id,
            results=[StudentResultItem(**item) for item in results_list],
            summary={
                "averageScore": round(avg_percentage, 2),
                "gradeDistribution": grade_counts,
            },
        )

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_results_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_assessment_results: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


# ──────────────────────────────────────────────────────────────────────────────
# Sprint 4 – Question Bank (EPIC-3-2)
# ──────────────────────────────────────────────────────────────────────────────

@assessment_router.get("/{id}/bank-questions", response_model=BankQuestionListResponse)
async def list_bank_questions(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    bank_svc: InstructorQuestionBankService = Depends(get_instructor_question_bank_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """List all question bank questions for an assessment."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        questions = bank_svc.list_questions(id)
        return BankQuestionListResponse(
            ok=True,
            assessmentId=id,
            questions=[BankQuestionResponse(**q) for q in questions],
            total=len(questions),
        )
    except InstructorQuestionBankServiceError as error:
        raise ApiError(status_code=400, code="bank_questions_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in list_bank_questions: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/bank-questions", response_model=BankQuestionResponse, status_code=201)
async def add_bank_question(
    id: str,
    request: BankQuestionRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    bank_svc: InstructorQuestionBankService = Depends(get_instructor_question_bank_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Add a question to the assessment bank (max 20 per assessment)."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = bank_svc.add_question(
            assessment_id=id,
            text=request.text,
            topic=request.topic,
            difficulty=request.difficulty,
            time_limit=request.timeLimit,
            source="manual",
        )
        return BankQuestionResponse(**result)
    except InstructorQuestionBankServiceError as error:
        raise ApiError(status_code=400, code="add_bank_question_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in add_bank_question: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.delete("/{id}/bank-questions/{question_id}", status_code=204)
async def delete_bank_question(
    id: str,
    question_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    bank_svc: InstructorQuestionBankService = Depends(get_instructor_question_bank_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Delete a bank question from an assessment."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        bank_svc.delete_question(id, question_id)
        return None
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in delete_bank_question: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/bank-questions/suggest", response_model=SuggestBankQuestionsResponse)
async def suggest_bank_questions(
    id: str,
    request: SuggestBankQuestionsRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    bank_svc: InstructorQuestionBankService = Depends(get_instructor_question_bank_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    AI-suggest general bank questions based on the assessment brief.
    Returns suggestions without saving them — the instructor selects which to add
    via POST /{id}/bank-questions.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        suggestions = bank_svc.suggest_questions(id, count=request.count)
        return SuggestBankQuestionsResponse(
            ok=True,
            assessmentId=id,
            suggestions=[BankQuestionSuggestion(**s) for s in suggestions],
            total=len(suggestions),
        )
    except InstructorQuestionBankServiceError as error:
        raise ApiError(status_code=400, code="suggest_bank_questions_failed", message=str(error))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in suggest_bank_questions: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


# ──────────────────────────────────────────────────────────────────────────────
# Sprint 4 – Per-question time limit override (EPIC-3-4)
# ──────────────────────────────────────────────────────────────────────────────

@assessment_router.patch("/{id}/students/{student_id}/questions/{question_id}/time-limit")
async def update_question_time_limit(
    id: str,
    student_id: str,
    question_id: str,
    request: UpdateQuestionTimeLimitRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """
    Set or clear a per-question time limit override for a student's question.
    timeLimit = null removes the override (assessment default applies).
    timeLimit = N (seconds) overrides the assessment default for this question only.
    """
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)

        pk = f"STUDENT#{student_id}#ASSESSMENT#{id}"
        if request.timeLimit is not None:
            svc.table.update_item(
                Key={"PK": pk, "SK": f"QUESTION#{question_id}"},
                UpdateExpression="SET timeLimit = :tl",
                ExpressionAttributeValues={":tl": request.timeLimit},
            )
        else:
            svc.table.update_item(
                Key={"PK": pk, "SK": f"QUESTION#{question_id}"},
                UpdateExpression="REMOVE timeLimit",
            )

        logger.info(
            "Set timeLimit=%s on question %s for student %s in assessment %s",
            request.timeLimit, question_id, student_id, id,
        )
        return {"ok": True, "questionId": question_id, "studentId": student_id, "timeLimit": request.timeLimit}

    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in update_question_time_limit: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


# ──────────────────────────────────────────────────────────────────────────────
# Sprint 8 – Results Dashboards (EPIC-6-1 to 6-4)
# ──────────────────────────────────────────────────────────────────────────────

import json as _json


@assessment_router.get("/{id}/student/{student_id}/results", response_model=InstructorStudentDetailResponse)
async def get_student_detail(
    id: str,
    student_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-2: Instructor per-student detailed results with transcript, playback URLs, and proctor chunk health."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        detail = svc.get_student_detail(id, student_id)
        proctor_raw = detail.pop("proctoring")
        proctor_chunks = [ProctorChunkItem(**c) for c in proctor_raw.pop("chunks", [])]
        return InstructorStudentDetailResponse(
            **detail,
            proctoring=ProctorChunkHealthResponse(
                ok=True,
                chunks=proctor_chunks,
                **proctor_raw,
            ),
        )
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="student_detail_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_student_detail: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/student/{student_id}/question/{question_id}/override", response_model=ScoreOverrideResponse)
async def override_question_score(
    id: str,
    student_id: str,
    question_id: str,
    request: ScoreOverrideRequest = Body(...),
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-2: Override an AI-assigned score for a specific question."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = svc.override_question_score(id, student_id, question_id, request.score, request.comment)
        return ScoreOverrideResponse(ok=True, **result)
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="override_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in override_question_score: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/release-results", response_model=ReleaseResultsResponse)
async def release_results(
    id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-3: Release results so students can view their feedback."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        result = svc.release_results(id)
        return ReleaseResultsResponse(ok=True, **result)
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=404, code="assessment_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in release_results: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/student/{student_id}/remind", response_model=SendReminderResponse)
async def send_reminder(
    id: str,
    student_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-4: Send an email reminder to a student who has not yet submitted."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        message = svc.send_reminder_email(id, student_id)
        return SendReminderResponse(ok=True, studentId=student_id, assessmentId=id, message=message)
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="reminder_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in send_reminder: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


# ── EPIC-3-3: Question Preview and Editing ───────────────────────────────────

@assessment_router.get("/{id}/students/{student_id}/questions", response_model=StudentQuestionListResponse)
async def list_student_questions(
    id: str,
    student_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-3-3: List all generated questions for a student."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        questions_raw = svc.list_student_questions(id, student_id)
        questions = [StudentQuestionItem(**q) for q in questions_raw]
        return StudentQuestionListResponse(
            assessmentId=id, studentId=student_id, questions=questions, total=len(questions)
        )
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="list_questions_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error("Unexpected error in list_student_questions: %s", error)
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.put("/{id}/students/{student_id}/questions/{question_id}", response_model=StudentQuestionResponse)
async def update_student_question(
    id: str,
    student_id: str,
    question_id: str,
    body: UpdateStudentQuestionRequest,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-3-3: Edit a student question's text. Locked once assessment is open."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        updated = svc.update_student_question(id, student_id, question_id, body.text, body.timeLimit)
        return StudentQuestionResponse(question=StudentQuestionItem(**updated))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="update_question_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error("Unexpected error in update_student_question: %s", error)
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.delete("/{id}/students/{student_id}/questions/{question_id}", response_model=DeleteStudentQuestionResponse)
async def delete_student_question(
    id: str,
    student_id: str,
    question_id: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-3-3: Delete a student question. Min 1 must remain. Locked once assessment is open."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        deleted_id = svc.delete_student_question(id, student_id, question_id)
        return DeleteStudentQuestionResponse(deletedId=deleted_id)
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="delete_question_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error("Unexpected error in delete_student_question: %s", error)
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.post("/{id}/students/{student_id}/questions", response_model=StudentQuestionResponse, status_code=201)
async def add_student_question(
    id: str,
    student_id: str,
    body: AddStudentQuestionRequest,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-3-3: Manually add a question for a specific student. Locked once assessment is open."""
    try:
        _assert_instructor_access(_principal)
        assessment = svc.get_assessment(id)
        _assert_assessment_owner(_principal, assessment)
        added = svc.add_student_question(
            id, student_id, body.text, body.questionType, body.difficulty, body.topic, body.timeLimit
        )
        return StudentQuestionResponse(question=StudentQuestionItem(**added))
    except InstructorAssessmentServiceError as error:
        raise ApiError(status_code=400, code="add_question_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error("Unexpected error in add_student_question: %s", error)
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@assessment_router.get("/{id}/evaluation-status-stream/{jobId}")
async def stream_evaluation_status(
    id: str,
    jobId: str,
    svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-1: SSE stream for evaluation job status (auto-refreshes results dashboard)."""
    _assert_instructor_access(_principal)
    assessment = svc.get_assessment(id)
    _assert_assessment_owner(_principal, assessment)

    terminal = {"completed", "failed"}
    job_manager = get_batch_job_manager()

    async def event_stream():
        while True:
            job = job_manager.get_job(jobId)
            if not job:
                yield f"event: error\ndata: {_json.dumps({'message': 'Job not found'})}\n\n"
                break
            payload = _json.dumps({
                "jobId": job["job_id"],
                "status": job["status"],
                "totalStudents": job["total_items"],
                "processedCount": job["processed_count"],
                "successfulCount": job.get("successful_count", 0),
                "failedCount": job.get("failed_count", 0),
                "completedAt": job.get("completed_at"),
            })
            yield f"data: {payload}\n\n"
            if job["status"] in terminal:
                break
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
