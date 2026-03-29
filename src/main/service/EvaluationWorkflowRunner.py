"""
EvaluationWorkflowRunner: Runs the DynamoDB-backed evaluation workflow.

For each student, reads questions + answers from DynamoDB, evaluates each via LLM,
and stores evaluation results back in DynamoDB.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EvaluationWorkflowRunner:
    def __init__(
        self,
        *,
        engine,
        repository,
        transcription_service: Optional[Any] = None,
    ):
        self.engine = engine
        self.repository = repository
        self.transcription_service = transcription_service

    def evaluate_from_dynamodb(self, job_id: str, student_id: str, assessment_id: str) -> None:
        try:
            logger.info("[Job %s] Starting DynamoDB evaluation for student %s", job_id, student_id)

            # Pre-pass: transcribe audio/video answers that don't yet have a transcript
            if self.transcription_service is not None:
                try:
                    n = self.transcription_service.transcribe_pending_answers(student_id, assessment_id)
                    if n:
                        logger.info("[Job %s] Transcribed %d answer(s) for student %s", job_id, n, student_id)
                except Exception as e:
                    logger.warning(
                        "[Job %s] Transcription pre-pass failed for student %s (continuing): %s",
                        job_id, student_id, e,
                    )

            questions_data = self.repository.read_questions(student_id, assessment_id)
            answers_data = self.repository.read_answers(student_id, assessment_id)
            # For text answers, populate 'transcript' from 'textContent' so the
            # engine doesn't receive an empty transcript.
            for ans in answers_data:
                if ans.get("answerType") == "text" and not ans.get("transcript"):
                    ans["transcript"] = ans.get("textContent", "")
            qa_pairs = self.match_questions_and_answers(questions_data, answers_data)
            total_questions = len(qa_pairs)

            # Read assessment rubric if available
            rubric = self._read_assessment_rubric(assessment_id)

            evaluations = []
            total_score = 0.0

            self.repository.set_evaluation_progress(student_id, assessment_id, 0, total_questions, "evaluating")

            for index, qa_pair in enumerate(qa_pairs):
                try:
                    logger.info("[Job %s] Evaluating question %d/%d", job_id, index + 1, total_questions)
                    evaluation = self.engine.evaluate_qa_pair(qa_pair, rubric=rubric)
                    evaluations.append(evaluation)
                    total_score += evaluation["total_score"]

                    self.repository.store_evaluation(
                        student_id,
                        assessment_id,
                        qa_pair["question"]["id"],
                        evaluation,
                    )

                    self.repository.set_evaluation_progress(student_id, assessment_id, index + 1, total_questions, "evaluating")
                except Exception as error:
                    logger.error("[Job %s] Error evaluating question %d: %s", job_id, index + 1, error)
                    evaluations.append(
                        {
                            "question_id": qa_pair["question"]["id"],
                            "correctness_score": 0,
                            "understanding_score": 0,
                            "total_score": 0,
                            "feedback": f"Evaluation failed: {str(error)}",
                            "error": str(error),
                        }
                    )

            max_score = total_questions * 10
            percentage = (total_score / max_score * 100) if max_score > 0 else 0

            self.repository.set_evaluation_progress(student_id, assessment_id, total_questions, total_questions, "completed")

            logger.info(
                "[Job %s] DynamoDB evaluation completed. Score: %.1f/%d (%.1f%%)",
                job_id, total_score, max_score, percentage,
            )
        except Exception as error:
            logger.error("[Job %s] DynamoDB evaluation failed: %s", job_id, error)
            try:
                self.repository.set_evaluation_progress(student_id, assessment_id, 0, 0, "failed")
            except Exception:
                pass

    @staticmethod
    def match_questions_and_answers(
        questions: List[Dict[str, Any]],
        answers: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        answer_map = {answer["questionId"]: answer for answer in answers}
        qa_pairs = []
        for question in questions:
            question_id = question["id"]
            answer = answer_map.get(question_id)
            if answer:
                qa_pairs.append({"question": question, "answer": answer})
        return qa_pairs

    def _read_assessment_rubric(self, assessment_id: str) -> str:
        """Read the custom rubric from the assessment metadata item. Returns '' if not set."""
        try:
            resp = self.repository.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
            )
            item = resp.get("Item") or {}
            return item.get("rubric") or ""
        except Exception as e:
            logger.warning("Could not read rubric for assessment %s: %s", assessment_id, e)
            return ""
