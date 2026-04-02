"""
Thin client for the Ed (edstem.org) REST API + WebSocket workspace protocol.

Used to import students and their code submissions from Ed challenges
into our assessment system, replacing the manual CSV upload flow.

The Ed API is unofficial and undocumented — endpoints were reverse-engineered
from browser network inspection and the glipR/terraform-provider-edstem repo.

Code retrieval flow:
  1. GET /api/challenges/{id}/users  → list students
  2. GET /api/users/{uid}/challenges/{cid}/submissions  → get workspace_id
  3. POST /api/challenges/{cid}/connect/scaffold  → get WebSocket ticket
  4. WSS connect → list_folder → file_open → read buffer from file_ot_init
"""

from __future__ import annotations

import json
import logging
import ssl
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

import requests
import websocket

logger = logging.getLogger(__name__)

ED_API_BASE = "https://edstem.org/api"
ED_WS_HOST = "wss://sahara.au.edstem.org/connect"
# Per-student WebSocket timeout (seconds)
WS_TIMEOUT = 20
# Max concurrent WebSocket connections
MAX_WS_WORKERS = 10


class EdStemServiceError(Exception):
    pass


class EdStemService:
    def __init__(self, ed_token: str):
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {ed_token}"

    def _get(self, path: str) -> Dict[str, Any]:
        url = f"{ED_API_BASE}/{path.lstrip('/')}"
        resp = self.session.get(url, timeout=30)
        if resp.status_code in (400, 401):
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            raise EdStemServiceError(f"Ed authentication failed: {body.get('message', resp.status_code)}")
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{ED_API_BASE}/{path.lstrip('/')}"
        resp = self.session.post(url, json=data, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_challenge_users(self, challenge_id: int) -> List[Dict[str, Any]]:
        data = self._get(f"challenges/{challenge_id}/users")
        return data.get("users", [])

    def get_user_submissions(self, challenge_id: int, user_id: int) -> List[Dict[str, Any]]:
        data = self._get(f"users/{user_id}/challenges/{challenge_id}/submissions")
        return data.get("submissions", [])

    def _get_ws_ticket(self, challenge_id: int, workspace_id: str) -> str:
        data = self._post(
            f"challenges/{challenge_id}/connect/scaffold",
            {"workspace_id": workspace_id},
        )
        ticket = data.get("ticket")
        if not ticket:
            raise EdStemServiceError(f"No WebSocket ticket returned for workspace {workspace_id}")
        return ticket

    def _fetch_code_via_ws(self, ticket: str) -> str:
        """
        Connect to the Ed workspace WebSocket, list Python files, and read their content.
        Returns concatenated code from all .py files found.
        """
        code_parts: List[str] = []
        done = threading.Event()
        pending_files: List[str] = []
        opened_files: set = set()

        def on_message(ws: websocket.WebSocketApp, raw: str) -> None:
            try:
                msg = json.loads(raw)
            except Exception:
                return

            msg_type = msg.get("type")

            if msg_type == "client_join":
                ws.send(json.dumps({"type": "fsop", "data": {"type": "list_folder", "param1": "."}}))

            elif msg_type == "list_reply":
                listing = msg.get("data", {}).get("listing", [])
                py_files = [f["name"] for f in listing if isinstance(f, dict) and f.get("name", "").endswith(".py")]
                pending_files.extend(py_files)
                if py_files:
                    # Open first file; subsequent opens triggered after file_ot_init
                    ws.send(json.dumps({"type": "file_open", "data": {"path": py_files[0], "soft": True}}))
                    opened_files.add(py_files[0])
                else:
                    done.set()

            elif msg_type == "file_ot_init":
                buf = msg.get("data", {}).get("buffer", "")
                # Determine which file this is (Ed sends fid, not path — use open order)
                idx = len(code_parts)
                fname = pending_files[idx] if idx < len(pending_files) else "unknown.py"
                if buf.strip():
                    code_parts.append(f"# === {fname} ===\n{buf}")
                # Open next file if any
                next_idx = idx + 1
                if next_idx < len(pending_files):
                    next_file = pending_files[next_idx]
                    if next_file not in opened_files:
                        ws.send(json.dumps({"type": "file_open", "data": {"path": next_file, "soft": True}}))
                        opened_files.add(next_file)
                else:
                    done.set()

            elif msg_type == "error":
                logger.warning(f"[EdStem WS] error msg: {msg}")
                done.set()

        def on_error(ws: websocket.WebSocketApp, err: Exception) -> None:
            logger.warning(f"[EdStem WS] error: {err}")
            done.set()

        ws_app = websocket.WebSocketApp(
            f"{ED_WS_HOST}?ticket={ticket}",
            on_message=on_message,
            on_error=on_error,
        )
        thread = threading.Thread(
            target=lambda: ws_app.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE}),
            daemon=True,
        )
        thread.start()
        done.wait(timeout=WS_TIMEOUT)
        ws_app.close()

        return "\n\n".join(code_parts)

    def _fetch_student_code(self, challenge_id: int, user_id: int) -> str:
        """Fetch the latest submission code for a single student via WebSocket."""
        submissions = self.get_user_submissions(challenge_id, user_id)
        if not submissions:
            return ""
        workspace_id = submissions[0].get("workspace_id")
        if not workspace_id:
            return ""
        try:
            ticket = self._get_ws_ticket(challenge_id, workspace_id)
            return self._fetch_code_via_ws(ticket)
        except Exception as e:
            logger.warning(f"[EdStem] Failed to fetch code for user {user_id}: {e}")
            return ""

    def import_challenge(
        self,
        challenge_id: int,
        *,
        student_id_field: str = "email",
    ) -> List[Dict[str, str]]:
        """
        Fetch all students and their latest code submissions from an Ed challenge.

        Returns a list of dicts in the shape expected by upload_students():
            [{name, email, studentId, code, assignmentFile}, ...]

        Args:
            challenge_id: The Ed challenge/assignment ID.
            student_id_field: Which Ed user field to use as studentId.
                              Options: "email", "username", "student_number", "id".
        """
        users = self.get_challenge_users(challenge_id)
        students_only = [
            u for u in users
            if u.get("course_role") == "student" or u.get("role") == "student"
        ]

        if not students_only:
            raise EdStemServiceError(f"No students found for challenge {challenge_id}")

        logger.info(f"[EdStem] Found {len(students_only)} students for challenge {challenge_id}")

        # Build result shells first so order is preserved
        results: List[Dict[str, str]] = []
        user_index: Dict[int, int] = {}  # ed_user_id → results index

        for user in students_only:
            ed_user_id = user["id"]
            name = user.get("name", "")
            email = user.get("email", "")
            student_id = str(
                user.get(student_id_field)
                or user.get("email")
                or user.get("username")
                or user["id"]
            )
            idx = len(results)
            results.append({
                "name": name,
                "email": email,
                "studentId": student_id,
                "code": "",
                "assignmentFile": "",
            })
            user_index[ed_user_id] = idx

        # Fetch code concurrently
        errors: List[str] = []

        def fetch_one(user: Dict[str, Any]) -> tuple[int, str]:
            ed_user_id = user["id"]
            try:
                code = self._fetch_student_code(challenge_id, ed_user_id)
            except Exception as e:
                errors.append(str(e))
                code = ""
            return ed_user_id, code

        with ThreadPoolExecutor(max_workers=MAX_WS_WORKERS) as pool:
            futures = {pool.submit(fetch_one, u): u for u in students_only}
            for future in as_completed(futures):
                ed_user_id, code = future.result()
                idx = user_index[ed_user_id]
                results[idx]["code"] = code

        code_count = sum(1 for r in results if r["code"])
        logger.info(
            f"[EdStem] Imported {len(results)} students, "
            f"{code_count} with code, {len(errors)} errors"
        )
        return results
