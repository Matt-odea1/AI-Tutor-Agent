from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List


class EvaluationWorkflowRunner:
    def __init__(self, *, engine, repository, report_writer, job_store, base_output_dir: Path):
        self.engine = engine
        self.repository = repository
        self.report_writer = report_writer
        self.job_store = job_store
        self.base_output_dir = base_output_dir

    def evaluate_from_dynamodb(self, job_id: str, student_id: str, assessment_id: str) -> None:
        try:
            print(f"[Job {job_id}] Starting DynamoDB evaluation for student {student_id}")

            questions_data = self.repository.read_questions(student_id, assessment_id)
            answers_data = self.repository.read_answers(student_id, assessment_id)
            qa_pairs = self.match_questions_and_answers(questions_data, answers_data)
            total_questions = len(qa_pairs)

            evaluations = []
            total_score = 0.0

            for index, qa_pair in enumerate(qa_pairs):
                try:
                    print(f"[Job {job_id}] Evaluating question {index + 1}/{total_questions}")
                    evaluation = self.engine.evaluate_qa_pair(qa_pair)
                    evaluations.append(evaluation)
                    total_score += evaluation["total_score"]

                    self.repository.store_evaluation(
                        student_id,
                        assessment_id,
                        qa_pair["question"]["id"],
                        evaluation,
                    )

                    self.job_store.set_progress(job_id, index + 1, total_questions)
                except Exception as error:
                    print(f"[Job {job_id}] Error evaluating question {index + 1}: {error}")
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

            print(f"[Job {job_id}] DynamoDB evaluation completed. Score: {total_score}/{max_score} ({percentage:.1f}%)")
        except Exception as error:
            print(f"[Job {job_id}] DynamoDB evaluation failed: {error}")
            self.job_store.mark_failed(job_id, str(error))

    def evaluate_from_csv(self, job_id: str, student_name: str, responses_file_path: str) -> None:
        try:
            print(f"[Job {job_id}] Starting evaluation for {student_name}")

            responses = self.read_responses_csv(responses_file_path)
            total_questions = len(responses)

            evaluations = []
            total_correctness = 0.0
            total_understanding = 0.0
            total_score = 0.0

            for index, response in enumerate(responses):
                try:
                    print(f"[Job {job_id}] Evaluating question {index + 1}/{total_questions}")
                    evaluation = self.engine.evaluate_single_question(response)
                    evaluations.append(evaluation)

                    total_correctness += evaluation["correctness_score"]
                    total_understanding += evaluation["understanding_score"]
                    total_score += evaluation["total_score"]

                    self.job_store.set_progress(job_id, index + 1, total_questions)
                except Exception as error:
                    print(f"[Job {job_id}] Error evaluating question {index + 1}: {error}")
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

            print(f"[Job {job_id}] Evaluation completed. Score: {total_score}/{max_score} ({percentage:.1f}%)")
        except Exception as error:
            print(f"[Job {job_id}] Evaluation failed: {error}")
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

    @staticmethod
    def read_responses_csv(file_path: str) -> List[Dict[str, str]]:
        responses: List[Dict[str, str]] = []
        with open(file_path, "r", encoding="utf-8") as file_obj:
            reader = csv.DictReader(file_obj)
            for row in reader:
                responses.append(row)
        return responses
