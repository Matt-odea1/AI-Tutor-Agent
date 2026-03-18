from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EvaluationWorkflowRunner:
    def __init__(
        self,
        *,
        engine,
        repository,
        report_writer,
        job_store,
        base_output_dir: Path,
        transcription_service: Optional[Any] = None,
    ):
        self.engine = engine
        self.repository = repository
        self.report_writer = report_writer
        self.job_store = job_store
        self.base_output_dir = base_output_dir
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

                    self.job_store.set_progress(job_id, index + 1, total_questions)
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
            grade = self.engine.calculate_grade(percentage)

            self.repository.set_evaluation_progress(student_id, assessment_id, total_questions, total_questions, "completed")

            self.job_store.mark_completed(
                job_id,
                {
                    "ok": True,
                    "student_id": student_id,
                    "assessment_id": assessment_id,
                    "total_questions": total_questions,
                    "total_score": round(total_score, 1),
                    "max_score": max_score,
                    "percentage": round(percentage, 1),
                    "grade": grade,
                    "evaluations_stored_in_dynamodb": len(evaluations),
                },
            )

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
            self.job_store.mark_failed(job_id, str(error))

    def evaluate_from_csv(self, job_id: str, student_name: str, responses_file_path: str) -> None:
        try:
            logger.info("[Job %s] Starting CSV evaluation for %s", job_id, student_name)

            responses = self.read_responses_csv(responses_file_path)
            total_questions = len(responses)

            evaluations = []
            total_correctness = 0.0
            total_understanding = 0.0
            total_score = 0.0

            for index, response in enumerate(responses):
                try:
                    logger.info("[Job %s] Evaluating question %d/%d", job_id, index + 1, total_questions)
                    evaluation = self.engine.evaluate_single_question(response)
                    evaluations.append(evaluation)

                    total_correctness += evaluation["correctness_score"]
                    total_understanding += evaluation["understanding_score"]
                    total_score += evaluation["total_score"]

                    self.job_store.set_progress(job_id, index + 1, total_questions)
                except Exception as error:
                    logger.error("[Job %s] Error evaluating question %d: %s", job_id, index + 1, error)
                    evaluations.append(
                        {
                            "question_number": response.get("question_number", index + 1),
                            "correctness_score": 0,
                            "understanding_score": 0,
                            "total_score": 0,
                            "strengths": [],
                            "weaknesses": ["Evaluation failed"],
                            "feedback": f"Evaluation failed: {str(error)}",
                            "suggested_improvements": [],
                            "error": str(error),
                        }
                    )

            correctness_avg = total_correctness / total_questions if total_questions > 0 else 0
            understanding_avg = total_understanding / total_questions if total_questions > 0 else 0
            max_score = total_questions * 10
            percentage = (total_score / max_score * 100) if max_score > 0 else 0
            grade = self.engine.calculate_grade(percentage)

            output_dir = self.base_output_dir / student_name
            output_dir.mkdir(parents=True, exist_ok=True)

            json_path = self.report_writer.save_detailed_json(output_dir, student_name, evaluations, responses)
            csv_path = self.report_writer.save_summary_csv(output_dir, evaluations)
            report_path = self.report_writer.save_report(
                output_dir=output_dir,
                student_name=student_name,
                evaluations=evaluations,
                total_score=total_score,
                max_score=max_score,
                percentage=percentage,
                grade=grade,
                correctness_avg=correctness_avg,
                understanding_avg=understanding_avg,
            )

            self.job_store.mark_completed(
                job_id,
                {
                    "ok": True,
                    "student_name": student_name,
                    "total_questions": total_questions,
                    "total_score": round(total_score, 1),
                    "max_score": max_score,
                    "percentage": round(percentage, 1),
                    "grade": grade,
                    "detailed_json_path": str(json_path),
                    "summary_csv_path": str(csv_path),
                    "report_path": str(report_path),
                    "correctness_avg": round(correctness_avg, 2),
                    "understanding_avg": round(understanding_avg, 2),
                    "tokens_used": None,
                },
            )

            logger.info(
                "[Job %s] CSV evaluation completed. Score: %.1f/%d (%.1f%%)",
                job_id, total_score, max_score, percentage,
            )
        except Exception as error:
            logger.error("[Job %s] CSV evaluation failed: %s", job_id, error)
            self.job_store.mark_failed(job_id, str(error))

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

    @staticmethod
    def read_responses_csv(file_path: str) -> List[Dict[str, str]]:
        responses: List[Dict[str, str]] = []
        with open(file_path, "r", encoding="utf-8") as file_obj:
            reader = csv.DictReader(file_obj)
            for row in reader:
                responses.append(row)
        return responses
