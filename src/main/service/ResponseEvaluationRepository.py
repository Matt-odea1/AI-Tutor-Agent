from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key


class ResponseEvaluationRepository:
    def __init__(self, table_name: Optional[str] = None, region: Optional[str] = None):
        self.table_name = table_name or os.getenv("DYNAMODB_ASSESSMENT_TABLE", "oral_assessments")
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.dynamodb = boto3.resource("dynamodb", region_name=self.region)
        self.table = self.dynamodb.Table(self.table_name)

    def count_answers(self, student_id: str, assessment_id: str) -> int:
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("ANSWER#")
        )
        return len(response.get("Items", []))

    def read_questions(self, student_id: str, assessment_id: str) -> List[Dict[str, Any]]:
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("QUESTION#")
        )
        return response.get("Items", [])

    def read_answers(self, student_id: str, assessment_id: str) -> List[Dict[str, Any]]:
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("ANSWER#")
        )
        return response.get("Items", [])

    def set_evaluation_progress(
        self,
        student_id: str,
        assessment_id: str,
        questions_evaluated: int,
        total_questions: int,
        status: str = "evaluating",
    ) -> None:
        """Write (or overwrite) the EVAL_PROGRESS marker for a student's evaluation run."""
        percentage = round(questions_evaluated / total_questions * 100, 1) if total_questions > 0 else 0.0
        self.table.put_item(Item={
            "PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}",
            "SK": "EVAL_PROGRESS",
            "studentId": student_id,
            "assessmentId": assessment_id,
            "questionsEvaluated": questions_evaluated,
            "totalQuestions": total_questions,
            "percentage": str(percentage),
            "status": status,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    def get_evaluation_progress(
        self,
        student_id: str,
        assessment_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Read the EVAL_PROGRESS item, or None if not present."""
        resp = self.table.get_item(
            Key={
                "PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}",
                "SK": "EVAL_PROGRESS",
            }
        )
        return resp.get("Item")

    def store_evaluation(
        self,
        student_id: str,
        assessment_id: str,
        question_id: str,
        evaluation: Dict[str, Any],
    ) -> None:
        created_at = datetime.now(timezone.utc).isoformat() + "Z"
        item = {
            "PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}",
            "SK": f"EVALUATION#{question_id}",
            "questionId": question_id,
            "assessmentId": assessment_id,
            "studentId": student_id,
            "correctnessScore": Decimal(str(evaluation.get("correctness_score", 0))),
            "understandingScore": Decimal(str(evaluation.get("understanding_score", 0))),
            "totalScore": Decimal(str(evaluation.get("total_score", 0))),
            "maxScore": Decimal(str(evaluation.get("max_score", 10))),
            "feedback": evaluation.get("feedback", ""),
            "strengths": evaluation.get("strengths", []),
            "weaknesses": evaluation.get("weaknesses", []),
            "suggestedImprovements": evaluation.get("suggested_improvements", []),
            "evaluatedAt": created_at,
        }
        self.table.put_item(Item=item)
