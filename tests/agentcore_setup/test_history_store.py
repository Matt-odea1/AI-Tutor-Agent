"""
Unit tests for the in-memory HistoryStore.

Covers: workspace CRUD, view sessions, messages, code memory, programs, threads.
"""
from __future__ import annotations

import pytest

from src.main.agentcore_setup.history import HistoryStore


@pytest.fixture()
def store():
    return HistoryStore()


# ── Workspace ─────────────────────────────────────────────

class TestWorkspace:
    def test_create_and_get(self, store):
        ws = store.create_workspace("W1", user_id="u-1")
        assert ws["title"] == "W1"
        fetched = store.get_workspace(ws["workspace_id"])
        assert fetched["user_id"] == "u-1"

    def test_get_nonexistent(self, store):
        assert store.get_workspace("nope") is None


# ── View Sessions ────────────────────────────────────────

class TestViewSessions:
    def test_create_and_list(self, store):
        ws = store.create_workspace("W1")
        store.create_view_session(ws["workspace_id"], "chat", "explanatory")
        store.create_view_session(ws["workspace_id"], "chat", "concise")

        sessions = store.list_view_sessions(ws["workspace_id"])
        assert len(sessions) == 2

    def test_list_by_type(self, store):
        ws = store.create_workspace("W1")
        store.create_view_session(ws["workspace_id"], "chat", None)
        store.create_view_session(ws["workspace_id"], "assistant", None)

        chat_only = store.list_view_sessions(ws["workspace_id"], view_type="chat")
        assert len(chat_only) == 1

    def test_get_view_session(self, store):
        ws = store.create_workspace("W1")
        view = store.create_view_session(ws["workspace_id"], "chat", "explanatory")
        fetched = store.get_view_session(view["view_session_id"])
        assert fetched["pedagogy_mode"] == "explanatory"

    def test_update_title(self, store):
        ws = store.create_workspace("W1")
        view = store.create_view_session(ws["workspace_id"], "chat", None)
        updated = store.update_view_title(view["view_session_id"], "Renamed")
        assert updated["title"] == "Renamed"

    def test_delete(self, store):
        ws = store.create_workspace("W1")
        view = store.create_view_session(ws["workspace_id"], "chat", None)
        store.add_view_message(view["view_session_id"], "user", "hello")

        store.delete_view_session(view["view_session_id"])
        assert store.get_view_session(view["view_session_id"]) is None
        assert store.get_view_history(view["view_session_id"]) == []


# ── View Messages ────────────────────────────────────────

class TestViewMessages:
    def test_add_and_get(self, store):
        ws = store.create_workspace("W1")
        view = store.create_view_session(ws["workspace_id"], "chat", None)

        store.add_view_message(view["view_session_id"], "user", "Hello", tokens=5)
        store.add_view_message(view["view_session_id"], "assistant", "Hi!", tokens=3, context_ids=["d1"])

        history = store.get_view_history(view["view_session_id"])
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[1]["context_ids"] == ["d1"]


# ── Code Memory ──────────────────────────────────────────

class TestCodeMemory:
    def test_create_and_get(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "x = 1")
        fetched = store.get_code_memory(cm["code_memory_id"])
        assert fetched["current_code"] == "x = 1"

    def test_update(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "x = 1")
        updated = store.update_code_memory(cm["code_memory_id"], current_code="x = 2", last_output="2", last_error=None)
        assert updated["current_code"] == "x = 2"


# ── Programs ─────────────────────────────────────────────

class TestPrograms:
    def test_create_and_list(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        store.create_program(ws["workspace_id"], cm["code_memory_id"], "python", "P1", "code1")
        store.create_program(ws["workspace_id"], cm["code_memory_id"], "python", "P2", "code2")

        programs = store.list_programs(ws["workspace_id"])
        assert len(programs) == 2

    def test_update(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        p = store.create_program(ws["workspace_id"], cm["code_memory_id"], "python", "P1", "old")
        updated = store.update_program(p["program_id"], title="New", current_code="new", last_output=None, last_error=None)
        assert updated["title"] == "New"

    def test_delete(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        p = store.create_program(ws["workspace_id"], cm["code_memory_id"], "python", "P1", "code")
        store.delete_program(p["program_id"])
        assert store.get_program(p["program_id"]) is None


# ── Threads ──────────────────────────────────────────────

class TestThreads:
    def test_create_and_list(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        store.create_thread(cm["code_memory_id"], "T1")
        store.create_thread(cm["code_memory_id"], "T2")

        threads = store.list_threads(cm["code_memory_id"])
        assert len(threads) == 2

    def test_messages(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        t = store.create_thread(cm["code_memory_id"], "T1")

        store.add_thread_message(t["thread_id"], "user", "Fix this", tokens=5)
        store.add_thread_message(t["thread_id"], "assistant", "Done", edit_block={"diff": "+x"})

        history = store.get_thread_history(t["thread_id"])
        assert len(history) == 2
        assert history[1]["edit_block"] == {"diff": "+x"}

    def test_update_title(self, store):
        ws = store.create_workspace("W1")
        cm = store.create_code_memory(ws["workspace_id"], "python", "")
        t = store.create_thread(cm["code_memory_id"], "Old")
        updated = store.update_thread_title(t["thread_id"], "New")
        assert updated["title"] == "New"
