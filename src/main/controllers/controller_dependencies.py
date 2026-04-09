from __future__ import annotations

import logging
from functools import lru_cache

from src.main.agentcore_setup.dynamodb_history import DynamoDBHistoryStore
from src.main.agentcore_setup.dynamodb_memory import DynamoDBConversationMemory
from src.main.agentcore_setup.history import HistoryStore
from src.main.agentcore_setup.memory import ConversationMemory
from src.main.config import get_settings
from src.main.llm.AgentCoreProvider import AgentCoreProvider
from src.main.service.ChatService import ChatService
from src.main.service.ContextVectorService import ContextVectorService
from src.main.service.AnalyticsService import AnalyticsService
from src.main.service.InstructorAssessmentService import InstructorAssessmentService
from src.main.service.InstructorQuestionBankService import InstructorQuestionBankService
from src.main.service.InstructorSubmissionService import InstructorSubmissionService
from src.main.service.OralAssessmentService import OralAssessmentService
from src.main.service.SQSJobDispatcher import SQSJobDispatcher, resolve_queue_url
from src.main.service.QuestionGenerationService import QuestionGenerationService
from src.main.service.ResponseEvaluationService import ResponseEvaluationService
from src.main.service.S3UploadService import S3UploadService
from src.main.service.TranscriptionService import TranscriptionService


logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _service_singleton() -> ContextVectorService:
    return ContextVectorService()


def get_context_service() -> ContextVectorService:
    return _service_singleton()


@lru_cache(maxsize=1)
def _memory_singleton():
    settings = get_settings()
    use_dynamodb = settings.use_dynamodb

    if use_dynamodb:
        logger.info("Using DynamoDB for conversation persistence")
        return DynamoDBConversationMemory(
            table_name=settings.dynamodb_table_name,
            region=settings.dynamodb_region,
            ttl_days=30,
        )

    logger.info("Using in-memory conversation storage")
    return ConversationMemory(max_sessions=1000)


def get_memory_service():
    return _memory_singleton()


@lru_cache(maxsize=1)
def _history_singleton():
    settings = get_settings()
    use_dynamodb = settings.use_dynamodb
    if use_dynamodb:
        logger.info("Using DynamoDB for history persistence")
        return DynamoDBHistoryStore(
            table_name=settings.dynamodb_table_name,
            region=settings.dynamodb_region,
        )
    logger.info("Using in-memory history storage")
    return HistoryStore()


def get_history_store():
    return _history_singleton()


@lru_cache(maxsize=1)
def _analytics_service_singleton() -> AnalyticsService:
    settings = get_settings()
    return AnalyticsService(
        use_dynamodb=settings.use_dynamodb,
        table_name=settings.dynamodb_table_name,
        region=settings.dynamodb_region,
    )


def get_analytics_service() -> AnalyticsService:
    return _analytics_service_singleton()


@lru_cache(maxsize=1)
def _chat_service_singleton() -> ChatService:
    vector_service = _service_singleton()
    agent_client = AgentCoreProvider()
    memory = _memory_singleton()
    return ChatService(vector_service, agent_client, memory)


def get_chat_service() -> ChatService:
    return _chat_service_singleton()


@lru_cache(maxsize=1)
def _question_service_singleton() -> QuestionGenerationService:
    return QuestionGenerationService()


def get_question_service() -> QuestionGenerationService:
    return _question_service_singleton()


@lru_cache(maxsize=1)
def _transcription_service_singleton() -> TranscriptionService:
    settings = get_settings()
    oral_svc = _oral_assessment_service_singleton()
    return TranscriptionService(
        table=oral_svc.table,
        region=settings.aws_default_region,
    )


def get_transcription_service() -> TranscriptionService:
    return _transcription_service_singleton()


@lru_cache(maxsize=1)
def _evaluation_service_singleton() -> ResponseEvaluationService:
    return ResponseEvaluationService(
        transcription_service=_transcription_service_singleton(),
    )


def get_evaluation_service() -> ResponseEvaluationService:
    return _evaluation_service_singleton()


@lru_cache(maxsize=1)
def _oral_assessment_service_singleton() -> OralAssessmentService:
    return OralAssessmentService()


def get_oral_assessment_service() -> OralAssessmentService:
    return _oral_assessment_service_singleton()


@lru_cache(maxsize=1)
def _instructor_assessment_service_singleton() -> InstructorAssessmentService:
    return InstructorAssessmentService()


def get_instructor_assessment_service() -> InstructorAssessmentService:
    return _instructor_assessment_service_singleton()


@lru_cache(maxsize=1)
def _instructor_question_bank_service_singleton() -> InstructorQuestionBankService:
    instructor_svc = _instructor_assessment_service_singleton()
    agent_client = AgentCoreProvider()
    return InstructorQuestionBankService(
        table=instructor_svc.table,
        llm_client=agent_client,
    )


def get_instructor_question_bank_service() -> InstructorQuestionBankService:
    return _instructor_question_bank_service_singleton()


def _extract_sqs_region(queue_url: str, fallback: str) -> str:
    """Extract the AWS region from an SQS queue URL (sqs.<region>.amazonaws.com)."""
    import re
    match = re.search(r"sqs\.([a-z0-9-]+)\.amazonaws\.com", queue_url)
    return match.group(1) if match else fallback


@lru_cache(maxsize=1)
def _sqs_job_dispatcher_singleton() -> SQSJobDispatcher:
    settings = get_settings()
    instructor_svc = _instructor_assessment_service_singleton()
    queue_url = resolve_queue_url(region=settings.aws_default_region)
    sqs_region = _extract_sqs_region(queue_url, settings.aws_default_region)
    return SQSJobDispatcher(
        queue_url=queue_url,
        region=sqs_region,
        table=instructor_svc.table,
    )


def get_sqs_job_dispatcher() -> SQSJobDispatcher:
    return _sqs_job_dispatcher_singleton()


@lru_cache(maxsize=1)
def _instructor_submission_service_singleton() -> InstructorSubmissionService:
    settings = get_settings()
    instructor_svc = _instructor_assessment_service_singleton()
    return InstructorSubmissionService(
        table=instructor_svc.table,
        s3_bucket=settings.s3_assessment_bucket,
        region=settings.aws_default_region,
    )


def get_instructor_submission_service() -> InstructorSubmissionService:
    return _instructor_submission_service_singleton()


@lru_cache(maxsize=1)
def _s3_upload_service_singleton() -> S3UploadService:
    settings = get_settings()
    return S3UploadService(
        bucket_name=settings.s3_assessment_bucket,
        region=settings.aws_default_region,
    )


def get_s3_upload_service() -> S3UploadService:
    return _s3_upload_service_singleton()
