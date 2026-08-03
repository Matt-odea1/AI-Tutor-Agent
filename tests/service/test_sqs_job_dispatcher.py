"""
Integration tests for SQSJobDispatcher using moto-mocked SQS.

Covers:
- enqueue_question_generation
- enqueue_evaluation_batch
- _process_message routing
- Malformed message handling
- start_consumer / stop_consumer lifecycle
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import boto3
import pytest
from moto import mock_aws

from src.main.service.SQSJobDispatcher import SQSJobDispatcher

TABLE_NAME = "test_oral_assessments"
QUEUE_NAME = "test-jobs-queue"


@pytest.fixture()
def sqs_env(monkeypatch):
    """Set up moto-backed SQS queue and DynamoDB table."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")

    with mock_aws():
        # SQS
        sqs_client = boto3.client("sqs", region_name="us-east-1")
        resp = sqs_client.create_queue(QueueName=QUEUE_NAME)
        queue_url = resp["QueueUrl"]

        # DynamoDB
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
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.meta.client.get_waiter("table_exists").wait(TableName=TABLE_NAME)

        yield queue_url, table, sqs_client


def _make_dispatcher(queue_url, table) -> SQSJobDispatcher:
    return SQSJobDispatcher(queue_url=queue_url, region="us-east-1", table=table)


# ─────────────────────────────────────────────────────────────
# Enqueue question generation
# ─────────────────────────────────────────────────────────────

class TestEnqueueQuestionGeneration:
    def test_enqueue_sends_messages(self, sqs_env):
        queue_url, table, sqs_client = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        students = [
            {"studentId": "s-1", "name": "Alice", "code": "print('hi')"},
            {"studentId": "s-2", "name": "Bob", "code": "x = 1"},
        ]
        count = dispatcher.enqueue_question_generation(
            job_id="job-1",
            assessment_id="a-1",
            students=students,
            assignment_brief="Build a BST",
        )

        assert count == 2

        # Verify messages are in the queue
        resp = sqs_client.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)
        messages = resp.get("Messages", [])
        assert len(messages) == 2

        body = json.loads(messages[0]["Body"])
        assert body["job_type"] == "question_generation"
        assert body["assignment_brief"] == "Build a BST"

    def test_enqueue_batches_over_ten_students(self, sqs_env):
        queue_url, table, sqs_client = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        students = [{"studentId": f"s-{i}", "name": f"Student {i}", "code": ""} for i in range(15)]
        count = dispatcher.enqueue_question_generation(
            job_id="job-2",
            assessment_id="a-1",
            students=students,
            assignment_brief="Brief",
        )

        assert count == 15


# ─────────────────────────────────────────────────────────────
# Enqueue evaluation batch
# ─────────────────────────────────────────────────────────────

class TestEnqueueEvaluationBatch:
    def test_enqueue_evaluation_messages(self, sqs_env):
        queue_url, table, sqs_client = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        students = [
            {"studentId": "s-1"},
            {"studentId": "s-2"},
            {"studentId": "s-3"},
        ]
        count = dispatcher.enqueue_evaluation_batch(
            job_id="eval-1",
            assessment_id="a-1",
            students=students,
        )

        assert count == 3

        resp = sqs_client.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)
        body = json.loads(resp["Messages"][0]["Body"])
        assert body["job_type"] == "evaluation"


class TestEnqueueReportGeneration:
    def test_enqueue_sends_one_message_for_the_whole_cohort(self, sqs_env):
        """Reports are per-assessment, not per-student — exactly one message."""
        queue_url, table, sqs_client = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        count = dispatcher.enqueue_report_generation(
            job_id="rep-1", assessment_id="a-1", milestone=2,
        )

        assert count == 1
        resp = sqs_client.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)
        assert len(resp["Messages"]) == 1
        body = json.loads(resp["Messages"][0]["Body"])
        assert body["job_type"] == "report_generation"
        assert body["assessment_id"] == "a-1"
        assert body["milestone"] == 2
        assert body["triggered_by"] == "auto_threshold"


# ─────────────────────────────────────────────────────────────
# Message processing
# ─────────────────────────────────────────────────────────────

class TestProcessMessage:
    def test_routes_question_generation_message(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        question_svc = MagicMock()
        msg = {
            "Body": json.dumps({
                "job_type": "question_generation",
                "job_id": "j-1",
                "assessment_id": "a-1",
                "student_id": "s-1",
                "student_name": "Alice",
                "student_code": "x = 1",
                "assignment_brief": "Brief",
            }),
            "ReceiptHandle": "fake-receipt",
        }

        dispatcher._process_message(msg, question_svc, None)
        question_svc.generate_questions.assert_called_once()
        call_kwargs = question_svc.generate_questions.call_args
        assert call_kwargs[1]["student_id"] == "s-1" or call_kwargs.kwargs.get("student_id") == "s-1"

    def test_routes_evaluation_message(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        eval_runner = MagicMock()
        msg = {
            "Body": json.dumps({
                "job_type": "evaluation",
                "job_id": "j-1",
                "assessment_id": "a-1",
                "student_id": "s-1",
            }),
            "ReceiptHandle": "fake-receipt",
        }

        dispatcher._process_message(msg, MagicMock(), eval_runner)
        eval_runner.evaluate_from_dynamodb.assert_called_once()

    def test_routes_report_generation_message(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        report_svc = MagicMock()
        msg = {
            "Body": json.dumps({
                "job_type": "report_generation",
                "job_id": "j-1",
                "assessment_id": "a-1",
                "triggered_by": "auto_threshold",
                "milestone": 1,
            }),
            "ReceiptHandle": "fake-receipt",
        }

        dispatcher._process_message(msg, MagicMock(), None, report_svc)

        report_svc.generate_report.assert_called_once_with(
            "a-1", triggered_by="auto_threshold", milestone=1,
        )

    def test_report_message_without_service_is_discarded(self, sqs_env):
        """No report service configured must not wedge the consumer."""
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        msg = {
            "Body": json.dumps({
                "job_type": "report_generation", "job_id": "j-1", "assessment_id": "a-1",
            }),
            "ReceiptHandle": "fake-receipt",
        }

        dispatcher._process_message(msg, MagicMock(), None, None)  # should not raise

    def test_report_generation_failure_is_swallowed(self, sqs_env):
        """A failed report must not poison the queue for evaluation work."""
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        report_svc = MagicMock()
        report_svc.generate_report.side_effect = RuntimeError("aggregation blew up")
        msg = {
            "Body": json.dumps({
                "job_type": "report_generation", "job_id": "j-1", "assessment_id": "a-1",
            }),
            "ReceiptHandle": "fake-receipt",
        }

        dispatcher._process_message(msg, MagicMock(), None, report_svc)  # should not raise

    def test_malformed_json_deletes_message(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        msg = {
            "Body": "not json {{{",
            "ReceiptHandle": "fake-receipt",
        }

        # Should not raise
        dispatcher._process_message(msg, MagicMock(), None)


# ─────────────────────────────────────────────────────────────
# Consumer lifecycle
# ─────────────────────────────────────────────────────────────

class TestConsumerLifecycle:
    def test_start_and_stop(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        dispatcher.start_consumer(MagicMock())
        assert dispatcher.is_running() is True

        dispatcher.stop_consumer()
        # Give thread a moment to stop
        import time
        time.sleep(0.5)
        # _stopping is set
        assert dispatcher._stopping.is_set()

    def test_start_is_idempotent(self, sqs_env):
        queue_url, table, _ = sqs_env
        dispatcher = _make_dispatcher(queue_url, table)

        dispatcher.start_consumer(MagicMock())
        thread1 = dispatcher._consumer_thread
        dispatcher.start_consumer(MagicMock())
        thread2 = dispatcher._consumer_thread

        assert thread1 is thread2
        dispatcher.stop_consumer()
