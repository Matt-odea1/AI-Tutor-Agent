from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional

from boto3.dynamodb.conditions import Key


def _effective_score(eval_item: Dict[str, Any]) -> int:
    """Return instructorScore if set, else AI score, else 0."""
    if eval_item.get("instructorScore") is not None:
        return int(eval_item["instructorScore"])
    score = eval_item.get("totalScore")
    return int(score) if score is not None else 0


class InstructorAssessmentResultsAggregator:
    def __init__(self, *, table, get_students: Callable[[str], List[Dict[str, Any]]]):
        self.table = table
        self.get_students = get_students

    # ------------------------------------------------------------------
    # Batch helpers
    # ------------------------------------------------------------------

    def _batch_get_enrollments(
        self, assessment_id: str, student_ids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch enrollment items via BatchGetItem (100-key pages)."""
        table_name = self.table.table_name
        keys = [
            {"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{sid}"}
            for sid in student_ids
        ]
        enrollment_map: Dict[str, Dict[str, Any]] = {}
        for i in range(0, len(keys), 100):
            batch = keys[i : i + 100]
            response = self.table.meta.client.batch_get_item(
                RequestItems={table_name: {"Keys": batch}}
            )
            for item in response.get("Responses", {}).get(table_name, []):
                sid = item["SK"].replace("STUDENT#", "")
                enrollment_map[sid] = item

            # Handle unprocessed keys (throttling)
            unprocessed = (
                response.get("UnprocessedKeys", {})
                .get(table_name, {})
                .get("Keys", [])
            )
            while unprocessed:
                retry = self.table.meta.client.batch_get_item(
                    RequestItems={table_name: {"Keys": unprocessed}}
                )
                for item in retry.get("Responses", {}).get(table_name, []):
                    sid = item["SK"].replace("STUDENT#", "")
                    enrollment_map[sid] = item
                unprocessed = (
                    retry.get("UnprocessedKeys", {})
                    .get(table_name, {})
                    .get("Keys", [])
                )
        return enrollment_map

    def _query_evaluations(
        self, student_id: str, assessment_id: str
    ) -> List[Dict[str, Any]]:
        """Query evaluation items for a single student (used inside thread pool)."""
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        resp = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("EVALUATION#")
        )
        return resp.get("Items", [])

    # ------------------------------------------------------------------
    # get_assessment_results  — was N+1, now batched + concurrent
    # ------------------------------------------------------------------

    def get_assessment_results(self, assessment_id: str) -> List[Dict[str, Any]]:
        students = self.get_students(assessment_id)
        if not students:
            return []

        student_ids = [s["studentId"] for s in students]

        # 1) BatchGetItem for all enrollment records (ceil(N/100) calls)
        enrollment_map = self._batch_get_enrollments(assessment_id, student_ids)

        # 2) Concurrent evaluation queries (max 20 workers)
        evaluations_map: Dict[str, List[Dict[str, Any]]] = {}
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {
                pool.submit(self._query_evaluations, sid, assessment_id): sid
                for sid in student_ids
            }
            for future in as_completed(futures):
                sid = futures[future]
                evaluations_map[sid] = future.result()

        # 3) Assemble results
        results_list: List[Dict[str, Any]] = []
        for student in students:
            student_id = student["studentId"]
            evaluations = evaluations_map.get(student_id, [])
            enrollment = enrollment_map.get(student_id, {})

            if not evaluations:
                results_list.append(
                    {
                        "studentId": student_id,
                        "name": student["name"],
                        "email": student["email"],
                        "totalScore": 0,
                        "maxScore": 0,
                        "percentage": 0,
                        "grade": "Not Evaluated",
                        "completedAt": enrollment.get("submittedAt"),
                    }
                )
                continue

            total_score = 0
            max_score = 0
            for eval_item in evaluations:
                score = _effective_score(eval_item)
                q_max = int(eval_item.get("maxScore", 10)) if eval_item.get("maxScore") is not None else 10
                total_score += score
                max_score += q_max

            percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0

            if percentage >= 90:
                grade = "Excellent"
            elif percentage >= 75:
                grade = "Competent"
            elif percentage >= 60:
                grade = "Developing"
            else:
                grade = "Unsatisfactory"

            results_list.append(
                {
                    "studentId": student_id,
                    "name": student["name"],
                    "email": student["email"],
                    "totalScore": total_score,
                    "maxScore": max_score,
                    "percentage": percentage,
                    "grade": grade,
                    "completedAt": enrollment.get("submittedAt"),
                }
            )

        return results_list

    # ------------------------------------------------------------------
    # get_student_detail  — was 5 sequential queries, now 1 query + 1 get
    # ------------------------------------------------------------------

    def get_student_detail(self, assessment_id: str, student_id: str) -> Dict[str, Any]:
        """Return per-question details for one student in the instructor view."""
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"

        # Single query for ALL items under this PK (questions, answers,
        # evaluations, and proctoring chunks all share the same partition).
        all_items_resp = self.table.query(KeyConditionExpression=Key("PK").eq(pk))
        all_items = all_items_resp.get("Items", [])

        # Bucket items by SK prefix
        questions_map: Dict[str, Dict[str, Any]] = {}
        answers_map: Dict[str, Dict[str, Any]] = {}
        evaluations_map: Dict[str, Dict[str, Any]] = {}
        chunks: List[Dict[str, Any]] = []

        for item in all_items:
            sk: str = item.get("SK", "")
            if sk.startswith("QUESTION#"):
                questions_map[sk.replace("QUESTION#", "")] = item
            elif sk.startswith("ANSWER#"):
                answers_map[sk.replace("ANSWER#", "")] = item
            elif sk.startswith("EVALUATION#"):
                evaluations_map[sk.replace("EVALUATION#", "")] = item
            elif sk.startswith("PROCTORING#CHUNK#"):
                chunks.append(item)

        # Proctoring chunk health
        chunks.sort(key=lambda c: int(c.get("chunkIndex", 0)))
        chunk_indexes = {int(c.get("chunkIndex", 0)) for c in chunks}
        max_index = max(chunk_indexes, default=-1)
        missing_indexes = [i for i in range(max_index + 1) if i not in chunk_indexes]

        proctoring = {
            "studentId": student_id,
            "assessmentId": assessment_id,
            "totalChunks": len(chunks),
            "missingIndexes": missing_indexes,
            "chunks": [
                {
                    "chunkIndex": int(c.get("chunkIndex", 0)),
                    "chunkUrl": c.get("chunkUrl", ""),
                    "recordedAt": c.get("recordedAt"),
                }
                for c in chunks
            ],
        }

        question_details = []
        total_score = 0
        max_score = 0

        for question_id, question in questions_map.items():
            answer = answers_map.get(question_id, {})
            evaluation = evaluations_map.get(question_id, {})

            ai_score = int(evaluation.get("totalScore", 0)) if evaluation.get("totalScore") is not None else None
            instructor_score = int(evaluation["instructorScore"]) if evaluation.get("instructorScore") is not None else None
            effective = instructor_score if instructor_score is not None else (ai_score if ai_score is not None else 0)
            q_max = int(evaluation.get("maxScore", 10)) if evaluation.get("maxScore") is not None else 10

            if evaluation:
                total_score += effective
                max_score += q_max

            question_details.append({
                "questionId": question_id,
                "questionText": question.get("text", ""),
                "answerType": answer.get("answerType"),
                "audioUrl": answer.get("audioUrl"),
                "videoUrl": answer.get("videoUrl"),
                "textContent": answer.get("textContent"),
                "duration": int(answer.get("duration", 0)) if answer.get("duration") else None,
                "transcript": answer.get("transcript"),
                "transcriptStatus": answer.get("transcriptStatus"),
                "aiScore": ai_score,
                "instructorScore": instructor_score,
                "effectiveScore": effective if evaluation else None,
                "maxScore": q_max,
                "feedback": evaluation.get("feedback"),
                "strengths": list(evaluation["strengths"]) if isinstance(evaluation.get("strengths"), (list, set)) else ([evaluation["strengths"]] if evaluation.get("strengths") else []),
                "weaknesses": list(evaluation["weaknesses"]) if isinstance(evaluation.get("weaknesses"), (list, set)) else ([evaluation["weaknesses"]] if evaluation.get("weaknesses") else []),
                "suggestedImprovements": list(evaluation["suggestedImprovements"]) if isinstance(evaluation.get("suggestedImprovements"), (list, set)) else ([evaluation["suggestedImprovements"]] if evaluation.get("suggestedImprovements") else []),
                "correctnessScore": int(evaluation.get("correctnessScore", 0)) if evaluation.get("correctnessScore") is not None else 0,
                "understandingScore": int(evaluation.get("understandingScore", 0)) if evaluation.get("understandingScore") is not None else 0,
                "instructorComment": evaluation.get("instructorComment"),
                "evaluatedAt": evaluation.get("evaluatedAt"),
            })

        percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0

        if percentage >= 90:
            grade = "Excellent"
        elif percentage >= 75:
            grade = "Competent"
        elif percentage >= 60:
            grade = "Developing"
        else:
            grade = "Unsatisfactory"

        # Fetch enrollment for name/email/submittedAt (different PK, so separate call)
        enrollment_resp = self.table.get_item(
            Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": f"STUDENT#{student_id}"}
        )
        enrollment = enrollment_resp.get("Item", {})

        return {
            "studentId": student_id,
            "studentName": enrollment.get("name", ""),
            "studentEmail": enrollment.get("email", ""),
            "assessmentId": assessment_id,
            "totalScore": total_score,
            "maxScore": max_score,
            "percentage": percentage,
            "grade": grade,
            "submittedAt": enrollment.get("submittedAt"),
            "questions": question_details,
            "proctoring": proctoring,
        }
