from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List

from boto3.dynamodb.conditions import Key


class InstructorAssessmentEnrollment:
    def __init__(self, *, table, assessment_exists: Callable[[str], Dict[str, Any]]):
        self.table = table
        self.assessment_exists = assessment_exists

    def upload_students(self, assessment_id: str, students: List[Dict[str, str]]) -> Dict[str, Any]:
        self.assessment_exists(assessment_id)

        enrolled_at = datetime.now(timezone.utc).isoformat()
        with self.table.batch_writer() as batch:
            for student in students:
                batch.put_item(
                    Item={
                        "PK": f"ASSESSMENT#{assessment_id}",
                        "SK": f"STUDENT#{student['studentId']}",
                        "GSI1PK": f"STUDENT#{student['studentId']}",
                        "GSI1SK": f"ASSESSMENT#{assessment_id}",
                        "name": student["name"],
                        "email": student["email"],
                        "studentId": student["studentId"],
                        "code": student["code"],
                        "assignmentFile": student.get("assignmentFile", ""),
                        "status": "enrolled",
                        "enrolledAt": enrolled_at,
                    }
                )

        return {
            "ok": True,
            "assessmentId": assessment_id,
            "studentsUploaded": len(students),
        }

    def get_assessment_students(self, assessment_id: str) -> List[Dict[str, Any]]:
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}")
            & Key("SK").begins_with("STUDENT#")
        )

        students: List[Dict[str, Any]] = []
        for item in response.get("Items", []):
            students.append(
                {
                    "studentId": item["studentId"],
                    "name": item["name"],
                    "email": item["email"],
                    "code": item["code"],
                    "assignmentFile": item.get("assignmentFile", ""),
                    "status": item.get("status", "enrolled"),
                    "enrolledAt": item.get("enrolledAt", ""),
                }
            )
        return students
