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
from src.main.service.InstructorAssessmentService import InstructorAssessmentService
from src.main.service.OralAssessmentService import OralAssessmentService
from src.main.service.QuestionGenerationService import QuestionGenerationService
from src.main.service.ResponseEvaluationService import ResponseEvaluationService
from src.main.service.S3UploadService import S3UploadService


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
def _evaluation_service_singleton() -> ResponseEvaluationService:
    return ResponseEvaluationService()


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
def _s3_upload_service_singleton() -> S3UploadService:
    settings = get_settings()
    return S3UploadService(
        bucket_name=settings.s3_assessment_bucket,
        region=settings.aws_default_region,
    )


def get_s3_upload_service() -> S3UploadService:
    return _s3_upload_service_singleton()
