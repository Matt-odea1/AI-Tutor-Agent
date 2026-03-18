"""
SQSJobDispatcher - SQS-based job dispatch and in-process consumer

Replaces the inline thread dispatch in generate-questions-batch with durable
SQS messages so work survives server restarts. The consumer runs in the same
process as the API (background thread), meeting the platform plan's
"worker runs in-process via thread pool" constraint.

Message lifecycle:
  enqueue → SQS → consumer receives → processes → deletes message

If the server dies mid-message, the SQS visibility timeout (900s) expires
and the message becomes visible again. After 3 receive attempts the message
moves to the DLQ. The DynamoDB job record stays in 'running' state, which
the instructor can see and re-trigger.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_VISIBILITY_TIMEOUT = 900       # 15 min — matches Terraform queue setting
_LONG_POLL_SECONDS = 10         # reduces empty receives
_MAX_MESSAGES_PER_RECEIVE = 5
_CONSUMER_ERROR_BACKOFF = 5     # seconds to sleep after an unexpected consumer loop error


class SQSJobDispatcher:
    def __init__(self, *, queue_url: str, region: str, table):
        """
        Args:
            queue_url: Full SQS queue URL (e.g. https://sqs.us-east-1.amazonaws.com/123/ai-tutor-jobs)
            region: AWS region string
            table: boto3 DynamoDB Table resource (for job progress updates)
        """
        self.queue_url = queue_url
        self.table = table
        self.sqs = boto3.client("sqs", region_name=region)
        self._consumer_thread: Optional[threading.Thread] = None
        self._stopping = threading.Event()

    # ─────────────────────────────────────────────────────────────
    # Producer
    # ─────────────────────────────────────────────────────────────

    def enqueue_evaluation_batch(
        self,
        job_id: str,
        assessment_id: str,
        students: List[Dict[str, Any]],
    ) -> int:
        """
        Send one SQS message per student for evaluation.

        Returns the number of messages successfully enqueued.
        """
        enqueued = 0
        batch: List[Dict[str, Any]] = []

        def _flush(b: List[Dict[str, Any]]) -> int:
            try:
                resp = self.sqs.send_message_batch(
                    QueueUrl=self.queue_url,
                    Entries=b,
                )
                failed = resp.get("Failed", [])
                if failed:
                    logger.error("SQS evaluation batch send failures: %s", failed)
                return len(b) - len(failed)
            except ClientError as e:
                logger.error("SQS evaluation batch send error: %s", e)
                return 0

        for i, student in enumerate(students):
            batch.append({
                "Id": str(i),
                "MessageBody": json.dumps({
                    "job_type": "evaluation",
                    "job_id": job_id,
                    "assessment_id": assessment_id,
                    "student_id": student["studentId"],
                }),
            })
            if len(batch) == 10:
                enqueued += _flush(batch)
                batch = []

        if batch:
            enqueued += _flush(batch)

        logger.info(
            "Enqueued %d/%d evaluation messages for job %s",
            enqueued, len(students), job_id,
        )
        return enqueued

    def enqueue_question_generation(
        self,
        job_id: str,
        assessment_id: str,
        students: List[Dict[str, Any]],
        assignment_brief: str,
    ) -> int:
        """
        Send one SQS message per student for question generation.

        Returns the number of messages successfully enqueued.
        Uses batch send (10 per call) for efficiency.
        """
        enqueued = 0
        batch: List[Dict[str, Any]] = []

        def _flush(b: List[Dict[str, Any]]) -> int:
            try:
                resp = self.sqs.send_message_batch(
                    QueueUrl=self.queue_url,
                    Entries=b,
                )
                failed = resp.get("Failed", [])
                if failed:
                    logger.error("SQS batch send failures: %s", failed)
                return len(b) - len(failed)
            except ClientError as e:
                logger.error("SQS batch send error: %s", e)
                return 0

        for i, student in enumerate(students):
            batch.append(
                {
                    "Id": str(i),
                    "MessageBody": json.dumps(
                        {
                            "job_type": "question_generation",
                            "job_id": job_id,
                            "assessment_id": assessment_id,
                            "student_id": student["studentId"],
                            "student_name": student["name"],
                            "student_code": student.get("code", ""),
                            "assignment_brief": assignment_brief,
                        }
                    ),
                }
            )
            if len(batch) == 10:
                enqueued += _flush(batch)
                batch = []

        if batch:
            enqueued += _flush(batch)

        logger.info(
            "Enqueued %d/%d question-generation messages for job %s",
            enqueued,
            len(students),
            job_id,
        )
        return enqueued

    # ─────────────────────────────────────────────────────────────
    # Consumer
    # ─────────────────────────────────────────────────────────────

    def start_consumer(
        self,
        question_generation_service: Any,
        evaluation_workflow_runner: Optional[Any] = None,
    ) -> None:
        """
        Start the background SQS consumer thread.
        Idempotent — calling multiple times has no effect if already running.

        Args:
            question_generation_service: Handles 'question_generation' job type.
            evaluation_workflow_runner: Handles 'evaluation' job type. If None,
                evaluation messages are logged as warnings and deleted.
        """
        if self._consumer_thread and self._consumer_thread.is_alive():
            logger.debug("SQS consumer already running")
            return

        self._stopping.clear()

        def _supervised() -> None:
            logger.info("SQS consumer supervisor started")
            while not self._stopping.is_set():
                try:
                    self._consume_loop(question_generation_service, evaluation_workflow_runner)
                except Exception as e:
                    logger.error(
                        "SQS consumer exited unexpectedly, restarting in %ds: %s",
                        _CONSUMER_ERROR_BACKOFF, e,
                    )
                    time.sleep(_CONSUMER_ERROR_BACKOFF)
            logger.info("SQS consumer supervisor stopped")

        self._consumer_thread = threading.Thread(
            target=_supervised,
            daemon=True,
            name="sqs-consumer-supervisor",
        )
        self._consumer_thread.start()
        logger.info("SQS job consumer started (queue: %s)", self.queue_url)

    def is_running(self) -> bool:
        """Return True if the consumer supervisor thread is alive."""
        return bool(self._consumer_thread and self._consumer_thread.is_alive())

    def stop_consumer(self) -> None:
        """Signal the consumer to stop after its current receive cycle."""
        self._stopping.set()

    def _consume_loop(
        self,
        question_generation_service: Any,
        evaluation_workflow_runner: Optional[Any] = None,
    ) -> None:
        """Main consumer loop — runs until process exits or stop_consumer() called."""
        logger.info("SQS consumer loop running")
        while not self._stopping.is_set():
            try:
                response = self.sqs.receive_message(
                    QueueUrl=self.queue_url,
                    MaxNumberOfMessages=_MAX_MESSAGES_PER_RECEIVE,
                    WaitTimeSeconds=_LONG_POLL_SECONDS,
                    VisibilityTimeout=_VISIBILITY_TIMEOUT,
                    AttributeNames=["ApproximateReceiveCount"],
                )
                messages = response.get("Messages", [])
                for msg in messages:
                    self._process_message(msg, question_generation_service, evaluation_workflow_runner)

            except ClientError as e:
                if e.response["Error"]["Code"] == "AWS.SimpleQueueService.NonExistentQueue":
                    logger.warning("SQS queue not found — consumer pausing 30s: %s", self.queue_url)
                    time.sleep(30)
                else:
                    logger.error("SQS receive error: %s", e)
                    time.sleep(_CONSUMER_ERROR_BACKOFF)
            except Exception as e:
                logger.error("SQS consumer loop unexpected error: %s", e)
                time.sleep(_CONSUMER_ERROR_BACKOFF)

        logger.info("SQS consumer loop stopped")

    def _process_message(
        self,
        msg: Dict[str, Any],
        question_generation_service: Any,
        evaluation_workflow_runner: Optional[Any] = None,
    ) -> None:
        """Process one SQS message. Deletes it on both success and non-retriable failure."""
        receipt = msg["ReceiptHandle"]
        try:
            body = json.loads(msg["Body"])
        except json.JSONDecodeError as e:
            logger.error("Malformed SQS message body (deleting): %s", e)
            self._delete_message(receipt)
            return

        job_type = body.get("job_type", "question_generation")
        job_id = body.get("job_id", "unknown")
        student_id = body.get("student_id", "unknown")
        assessment_id = body.get("assessment_id", "")

        logger.info("[Job %s] Processing %s for student %s", job_id, job_type, student_id)

        try:
            if job_type == "question_generation":
                question_generation_service.generate_questions(
                    assignment_brief=body.get("assignment_brief", ""),
                    student_code=body.get("student_code", ""),
                    student_name=body.get("student_name", student_id),
                    student_id=student_id,
                    assessment_id=assessment_id,
                )
                self._increment_job_progress(job_id, success=True)
                logger.info("[Job %s] Question generation succeeded for student %s", job_id, student_id)

            elif job_type == "evaluation":
                if evaluation_workflow_runner is None:
                    logger.warning("[Job %s] Evaluation runner not configured — skipping", job_id)
                    self._increment_job_progress(job_id, success=False)
                else:
                    # Runs synchronously in consumer thread — each student evaluated fully before
                    # the next message is picked up. This keeps DynamoDB progress accurate.
                    evaluation_workflow_runner.evaluate_from_dynamodb(job_id, student_id, assessment_id)
                    self._increment_job_progress(job_id, success=True)
                    logger.info("[Job %s] Evaluation succeeded for student %s", job_id, student_id)

            else:
                logger.warning("Unknown job_type '%s' — discarding message", job_type)

        except Exception as e:
            logger.error("[Job %s] Processing failed for student %s: %s", job_id, student_id, e)
            self._increment_job_progress(job_id, success=False)

        # Always delete — retries are handled at the job level, not SQS level
        # (DLQ handles poison pills after 3 total receives per Terraform config)
        self._delete_message(receipt)

    def _delete_message(self, receipt_handle: str) -> None:
        try:
            self.sqs.delete_message(
                QueueUrl=self.queue_url,
                ReceiptHandle=receipt_handle,
            )
        except ClientError as e:
            logger.warning("Failed to delete SQS message: %s", e)

    def _increment_job_progress(self, job_id: str, success: bool) -> None:
        """Atomic progress counter update in DynamoDB — same as DynamoDBJobStore."""
        try:
            self.table.update_item(
                Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
                UpdateExpression=(
                    "ADD processed_count :one, successful_count :s, failed_count :f"
                ),
                ExpressionAttributeValues={
                    ":one": 1,
                    ":s": 1 if success else 0,
                    ":f": 0 if success else 1,
                },
            )
            # Check if all items processed → mark job complete
            self._maybe_complete_job(job_id)
        except ClientError as e:
            logger.error("Failed to update job progress for %s: %s", job_id, e)

    def _maybe_complete_job(self, job_id: str) -> None:
        """Mark job 'completed' if processed_count has reached total_items."""
        try:
            resp = self.table.get_item(Key={"PK": f"JOB#{job_id}", "SK": "METADATA"})
            item = resp.get("Item")
            if not item:
                return
            total = int(item.get("total_items", 0))
            processed = int(item.get("processed_count", 0))
            if total > 0 and processed >= total:
                self.table.update_item(
                    Key={"PK": f"JOB#{job_id}", "SK": "METADATA"},
                    UpdateExpression="SET #s = :done, completed_at = :ca",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={
                        ":done": "completed",
                        ":ca": _utc_now(),
                    },
                    ConditionExpression="attribute_exists(PK)",
                )
                logger.info("[Job %s] All %d items processed — marked completed", job_id, total)
        except ClientError as e:
            if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
                logger.error("Failed to complete job %s: %s", job_id, e)
        except Exception as e:
            logger.error("Unexpected error completing job %s: %s", job_id, e)


def _utc_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────
# Queue URL resolution
# ─────────────────────────────────────────────────────────────────

def resolve_queue_url(queue_name: str = "ai-tutor-jobs", region: str = "us-east-1") -> str:
    """
    Resolve the SQS queue URL.
    Prefers SQS_JOBS_QUEUE_URL env var; falls back to dynamic lookup.
    Returns empty string if the queue cannot be found (consumer will pause and retry).
    """
    explicit = os.getenv("SQS_JOBS_QUEUE_URL", "")
    if explicit:
        return explicit

    try:
        sqs = boto3.client("sqs", region_name=region)
        resp = sqs.get_queue_url(QueueName=queue_name)
        url = resp["QueueUrl"]
        logger.info("Resolved SQS queue URL: %s", url)
        return url
    except ClientError as e:
        logger.warning("Could not resolve SQS queue URL for '%s': %s", queue_name, e)
        return ""
