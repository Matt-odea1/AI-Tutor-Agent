"""
Tests for InstructorQuestionBankService - CRUD and AI suggestion.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import boto3
import pytest
from moto import mock_aws

from src.main.service.InstructorQuestionBankService import (
    InstructorQuestionBankService,
    InstructorQuestionBankServiceError,
)

TABLE = "test_oral_assessments"


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = dynamodb.create_table(
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
        table.meta.client.get_waiter("table_exists").wait(TableName=TABLE)
        yield table


def _make_svc(table) -> InstructorQuestionBankService:
    return InstructorQuestionBankService(table=table, llm_client=MagicMock())


def _seed_assessment(table, assessment_id="a-1"):
    table.put_item(Item={
        "PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA",
        "title": "Test", "course": "COMP9021",
        "description": "Short description that is too short",
        "assignmentBrief": "A comprehensive assignment brief about binary search trees and graph algorithms that is definitely long enough",
    })


class TestAddQuestion:
    def test_add_returns_question(self, env):
        svc = _make_svc(env)
        q = svc.add_question("a-1", "What is a binary tree?", topic="trees")
        assert q["text"] == "What is a binary tree?"
        assert q["topic"] == "trees"
        assert "id" in q

    def test_add_too_short_raises(self, env):
        svc = _make_svc(env)
        with pytest.raises(InstructorQuestionBankServiceError, match="at least"):
            svc.add_question("a-1", "Short?")

    def test_add_invalid_difficulty_raises(self, env):
        svc = _make_svc(env)
        with pytest.raises(InstructorQuestionBankServiceError, match="difficulty"):
            svc.add_question("a-1", "A valid question text here", difficulty="ultra")

    def test_add_at_max_limit_raises(self, env):
        svc = _make_svc(env)
        for i in range(20):
            svc.add_question("a-1", f"Question number {i} is long enough")
        with pytest.raises(InstructorQuestionBankServiceError, match="maximum"):
            svc.add_question("a-1", "One too many questions here")

    def test_add_with_time_limit(self, env):
        svc = _make_svc(env)
        q = svc.add_question("a-1", "Explain recursion in detail", time_limit=120)
        assert q["timeLimit"] == 120


class TestListQuestions:
    def test_list_empty(self, env):
        svc = _make_svc(env)
        assert svc.list_questions("a-1") == []

    def test_list_returns_all(self, env):
        svc = _make_svc(env)
        svc.add_question("a-1", "Question one is long enough")
        svc.add_question("a-1", "Question two is long enough")
        assert len(svc.list_questions("a-1")) == 2


class TestDeleteQuestion:
    def test_delete_removes(self, env):
        svc = _make_svc(env)
        q = svc.add_question("a-1", "To be deleted question")
        svc.delete_question("a-1", q["id"])
        assert len(svc.list_questions("a-1")) == 0

    def test_delete_nonexistent_succeeds(self, env):
        svc = _make_svc(env)
        svc.delete_question("a-1", "fake-id")  # should not raise


class TestSuggestQuestions:
    def test_suggest_returns_questions(self, env):
        _seed_assessment(env)
        llm = MagicMock()
        suggestions = [
            {"text": "What is a BST?", "topic": "trees", "difficulty": "medium"},
            {"text": "Explain DFS", "topic": "graphs", "difficulty": "hard"},
        ]
        llm.chat.return_value = {"text": json.dumps(suggestions)}
        svc = InstructorQuestionBankService(table=env, llm_client=llm)

        result = svc.suggest_questions("a-1", count=2)
        assert len(result) == 2
        assert result[0]["source"] == "ai_suggested"
        assert result[1]["difficulty"] == "hard"

    def test_suggest_assessment_not_found_raises(self, env):
        svc = _make_svc(env)
        with pytest.raises(InstructorQuestionBankServiceError, match="not found"):
            svc.suggest_questions("nonexistent")

    def test_suggest_brief_too_short_raises(self, env):
        env.put_item(Item={
            "PK": "ASSESSMENT#a-short", "SK": "METADATA",
            "title": "T", "description": "tiny",
        })
        svc = _make_svc(env)
        with pytest.raises(InstructorQuestionBankServiceError, match="too short"):
            svc.suggest_questions("a-short")

    def test_suggest_llm_error_raises(self, env):
        _seed_assessment(env)
        llm = MagicMock()
        llm.chat.side_effect = RuntimeError("LLM down")
        svc = InstructorQuestionBankService(table=env, llm_client=llm)
        with pytest.raises(InstructorQuestionBankServiceError, match="LLM call failed"):
            svc.suggest_questions("a-1")


class TestParseSuggestions:
    def test_parse_valid(self):
        raw = json.dumps([{"text": "Q1", "topic": "t", "difficulty": "easy"}])
        result = InstructorQuestionBankService._parse_suggestions(raw, 5)
        assert len(result) == 1
        assert result[0]["difficulty"] == "easy"

    def test_parse_invalid_json_raises(self):
        with pytest.raises(InstructorQuestionBankServiceError, match="invalid JSON"):
            InstructorQuestionBankService._parse_suggestions("not json", 5)

    def test_parse_not_array_raises(self):
        with pytest.raises(InstructorQuestionBankServiceError, match="not a JSON array"):
            InstructorQuestionBankService._parse_suggestions('{"key": "val"}', 5)

    def test_parse_markdown_fenced(self):
        inner = json.dumps([{"text": "Q1", "topic": "t", "difficulty": "medium"}])
        raw = f"```json\n{inner}\n```"
        result = InstructorQuestionBankService._parse_suggestions(raw, 5)
        assert len(result) == 1

    def test_parse_clamps_difficulty(self):
        raw = json.dumps([{"text": "Q1", "topic": "t", "difficulty": "extreme"}])
        result = InstructorQuestionBankService._parse_suggestions(raw, 5)
        assert result[0]["difficulty"] == "medium"
