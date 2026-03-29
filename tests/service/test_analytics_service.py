"""
Tests for AnalyticsService covering in-memory and DynamoDB-backed event ingestion + summarization.
"""
from __future__ import annotations

import boto3
import pytest
from moto import mock_aws

from src.main.service.AnalyticsService import AnalyticsService

TABLE = "test_chat_sessions"


@pytest.fixture()
def inmem_svc():
    return AnalyticsService(use_dynamodb=False)


@pytest.fixture()
def dynamo_svc(monkeypatch):
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
        yield AnalyticsService(use_dynamodb=True, table_name=TABLE, region="us-east-1")


class TestIngestInMemory:
    def test_ingest_valid_events(self, inmem_svc):
        count = inmem_svc.ingest_events("u-1", [
            {"event_name": "page_view", "session_id": "s-1"},
            {"event_name": "message_sent", "session_id": "s-1"},
        ])
        assert count == 2

    def test_ingest_empty_list(self, inmem_svc):
        assert inmem_svc.ingest_events("u-1", []) == 0

    def test_ingest_skips_missing_event_name(self, inmem_svc):
        count = inmem_svc.ingest_events("u-1", [
            {"event_name": "valid"},
            {"event_name": ""},
            {},
        ])
        assert count == 1

    def test_ingest_caps_at_100(self, inmem_svc):
        events = [{"event_name": f"e-{i}"} for i in range(150)]
        count = inmem_svc.ingest_events("u-1", events)
        assert count == 100


class TestSummarizeInMemory:
    def test_summarize_empty(self, inmem_svc):
        summary = inmem_svc.summarize(window_days=7)
        assert summary["total_events"] == 0
        assert summary["active_users"] == 0

    def test_summarize_recent_events(self, inmem_svc):
        inmem_svc.ingest_events("u-1", [
            {"event_name": "page_view"},
            {"event_name": "page_view"},
            {"event_name": "message_sent"},
        ])
        inmem_svc.ingest_events("u-2", [
            {"event_name": "page_view"},
        ])

        summary = inmem_svc.summarize(window_days=1)
        assert summary["total_events"] == 4
        assert summary["active_users"] == 2
        assert summary["event_counts"]["page_view"] == 3
        assert summary["event_counts"]["message_sent"] == 1

    def test_summarize_clamps_window(self, inmem_svc):
        summary = inmem_svc.summarize(window_days=100)
        assert summary["window_days"] == 30

        summary = inmem_svc.summarize(window_days=0)
        assert summary["window_days"] == 1


class TestIngestDynamoDB:
    def test_ingest_and_summarize_with_dynamodb(self, dynamo_svc):
        count = dynamo_svc.ingest_events("u-1", [
            {"event_name": "page_view"},
            {"event_name": "code_executed"},
        ])
        assert count == 2

        summary = dynamo_svc.summarize(window_days=1)
        assert summary["total_events"] == 2
        assert summary["active_users"] == 1
