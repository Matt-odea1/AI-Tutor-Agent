from __future__ import annotations

import asyncio
import logging

import io

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import StreamingResponse as _StreamingResponse
from pydantic import BaseModel

from src.main.auth.dependencies import require_auth_principal, get_auth_service
from src.main.auth.models import AuthPrincipal
from src.main.auth.service import AuthService
from src.main.controllers.api_errors import ApiError
from src.main.controllers.controller_helpers import _assert_student_access
from src.main.controllers.controller_dependencies import (
    get_instructor_assessment_service,
    get_oral_assessment_service,
    get_sqs_job_dispatcher,
)
from src.main.service.BatchJobManager import JobType, get_batch_job_manager
from src.main.service.InstructorAssessmentService import InstructorAssessmentService, InstructorAssessmentServiceError
from src.main.service.SQSJobDispatcher import SQSJobDispatcher
from src.main.dtos.StudentAssessmentDTOs import (
    QuestionResponse,
    StudentProgressResponse,
    StudentQuestionsResponse,
    StudentResultsResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmitAssessmentRequest,
    SubmitAssessmentResponse,
    SubmitConsentRequest,
    SubmitConsentResponse,
    SubmitProctorChunkRequest,
    SubmitProctorChunkResponse,
)
from src.main.service.OralAssessmentService import OralAssessmentService, OralAssessmentServiceError


logger = logging.getLogger(__name__)


student_router = APIRouter(prefix="/api/student", tags=["student"])


class StudentTokenRequest(BaseModel):
    student_id: str
    assessment_id: str


@student_router.post("/token")
async def get_student_token(
    request: StudentTokenRequest,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    auth_service: AuthService = Depends(get_auth_service),
):
    """
    Public endpoint — no prior auth required.
    Verifies the student is enrolled in the assessment, then issues a
    12-hour scoped JWT so the student can call protected student endpoints.
    """
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None, lambda: svc.question_access.ensure_student_enrollment(request.student_id, request.assessment_id)
        )
    except (ValueError, OralAssessmentServiceError):
        raise ApiError(
            status_code=404,
            code="student_not_enrolled",
            message="Assessment not found or you are not enrolled. Please check your link.",
        )
    except Exception as error:
        logger.error("Unexpected error verifying enrollment: %s", error)
        raise ApiError(status_code=500, code="unexpected_error", message="Failed to verify enrollment")

    return await loop.run_in_executor(
        None, lambda: auth_service.issue_student_session_token(request.student_id, request.assessment_id)
    )


@student_router.get("/{student_id}/assessment/{assessment_id}/questions", response_model=StudentQuestionsResponse)
async def get_student_questions(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id, assessment_id)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: svc.get_student_questions(student_id, assessment_id))

        # result is now {"questions": [...], "answerMode": ..., "preparationTime": ...}
        raw_questions = result.get("questions", []) if isinstance(result, dict) else result

        question_dtos = [
            QuestionResponse(
                id=q["id"],
                text=q.get("text", ""),
                codeContext=q.get("codeContext"),
                assessmentId=q.get("assessmentId", assessment_id),
                studentId=q.get("studentId", student_id),
                difficulty=q.get("difficulty"),
                topic=q.get("topic"),
                timeLimit=q.get("timeLimit"),
                createdAt=q.get("createdAt", ""),
            )
            for q in raw_questions
        ]

        return StudentQuestionsResponse(
            studentId=student_id,
            assessmentId=assessment_id,
            questions=question_dtos,
            totalQuestions=len(question_dtos),
            currentQuestionIndex=result.get("currentQuestionIndex", 0) if isinstance(result, dict) else 0,
            answerMode=result.get("answerMode", "oral") if isinstance(result, dict) else "oral",
            preparationTime=result.get("preparationTime") if isinstance(result, dict) else None,
            assessmentTitle=result.get("assessmentTitle") if isinstance(result, dict) else None,
            assessmentCourse=result.get("assessmentCourse") if isinstance(result, dict) else None,
            assessmentDescription=result.get("assessmentDescription") if isinstance(result, dict) else None,
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
        _assert_student_access(_principal, student_id, request.assessment_id)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: svc.submit_answer(
            student_id=student_id,
            question_id=request.question_id,
            assessment_id=request.assessment_id,
            answer_type=request.answer_type,
            audio_url=request.audio_url,
            duration=request.duration,
            text_content=request.text_content,
            video_url=request.video_url,
        ))

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
    instructor_svc: InstructorAssessmentService = Depends(get_instructor_assessment_service),
    dispatcher: SQSJobDispatcher = Depends(get_sqs_job_dispatcher),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id, request.assessment_id)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: svc.submit_assessment(
            student_id=student_id,
            assessment_id=request.assessment_id,
        ))

        # Auto-evaluate in background so the last student's response isn't delayed
        def _maybe_auto_evaluate():
            try:
                assessment = instructor_svc.get_assessment(request.assessment_id)
                if not assessment.get("autoEvaluate"):
                    return
                submitted, total = instructor_svc.count_submitted_students(request.assessment_id)
                if total <= 0 or submitted < total:
                    return
                all_students = instructor_svc.get_assessment_students(request.assessment_id)
                job_manager = get_batch_job_manager()
                job_id = job_manager.create_job(
                    job_type=JobType.EVALUATION,
                    assessment_id=request.assessment_id,
                    total_items=len(all_students),
                    metadata={"assessment_title": assessment.get("title", ""), "trigger": "auto"},
                )
                dispatcher.enqueue_evaluation_batch(
                    job_id=job_id,
                    assessment_id=request.assessment_id,
                    students=all_students,
                )
                logger.info(
                    "[AutoEval] Triggered evaluation job %s for assessment %s (%d students)",
                    job_id, request.assessment_id, len(all_students),
                )
            except Exception as auto_err:
                logger.error("[AutoEval] Failed to trigger auto-evaluation: %s", auto_err)

        import threading
        threading.Thread(target=_maybe_auto_evaluate, daemon=True).start()

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
        _assert_student_access(_principal, student_id, assessment_id)
        loop = asyncio.get_event_loop()
        progress = await loop.run_in_executor(None, lambda: svc.get_student_progress(student_id, assessment_id))
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
        _assert_student_access(_principal, student_id, assessment_id)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: svc.get_student_results(student_id, assessment_id))
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


@student_router.post("/{student_id}/proctoring-chunk", response_model=SubmitProctorChunkResponse)
async def submit_proctor_chunk(
    student_id: str,
    request: SubmitProctorChunkRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    try:
        _assert_student_access(_principal, student_id, request.assessment_id)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: svc.submit_proctor_chunk(
            student_id=student_id,
            assessment_id=request.assessment_id,
            chunk_url=request.chunk_url,
            chunk_index=request.chunk_index,
            timestamp=request.timestamp,
        ))
        return SubmitProctorChunkResponse(**result)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=400, code="proctor_chunk_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in submit_proctor_chunk: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


@student_router.post("/{student_id}/consent", response_model=SubmitConsentResponse)
async def record_consent(
    student_id: str,
    request: SubmitConsentRequest = Body(...),
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """Record the student's webcam-proctoring consent decision (granted or declined)."""
    try:
        _assert_student_access(_principal, student_id, request.assessment_id)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: svc.record_consent(
            student_id=student_id,
            assessment_id=request.assessment_id,
            granted=request.granted,
            consent_version=request.consent_version,
            timestamp=request.timestamp,
        ))
        return SubmitConsentResponse(**result)

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=400, code="consent_failed", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in record_consent: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))


# ──────────────────────────────────────────────────────────────────────────────
# Sprint 8 – Student Results PDF (EPIC-6-3)
# ──────────────────────────────────────────────────────────────────────────────

@student_router.get("/{student_id}/assessment/{assessment_id}/results/pdf")
async def get_student_results_pdf(
    student_id: str,
    assessment_id: str,
    svc: OralAssessmentService = Depends(get_oral_assessment_service),
    _principal: AuthPrincipal = Depends(require_auth_principal),
):
    """EPIC-6-3: Generate a PDF results report for a student."""
    try:
        _assert_student_access(_principal, student_id, assessment_id)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: svc.get_student_results(student_id, assessment_id))

        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
            from reportlab.lib.enums import TA_CENTER, TA_LEFT
        except ImportError:
            raise ApiError(status_code=500, code="pdf_unavailable", message="PDF generation library not installed")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title", parent=styles["Heading1"], alignment=TA_CENTER, fontSize=18)
        h2_style = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceAfter=4)
        body_style = styles["BodyText"]
        grade_colors = {
            "Excellent": colors.HexColor("#10b981"),
            "Competent": colors.HexColor("#3b82f6"),
            "Developing": colors.HexColor("#f59e0b"),
            "Unsatisfactory": colors.HexColor("#ef4444"),
        }

        story = []
        story.append(Paragraph(results.get("assessmentTitle", "Assessment Results"), title_style))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(f"Student: {results.get('studentName', student_id)}", body_style))
        story.append(Spacer(1, 0.5*cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0")))
        story.append(Spacer(1, 0.5*cm))

        grade = results.get("grade", "")
        grade_color = grade_colors.get(grade, colors.black)
        summary_data = [
            ["Overall Score", f"{results.get('totalScore', 0)} / {results.get('maxScore', 0)}"],
            ["Percentage", f"{results.get('percentage', 0)}%"],
            ["Grade", grade],
        ]
        summary_table = Table(summary_data, colWidths=[4*cm, 8*cm])
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
            ("TEXTCOLOR", (1, 2), (1, 2), grade_color),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 1*cm))

        story.append(Paragraph("Question Feedback", h2_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
        story.append(Spacer(1, 0.3*cm))

        for i, q in enumerate(results.get("questions", []), 1):
            story.append(Paragraph(f"<b>Q{i}:</b> {q.get('questionText', '')}", body_style))
            score = q.get("score")
            max_s = q.get("maxScore", 10)
            if score is not None:
                story.append(Paragraph(f"Score: {score}/{max_s}", body_style))
            if q.get("feedback"):
                story.append(Paragraph(f"<i>Feedback:</i> {q['feedback']}", body_style))
            if q.get("strengths"):
                story.append(Paragraph(f"<i>Strengths:</i> {q['strengths']}", body_style))
            if q.get("improvements"):
                story.append(Paragraph(f"<i>Areas for improvement:</i> {q['improvements']}", body_style))
            story.append(Spacer(1, 0.4*cm))

        doc.build(story)
        buf.seek(0)

        filename = f"results_{student_id}_{assessment_id}.pdf"
        return _StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except OralAssessmentServiceError as error:
        raise ApiError(status_code=404, code="student_results_not_found", message=str(error))
    except HTTPException:
        raise
    except ApiError:
        raise
    except Exception as error:
        logger.error(f"Unexpected error in get_student_results_pdf: {error}")
        raise ApiError(status_code=500, code="unexpected_error", message=str(error))
