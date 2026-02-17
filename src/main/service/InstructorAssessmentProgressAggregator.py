from __future__ import annotations

from typing import Any, Callable, Dict, List


class InstructorAssessmentProgressAggregator:
    def __init__(self, *, table, get_students: Callable[[str], List[Dict[str, Any]]]):
        self.table = table
        self.get_students = get_students

    def get_assessment_progress(self, assessment_id: str) -> List[Dict[str, Any]]:
        students = self.get_students(assessment_id)

        progress_list: List[Dict[str, Any]] = []
        for student in students:
            student_id = student["studentId"]
            pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

            progress_response = self.table.get_item(Key={"PK": pk, "SK": "PROGRESS"})
            if "Item" in progress_response:
                progress = progress_response["Item"]
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
