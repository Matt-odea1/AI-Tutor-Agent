"""
test_llm_provider.py
Unit tests for LlmProvider base logic.
"""
import pytest
from src.main.llm.LlmProvider import LlmProvider

def test_llm_provider_init():
    provider = LlmProvider()
    assert provider.model_id == "amazon.nova-lite-v1:0"
