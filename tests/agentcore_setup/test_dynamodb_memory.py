"""
Integration tests for DynamoDBConversationMemory using moto.

Covers: add_message, get_history, get_formatted_history, session_exists,
get_session_info, list_sessions, clear_session, pedagogy_mode, truncate.
"""
from __future__ import annotations

import boto3
import pytest
from moto import mock_aws

from src.main.agentcore_setup.dynamodb_memory import DynamoDBConversationMemory

TABLE = "test_chat_sessions"


@pytest.fixture()
def memory(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        dynamodb.create_table(
            TableName=TABLE,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield DynamoDBConversationMemory(table_name=TABLE, region="us-east-1", ttl_days=30)


# ── Basic operations ────────────────────────────────────

class TestAddAndGet:
    def test_add_and_get_history(self, memory):
        memory.add_message("s-1", "user", "Hello", tokens=5)
        memory.add_message("s-1", "assistant", "Hi there!", tokens=10, context_ids=["d1"])

        history = memory.get_history("s-1")
        assert len(history) == 2
        assert history[0]["role"] == "user"
        assert history[1]["context_ids"] == ["d1"]

    def test_get_history_empty_session(self, memory):
        assert memory.get_history("nonexistent") == []

    def test_get_history_with_limit(self, memory):
        for i in range(5):
            memory.add_message("s-2", "user", f"msg {i}")

        history = memory.get_history("s-2", max_messages=3)
        assert len(history) == 3
        # Should be the 3 most recent
        assert history[0]["content"] == "msg 2"

    def test_get_formatted_history(self, memory):
        memory.add_message("s-3", "user", "What is a list?")
        memory.add_message("s-3", "assistant", "A list is a collection.")

        formatted = memory.get_formatted_history("s-3")
        assert "Student: What is a list?" in formatted
        assert "Tutor: A list is a collection." in formatted

    def test_get_formatted_history_empty(self, memory):
        assert memory.get_formatted_history("empty") == ""


# ── Session metadata ────────────────────────────────────

class TestSessionMetadata:
    def test_session_exists(self, memory):
        assert memory.session_exists("new") is False
        memory.add_message("new", "user", "hi")
        assert memory.session_exists("new") is True

    def test_get_session_info(self, memory):
        memory.add_message("s-4", "user", "hello", tokens=5)
        memory.add_message("s-4", "assistant", "hi", tokens=10)

        info = memory.get_session_info("s-4")
        assert info["session_id"] == "s-4"
        assert info["message_count"] == 2
        assert info["total_tokens"] == 15
        assert info["pedagogy_mode"] == "explanatory"

    def test_get_session_info_nonexistent(self, memory):
        assert memory.get_session_info("nope") is None

    def test_get_session_stats_alias(self, memory):
        assert memory.get_session_stats("nope") == {}
        memory.add_message("s-5", "user", "test")
        stats = memory.get_session_stats("s-5")
        assert stats["message_count"] == 1


# ── List sessions ───────────────────────────────────────

class TestListSessions:
    def test_list_sessions(self, memory):
        memory.add_message("s-a", "user", "a")
        memory.add_message("s-b", "user", "b")

        sessions = memory.list_sessions()
        ids = [s["session_id"] for s in sessions]
        assert "s-a" in ids
        assert "s-b" in ids


# ── Clear session ───────────────────────────────────────

class TestClearSession:
    def test_clear_existing(self, memory):
        memory.add_message("s-c", "user", "msg1")
        memory.add_message("s-c", "assistant", "msg2")

        assert memory.clear_session("s-c") is True
        assert memory.session_exists("s-c") is False
        assert memory.get_history("s-c") == []

    def test_clear_nonexistent(self, memory):
        assert memory.clear_session("nope") is False


# ── Pedagogy mode ───────────────────────────────────────

class TestPedagogyMode:
    def test_set_and_get(self, memory):
        memory.add_message("s-p", "user", "test")
        memory.set_pedagogy_mode("s-p", "concise")
        assert memory.get_pedagogy_mode("s-p") == "concise"

    def test_get_default(self, memory):
        assert memory.get_pedagogy_mode("no-such-session") == "explanatory"

    def test_set_creates_session_if_needed(self, memory):
        memory.set_pedagogy_mode("brand-new", "concise")
        assert memory.session_exists("brand-new") is True
        assert memory.get_pedagogy_mode("brand-new") == "concise"


# ── Truncate ────────────────────────────────────────────

class TestTruncate:
    def test_truncate_removes_oldest(self, memory):
        for i in range(6):
            memory.add_message("s-t", "user", f"msg-{i}", tokens=10)

        removed = memory.truncate_session_history("s-t", max_messages=3)
        assert removed == 3

        history = memory.get_history("s-t")
        assert len(history) == 3

    def test_truncate_noop_when_under_limit(self, memory):
        memory.add_message("s-t2", "user", "msg-0")
        removed = memory.truncate_session_history("s-t2", max_messages=10)
        assert removed == 0


# ── Legacy compatibility ────────────────────────────────

class TestLegacy:
    def test_get_state(self, memory):
        memory.add_message("s-leg", "user", "hi")
        state = memory.get_state("s-leg")
        assert state["message_count"] == 1

    def test_set_state_creates_session(self, memory):
        memory.set_state("new-leg", {})
        assert memory.session_exists("new-leg") is True

    def test_clear_state(self, memory):
        memory.add_message("s-clr", "user", "hi")
        memory.clear_state("s-clr")
        assert memory.session_exists("s-clr") is False

    def test_update_session_title(self, memory):
        memory.add_message("s-title", "user", "hi")
        memory.update_session_title("s-title", "My Chat")
        info = memory.get_session_info("s-title")
        assert info["title"] == "My Chat"
