from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, Form

from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_dependencies import get_question_service
from src.main.dtos.GenerateQuestionsResponse import GenerateQuestionsResponse
from src.main.service.QuestionGenerationService import QuestionGenerationService, QuestionGenerationError


questions_router = APIRouter(prefix="/internal/questions", tags=["questions"])


@questions_router.post("/generate", response_model=GenerateQuestionsResponse, status_code=201)
async def generate_questions_endpoint(
    assignment_brief: UploadFile = File(..., description="Assignment brief/description file"),
    student_submission: UploadFile = File(..., description="Student's Python code submission"),
    student_name: str = Form(..., description="Student identifier for filename"),
    svc: QuestionGenerationService = Depends(get_question_service),
):
    try:
        assignment_content = (await assignment_brief.read()).decode("utf-8")
        student_code_content = (await student_submission.read()).decode("utf-8")

        result = svc.generate_questions(
            assignment_brief=assignment_content,
            student_code=student_code_content,
            student_name=student_name,
        )

        return GenerateQuestionsResponse(
            ok=True,
            questions=result["questions"],
            csv_file_path=result["csv_file_path"],
            json_file_path=result["json_file_path"],
            questions_count=result["questions_count"],
            tokens_used=result.get("tokens_used"),
        )

    except QuestionGenerationError as error:
        raise ApiError(status_code=500, code="question_generation_failed", message=str(error))
    except UnicodeDecodeError as error:
        raise ApiError(status_code=400, code="invalid_upload_encoding", message=str(error))
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
