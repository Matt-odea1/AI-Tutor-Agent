"""
Thin client for the Ed (edstem.org) REST API.

Used to import students and their code submissions from Ed challenges
into our assessment system, replacing the manual CSV upload flow.

The Ed API is unofficial and undocumented — endpoints were reverse-engineered
from the hschafer/edstem and smartspot2/edapi open-source libraries.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

ED_API_BASE = "https://edstem.org/api"


class EdStemServiceError(Exception):
    pass


class EdStemService:
    def __init__(self, ed_token: str):
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {ed_token}"

    def _get(self, path: str) -> Dict[str, Any]:
        url = f"{ED_API_BASE}/{path.lstrip('/')}"
        resp = self.session.get(url, timeout=30)
        if resp.status_code == 401 or resp.status_code == 400:
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise EdStemServiceError(f"Ed authentication failed: {body.get('message', resp.status_code)}")
        resp.raise_for_status()
        return resp.json()

    def get_challenge_users(self, challenge_id: int) -> List[Dict[str, Any]]:
        data = self._get(f"challenges/{challenge_id}/users")
        return data.get("users", [])

    def get_user_submissions(self, challenge_id: int, user_id: int) -> List[Dict[str, Any]]:
        data = self._get(f"users/{user_id}/challenges/{challenge_id}/submissions")
        return data.get("submissions", [])

    def import_challenge(
        self,
        challenge_id: int,
        *,
        student_id_field: str = "username",
    ) -> List[Dict[str, str]]:
        """
        Fetch all students and their latest submissions from an Ed challenge.

        Returns a list of dicts in the shape expected by upload_students():
            [{name, email, studentId, code, assignmentFile}, ...]

        Args:
            challenge_id: The Ed challenge/assignment ID.
            student_id_field: Which Ed user field to use as studentId.
                              Options: "username", "student_number", "id".
        """
        users = self.get_challenge_users(challenge_id)
        students_only = [u for u in users if u.get("role") == "student"]

        if not students_only:
            raise EdStemServiceError(f"No students found for challenge {challenge_id}")

        logger.info(f"[EdStem] Found {len(students_only)} students for challenge {challenge_id}")

        results: List[Dict[str, str]] = []
        errors: List[Dict[str, str]] = []

        for user in students_only:
            ed_user_id = user["id"]
            name = user.get("name", "")
            email = user.get("email", "")
            student_id = str(user.get(student_id_field) or user.get("username") or user["id"])

            try:
                submissions = self.get_user_submissions(challenge_id, ed_user_id)
                code = _extract_latest_code(submissions)
            except Exception as e:
                logger.warning(f"[EdStem] Failed to fetch submissions for user {ed_user_id}: {e}")
                errors.append({"studentId": student_id, "error": str(e)})
                code = ""

            results.append({
                "name": name,
                "email": email,
                "studentId": student_id,
                "code": code,
                "assignmentFile": "",
            })

        logger.info(f"[EdStem] Imported {len(results)} students ({len(errors)} errors)")
        return results


def _extract_latest_code(submissions: List[Dict[str, Any]]) -> str:
    """Extract code from the most recent submission."""
    if not submissions:
        return ""

    # Submissions are typically ordered newest-first; take first
    latest = submissions[0]

    # Ed submissions can have code in different places depending on challenge type:
    # 1. Inline code in submission.content
    # 2. Files array in submission.files
    # 3. Source field
    code_parts: List[str] = []

    # Check for files array (most common for code challenges)
    files = latest.get("files")
    if isinstance(files, list):
        for f in files:
            name = f.get("name", "unknown")
            content = f.get("content", "")
            if content:
                code_parts.append(f"# === {name} ===\n{content}")

    if code_parts:
        return "\n\n".join(code_parts)

    # Fallback: check source/content fields
    for field in ("source", "content", "code"):
        val = latest.get(field)
        if val and isinstance(val, str):
            return val

    return ""
