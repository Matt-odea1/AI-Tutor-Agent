from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional

from boto3.dynamodb.conditions import Key

from src.main.service.ScoringConfig import ScoringConfig


def _effective_score(eval_item: Dict[str, Any]) -> int:
    """Return instructorScore if set, else AI score, else 0."""
    if eval_item.get("instructorScore") is not None:
        return int(eval_item["instructorScore"])
    score = eval_item.get("totalScore")
    return int(score) if score is not None else 0


def _as_list(value: Any) -> List[str]:
    """Normalise a DynamoDB list/set/string field to a list of strings."""
    if isinstance(value, (list, set, tuple)):
        return [str(v) for v in value]
    return [str(value)] if value else []


class InstructorAssessmentResultsAggregator:
    def __init__(self, *, table, get_students: Callable[[str], List[Dict[str, Any]]], presign_url: Optional[Callable[[Optional[str]], Optional[str]]] = None):
        self.table = table
        self.get_students = get_students
        self._presign_url = presign_url or (lambda url: url)

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

    def _get_assessment_metadata(self, assessment_id: str) -> Dict[str, Any]:
        """Read the assessment METADATA item (for scoring config), or {} if absent."""
        try:
            resp = self.table.get_item(
                Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
            )
            return resp.get("Item") or {}
        except Exception:
            return {}

    # ------------------------------------------------------------------
    # get_assessment_results  — was N+1, now batched + concurrent
    # ------------------------------------------------------------------

    def get_assessment_results(self, assessment_id: str) -> List[Dict[str, Any]]:
        students = self.get_students(assessment_id)
        if not students:
            return []

        student_ids = [s["studentId"] for s in students]

        scoring = ScoringConfig.from_metadata(self._get_assessment_metadata(assessment_id))

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
                q_max = int(eval_item.get("maxScore", scoring.max_score_per_question)) if eval_item.get("maxScore") is not None else scoring.max_score_per_question
                total_score += score
                max_score += q_max

            percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0
            grade = scoring.grade(percentage)

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
        scoring = ScoringConfig.from_metadata(self._get_assessment_metadata(assessment_id))

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
                    "chunkUrl": self._presign_url(c.get("chunkUrl", "")),
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
            q_max = int(evaluation.get("maxScore", scoring.max_score_per_question)) if evaluation.get("maxScore") is not None else scoring.max_score_per_question

            if evaluation:
                total_score += effective
                max_score += q_max

            # Human reference score (dual-scoring validity harness) — separate from
            # the instructor override and does not affect the grade.
            human_correctness = int(evaluation["humanCorrectnessScore"]) if evaluation.get("humanCorrectnessScore") is not None else None
            human_understanding = int(evaluation["humanUnderstandingScore"]) if evaluation.get("humanUnderstandingScore") is not None else None
            human_total = int(evaluation["humanTotalScore"]) if evaluation.get("humanTotalScore") is not None else None

            confidence = evaluation.get("transcriptConfidence")
            question_details.append({
                "questionId": question_id,
                "questionText": question.get("text", ""),
                "answerType": answer.get("answerType"),
                "audioUrl": self._presign_url(answer.get("audioUrl")),
                "videoUrl": self._presign_url(answer.get("videoUrl")),
                "textContent": answer.get("textContent"),
                "duration": int(answer.get("duration", 0)) if answer.get("duration") else None,
                "transcript": answer.get("transcript"),
                "transcriptStatus": answer.get("transcriptStatus"),
                "aiScore": ai_score,
                "instructorScore": instructor_score,
                "effectiveScore": effective if evaluation else None,
                "maxScore": q_max,
                "feedback": evaluation.get("feedback"),
                "strengths": _as_list(evaluation.get("strengths")),
                "weaknesses": _as_list(evaluation.get("weaknesses")),
                "suggestedImprovements": _as_list(evaluation.get("suggestedImprovements")),
                "correctnessScore": int(evaluation.get("correctnessScore", 0)) if evaluation.get("correctnessScore") is not None else 0,
                "understandingScore": int(evaluation.get("understandingScore", 0)) if evaluation.get("understandingScore") is not None else 0,
                "instructorComment": evaluation.get("instructorComment"),
                "evaluatedAt": evaluation.get("evaluatedAt"),
                # Review flags (Tasks 4 & 5) — carry the AI's quality signals to the instructor.
                "needsReview": bool(evaluation.get("needsReview", False)),
                "reviewReasons": _as_list(evaluation.get("reviewReasons")),
                "evaluationMethod": evaluation.get("evaluationMethod"),
                "transcriptConfidence": float(confidence) if confidence is not None else None,
                # Human reference score (Task 3 dual-scoring).
                "humanCorrectnessScore": human_correctness,
                "humanUnderstandingScore": human_understanding,
                "humanTotalScore": human_total,
                "humanScoredBy": evaluation.get("humanScoredBy"),
                "humanScoredAt": evaluation.get("humanScoredAt"),
            })

        percentage = round((total_score / max_score * 100), 1) if max_score > 0 else 0
        grade = scoring.grade(percentage)

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

    # ------------------------------------------------------------------
    # Cross-student aggregates (Tasks 3 & 5)
    # ------------------------------------------------------------------

    def _query_all_evaluations(self, assessment_id: str):
        """Return (students, {student_id: [evaluation_items]}) for the assessment."""
        students = self.get_students(assessment_id)
        student_ids = [s["studentId"] for s in students]
        evaluations_map: Dict[str, List[Dict[str, Any]]] = {}
        if not student_ids:
            return students, evaluations_map
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {
                pool.submit(self._query_evaluations, sid, assessment_id): sid
                for sid in student_ids
            }
            for future in as_completed(futures):
                evaluations_map[futures[future]] = future.result()
        return students, evaluations_map

    def compute_score_agreement(self, assessment_id: str) -> Dict[str, Any]:
        """
        AI-vs-human agreement across all dual-scored items (Task 3 validity harness).

        Compares the AI total score against the recorded human total score on the
        same 0-10 scale. The instructor *override* score is deliberately ignored
        here — agreement is measured against the independent human reference score.
        """
        _, evaluations_map = self._query_all_evaluations(assessment_id)
        items: List[Dict[str, Any]] = []
        for student_id, evals in evaluations_map.items():
            for e in evals:
                if e.get("humanTotalScore") is None:
                    continue
                ai_total = int(e.get("totalScore", 0)) if e.get("totalScore") is not None else 0
                human_total = int(e["humanTotalScore"])
                items.append({
                    "studentId": student_id,
                    "questionId": e.get("questionId") or e.get("SK", "").replace("EVALUATION#", ""),
                    "aiTotal": ai_total,
                    "humanTotal": human_total,
                    "difference": ai_total - human_total,
                    "aiCorrectness": int(e.get("correctnessScore", 0)) if e.get("correctnessScore") is not None else None,
                    "humanCorrectness": int(e["humanCorrectnessScore"]) if e.get("humanCorrectnessScore") is not None else None,
                    "aiUnderstanding": int(e.get("understandingScore", 0)) if e.get("understandingScore") is not None else None,
                    "humanUnderstanding": int(e["humanUnderstandingScore"]) if e.get("humanUnderstandingScore") is not None else None,
                })

        n = len(items)
        if n == 0:
            return {
                "assessmentId": assessment_id,
                "dualScoredCount": 0,
                "exactMatchRate": None,
                "within1Rate": None,
                "meanAbsoluteDifference": None,
                "items": [],
            }
        exact = sum(1 for it in items if it["aiTotal"] == it["humanTotal"])
        within1 = sum(1 for it in items if abs(it["difference"]) <= 1)
        mad = sum(abs(it["difference"]) for it in items) / n
        return {
            "assessmentId": assessment_id,
            "dualScoredCount": n,
            "exactMatchRate": round(exact / n, 4),
            "within1Rate": round(within1 / n, 4),
            "meanAbsoluteDifference": round(mad, 4),
            "items": items,
        }

    def get_flagged_evaluations(self, assessment_id: str, divergence_threshold: int = 3) -> Dict[str, Any]:
        """
        Evaluations worth a human glance before/at release (Task 5):
          - needs_review (unusable transcript or structured-output fallback), or
          - a large divergence between the correctness and understanding scores.
        Returns a count plus a per-item list (no student names — keyed by id).
        """
        _, evaluations_map = self._query_all_evaluations(assessment_id)
        flagged: List[Dict[str, Any]] = []
        for student_id, evals in evaluations_map.items():
            for e in evals:
                reasons = _as_list(e.get("reviewReasons"))
                if e.get("needsReview") and not reasons:
                    reasons = ["needs_review"]
                correctness = e.get("correctnessScore")
                understanding = e.get("understandingScore")
                if (
                    correctness is not None
                    and understanding is not None
                    and abs(int(correctness) - int(understanding)) >= divergence_threshold
                    and "score_divergence" not in reasons
                ):
                    reasons.append("score_divergence")
                if reasons:
                    flagged.append({
                        "studentId": student_id,
                        "questionId": e.get("questionId") or e.get("SK", "").replace("EVALUATION#", ""),
                        "reasons": reasons,
                        "aiScore": int(e.get("totalScore", 0)) if e.get("totalScore") is not None else None,
                        "evaluationMethod": e.get("evaluationMethod"),
                    })
        return {
            "assessmentId": assessment_id,
            "flaggedCount": len(flagged),
            "items": flagged,
        }
