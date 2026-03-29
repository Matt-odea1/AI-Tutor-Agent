"""
Integration tests for InstructorAssessmentService using moto-mocked DynamoDB.

Covers:
- create_assessment
- list_assessments
- get_assessment
- upload_students
- update_brief
- update_schedule
"""
from __future__ import annotations

import boto3
import pytest
from moto import mock_aws

from src.main.service.InstructorAssessmentService import (
    InstructorAssessmentService,
    InstructorAssessmentServiceError,
)

TABLE_NAME = "test_oral_assessments"


@pytest.fixture()
def dynamo_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("DYNAMODB_ASSESSMENT_TABLE", TABLE_NAME)

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "InstructorAssessmentsIndex",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.meta.client.get_waiter("table_exists").wait(TableName=TABLE_NAME)
        yield table


def _create_service(table) -> InstructorAssessmentService:
    svc = InstructorAssessmentService()
    svc.table = table
    svc.catalog.table = table
    svc.enrollment.table = table
    svc.progress_aggregator.table = table
    svc.results_aggregator.table = table
    return svc


# ─────────────────────────────────────────────────────────────
# create_assessment
# ─────────────────────────────────────────────────────────────

class TestCreateAssessment:
    def test_create_returns_assessment_data(self, dynamo_env):
        svc = _create_service(dynamo_env)
        result = svc.create_assessment(
            title="Midterm Oral",
            course="COMP9021",
            description="Test assessment",
            due_date="2026-04-01T23:59:00Z",
            total_questions=5,
            owner_user_id="instructor-1",
        )

        assert result["title"] == "Midterm Oral"
        assert result["course"] == "COMP9021"
        assert result["status"] == "draft"
        assert result["createdBy"] == "instructor-1"
        assert "id" in result

    def test_create_persists_to_dynamodb(self, dynamo_env):
        table = dynamo_env
        svc = _create_service(table)
        result = svc.create_assessment(
            title="Final Oral",
            course="COMP9021",
            description="Final exam",
            due_date="2026-06-01T23:59:00Z",
            total_questions=8,
        )

        item = table.get_item(Key={
            "PK": f"ASSESSMENT#{result['id']}",
            "SK": "METADATA",
        })
        assert item["Item"]["title"] == "Final Oral"

    def test_create_with_optional_fields(self, dynamo_env):
        svc = _create_service(dynamo_env)
        result = svc.create_assessment(
            title="Scheduled Oral",
            course="COMP9021",
            description="Scheduled",
            due_date="2026-04-01T23:59:00Z",
            total_questions=5,
            time_limit=3,
            access_mode="scheduled",
            scheduled_window_start="2026-04-01T09:00:00Z",
            scheduled_window_end="2026-04-01T17:00:00Z",
            auto_evaluate=True,
            rubric="Custom rubric text",
            answer_mode="text",
            preparation_time=30,
        )

        assert result["accessMode"] == "scheduled"
        assert result["autoEvaluate"] is True
        assert result["rubric"] == "Custom rubric text"
        assert result["answerMode"] == "text"


# ─────────────────────────────────────────────────────────────
# list_assessments / get_assessment
# ─────────────────────────────────────────────────────────────

class TestListAndGet:
    def test_list_returns_created_assessments(self, dynamo_env):
        svc = _create_service(dynamo_env)
        svc.create_assessment(title="A1", course="C", description="D", due_date="2026-04-01", total_questions=5, owner_user_id="i-1")
        svc.create_assessment(title="A2", course="C", description="D", due_date="2026-04-01", total_questions=5, owner_user_id="i-1")

        assessments = svc.list_assessments(owner_user_id="i-1")
        assert len(assessments) >= 2

    def test_get_existing_assessment(self, dynamo_env):
        svc = _create_service(dynamo_env)
        created = svc.create_assessment(title="Get Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        fetched = svc.get_assessment(created["id"])
        assert fetched["title"] == "Get Test"

    def test_get_nonexistent_raises(self, dynamo_env):
        svc = _create_service(dynamo_env)
        with pytest.raises(InstructorAssessmentServiceError):
            svc.get_assessment("nonexistent-id")


# ─────────────────────────────────────────────────────────────
# upload_students
# ─────────────────────────────────────────────────────────────

class TestUploadStudents:
    def test_upload_students_enrolls(self, dynamo_env):
        table = dynamo_env
        svc = _create_service(table)
        assessment = svc.create_assessment(title="Upload Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        students = [
            {"name": "Alice", "email": "alice@test.com", "studentId": "s-1", "code": "print('hi')"},
            {"name": "Bob", "email": "bob@test.com", "studentId": "s-2", "code": "x = 1"},
        ]
        result = svc.upload_students(assessment["id"], students)
        assert result["studentsUploaded"] == 2

    def test_upload_to_nonexistent_assessment_raises(self, dynamo_env):
        svc = _create_service(dynamo_env)
        with pytest.raises(InstructorAssessmentServiceError):
            svc.upload_students("fake-id", [{"name": "A", "email": "a@b.com", "studentId": "s-1"}])


# ─────────────────────────────────────────────────────────────
# update_brief
# ─────────────────────────────────────────────────────────────

class TestUpdateBrief:
    def test_update_brief_success(self, dynamo_env):
        svc = _create_service(dynamo_env)
        assessment = svc.create_assessment(title="Brief Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        brief_text = "A" * 60  # meets 50-char minimum
        result = svc.update_brief(assessment["id"], brief_text)
        assert result.get("assignmentBrief") == brief_text

    def test_update_brief_too_short_raises(self, dynamo_env):
        svc = _create_service(dynamo_env)
        assessment = svc.create_assessment(title="Brief Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        with pytest.raises(InstructorAssessmentServiceError, match="50 characters"):
            svc.update_brief(assessment["id"], "too short")


# ─────────────────────────────────────────────────────────────
# update_schedule
# ─────────────────────────────────────────────────────────────

class TestUpdateSchedule:
    def test_update_to_scheduled(self, dynamo_env):
        svc = _create_service(dynamo_env)
        assessment = svc.create_assessment(title="Schedule Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        result = svc.update_schedule(
            assessment["id"],
            access_mode="scheduled",
            scheduled_window_start="2026-04-01T09:00:00Z",
            scheduled_window_end="2026-04-01T17:00:00Z",
        )
        assert result["accessMode"] == "scheduled"

    def test_scheduled_without_window_raises(self, dynamo_env):
        svc = _create_service(dynamo_env)
        assessment = svc.create_assessment(title="Schedule Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        with pytest.raises(InstructorAssessmentServiceError, match="required"):
            svc.update_schedule(assessment["id"], access_mode="scheduled")

    def test_invalid_access_mode_raises(self, dynamo_env):
        svc = _create_service(dynamo_env)
        assessment = svc.create_assessment(title="Schedule Test", course="C", description="D", due_date="2026-04-01", total_questions=5)

        with pytest.raises(InstructorAssessmentServiceError, match="must be"):
            svc.update_schedule(assessment["id"], access_mode="invalid")
