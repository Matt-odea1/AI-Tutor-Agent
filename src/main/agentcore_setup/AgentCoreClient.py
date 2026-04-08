"""
AgentCoreClient.py
Thin wrapper exposing generate, chat, embed, and streaming methods for AgentCoreProvider.
"""
from bedrock_agentcore.runtime import BedrockAgentCoreApp
import boto3
import json
import logging
import os

class AgentCoreClient:
    def __init__(self):
        self.app = BedrockAgentCoreApp()
        bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
        self.bedrock_client = boto3.client("bedrock-runtime", region_name=bedrock_region)
        self.logger = logging.getLogger("AgentCoreClient")
        if not self.logger.hasHandlers():
            logging.basicConfig(level=logging.INFO)

    def generate(self, prompt, model_id, **kwargs):
        # TODO: Implement actual call to Bedrock model
        raise NotImplementedError("BedrockAgentCoreApp does not expose 'generate' directly. Implement model call here.")

    def chat(self, messages, model_id, **kwargs):
        self.logger.debug(f"chat called with model_id={model_id}")
        self.logger.debug(f"messages={messages}")
        
        # Amazon Nova models use specific format
        if model_id == "amazon.nova-lite-v1:0":
            messages = self._adapt_messages_for_nova(messages)
            # Validate messages structure
            if not messages or not isinstance(messages, list):
                self.logger.error("Nova chat: 'messages' must be a non-empty list.")
                raise ValueError("Nova chat: 'messages' must be a non-empty list.")
            if messages[0].get("role") != "user":
                self.logger.error("Nova chat: First message must have role 'user'.")
                raise ValueError("Nova chat: First message must have role 'user'.")
            payload = json.dumps({"messages": messages})
            self.logger.debug(f"Nova payload={payload}")
            try:
                response = self.bedrock_client.invoke_model(
                    modelId=model_id,
                    body=payload,
                    contentType="application/json",
                    accept="application/json"
                )
                body = json.loads(response["body"].read())
                self.logger.debug(f"Nova response={body}")
            except Exception as e:
                self.logger.error(f"Nova Bedrock error: {e}")
                raise
            # Nova returns {"output": {"message": {"content": [{"text": "..."}], "role": "assistant"}}}
            if "output" in body and "message" in body["output"]:
                msg = body["output"]["message"]
                if "content" in msg and isinstance(msg["content"], list) and msg["content"]:
                    return {"text": msg["content"][0]["text"]}
            # Legacy/other Nova formats
            elif "outputs" in body and body["outputs"]:
                return {"text": body["outputs"][0]["text"]}
            elif "content" in body and isinstance(body["content"], list):
                return {"text": body["content"][0]["text"]}
            else:
                # NOTE: Unexpected Nova chat response structure
                self.logger.error(f"Unexpected Nova chat response: {body}")
                raise ValueError(f"Unexpected Nova chat response: {body}")
        
        # GPT-OSS-120B and other standard Bedrock models
        # Validate messages for standard Bedrock models
        if not messages or not isinstance(messages, list):
            self.logger.error("Bedrock chat: 'messages' must be a non-empty list.")
            raise ValueError("Bedrock chat: 'messages' must be a non-empty list.")
        
        payload = json.dumps({"messages": messages})
        self.logger.debug(f"Bedrock payload for {model_id}={payload}")
        try:
            response = self.bedrock_client.invoke_model(
                modelId=model_id,
                body=payload,
                contentType="application/json",
                accept="application/json"
            )
            body = json.loads(response["body"].read())
            self.logger.debug(f"Bedrock response for {model_id}={body}")
        except Exception as e:
            self.logger.error(f"Bedrock error for {model_id}: {e}")
            raise
        
        # Handle standard Bedrock response formats
        # OpenAI-compatible format (GPT-OSS-120B)
        if "choices" in body and isinstance(body["choices"], list) and body["choices"]:
            choice = body["choices"][0]
            if "message" in choice and "content" in choice["message"]:
                content = choice["message"]["content"]
                # Extract token usage if available
                tokens_input = body.get("usage", {}).get("prompt_tokens")
                tokens_output = body.get("usage", {}).get("completion_tokens")
                return {
                    "text": content,
                    "tokens_input": tokens_input,
                    "tokens_output": tokens_output,
                    "model_id": body.get("model")
                }
        # Bedrock standard formats
        elif "content" in body and isinstance(body["content"], list):
            return {"text": body["content"][0]["text"]}
        elif "completions" in body and isinstance(body["completions"], list):
            return {"text": body["completions"][0]["data"]["text"]}
        elif "completion" in body:
            return {"text": body["completion"]}
        else:
            self.logger.error(f"Unexpected chat response: {body}")
            raise ValueError(f"Unexpected chat response: {body}")

    def _adapt_messages_for_nova(self, messages):
        """
        Nova requires the first message role to be 'user'.
        If we receive leading system messages, fold them into the first user turn.
        """
        if not isinstance(messages, list) or not messages:
            return messages

        leading_system = []
        index = 0
        for msg in messages:
            if msg.get("role") == "system":
                text = msg.get("content", "")
                leading_system.append(text if isinstance(text, str) else str(text))
                index += 1
                continue
            break

        if not leading_system:
            return messages

        remainder = messages[index:]
        system_block = "\n\n".join(part for part in leading_system if part)

        if remainder and remainder[0].get("role") == "user":
            current = remainder[0].get("content", "")
            current_text = current if isinstance(current, str) else str(current)
            remainder[0] = {
                **remainder[0],
                "content": f"System instructions:\n{system_block}\n\n{current_text}".strip(),
            }
            return remainder

        injected_user = {
            "role": "user",
            "content": f"System instructions:\n{system_block}".strip(),
        }
        return [injected_user, *remainder]

    def embed(self, texts, model_id):
        # Cohere embedding expects 'texts' key
        if model_id == "cohere.embed-english-v3":
            if not texts or not isinstance(texts, list):
                self.logger.error("Cohere embed: 'texts' must be a non-empty list.")
                raise ValueError("Cohere embed: 'texts' must be a non-empty list.")
            payload = json.dumps({"texts": texts,
                                  "input_type": "search_document"})
            self.logger.debug(f"Cohere embed payload={payload}")
            try:
                response = self.bedrock_client.invoke_model(
                    modelId=model_id,
                    body=payload,
                    contentType="application/json",
                    accept="application/json"
                )
                body = json.loads(response["body"].read())
                self.logger.debug(f"Cohere embed response={body}")
            except Exception as e:
                self.logger.error(f"Cohere embed Bedrock error: {e}")
                raise
            # Cohere returns {"embeddings": [[...]]}
            if "embeddings" in body and body["embeddings"]:
                return {"vectors": body["embeddings"]}
            else:
                self.logger.error(f"Unexpected Cohere embed response: {body}")
                raise ValueError(f"Unexpected Cohere embed response: {body}")
        # Actual embedding using AWS Bedrock
        vectors = []
        for text in texts:
            payload = json.dumps({"inputText": text})
            response = self.bedrock_client.invoke_model(
                modelId=model_id,
                body=payload,
                contentType="application/json",
                accept="application/json"
            )
            body = json.loads(response["body"].read())
            # Titan returns {"embedding": [...]}, Cohere returns {"embeddings": [[...]]}
            if "embedding" in body:
                vectors.append(body["embedding"])
            elif "embeddings" in body:
                vectors.append(body["embeddings"][0])
            else:
                raise ValueError(f"Unexpected embedding response: {body}")
        return {"vectors": vectors}

    def generate_stream(self, prompt, model_id, **kwargs):
        # TODO: Implement streaming call
        raise NotImplementedError("Streaming not implemented.")

    def chat_stream(self, messages, model_id, **kwargs):
        # TODO: Implement streaming call
        raise NotImplementedError("Streaming not implemented.")
