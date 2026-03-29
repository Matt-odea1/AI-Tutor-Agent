"""
AgentCoreProvider.py
LLM provider using AWS Bedrock AgentCore runtime.
"""
from typing import Dict, List
from src.main.agentcore_setup.bootstrap import get_runtime
from src.main.agentcore_setup.config import BEDROCK_MODEL_CHAT, BEDROCK_MODEL_EMBED, EMBEDDING_DIM
import logging


class LlmError(Exception): pass
class LlmRateLimit(Exception): pass
class LlmTimeout(Exception): pass


class AgentCoreProvider:
    def __init__(self):
        self.client = get_runtime()
        self.logger = logging.getLogger("AgentCoreProvider")

    def chat(self, messages: List[Dict], **kwargs) -> str:
        model_id = BEDROCK_MODEL_CHAT
        try:
            result = self.client.chat(messages=messages, model_id=model_id, **kwargs)
            self.logger.info(f"chat: model={model_id}, messages={len(messages)}")
            return result['text']
        except Exception as e:
            self.logger.error(f"chat error: {e}")
            raise LlmError(str(e))

    def embed(self, texts: List[str]) -> List[List[float]]:
        model_id = BEDROCK_MODEL_EMBED
        try:
            result = self.client.embed(texts=texts, model_id=model_id)
            vectors = result['vectors']
            for v in vectors:
                if len(v) != EMBEDDING_DIM:
                    raise LlmError(f"Embedding dim mismatch: expected {EMBEDDING_DIM}, got {len(v)}")
            self.logger.info(f"embed: model={model_id}, texts={len(texts)}")
            return vectors
        except Exception as e:
            self.logger.error(f"embed error: {e}")
            raise LlmError(str(e))
