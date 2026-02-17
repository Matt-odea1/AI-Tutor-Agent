from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, HTTPException

from src.main.auth.dependencies import require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_helpers import _assert_student_access
from src.main.controllers.controller_dependencies import get_oral_assessment_service
from src.main.dtos.StudentAssessmentDTOs import (
    QuestionResponse,
    StudentProgressResponse,
    StudentQuestionsResponse,
    StudentResultsResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmitAssessmentRequest,
    SubmitAssessmentResponse,
)
from src.main.service.OralAssessmentService import OralAssessmentService, OralAssessmentServiceError


logger = logging.getLogger(__name__)


student_router = APIRouter(prefix="/api/student", tags=["student"])


@student_router.get("/{student_id}/assessment/{assessment_id}/questions", response_model=StudentQuestionsResponse)
async def get_student_questions(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id)
        questions = svc.get_student_questions(student_id, assessment_id)

        question_dtos = [
            QuestionResponse(
                id=q["id"],
                text=q["text"],
                codeContext=q.get("codeContext"),
                assessmentId=q["assessmentId"],
                studentId=q["studentId"],
                difficulty=q.get("difficulty"),
                topic=q.get("topic"),
                createdAt=q["createdAt"],
            )
            for q in questions
        ]

        return StudentQuestionsResponse(
            studentId=student_id,
            assessmentId=assessment_id,
            questions=question_dtos,
            totalQuestions=len(question_dtos),
        )

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=404, code="student_questions_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_student_questions: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@student_router.post("/{student_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    student_id: str,
    request: SubmitAnswerRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id)
        result = svc.submit_answer(
            student_id=student_id,
            question_id=request.question_id,
            audio_url=request.audio_url,
            duration=request.duration,
        )

        return SubmitAnswerResponse(**result)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=400, code="submit_answer_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in submit_answer: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@student_router.put("/{student_id}/submit", response_model=SubmitAssessmentResponse)
async def submit_assessment(
    student_id: str,
    request: SubmitAssessmentRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id)
        result = svc.submit_assessment(
            student_id=student_id,
            assessment_id=request.assessment_id,
        )

        return SubmitAssessmentResponse(**result)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=400, code="submit_assessment_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in submit_assessment: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@student_router.get("/{student_id}/assessment/{assessment_id}/progress", response_model=StudentProgressResponse)
async def get_student_progress(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id)
        progress = svc.get_student_progress(student_id, assessment_id)
        return StudentProgressResponse(**progress)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=404, code="student_progress_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_student_progress: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@student_router.get("/{student_id}/assessment/{assessment_id}/results", response_model=StudentResultsResponse)
async def get_student_results(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id)
        results = svc.get_student_results(student_id, assessment_id)
        return StudentResultsResponse(**results)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=404, code="student_results_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_student_results: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
