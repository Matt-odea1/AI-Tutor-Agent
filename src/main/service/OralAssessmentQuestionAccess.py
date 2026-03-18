from __future__ import annotations

from typing import Any, Dict, List, Optional

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

    def get_student_questions(self, student_id: str, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Fetch questions generated for a specific student.
        Stored at PK=STUDENT#{student_id}#ASSESSMENT#{assessment_id}, SK=QUESTION#{id}
        """
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("QUESTION#")
        )
        return response.get("Items", [])

    def get_bank_questions(self, assessment_id: str) -> List[Dict[str, Any]]:
        """
        Fetch question-bank items for this assessment.
        Stored at PK=ASSESSMENT#{assessment_id}, SK=BANK_QUESTION#{id}
        """
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}")
            & Key("SK").begins_with("BANK_QUESTION#")
        )
        return response.get("Items", [])

    def to_student_question_view(
        self,
        student_items: List[Dict[str, Any]],
        bank_items: List[Dict[str, Any]],
        *,
        student_id: str,
        assessment_id: str,
        assessment_time_limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Project raw DynamoDB items into the student-facing question shape.
        Bank questions are appended after student-specific questions with
        sequential question numbers.

        Attribute names in DynamoDB match what QuestionGenerationService stores:
        lowercase camelCase (text, questionNumber, questionType, codeContext, etc.)
        """

        def _to_view(item: Dict[str, Any], question_number: int, is_bank: bool) -> Dict[str, Any]:
            raw_id = item.get("id", item["SK"].replace("QUESTION#", "").replace("BANK_QUESTION#", ""))
            per_question_limit = item.get("timeLimit")
            effective_limit = per_question_limit if per_question_limit is not None else assessment_time_limit
            return {
                "id": raw_id,
                "questionNumber": question_number,
                "type": item.get("questionType", "general"),
                "text": item.get("text", ""),
                "difficulty": item.get("difficulty", "medium"),
                "topic": item.get("topic", ""),
                "codeContext": item.get("codeContext") or item.get("code_reference"),
                "rationale": item.get("rationale", ""),
                "timeLimit": effective_limit,
                "isBank": is_bank,
                "assessmentId": assessment_id,
                "studentId": student_id,
                "createdAt": item.get("createdAt", ""),
            }

        # Sort student questions by their stored question number
        student_items_sorted = sorted(
            student_items, key=lambda q: q.get("questionNumber", 999)
        )

        questions: List[Dict[str, Any]] = []
        for idx, item in enumerate(student_items_sorted, start=1):
            questions.append(_to_view(item, idx, is_bank=False))

        # Append bank questions after student questions
        next_num = len(questions) + 1
        for idx, item in enumerate(bank_items, start=next_num):
            questions.append(_to_view(item, idx, is_bank=True))

        return questions
