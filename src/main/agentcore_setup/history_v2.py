"""
In-memory History v2 store for workspaces, view sessions, code memories, and assistant threads.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class HistoryV2Store:
    def __init__(self):
        self.workspaces: Dict[str, Dict[str, Any]] = {}
        self.view_sessions: Dict[str, Dict[str, Any]] = {}
        self.view_messages: Dict[str, List[Dict[str, Any]]] = {}
        self.code_memories: Dict[str, Dict[str, Any]] = {}
        self.programs: Dict[str, Dict[str, Any]] = {}
        self.threads: Dict[str, Dict[str, Any]] = {}
        self.thread_messages: Dict[str, List[Dict[str, Any]]] = {}

    # Workspace
    def create_workspace(self, title: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        workspace_id = str(uuid.uuid4())
        now = _now_iso()
        self.workspaces[workspace_id] = {
            "workspace_id": workspace_id,
            "title": title,
            "user_id": user_id,
            "created_at": now,
            "last_accessed": now,
        }
        logger.info(f"Created workspace {workspace_id[:8]}...")
        return self.workspaces[workspace_id]

    def get_workspace(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        return self.workspaces.get(workspace_id)

    # View sessions
    def create_view_session(self, workspace_id: str, view_type: str, pedagogy_mode: Optional[str]) -> Dict[str, Any]:
        view_session_id = str(uuid.uuid4())
        now = _now_iso()
        session = {
            "view_session_id": view_session_id,
            "workspace_id": workspace_id,
            "view_type": view_type,
            "created_at": now,
            "last_accessed": now,
            "message_count": 0,
            "total_tokens": 0,
            "pedagogy_mode": pedagogy_mode,
        }
        self.view_sessions[view_session_id] = session
        self.view_messages[view_session_id] = []
        return session

    def get_view_session(self, view_session_id: str) -> Optional[Dict[str, Any]]:
        return self.view_sessions.get(view_session_id)

    def list_view_sessions(self, workspace_id: str, view_type: Optional[str] = None) -> List[Dict[str, Any]]:
        sessions = [v for v in self.view_sessions.values() if v.get("workspace_id") == workspace_id]
        if view_type:
            sessions = [v for v in sessions if v.get("view_type") == view_type]
        return sorted(sessions, key=lambda v: v.get("last_accessed", ""), reverse=True)

    def add_view_message(
        self,
        view_session_id: str,
        role: str,
        content: str,
        tokens: Optional[int] = None,
        context_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        now = _now_iso()
        message = {
            "role": role,
            "content": content,
            "timestamp": now,
        }
        if tokens is not None:
            message["tokens"] = tokens
        if context_ids is not None:
            message["context_ids"] = context_ids

        messages = self.view_messages.setdefault(view_session_id, [])
        messages.append(message)

        session = self.view_sessions[view_session_id]
        session["message_count"] += 1
        session["last_accessed"] = now
        if tokens:
            session["total_tokens"] += tokens

        return message

    def get_view_history(self, view_session_id: str) -> List[Dict[str, Any]]:
        return list(self.view_messages.get(view_session_id, []))

    def delete_view_session(self, view_session_id: str) -> None:
        view = self.view_sessions.pop(view_session_id, None)
        self.view_messages.pop(view_session_id, None)
        if view:
            logger.info(f"Deleted view session {view_session_id[:8]}... from workspace {view.get('workspace_id')}")

    # Code memories
    def create_code_memory(self, workspace_id: str, language: str, current_code: str) -> Dict[str, Any]:
        code_memory_id = str(uuid.uuid4())
        now = _now_iso()
        memory = {
            "code_memory_id": code_memory_id,
            "workspace_id": workspace_id,
            "language": language,
            "current_code": current_code,
            "last_output": None,
            "last_error": None,
            "created_at": now,
            "last_accessed": now,
        }
        self.code_memories[code_memory_id] = memory
        return memory

    def update_code_memory(self, code_memory_id: str, current_code: Optional[str], last_output: Optional[str], last_error: Optional[str]) -> Dict[str, Any]:
        memory = self.code_memories[code_memory_id]
        if current_code is not None:
            memory["current_code"] = current_code
        if last_output is not None:
            memory["last_output"] = last_output
        if last_error is not None:
            memory["last_error"] = last_error
        memory["last_accessed"] = _now_iso()
        return memory

    def get_code_memory(self, code_memory_id: str) -> Optional[Dict[str, Any]]:
        return self.code_memories.get(code_memory_id)

    # Programs
    def create_program(
        self,
        workspace_id: str,
        code_memory_id: str,
        language: str,
        title: str,
        current_code: str,
    ) -> Dict[str, Any]:
        program_id = str(uuid.uuid4())
        now = _now_iso()
        program = {
            "program_id": program_id,
            "workspace_id": workspace_id,
            "code_memory_id": code_memory_id,
            "language": language,
            "title": title,
            "current_code": current_code,
            "last_output": None,
            "last_error": None,
            "created_at": now,
            "last_accessed": now,
        }
        self.programs[program_id] = program
        return program

    def list_programs(self, workspace_id: str) -> List[Dict[str, Any]]:
        return [p for p in self.programs.values() if p.get("workspace_id") == workspace_id]

    def get_program(self, program_id: str) -> Optional[Dict[str, Any]]:
        return self.programs.get(program_id)

    def update_program(
        self,
        program_id: str,
        title: Optional[str],
        current_code: Optional[str],
        last_output: Optional[str],
        last_error: Optional[str],
    ) -> Dict[str, Any]:
        program = self.programs[program_id]
        if title is not None:
            program["title"] = title
        if current_code is not None:
            program["current_code"] = current_code
        if last_output is not None:
            program["last_output"] = last_output
        if last_error is not None:
            program["last_error"] = last_error
        program["last_accessed"] = _now_iso()
        return program

    def delete_program(self, program_id: str) -> None:
        self.programs.pop(program_id, None)

    # Assistant threads
    def create_thread(self, code_memory_id: str, title: str) -> Dict[str, Any]:
        thread_id = str(uuid.uuid4())
        now = _now_iso()
        thread = {
            "thread_id": thread_id,
            "code_memory_id": code_memory_id,
            "title": title,
            "created_at": now,
            "last_accessed": now,
            "message_count": 0,
        }
        self.threads[thread_id] = thread
        self.thread_messages[thread_id] = []
        return thread

    def list_threads(self, code_memory_id: str) -> List[Dict[str, Any]]:
        return [t for t in self.threads.values() if t.get("code_memory_id") == code_memory_id]

    def get_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        return self.threads.get(thread_id)

    def update_thread_title(self, thread_id: str, title: str) -> Dict[str, Any]:
        thread = self.threads[thread_id]
        thread["title"] = title
        thread["last_accessed"] = _now_iso()
        return thread

    def add_thread_message(
        self,
        thread_id: str,
        role: str,
        content: str,
        tokens: Optional[int] = None,
        context_ids: Optional[List[str]] = None,
        edit_block: Optional[dict] = None,
    ) -> Dict[str, Any]:
        now = _now_iso()
        message = {
            "role": role,
            "content": content,
            "timestamp": now,
        }
        if tokens is not None:
            message["tokens"] = tokens
        if context_ids is not None:
            message["context_ids"] = context_ids
        if edit_block is not None:
            message["edit_block"] = edit_block

        messages = self.thread_messages.setdefault(thread_id, [])
        messages.append(message)

        thread = self.threads[thread_id]
        thread["message_count"] += 1
        thread["last_accessed"] = now

        return message

    def get_thread_history(self, thread_id: str) -> List[Dict[str, Any]]:
        return list(self.thread_messages.get(thread_id, []))
