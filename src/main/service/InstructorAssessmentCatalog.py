from __future__ import annotations

from typing import Any, Dict, List, Optional

from boto3.dynamodb.conditions import Key


class InstructorAssessmentCatalog:
    def __init__(self, *, table):
        self.table = table

    @staticmethod
    def to_assessment_view(item: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": item["id"],
            "createdBy": item.get("createdBy"),
            "title": item["title"],
            "course": item["course"],
            "description": item.get("description", ""),
            "dueDate": item["dueDate"],
            "totalQuestions": int(item["totalQuestions"]),
            "timeLimit": int(item["timeLimit"]) if item.get("timeLimit") else None,
            "status": item.get("status", "draft"),
            "createdAt": item["createdAt"],
            "updatedAt": item.get("updatedAt", item["createdAt"]),
            "accessMode": item.get("accessMode", "open"),
            "scheduledWindowStart": item.get("scheduledWindowStart"),
            "scheduledWindowEnd": item.get("scheduledWindowEnd"),
            "assignmentBrief": item.get("assignmentBrief"),
        }

    def list_assessments(self, owner_user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq("ASSESSMENT"),
            ScanIndexForward=False,
        )

        assessments: List[Dict[str, Any]] = []
        for item in response.get("Items", []):
            created_by = item.get("createdBy")
            if owner_user_id and created_by and created_by != owner_user_id:
                continue
            assessments.append(self.to_assessment_view(item))
        return assessments

    def get_assessment(self, assessment_id: str) -> Dict[str, Any]:
        response = self.table.get_item(
            Key={
                "PK": f"ASSESSMENT#{assessment_id}",
                "SK": "METADATA",
            }
        )
        if "Item" not in response:
            raise ValueError(f"Assessment {assessment_id} not found")
        return self.to_assessment_view(response["Item"])
