from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, HTTPException

from src.main.auth.dependencies import require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_dependencies import (
    get_evaluation_service,
    get_instructor_assessment_service,
    get_question_service,
)
from src.main.controllers.controller_helpers import (
    _assert_assessment_owner,
    _assert_instructor_access,
)
from src.main.dtos.InstructorAssessmentDTOs import (
    AssessmentListResponse,
    AssessmentResponse,
    CreateAssessmentRequest,
    EvaluateBatchRequest,
    EvaluationJobResponse,
    EvaluationStatusResponse,
    GenerateQuestionsBatchRequest,
    ProgressSummaryResponse,
    QuestionGenerationJobResponse,
    QuestionGenerationStatusResponse,
    ResultsSummaryResponse,
    StudentListResponse,
    StudentProgressItem,
    StudentResponse,
    StudentResultItem,
    UploadStudentsRequest,
)
from src.main.service.BatchJobManager import JobType, get_batch_job_manager
from src.main.service.InstructorAssessmentService import InstructorAssessmentService, InstructorAssessmentServiceError
from src.main.service.QuestionGenerationService import QuestionGenerationService
from src.main.service.ResponseEvaluationService import ResponseEvaluationService


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


@assessment_router.post("/{id}/generate-questions-batch", response_model=QuestionGenerationJobResponse, status_code=202)
async def generate_questions_batch(
    id: str,
    request: GenerateQuestionsBatchRequest = Body(...),
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    question_svc: QuestionGenerationService = Depends(get_question_service),
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
            job_type=JobType.QUESTION_GENERATION,
            assessment_id=id,
            total_items=len(students_to_process),
            metadata={"assessment_title": assessment["title"]},
        )

        def process_student(student):
            try:
                logger.info(f"[Job {job_id}] Generating questions for {student['studentId']}")

                assignment_brief = assessment.get("description", "No assignment brief provided")
                student_code = student.get("code", "# No code provided")

                result = question_svc.generate_questions(
                    assignment_brief=assignment_brief,
                    student_code=student_code,
                    student_name=student["name"],
                    student_id=student["studentId"],
                    assessment_id=id,
                )

                logger.info(f"[Job {job_id}] Generated {result['questions_count']} questions for {student['studentId']}")
                return True
            except Exception as error:
                logger.error(f"[Job {job_id}] Failed to generate questions for {student['studentId']}: {error}")
                return False

        job_manager.run_batch_job(job_id, students_to_process, process_student)

        return QuestionGenerationJobResponse(
            ok=True,
            jobId=job_id,
            assessmentId=id,
            status="running",
            totalStudents=len(students_to_process),
            processedCount=0,
            message=f"Started question generation for {len(students_to_process)} students",
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
    evaluation_svc: ResponseEvaluationService = Depends(get_evaluation_service),
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

        def process_student(student):
            try:
                logger.info(f"[Job {job_id}] Evaluating {student['studentId']}")

                result = evaluation_svc.start_evaluation_from_dynamodb(
                    student_id=student["studentId"],
                    assessment_id=id,
                )

                import time

                eval_job_id = result["job_id"]
                max_wait = 300
                waited = 0

                while waited < max_wait:
                    eval_status = evaluation_svc.get_job_status(eval_job_id)
                    if eval_status["status"] in ["completed", "failed"]:
                        break
                    time.sleep(5)
                    waited += 5

                logger.info(f"[Job {job_id}] Completed evaluation for {student['studentId']}")
                return eval_status["status"] == "completed"
            except Exception as error:
                logger.error(f"[Job {job_id}] Failed to evaluate {student['studentId']}: {error}")
                return False

        job_manager.run_batch_job(job_id, students_to_process, process_student)

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
