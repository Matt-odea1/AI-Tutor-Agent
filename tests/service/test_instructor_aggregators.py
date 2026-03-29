"""
Tests for InstructorAssessmentProgressAggregator and InstructorAssessmentResultsAggregator.
"""
from __future__ import annotations

from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

from src.main.service.InstructorAssessmentProgressAggregator import InstructorAssessmentProgressAggregator
from src.main.service.InstructorAssessmentResultsAggregator import (
    InstructorAssessmentResultsAggregator,
    _effective_score,
)

TABLE = "test_oral_assessments"
ASSESSMENT_ID = "a-1"

STUDENTS = [
    {"studentId": "s-1", "name": "Alice", "email": "alice@test.com"},
    {"studentId": "s-2", "name": "Bob", "email": "bob@test.com"},
]


@pytest.fixture()
def table(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        t = dynamodb.create_table(
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
        t.meta.client.get_waiter("table_exists").wait(TableName=TABLE)
        yield t


def _seed_enrollments(table):
    for s in STUDENTS:
        table.put_item(Item={
            "PK": f"ASSESSMENT#{ASSESSMENT_ID}",
            "SK": f"STUDENT#{s['studentId']}",
            "name": s["name"], "email": s["email"],
        })


# ── ProgressAggregator ─────────────────────────────────

class TestProgressAggregator:
    def test_no_progress_returns_not_started(self, table):
        agg = InstructorAssessmentProgressAggregator(table=table, get_students=lambda _: STUDENTS)
        progress = agg.get_assessment_progress(ASSESSMENT_ID)

        assert len(progress) == 2
        assert progress[0]["status"] == "not-started"
        assert progress[0]["answeredQuestions"] == 0

    def test_with_progress_records(self, table):
        # Seed progress for Alice
        table.put_item(Item={
            "PK": f"STUDENT#s-1#ASSESSMENT#{ASSESSMENT_ID}",
            "SK": "PROGRESS",
            "status": "in-progress",
            "totalQuestions": 5,
            "answeredQuestions": 3,
            "percentage": Decimal("60.0"),
        })

        agg = InstructorAssessmentProgressAggregator(table=table, get_students=lambda _: STUDENTS)
        progress = agg.get_assessment_progress(ASSESSMENT_ID)

        alice = next(p for p in progress if p["studentId"] == "s-1")
        bob = next(p for p in progress if p["studentId"] == "s-2")

        assert alice["status"] == "in-progress"
        assert alice["answeredQuestions"] == 3
        assert alice["percentage"] == 60.0
        assert bob["status"] == "not-started"


# ── ResultsAggregator ──────────────────────────────────

class TestResultsAggregator:
    def _seed_evaluations(self, table, student_id="s-1"):
        pk = f"STUDENT#{student_id}#ASSESSMENT#{ASSESSMENT_ID}"
        table.put_item(Item={
            "PK": pk, "SK": "EVALUATION#q-1",
            "totalScore": 8, "maxScore": 10,
        })
        table.put_item(Item={
            "PK": pk, "SK": "EVALUATION#q-2",
            "totalScore": 6, "maxScore": 10,
        })

    def test_get_assessment_results(self, table):
        _seed_enrollments(table)
        self._seed_evaluations(table, "s-1")

        agg = InstructorAssessmentResultsAggregator(table=table, get_students=lambda _: STUDENTS)
        results = agg.get_assessment_results(ASSESSMENT_ID)

        # Both students returned; s-1 has evaluations, s-2 is "Not Evaluated"
        assert len(results) == 2
        evaluated = [r for r in results if r["grade"] != "Not Evaluated"]
        assert len(evaluated) == 1
        assert evaluated[0]["studentId"] == "s-1"
        assert evaluated[0]["totalScore"] == 14
        assert evaluated[0]["percentage"] == 70.0
        assert evaluated[0]["grade"] == "Developing"

        not_evaluated = [r for r in results if r["grade"] == "Not Evaluated"]
        assert len(not_evaluated) == 1
        assert not_evaluated[0]["studentId"] == "s-2"

    def test_get_assessment_results_empty(self, table):
        agg = InstructorAssessmentResultsAggregator(table=table, get_students=lambda _: STUDENTS)
        results = agg.get_assessment_results(ASSESSMENT_ID)
        # All students returned as "Not Evaluated" when no evaluations exist
        assert len(results) == 2
        assert all(r["grade"] == "Not Evaluated" for r in results)

    def test_get_student_detail(self, table):
        _seed_enrollments(table)
        pk = f"STUDENT#s-1#ASSESSMENT#{ASSESSMENT_ID}"

        # Questions
        table.put_item(Item={"PK": pk, "SK": "QUESTION#q-1", "text": "Q1"})
        # Answers
        table.put_item(Item={"PK": pk, "SK": "ANSWER#q-1", "audioUrl": "s3://a.webm", "duration": 30, "answerType": "audio"})
        # Evaluations
        table.put_item(Item={
            "PK": pk, "SK": "EVALUATION#q-1",
            "totalScore": 8, "maxScore": 10,
            "correctnessScore": 4, "understandingScore": 4,
            "feedback": "Good", "strengths": ["Clear"], "weaknesses": [], "suggestedImprovements": [],
        })

        agg = InstructorAssessmentResultsAggregator(table=table, get_students=lambda _: STUDENTS)
        detail = agg.get_student_detail(ASSESSMENT_ID, "s-1")

        assert detail["totalScore"] == 8
        assert detail["percentage"] == 80.0
        assert detail["grade"] == "Competent"
        assert len(detail["questions"]) == 1
        assert detail["questions"][0]["audioUrl"] == "s3://a.webm"
        assert detail["proctoring"]["totalChunks"] == 0

    def test_get_student_detail_with_instructor_override(self, table):
        _seed_enrollments(table)
        pk = f"STUDENT#s-1#ASSESSMENT#{ASSESSMENT_ID}"
        table.put_item(Item={"PK": pk, "SK": "QUESTION#q-1", "text": "Q1"})
        table.put_item(Item={"PK": pk, "SK": "ANSWER#q-1", "answerType": "text", "textContent": "answer"})
        table.put_item(Item={
            "PK": pk, "SK": "EVALUATION#q-1",
            "totalScore": 5, "maxScore": 10, "instructorScore": 9,
            "correctnessScore": 3, "understandingScore": 2,
            "feedback": "Overridden", "strengths": [], "weaknesses": [], "suggestedImprovements": [],
        })

        agg = InstructorAssessmentResultsAggregator(table=table, get_students=lambda _: STUDENTS)
        detail = agg.get_student_detail(ASSESSMENT_ID, "s-1")

        assert detail["totalScore"] == 9  # uses instructor override
        assert detail["questions"][0]["instructorScore"] == 9
        assert detail["questions"][0]["aiScore"] == 5
        assert detail["questions"][0]["effectiveScore"] == 9


class TestEffectiveScore:
    def test_instructor_score_preferred(self):
        assert _effective_score({"instructorScore": 9, "totalScore": 5}) == 9

    def test_ai_score_fallback(self):
        assert _effective_score({"totalScore": 7}) == 7

    def test_zero_fallback(self):
        assert _effective_score({}) == 0
