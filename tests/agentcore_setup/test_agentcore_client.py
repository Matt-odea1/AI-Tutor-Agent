"""
test_agentcore_client.py
Unit tests for AgentCoreClient (Bedrock chat/embed logic, error handling).
"""
import pytest
from unittest.mock import MagicMock
from src.main.agentcore_setup.AgentCoreClient import AgentCoreClient

@pytest.fixture
def client():
    c = AgentCoreClient()
    c.bedrock_client = MagicMock()
    return c

def test_chat_nova_payload(client):
    # Nova expects 'messages' payload
    client.bedrock_client.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"output": {"message": {"content": [{"text": "hi"}], "role": "assistant"}}}')
    }
    messages = [{"role": "user", "content": [{"text": "hello"}]}]
    result = client.chat(messages, model_id="amazon.nova-lite-v1:0")
    assert result["text"] == "hi"

def test_embed_cohere_payload(client):
    # Cohere expects 'texts' payload
    client.bedrock_client.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"embeddings": [[0.1, 0.2, 0.3]]}')
    }
    result = client.embed(["hello world"], model_id="cohere.embed-english-v3")
    assert result["vectors"] == [[0.1, 0.2, 0.3]]

def test_chat_error_handling(client):
    client.bedrock_client.invoke_model.side_effect = Exception("Bedrock error")
    with pytest.raises(Exception):
        client.chat([{"role": "user", "content": [{"text": "fail"}]}], model_id="amazon.nova-lite-v1:0")

def test_embed_error_handling(client):
    client.bedrock_client.invoke_model.side_effect = Exception("Bedrock error")
    with pytest.raises(Exception):
        client.embed(["fail"], model_id="cohere.embed-english-v3")

