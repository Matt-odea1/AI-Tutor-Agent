from __future__ import annotations

from typing import Any, Callable, Dict, List

from boto3.dynamodb.conditions import Key


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
                score = int(eval_item.get("score", 0)) if eval_item.get("score") is not None else 0
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
