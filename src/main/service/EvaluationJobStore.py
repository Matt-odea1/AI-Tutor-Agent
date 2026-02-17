from __future__ import annotations

from datetime import datetime
from typing import Any, Dict


class EvaluationJobStore:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}

    def create_processing_job(self, job_id: str, payload: Dict[str, Any], total_questions: int) -> None:
        self.jobs[job_id] = {
            "status": "processing",
            **payload,
            "total_questions": total_questions,
            "progress": {
                "questions_evaluated": 0,
                "total_questions": total_questions,
                "percentage": 0.0,
            },
            "result": None,
            "error": None,
            "started_at": datetime.now().isoformat(),
        }

    def get(self, job_id: str) -> Dict[str, Any] | None:
        return self.jobs.get(job_id)

    def set_progress(self, job_id: str, questions_evaluated: int, total_questions: int) -> None:
        job = self.jobs.get(job_id)
        if not job:
            return
        job["progress"] = {
            "questions_evaluated": questions_evaluated,
            "total_questions": total_questions,
            "percentage": round((questions_evaluated / total_questions) * 100, 1) if total_questions > 0 else 0.0,
        }

    def mark_completed(self, job_id: str, result: Dict[str, Any]) -> None:
        job = self.jobs.get(job_id)
        if not job:
            return
        job["status"] = "completed"
        job["result"] = result

    def mark_failed(self, job_id: str, error: str) -> None:
        job = self.jobs.get(job_id)
        if not job:
            return
        job["status"] = "failed"
        job["error"] = error
