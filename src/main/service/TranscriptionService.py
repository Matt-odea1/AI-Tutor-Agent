"""
TranscriptionService — downloads audio/video from S3, transcribes via Deepgram,
and writes the transcript back to the DynamoDB answer item.

Called as a pre-pass inside EvaluationWorkflowRunner.evaluate_from_dynamodb
before the evaluation engine runs, so that audio/video answers have a
populated 'transcript' field when the LLM evaluator reads them.

Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s) for transient
Deepgram/network failures. Permanent failures (bad file, missing key) are not
retried.
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

from src.main.service.SpeechToTextService import DeepgramTranscribeService

logger = logging.getLogger(__name__)

_RETRYABLE_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1  # seconds


class TranscriptionService:
    def __init__(
        self,
        *,
        table,
        s3_client=None,
        deepgram_service: Optional[DeepgramTranscribeService] = None,
        region: str = "us-east-1",
    ):
        """
        Args:
            table: boto3 DynamoDB Table resource (oral_assessments table)
            s3_client: boto3 S3 client; created from env if not supplied
            deepgram_service: DeepgramTranscribeService; created from env if not supplied
            region: AWS region for S3 client when auto-created
        """
        self.table = table
        self.s3 = s3_client or boto3.client("s3", region_name=region)
        self.deepgram = deepgram_service or DeepgramTranscribeService()

    # ─────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────

    def transcribe_pending_answers(self, student_id: str, assessment_id: str) -> int:
        """
        Transcribe all audio/video answers for a student that lack a transcript.

        Returns the number of answers successfully transcribed.
        """
        pk = f"STUDENT#{student_id}#ASSESSMENT#{assessment_id}"
        from boto3.dynamodb.conditions import Key
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with("ANSWER#")
        )
        answers = response.get("Items", [])

        transcribed = 0
        for answer in answers:
            answer_type = answer.get("answerType", "audio")
            if answer_type not in ("audio", "video"):
                continue
            if answer.get("transcript"):
                # already transcribed — skip
                continue

            question_id = answer.get("questionId", answer.get("SK", "").replace("ANSWER#", ""))
            media_url = answer.get("audioUrl") or answer.get("videoUrl") or ""
            if not media_url:
                logger.warning(
                    "[Transcription] No media URL for student=%s assessment=%s question=%s",
                    student_id, assessment_id, question_id,
                )
                self._write_transcript_status(pk, question_id, "", "missing_url")
                continue

            transcript = self._transcribe_url_with_retry(media_url, student_id, question_id)
            if transcript is not None:
                self._write_transcript_status(pk, question_id, transcript, "completed")
                transcribed += 1
            else:
                self._write_transcript_status(pk, question_id, "", "failed")

        return transcribed

    # ─────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────

    def _transcribe_url_with_retry(
        self, url: str, student_id: str, question_id: str
    ) -> Optional[str]:
        """Download S3 file and call Deepgram with retry. Returns transcript or None."""
        bucket, key = _parse_s3_url(url)
        if not bucket or not key:
            logger.error(
                "[Transcription] Cannot parse S3 URL for student=%s question=%s: %s",
                student_id, question_id, url,
            )
            return None

        ext = os.path.splitext(key)[-1] or ".webm"

        for attempt in range(1, _RETRYABLE_ATTEMPTS + 1):
            try:
                with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                    tmp_path = tmp.name

                try:
                    self.s3.download_file(bucket, key, tmp_path)
                except ClientError as e:
                    code = e.response["Error"]["Code"]
                    if code in ("NoSuchKey", "404"):
                        logger.error(
                            "[Transcription] S3 key not found (student=%s question=%s): %s/%s",
                            student_id, question_id, bucket, key,
                        )
                        return None  # not retryable
                    raise

                transcript = self.deepgram.transcribe(tmp_path)
                logger.info(
                    "[Transcription] Transcribed student=%s question=%s (%d chars)",
                    student_id, question_id, len(transcript),
                )
                return transcript

            except Exception as e:
                if attempt < _RETRYABLE_ATTEMPTS:
                    delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "[Transcription] Attempt %d/%d failed for student=%s question=%s, retrying in %ds: %s",
                        attempt, _RETRYABLE_ATTEMPTS, student_id, question_id, delay, e,
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        "[Transcription] All %d attempts failed for student=%s question=%s: %s",
                        _RETRYABLE_ATTEMPTS, student_id, question_id, e,
                    )
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

        return None

    def _write_transcript_status(
        self,
        pk: str,
        question_id: str,
        transcript: str,
        status: str,
    ) -> None:
        """Write transcript and transcript_status back to the DynamoDB answer item."""
        try:
            self.table.update_item(
                Key={"PK": pk, "SK": f"ANSWER#{question_id}"},
                UpdateExpression="SET transcript = :t, transcript_status = :s",
                ExpressionAttributeValues={":t": transcript, ":s": status},
            )
        except ClientError as e:
            logger.error(
                "[Transcription] Failed to write transcript for pk=%s question=%s: %s",
                pk, question_id, e,
            )


# ─────────────────────────────────────────────────────────────────
# URL parsing
# ─────────────────────────────────────────────────────────────────

def _parse_s3_url(url: str) -> tuple[str, str]:
    """
    Parse bucket and key from an S3 URL.

    Supports:
      - https://<bucket>.s3.<region>.amazonaws.com/<key>
      - https://<bucket>.s3.amazonaws.com/<key>
      - s3://<bucket>/<key>
    Returns ("", "") if parsing fails.
    """
    if not url:
        return "", ""

    try:
        parsed = urlparse(url)

        if parsed.scheme == "s3":
            return parsed.netloc, parsed.path.lstrip("/")

        host = parsed.hostname or ""
        # virtual-hosted style: <bucket>.s3[.<region>].amazonaws.com
        if host.endswith(".amazonaws.com") and ".s3" in host:
            bucket = host.split(".s3")[0]
            key = parsed.path.lstrip("/")
            return bucket, key

        # path-style: s3.amazonaws.com/<bucket>/<key>  (rare, legacy)
        if host in ("s3.amazonaws.com",) or host.startswith("s3.") and host.endswith(".amazonaws.com"):
            parts = parsed.path.lstrip("/").split("/", 1)
            if len(parts) == 2:
                return parts[0], parts[1]

    except Exception:
        pass

    return "", ""
