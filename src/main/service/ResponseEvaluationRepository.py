from __future__ import annotations

import os
from datetime import datetime
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

    def store_evaluation(
        self,
        student_id: str,
        assessment_id: str,
        question_id: str,
        evaluation: Dict[str, Any],
    ) -> None:
        created_at = datetime.utcnow().isoformat() + "Z"
        item = {
            "PK": f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}",
            "SK": f"EVALUATION#{question_id}",
            "questionId": question_id,
            "assessmentId": assessment_id,
            "studentId": student_id,
            "correctnessScore": Decimal(str(evaluation.get("correctness_score", 0))),
            "understandingScore": Decimal(str(evaluation.get("understanding_score", 0))),
            "totalScore": Decimal(str(evaluation.get("total_score", 0))),
            "feedback": evaluation.get("feedback", ""),
            "strengths": evaluation.get("strengths", []),
            "weaknesses": evaluation.get("weaknesses", []),
            "suggestedImprovements": evaluation.get("suggested_improvements", []),
            "evaluatedAt": created_at,
        }
        self.table.put_item(Item=item)
