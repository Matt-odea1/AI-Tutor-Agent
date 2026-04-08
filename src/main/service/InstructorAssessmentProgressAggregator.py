from __future__ import annotations

from typing import Any, Callable, Dict, List


class InstructorAssessmentProgressAggregator:
    def __init__(self, *, table, get_students: Callable[[str], List[Dict[str, Any]]]):
        self.table = table
        self.get_students = get_students

    def get_assessment_progress(self, assessment_id: str) -> List[Dict[str, Any]]:
        students = self.get_students(assessment_id)
        if not students:
            return []

        # Build keys for batch get
        table_name = self.table.table_name
        keys = [
            {"PK": f"STUDENT#{s['studentId']}#ASSESSMENT#{assessment_id}", "SK": "PROGRESS"}
            for s in students
        ]

        # BatchGetItem supports max 100 keys per call
        progress_map: Dict[str, Dict[str, Any]] = {}
        for i in range(0, len(keys), 100):
            batch = keys[i : i + 100]
            response = self.table.meta.client.batch_get_item(
                RequestItems={table_name: {"Keys": batch}}
            )
            for item in response.get("Responses", {}).get(table_name, []):
                # Extract studentId from PK: "STUDENT#<id>#ASSESSMENT#<aid>"
                pk = item["PK"]
                student_id = pk.split("#")[1]
                progress_map[student_id] = item

            # Handle unprocessed keys (throttling)
            unprocessed = response.get("UnprocessedKeys", {}).get(table_name, {}).get("Keys", [])
            while unprocessed:
                retry = self.table.meta.client.batch_get_item(
                    RequestItems={table_name: {"Keys": unprocessed}}
                )
                for item in retry.get("Responses", {}).get(table_name, []):
                    pk = item["PK"]
                    student_id = pk.split("#")[1]
                    progress_map[student_id] = item
                unprocessed = retry.get("UnprocessedKeys", {}).get(table_name, {}).get("Keys", [])

        # Build response
        progress_list: List[Dict[str, Any]] = []
        for student in students:
            student_id = student["studentId"]
            progress = progress_map.get(student_id)
            if progress:
                progress_data = {
                    "studentId": student_id,
                    "name": student["name"],
                    "email": student["email"],
                    "status": progress.get("status", "not-started"),
                    "totalQuestions": int(progress.get("totalQuestions", 0)),
                    "answeredQuestions": int(progress.get("answeredQuestions", 0)),
                    "percentage": float(progress.get("percentage", 0)),
                    "startedAt": student.get("startedAt"),
                    "submittedAt": student.get("submittedAt"),
                }
            else:
                progress_data = {
                    "studentId": student_id,
                    "name": student["name"],
                    "email": student["email"],
                    "status": "not-started",
                    "totalQuestions": 0,
                    "answeredQuestions": 0,
                    "percentage": 0,
                    "startedAt": None,
                    "submittedAt": None,
                }
            progress_list.append(progress_data)

        return progress_list
