from __future__ import annotations

from typing import Any, Dict

from boto3.dynamodb.conditions import Key


class OralAssessmentResultsAggregator:
    def __init__(self, *, table):
        self.table = table

    def get_student_results(self, *, student_id: str, assessment_id: str) -> Dict[str, Any]:
        enrollment_response = self.table.get_item(
            Key={
                "PK": f"ASSESSMENT#{assessment_id}",
                "SK": f"STUDENT#{student_id}",
            }
        )

        if "Item" not in enrollment_response:
            raise ValueError(f"Student {student_id} not enrolled in assessment {assessment_id}")

        enrollment = enrollment_response["Item"]

        assessment_response = self.table.get_item(
            Key={
                "PK": f"ASSESSMENT#{assessment_id}",
                "SK": "METADATA",
            }
        )
        assessment = assessment_response.get("Item", {})

        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

        questions_response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("QUESTION#")
        )
        answers_response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("ANSWER#")
        )
        evaluations_response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("EVALUATION#")
        )

        questions_map = {
            item["SK"].replace("QUESTION#", ""): item for item in questions_response.get("Items", [])
        }
        answers_map = {
            item["SK"].replace("ANSWER#", ""): item for item in answers_response.get("Items", [])
        }
        evaluations_map = {
            item["SK"].replace("EVALUATION#", ""): item for item in evaluations_response.get("Items", [])
        }

        if not evaluations_map:
            raise ValueError(f"Results not available yet for student {student_id}")

        question_results = []
        total_score = 0
        max_score = 0

        for question_id, question in questions_map.items():
            answer = answers_map.get(question_id, {})
            evaluation = evaluations_map.get(question_id, {})

            score = int(evaluation.get("score", 0)) if evaluation.get("score") is not None else None
            q_max_score = int(evaluation.get("maxScore", 10)) if evaluation.get("maxScore") is not None else 10

            if score is not None:
                total_score += score
                max_score += q_max_score

            question_results.append(
                {
                    "questionId": question_id,
                    "questionText": question.get("text", ""),
                    "audioUrl": answer.get("audioUrl"),
                    "duration": int(answer.get("duration", 0)) if answer.get("duration") else None,
                    "score": score,
                    "maxScore": q_max_score,
                    "feedback": evaluation.get("feedback"),
                    "strengths": evaluation.get("strengths"),
                    "improvements": evaluation.get("improvements"),
                    "evaluatedAt": evaluation.get("evaluatedAt"),
                }
            )

        percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0

        if percentage >= 90:
            grade = "Excellent"
        elif percentage >= 75:
            grade = "Competent"
        elif percentage >= 60:
            grade = "Developing"
        else:
            grade = "Unsatisfactory"

        return {
            "studentId": student_id,
            "studentName": enrollment.get("name", ""),
            "studentEmail": enrollment.get("email", ""),
            "assessmentId": assessment_id,
            "assessmentTitle": assessment.get("title", "Unknown Assessment"),
            "status": enrollment.get("status", "unknown"),
            "totalScore": total_score,
            "maxScore": max_score,
            "percentage": percentage,
            "grade": grade,
            "submittedAt": enrollment.get("submittedAt"),
            "evaluatedQuestions": len(evaluations_map),
            "totalQuestions": len(questions_map),
            "questions": question_results,
        }
