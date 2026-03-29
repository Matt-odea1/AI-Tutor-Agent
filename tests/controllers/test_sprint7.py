"""
Sprint 7 tests covering:
- EPIC-7-1: evaluate_batch dispatches via SQS (not inline thread)
- EPIC-5-1: TranscriptionService._parse_s3_url + transcribe_pending_answers
- EPIC-5-3: autoEvaluate field persisted; auto-eval triggered on final submission
- EPIC-5-4: rubric field persisted; evaluate_qa_pair receives rubric
"""

from unittest.mock import MagicMock, patch, call
import pytest
from fastapi.testclient import TestClient

from app import create_app
from src.main.auth.dependencies import require_auth_principal
from src.main.auth.models import AuthPrincipal
from src.main.controllers.controller_dependencies import (
    get_instructor_assessment_service,
    get_oral_assessment_service,
    get_sqs_job_dispatcher,
)
from src.main.service.InstructorAssessmentService import InstructorAssessmentServiceError
from src.main.service.OralAssessmentService import OralAssessmentServiceError
from src.main.service.TranscriptionService import _parse_s3_url, TranscriptionService
from src.main.service.ResponseEvaluationEngine import ResponseEvaluationEngine
from src.main.service.EvaluationWorkflowRunner import EvaluationWorkflowRunner


# ─────────────────────────────────────────────────────────────
# Shared fixtures / helpers
# ─────────────────────────────────────────────────────────────

_INSTRUCTOR = AuthPrincipal(user_id="i-1", roles=["instructor"], source="jwt")
_STUDENT = AuthPrincipal(user_id="s-1", roles=["student"], source="jwt")


def _assessment_client(instructor_svc=None, dispatcher=None, principal=_INSTRUCTOR):
    app = create_app()
    app.dependency_overrides[require_auth_principal] = lambda: principal
    app.dependency_overrides[get_instructor_assessment_service] = lambda: instructor_svc or MagicMock()
    if dispatcher is not None:
        app.dependency_overrides[get_sqs_job_dispatcher] = lambda: dispatcher
    return TestClient(app)


def _student_client(oral_svc=None, instructor_svc=None, dispatcher=None, principal=_STUDENT):
    app = create_app()
    app.dependency_overrides[require_auth_principal] = lambda: principal
    app.dependency_overrides[get_oral_assessment_service] = lambda: oral_svc or MagicMock()
    app.dependency_overrides[get_instructor_assessment_service] = lambda: instructor_svc or MagicMock()
    if dispatcher is not None:
        app.dependency_overrides[get_sqs_job_dispatcher] = lambda: dispatcher
    return TestClient(app)


def _mock_instructor_svc(**overrides):
    svc = MagicMock()
    svc.get_assessment.return_value = overrides.get("assessment", {
        "id": "a-1", "title": "Test", "createdBy": "i-1",
        "autoEvaluate": False, "rubric": None,
    })
    svc.get_assessment_students.return_value = overrides.get("students", [
        {"studentId": "s-1"}, {"studentId": "s-2"},
    ])
    svc.count_submitted_students.return_value = overrides.get("submitted_counts", (1, 2))
    return svc


# ─────────────────────────────────────────────────────────────
# EPIC-7-1: evaluate-batch uses SQS dispatcher
# ─────────────────────────────────────────────────────────────

class TestEvaluateBatchSQS:
    def test_returns_202_and_job_id(self):
        instructor_svc = _mock_instructor_svc()
        dispatcher = MagicMock()
        dispatcher.enqueue_evaluation_batch.return_value = 2

        with patch("src.main.controllers.assessment_router.get_batch_job_manager") as mock_jm:
            mock_jm.return_value.create_job.return_value = "job-sqs-1"
            client = _assessment_client(instructor_svc=instructor_svc, dispatcher=dispatcher)
            resp = client.post("/api/assessment/a-1/evaluate-batch", json={})

        assert resp.status_code == 202
        data = resp.json()
        assert data["jobId"] == "job-sqs-1"
        assert data["status"] == "running"

    def test_enqueue_called_with_correct_args(self):
        students = [{"studentId": "s-1"}, {"studentId": "s-2"}]
        instructor_svc = _mock_instructor_svc(students=students)
        dispatcher = MagicMock()
        dispatcher.enqueue_evaluation_batch.return_value = 2

        with patch("src.main.controllers.assessment_router.get_batch_job_manager") as mock_jm:
            mock_jm.return_value.create_job.return_value = "job-42"
            client = _assessment_client(instructor_svc=instructor_svc, dispatcher=dispatcher)
            client.post("/api/assessment/a-1/evaluate-batch", json={})

        dispatcher.enqueue_evaluation_batch.assert_called_once_with(
            job_id="job-42",
            assessment_id="a-1",
            students=students,
        )

    def test_no_students_returns_400(self):
        instructor_svc = _mock_instructor_svc(students=[])
        client = _assessment_client(instructor_svc=instructor_svc)
        resp = client.post("/api/assessment/a-1/evaluate-batch", json={})
        assert resp.status_code == 400

    def test_student_id_filter_applied(self):
        all_students = [{"studentId": "s-1"}, {"studentId": "s-2"}, {"studentId": "s-3"}]
        instructor_svc = _mock_instructor_svc(students=all_students)
        dispatcher = MagicMock()
        dispatcher.enqueue_evaluation_batch.return_value = 1

        with patch("src.main.controllers.assessment_router.get_batch_job_manager") as mock_jm:
            mock_jm.return_value.create_job.return_value = "job-filtered"
            client = _assessment_client(instructor_svc=instructor_svc, dispatcher=dispatcher)
            client.post("/api/assessment/a-1/evaluate-batch", json={"studentIds": ["s-1"]})

        _, kwargs = dispatcher.enqueue_evaluation_batch.call_args
        assert kwargs["students"] == [{"studentId": "s-1"}]

    def test_non_owner_returns_403(self):
        instructor_svc = _mock_instructor_svc(
            assessment={"id": "a-1", "title": "T", "createdBy": "other-user", "autoEvaluate": False, "rubric": None}
        )
        client = _assessment_client(instructor_svc=instructor_svc)
        resp = client.post("/api/assessment/a-1/evaluate-batch", json={})
        assert resp.status_code == 403


# ─────────────────────────────────────────────────────────────
# EPIC-5-1: TranscriptionService._parse_s3_url
# ─────────────────────────────────────────────────────────────

class TestParseS3Url:
    def test_virtual_hosted_with_region(self):
        bucket, key = _parse_s3_url("https://my-bucket.s3.us-east-1.amazonaws.com/audio/s1/q1.webm")
        assert bucket == "my-bucket"
        assert key == "audio/s1/q1.webm"

    def test_virtual_hosted_no_region(self):
        bucket, key = _parse_s3_url("https://my-bucket.s3.amazonaws.com/video/file.mp4")
        assert bucket == "my-bucket"
        assert key == "video/file.mp4"

    def test_s3_scheme(self):
        bucket, key = _parse_s3_url("s3://my-bucket/path/to/file.wav")
        assert bucket == "my-bucket"
        assert key == "path/to/file.wav"

    def test_empty_url_returns_empty_strings(self):
        assert _parse_s3_url("") == ("", "")

    def test_unrecognised_url_returns_empty_strings(self):
        assert _parse_s3_url("https://example.com/file.mp3") == ("", "")

    def test_key_with_nested_path(self):
        bucket, key = _parse_s3_url("https://bucket.s3.eu-west-1.amazonaws.com/a/b/c/d.webm")
        assert bucket == "bucket"
        assert key == "a/b/c/d.webm"


# ─────────────────────────────────────────────────────────────
# EPIC-5-1: TranscriptionService.transcribe_pending_answers
# ─────────────────────────────────────────────────────────────

class TestTranscriptionService:
    def _make_svc(self, answers, deepgram_text="hello world"):
        table = MagicMock()
        table.query.return_value = {"Items": answers}
        deepgram = MagicMock()
        deepgram.transcribe.return_value = deepgram_text
        s3 = MagicMock()
        svc = TranscriptionService(table=table, s3_client=s3, deepgram_service=deepgram)
        return svc, table, deepgram, s3

    def test_skips_text_answers(self):
        answer = {"questionId": "q-1", "answerType": "text", "textContent": "foo"}
        svc, table, deepgram, _ = self._make_svc([answer])
        count = svc.transcribe_pending_answers("s-1", "a-1")
        assert count == 0
        deepgram.transcribe.assert_not_called()

    def test_skips_already_transcribed(self):
        answer = {"questionId": "q-1", "answerType": "audio", "audioUrl": "s3://b/k.webm", "transcript": "existing"}
        svc, table, deepgram, _ = self._make_svc([answer])
        count = svc.transcribe_pending_answers("s-1", "a-1")
        assert count == 0
        deepgram.transcribe.assert_not_called()

    def test_missing_url_writes_missing_url_status(self):
        answer = {"questionId": "q-1", "answerType": "audio"}
        svc, table, deepgram, _ = self._make_svc([answer])
        svc.transcribe_pending_answers("s-1", "a-1")
        table.update_item.assert_called_once()
        call_kwargs = table.update_item.call_args.kwargs
        assert "missing_url" in str(call_kwargs)

    def test_successful_transcription_writes_completed(self):
        answer = {"questionId": "q-1", "answerType": "audio", "audioUrl": "https://b.s3.amazonaws.com/k.webm"}
        svc, table, deepgram, s3 = self._make_svc([answer], deepgram_text="test transcript")
        count = svc.transcribe_pending_answers("s-1", "a-1")
        assert count == 1
        update_kwargs = table.update_item.call_args.kwargs
        attr_values = update_kwargs["ExpressionAttributeValues"]
        assert attr_values[":t"] == "test transcript"
        assert attr_values[":s"] == "completed"

    def test_failed_transcription_writes_failed_status(self):
        answer = {"questionId": "q-1", "answerType": "audio", "audioUrl": "https://b.s3.amazonaws.com/k.webm"}
        svc, table, deepgram, s3 = self._make_svc([answer])
        deepgram.transcribe.side_effect = Exception("Deepgram down")
        count = svc.transcribe_pending_answers("s-1", "a-1")
        assert count == 0
        update_kwargs = table.update_item.call_args.kwargs
        assert update_kwargs["ExpressionAttributeValues"][":s"] == "failed"

    def test_video_answer_uses_video_url(self):
        answer = {"questionId": "q-1", "answerType": "video", "videoUrl": "https://b.s3.amazonaws.com/v.mp4"}
        svc, table, deepgram, s3 = self._make_svc([answer], deepgram_text="video transcript")
        count = svc.transcribe_pending_answers("s-1", "a-1")
        assert count == 1


# ─────────────────────────────────────────────────────────────
# EPIC-5-3: autoEvaluate — create_assessment persists field
# ─────────────────────────────────────────────────────────────

class TestAutoEvaluateField:
    def test_create_assessment_stores_auto_evaluate_true(self):
        instructor_svc = MagicMock()
        instructor_svc.create_assessment.return_value = {
            "id": "a-new", "title": "T", "course": "C", "description": "",
            "dueDate": "2026-12-01", "totalQuestions": 5,
            "timeLimit": None, "accessMode": "open",
            "scheduledWindowStart": None, "scheduledWindowEnd": None,
            "autoEvaluate": True, "rubric": None,
            "status": "draft", "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
        }
        client = _assessment_client(instructor_svc=instructor_svc)
        resp = client.post("/api/assessment/create", json={
            "title": "T", "course": "C", "dueDate": "2026-12-01",
            "totalQuestions": 5, "autoEvaluate": True,
        })
        assert resp.status_code == 201
        _, kwargs = instructor_svc.create_assessment.call_args
        assert kwargs["auto_evaluate"] is True

    def test_create_assessment_default_auto_evaluate_false(self):
        instructor_svc = MagicMock()
        instructor_svc.create_assessment.return_value = {
            "id": "a-new", "title": "T", "course": "C", "description": "",
            "dueDate": "2026-12-01", "totalQuestions": 5,
            "timeLimit": None, "accessMode": "open",
            "scheduledWindowStart": None, "scheduledWindowEnd": None,
            "autoEvaluate": False, "rubric": None,
            "status": "draft", "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
        }
        client = _assessment_client(instructor_svc=instructor_svc)
        client.post("/api/assessment/create", json={
            "title": "T", "course": "C", "dueDate": "2026-12-01", "totalQuestions": 5,
        })
        _, kwargs = instructor_svc.create_assessment.call_args
        assert kwargs.get("auto_evaluate", False) is False


# ─────────────────────────────────────────────────────────────
# EPIC-5-3: auto-eval trigger on final student submission
# ─────────────────────────────────────────────────────────────

class TestAutoEvalTrigger:
    def _submission_result(self):
        return {
            "ok": True, "studentId": "s-1", "assessmentId": "a-1",
            "status": "submitted", "submittedAt": "2026-01-01T00:00:00",
            "questionsAnswered": 5, "totalQuestions": 5, "assessmentTitle": "T",
        }

    def test_no_trigger_when_auto_evaluate_false(self):
        oral_svc = MagicMock()
        oral_svc.submit_assessment.return_value = self._submission_result()
        instructor_svc = _mock_instructor_svc(
            assessment={"id": "a-1", "title": "T", "createdBy": "i-1", "autoEvaluate": False, "rubric": None},
            submitted_counts=(2, 2),
        )
        dispatcher = MagicMock()
        client = _student_client(oral_svc=oral_svc, instructor_svc=instructor_svc, dispatcher=dispatcher)
        resp = client.put("/api/student/s-1/submit", json={"assessment_id": "a-1"})
        assert resp.status_code == 200
        dispatcher.enqueue_evaluation_batch.assert_not_called()

    def test_no_trigger_when_not_all_submitted(self):
        oral_svc = MagicMock()
        oral_svc.submit_assessment.return_value = self._submission_result()
        instructor_svc = _mock_instructor_svc(
            assessment={"id": "a-1", "title": "T", "createdBy": "i-1", "autoEvaluate": True, "rubric": None},
            submitted_counts=(1, 2),  # only 1 of 2 submitted
        )
        dispatcher = MagicMock()
        client = _student_client(oral_svc=oral_svc, instructor_svc=instructor_svc, dispatcher=dispatcher)
        resp = client.put("/api/student/s-1/submit", json={"assessment_id": "a-1"})
        assert resp.status_code == 200
        dispatcher.enqueue_evaluation_batch.assert_not_called()

    def test_trigger_when_all_submitted_and_auto_evaluate_true(self):
        oral_svc = MagicMock()
        oral_svc.submit_assessment.return_value = self._submission_result()
        students = [{"studentId": "s-1"}, {"studentId": "s-2"}]
        instructor_svc = _mock_instructor_svc(
            assessment={"id": "a-1", "title": "T", "createdBy": "i-1", "autoEvaluate": True, "rubric": None},
            students=students,
            submitted_counts=(2, 2),  # all submitted
        )
        dispatcher = MagicMock()
        dispatcher.enqueue_evaluation_batch.return_value = 2

        with patch("src.main.controllers.student_router.get_batch_job_manager") as mock_jm:
            mock_jm.return_value.create_job.return_value = "auto-job-1"
            client = _student_client(oral_svc=oral_svc, instructor_svc=instructor_svc, dispatcher=dispatcher)
            resp = client.put("/api/student/s-1/submit", json={"assessment_id": "a-1"})

        assert resp.status_code == 200
        dispatcher.enqueue_evaluation_batch.assert_called_once_with(
            job_id="auto-job-1",
            assessment_id="a-1",
            students=students,
        )

    def test_submission_succeeds_even_if_auto_eval_fails(self):
        oral_svc = MagicMock()
        oral_svc.submit_assessment.return_value = self._submission_result()
        instructor_svc = MagicMock()
        # Make get_assessment raise so auto-eval path errors out
        instructor_svc.get_assessment.side_effect = Exception("DB timeout")
        client = _student_client(oral_svc=oral_svc, instructor_svc=instructor_svc)
        resp = client.put("/api/student/s-1/submit", json={"assessment_id": "a-1"})
        # Submission must still succeed
        assert resp.status_code == 200


# ─────────────────────────────────────────────────────────────
# EPIC-5-4: rubric field in create_assessment
# ─────────────────────────────────────────────────────────────

class TestRubricField:
    def test_rubric_passed_to_service(self):
        instructor_svc = MagicMock()
        instructor_svc.create_assessment.return_value = {
            "id": "a-r", "title": "T", "course": "C", "description": "",
            "dueDate": "2026-12-01", "totalQuestions": 3,
            "timeLimit": None, "accessMode": "open",
            "scheduledWindowStart": None, "scheduledWindowEnd": None,
            "autoEvaluate": False, "rubric": "Grade strictly on accuracy.",
            "status": "draft", "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
        }
        client = _assessment_client(instructor_svc=instructor_svc)
        resp = client.post("/api/assessment/create", json={
            "title": "T", "course": "C", "dueDate": "2026-12-01",
            "totalQuestions": 3, "rubric": "Grade strictly on accuracy.",
        })
        assert resp.status_code == 201
        _, kwargs = instructor_svc.create_assessment.call_args
        assert kwargs["rubric"] == "Grade strictly on accuracy."

    def test_rubric_none_by_default(self):
        instructor_svc = MagicMock()
        instructor_svc.create_assessment.return_value = {
            "id": "a-r2", "title": "T", "course": "C", "description": "",
            "dueDate": "2026-12-01", "totalQuestions": 3,
            "timeLimit": None, "accessMode": "open",
            "scheduledWindowStart": None, "scheduledWindowEnd": None,
            "autoEvaluate": False, "rubric": None,
            "status": "draft", "createdAt": "2026-01-01", "updatedAt": "2026-01-01",
        }
        client = _assessment_client(instructor_svc=instructor_svc)
        client.post("/api/assessment/create", json={
            "title": "T", "course": "C", "dueDate": "2026-12-01", "totalQuestions": 3,
        })
        _, kwargs = instructor_svc.create_assessment.call_args
        assert kwargs.get("rubric") is None


# ─────────────────────────────────────────────────────────────
# EPIC-5-4: rubric injected into evaluate_qa_pair prompt
# ─────────────────────────────────────────────────────────────

class TestEvaluateQaPairRubric:
    def _make_engine(self, response_text='{"correctness_score": 8, "understanding_score": 7, "total_score": 7.5, "feedback": "good"}'):
        agent_client = MagicMock()
        agent_client.chat.return_value = response_text
        return ResponseEvaluationEngine(agent_client=agent_client, evaluation_prompt="You are an evaluator.")

    def _qa_pair(self):
        return {
            "question": {"id": "q-1", "questionNumber": 1, "questionType": "comprehension", "text": "What is X?", "codeContext": "x = 1"},
            "answer": {"transcript": "X is one."},
        }

    def test_rubric_appears_in_prompt_sent_to_llm(self):
        engine = self._make_engine()
        engine.evaluate_qa_pair(self._qa_pair(), rubric="Award full marks only if student mentions edge cases.")
        messages = engine.agent_client.chat.call_args[0][0]
        combined = " ".join(str(m) for m in messages)
        assert "Award full marks only if student mentions edge cases." in combined

    def test_no_rubric_section_when_rubric_empty(self):
        engine = self._make_engine()
        engine.evaluate_qa_pair(self._qa_pair(), rubric="")
        messages = engine.agent_client.chat.call_args[0][0]
        combined = " ".join(str(m) for m in messages)
        assert "Custom Rubric" not in combined

    def test_evaluate_qa_pair_still_returns_evaluation(self):
        engine = self._make_engine()
        result = engine.evaluate_qa_pair(self._qa_pair(), rubric="Some rubric.")
        assert result["correctness_score"] == 8
        assert result["total_score"] == 7.5


# ─────────────────────────────────────────────────────────────
# EPIC-5-1: EvaluationWorkflowRunner transcription pre-pass
# ─────────────────────────────────────────────────────────────

class TestWorkflowRunnerTranscriptionPrePass:
    def _make_runner(self, transcription_service=None):
        engine = MagicMock()
        engine.evaluate_qa_pair.return_value = {
            "question_id": "q-1", "question_number": 1, "question_type": "comprehension",
            "correctness_score": 5, "understanding_score": 5, "total_score": 5.0,
            "feedback": "ok", "strengths": [], "weaknesses": [], "suggested_improvements": [],
        }
        engine.calculate_grade.return_value = "B"
        repository = MagicMock()
        repository.read_questions.return_value = [{"id": "q-1", "questionNumber": 1, "questionType": "comp", "text": "Q?", "codeContext": ""}]
        repository.read_answers.return_value = [{"questionId": "q-1", "answerType": "audio", "transcript": "ans"}]
        repository.table = MagicMock()
        repository.table.get_item.return_value = {"Item": {}}
        runner = EvaluationWorkflowRunner(
            engine=engine,
            repository=repository,
            transcription_service=transcription_service,
        )
        return runner, engine, repository, MagicMock()

    def test_transcription_service_called_before_evaluation(self):
        transcription_svc = MagicMock()
        transcription_svc.transcribe_pending_answers.return_value = 1
        runner, engine, _, _ = self._make_runner(transcription_svc)
        runner.evaluate_from_dynamodb("job-1", "s-1", "a-1")
        transcription_svc.transcribe_pending_answers.assert_called_once_with("s-1", "a-1")
        engine.evaluate_qa_pair.assert_called_once()

    def test_evaluation_proceeds_if_transcription_fails(self):
        transcription_svc = MagicMock()
        transcription_svc.transcribe_pending_answers.side_effect = Exception("network error")
        runner, engine, _, _ = self._make_runner(transcription_svc)
        # Should not raise
        runner.evaluate_from_dynamodb("job-1", "s-1", "a-1")
        engine.evaluate_qa_pair.assert_called_once()

    def test_no_transcription_service_still_evaluates(self):
        runner, engine, _, _ = self._make_runner(transcription_service=None)
        runner.evaluate_from_dynamodb("job-1", "s-1", "a-1")
        engine.evaluate_qa_pair.assert_called_once()
