from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from boto3.dynamodb.conditions import Key


def _effective_score(eval_item: Dict[str, Any]) -> int:
    """Return instructorScore if set, else AI score, else 0."""
    if eval_item.get("instructorScore") is not None:
        return int(eval_item["instructorScore"])
    score = eval_item.get("totalScore")
    return int(score) if score is not None else 0


class InstructorAssessmentResultsAggregator:
    def __init__(self, *, table, get_students: Callable[[str], List[Dict[str, Any]]]):
        self.table = table
        self.get_students = get_students

    def get_assessment_results(self, assessment_id: str) -> List[Dict[str, Any]]:
        students = self.get_students(assessment_id)
        results_list: List[Dict[str, Any]] = []

        for student in students:
            student_id = student["studentId"]
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

            evaluations_response = self.table.query(
                KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("EVALUATION#")
            )
            evaluations = evaluations_response.get("Items", [])
            if not evaluations:
                continue

            total_score = 0
            max_score = 0
            for eval_item in evaluations:
                score = _effective_score(eval_item)
                q_max = int(eval_item.get("maxScore", 10)) if eval_item.get("maxScore") is not None else 10
                total_score += score
                max_score += q_max

            percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0

            if percentage >= 90:
                grade = "Excellent"
            elif percentage >= 75:
                grade = "Competent"
            elif percentage >= 60:
                grade = "Developing"
            else:
                grade = "Unsatisfactory"

            enrollment_response = self.table.get_item(
                Key={
                    "PK": f"ASSESSMENT#{assessment_id}",
                    "SK": f"STUDENT#{student_id}",
                }
            )
            enrollment = enrollment_response.get("Item", {})

            results_list.append(
                {
                    "studentId": student_id,
                    "name": student["name"],
                    "email": student["email"],
                    "totalScore": total_score,
                    "maxScore": max_score,
                    "percentage": percentage,
                    "grade": grade,
                    "completedAt": enrollment.get("submittedAt"),
                }
            )

        return results_list

    def get_student_detail(self, assessment_id: str, student_id: str) -> Dict[str, Any]:
        """Return per-question details for one student in the instructor view."""
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

        questions_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("QUESTION#")
        )
        answers_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("ANSWER#")
        )
        evaluations_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("EVALUATION#")
        )
        chunks_resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("PROCTORING#CHUNK#")
        )

        questions_map = {item["SK"].replace("QUESTION#", ""): item for item in questions_resp.get("Items", [])}
        answers_map = {item["SK"].replace("ANSWER#", ""): item for item in answers_resp.get("Items", [])}
        evaluations_map = {item["SK"].replace("EVALUATION#", ""): item for item in evaluations_resp.get("Items", [])}

        # Proctoring chunk health
        chunks = sorted(chunks_resp.get("Items", []), key=lambda c: int(c.get("chunkIndex", 0)))
        chunk_indexes = {int(c.get("chunkIndex", 0)) for c in chunks}
        max_index = max(chunk_indexes, default=-1)
        missing_indexes = [i for i in range(max_index + 1) if i not in chunk_indexes]

        proctoring = {
            "studentId": student_id,
            "assessmentId": assessment_id,
            "totalChunks": len(chunks),
            "missingIndexes": missing_indexes,
            "chunks": [
                {
                    "chunkIndex": int(c.get("chunkIndex", 0)),
                    "chunkUrl": c.get("chunkUrl", ""),
                    "recordedAt": c.get("recordedAt"),
                }
                for c in chunks
            ],
        }

        question_details = []
        total_score = 0
        max_score = 0

        for question_id, question in questions_map.items():
            answer = answers_map.get(question_id, {})
            evaluation = evaluations_map.get(question_id, {})

            ai_score = int(evaluation.get("totalScore", 0)) if evaluation.get("totalScore") is not None else None
            instructor_score = int(evaluation["instructorScore"]) if evaluation.get("instructorScore") is not None else None
            effective = instructor_score if instructor_score is not None else (ai_score if ai_score is not None else 0)
            q_max = int(evaluation.get("maxScore", 10)) if evaluation.get("maxScore") is not None else 10

            if evaluation:
                total_score += effective
                max_score += q_max

            question_details.append({
                "questionId": question_id,
                "questionText": question.get("text", ""),
                "answerType": answer.get("answerType"),
                "audioUrl": answer.get("audioUrl"),
                "videoUrl": answer.get("videoUrl"),
                "textContent": answer.get("textContent"),
                "duration": int(answer.get("duration", 0)) if answer.get("duration") else None,
                "transcript": answer.get("transcript"),
                "transcriptStatus": answer.get("transcriptStatus"),
                "aiScore": ai_score,
                "instructorScore": instructor_score,
                "effectiveScore": effective if evaluation else None,
                "maxScore": q_max,
                "feedback": evaluation.get("feedback"),
                "strengths": " ".join(evaluation["strengths"]) if isinstance(evaluation.get("strengths"), (list, set)) else evaluation.get("strengths"),
                "improvements": " ".join(evaluation["improvements"]) if isinstance(evaluation.get("improvements"), (list, set)) else evaluation.get("improvements"),
                "instructorComment": evaluation.get("instructorComment"),
                "evaluatedAt": evaluation.get("evaluatedAt"),
            })

        percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0

        if percentage >= 90:
            grade = "Excellent"
        elif percentage >= 75:
            grade = "Competent"
        elif percentage >= 60:
            grade = "Developing"
        else:
            grade = "Unsatisfactory"

        # Fetch enrollment for name/email/submittedAt
        enrollment_resp = self.table.get_item(
            Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{student_id}"}
        )
        enrollment = enrollment_resp.get("Item", {})

        return {
            "studentId": student_id,
            "studentName": enrollment.get("name", ""),
            "studentEmail": enrollment.get("email", ""),
            "assessmentId": assessment_id,
            "totalScore": total_score,
            "maxScore": max_score,
            "percentage": percentage,
            "grade": grade,
            "submittedAt": enrollment.get("submittedAt"),
            "questions": question_details,
            "proctoring": proctoring,
        }
