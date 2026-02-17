from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_dependencies import get_evaluation_service
from src.main.dtos.EvaluateResponsesRequest import EvaluateResponsesRequest
from src.main.dtos.EvaluateResponsesResponse import EvaluationJobResponse, EvaluationStatusResponse
from src.main.service.ResponseEvaluationService import ResponseEvaluationService, ResponseEvaluationError


evaluations_router = APIRouter(prefix="/internal/evaluations", tags=["evaluations"])


@evaluations_router.post("/evaluate", response_model=EvaluationJobResponse, status_code=202)
async def start_evaluation(
    request: EvaluateResponsesRequest = Body(...),
    svc: ResponseEvaluationService = Depends(get_evaluation_service),
):
    try:
        result = svc.start_evaluation(
            student_name=request.student_name,
            responses_file_name=request.responses_file_name,
        )

        return EvaluationJobResponse(
            ok=True,
            job_id=result["job_id"],
            status=result["status"],
            message="Evaluation started. Use the job_id to check status.",
            student_name=result["student_name"],
            total_questions=result["total_questions"],
            estimated_time_seconds=result["estimated_time_seconds"],
        )

    except ResponseEvaluationError as error:
        raise ApiError(status_code=400, code="evaluation_start_failed", message=str(error))
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@evaluations_router.get("/status/{job_id}", response_model=EvaluationStatusResponse)
async def get_evaluation_status(
    job_id: str,
    svc: ResponseEvaluationService = Depends(get_evaluation_service),
):
    try:
        status = svc.get_job_status(job_id)
        return EvaluationStatusResponse(**status)

    except ResponseEvaluationError as error:
        raise ApiError(status_code=404, code="evaluation_job_not_found", message=str(error))
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
