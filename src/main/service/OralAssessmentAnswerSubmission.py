from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, Optional

from boto3.dynamodb.conditions import Key


class OralAssessmentAnswerSubmission:
    def __init__(self, *, table, progress_updater: Callable[[str, str], None]):
        self.table = table
        self.progress_updater = progress_updater

    def submit_answer(
        self,
        *,
        student_id: str,
        question_id: str,
        audio_url: str,
        duration: int,
        assessment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        resolved_assessment_id = assessment_id

        if not resolved_assessment_id:
            response = self.table.query(
                KeyConditionExpression=Key("PK").begins_with(f"STUDENT#{student_id}#ASSESSMENT#")
                & Key("SK").eq(f"QUESTION#{question_id}")
            )

            if not response.get("Items"):
                raise ValueError(f"Question {question_id} not found for student {student_id}")

            item = response["Items"][0]
            resolved_assessment_id = item["PK"].split("#")[3]

        pk = f"STUDENT#{student_id}#ASSESSMENT#{resolved_assessment_id}"
        submitted_at = datetime.utcnow().isoformat()

        self.table.put_item(
            Item={
                "PK": pk,
                "SK": f"ANSWER#{question_id}",
                "audioUrl": audio_url,
                "duration": duration,
                "submittedAt": submitted_at,
                "status": "submitted",
            }
        )

        self.progress_updater(student_id, resolved_assessment_id)

        return {
            "ok": True,
            "studentId": student_id,
            "questionId": question_id,
            "audioUrl": audio_url,
            "duration": duration,
            "submittedAt": submitted_at,
            "assessmentId": resolved_assessment_id,
        }
