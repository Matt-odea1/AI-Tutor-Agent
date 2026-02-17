from __future__ import annotations

from typing import Any, Dict, List

from boto3.dynamodb.conditions import Key


class OralAssessmentQuestionAccess:
    def __init__(self, *, table):
        self.table = table

    def ensure_student_enrollment(self, student_id: str, assessment_id: str) -> None:
        enrollment = self.table.get_item(
            Key={
                "PK": f"STUDENT#{student_id}",
                "SK": f"ASSESSMENT#{assessment_id}",
            }
        )
        if "Item" not in enrollment:
            raise ValueError(f"Student {student_id} not enrolled in assessment {assessment_id}")

    def get_assessment_questions(self, assessment_id: str) -> List[Dict[str, Any]]:
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}") & Key("SK").begins_with("QUESTION#")
        )
        return response.get("Items", [])

    def to_student_question_view(
        self,
        items: List[Dict[str, Any]],
        *,
        student_id: str,
        assessment_id: str,
    ) -> List[Dict[str, Any]]:
        questions: List[Dict[str, Any]] = []
        for item in items:
            questions.append(
                {
                    "id": item.get("QuestionId", item["SK"].replace("QUESTION#", "")),
                    "questionNumber": item.get("QuestionNumber", 0),
                    "type": item.get("QuestionType", "general"),
                    "text": item.get("QuestionText", ""),
                    "difficulty": item.get("Difficulty", "medium"),
                    "topic": item.get("Topic", ""),
                    "codeContext": item.get("CodeContext"),
                    "lineReference": item.get("LineReference"),
                    "rationale": item.get("Rationale", ""),
                    "assessmentId": assessment_id,
                    "studentId": student_id,
                    "createdAt": item.get("CreatedAt", ""),
                }
            )

        questions.sort(key=lambda question: question.get("questionNumber", 999))
        return questions
