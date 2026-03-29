"""
Integration tests for ResponseEvaluationRepository using moto.
"""
from __future__ import annotations

import boto3
import pytest
from moto import mock_aws

from src.main.service.ResponseEvaluationRepository import ResponseEvaluationRepository

TABLE = "test_oral_assessments"


@pytest.fixture()
def repo(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("DYNAMODB_ASSESSMENT_TABLE", TABLE)

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
        yield ResponseEvaluationRepository(table_name=TABLE, region="us-east-1")


def _seed_qa(repo, student_id="s-1", assessment_id="a-1"):
    pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
    repo.table.put_item(Item={"PK": pk, "SK": "QUESTION#q-1", "text": "Q1"})
    repo.table.put_item(Item={"PK": pk, "SK": "QUESTION#q-2", "text": "Q2"})
    repo.table.put_item(Item={"PK": pk, "SK": "ANSWER#q-1", "audioUrl": "s3://a.webm"})
    repo.table.put_item(Item={"PK": pk, "SK": "ANSWER#q-2", "audioUrl": "s3://b.webm"})


class TestCountAnswers:
    def test_count_with_answers(self, repo):
        _seed_qa(repo)
        assert repo.count_answers("s-1", "a-1") == 2

    def test_count_empty(self, repo):
        assert repo.count_answers("nobody", "a-1") == 0


class TestReadQuestions:
    def test_read_questions(self, repo):
        _seed_qa(repo)
        questions = repo.read_questions("s-1", "a-1")
        assert len(questions) == 2


class TestReadAnswers:
    def test_read_answers(self, repo):
        _seed_qa(repo)
        answers = repo.read_answers("s-1", "a-1")
        assert len(answers) == 2


class TestStoreEvaluation:
    def test_store_and_read_back(self, repo):
        evaluation = {
            "correctness_score": 4,
            "understanding_score": 3,
            "total_score": 7,
            "max_score": 10,
            "feedback": "Good work",
            "strengths": ["Clear"],
            "weaknesses": ["Missing edge cases"],
            "suggested_improvements": ["Add tests"],
        }
        repo.store_evaluation("s-1", "a-1", "q-1", evaluation)

        item = repo.table.get_item(Key={
            "PK": "STUDENT#s-1#ASSESSMENT#a-1",
            "SK": "EVALUATION#q-1",
        })["Item"]

        assert int(item["correctnessScore"]) == 4
        assert int(item["totalScore"]) == 7
        assert item["feedback"] == "Good work"


class TestEvaluationProgress:
    def test_set_and_get_progress(self, repo):
        repo.set_evaluation_progress("s-1", "a-1", questions_evaluated=3, total_questions=5)

        progress = repo.get_evaluation_progress("s-1", "a-1")
        assert progress is not None
        assert int(progress["questionsEvaluated"]) == 3
        assert progress["status"] == "evaluating"

    def test_get_progress_nonexistent(self, repo):
        assert repo.get_evaluation_progress("nobody", "a-1") is None

    def test_set_progress_completed(self, repo):
        repo.set_evaluation_progress("s-1", "a-1", 5, 5, status="completed")
        progress = repo.get_evaluation_progress("s-1", "a-1")
        assert progress["status"] == "completed"
        assert progress["percentage"] == "100.0"
