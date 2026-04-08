"""
src/main/service/SpeechToTextService.py

Speech-to-text services for the project.

This file contains two services:
 - DeepgramTranscribeService: uses Deepgram's REST API to transcribe audio files.
 - BedrockPostProcessor: optional post-processing using Bedrock.

Usage:
    svc = DeepgramTranscribeService()
    text = svc.transcribe("/path/to/audio.wav", language="en-US")
"""
from typing import Optional
import os
import json
import requests

# removed openai import and Whisper class; we now use Deepgram for ASR
import boto3


class DeepgramTranscribeService:
    """
    Service that uses Deepgram's REST API to transcribe audio files.

    - Reads DEEPGRAM_SECRET_KEY from environment by default (or accept api_key in constructor).
    - Performs a simple POST of the binary audio to Deepgram's /v1/listen endpoint and returns the transcript string.

    Usage:
        svc = DeepgramTranscribeService()
        text = svc.transcribe("/path/to/audio.wav", language="en-US")
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://api.deepgram.com/v1/listen",
        model: str = "general",
        timeout: int = 120,
    ):
        self.api_key = api_key or os.getenv("DEEPGRAM_SECRET_KEY")
        if not self.api_key:
            raise EnvironmentError("DEEPGRAM_SECRET_KEY not found in environment and no api_key provided")
        self.base_url = base_url
        self.model = model
        self.timeout = timeout

    def transcribe(self, audio_path: str, language: Optional[str] = None) -> str:
        """
        Transcribe a local audio file using Deepgram and return the transcript string.

        Args:
            audio_path: Local path to an audio file (.wav, .mp3, .m4a, etc.).
            language: Optional BCP-47 language code (e.g. "en-US"). If provided, it's sent as a query param.

        Returns:
            The transcript string.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        params = {"model": self.model}
        if language:
            params["language"] = language

        headers = {
            "Authorization": f"Token {self.api_key}",
            # Let requests set content-length; Deepgram accepts application/octet-stream for raw bytes
            "Content-Type": "application/octet-stream",
        }

        try:
            with open(audio_path, "rb") as f:
                resp = requests.post(self.base_url, params=params, headers=headers, data=f, timeout=self.timeout)
                resp.raise_for_status()
        except Exception as e:
            raise Exception(f"Deepgram request failed: {e}") from e

        try:
            data = resp.json()
        except ValueError:
            # If Deepgram returned non-json (unlikely), return raw text
            return resp.text or ""

        # Deepgram response common shape: {"results": {"channels": [{"alternatives": [{"transcript": "..."}] }]}}
        try:
            results = data.get("results", {})
            channels = results.get("channels", [])
            if channels and isinstance(channels, list):
                alts = channels[0].get("alternatives", [])
                if alts and isinstance(alts, list):
                    transcript = alts[0].get("transcript", "")
                    return transcript or ""

            # Fallbacks: some configs return `results.transcripts[0].transcript`
            transcripts = results.get("transcripts", [])
            if transcripts and isinstance(transcripts, list):
                return transcripts[0].get("transcript", "") or ""

            # As a last resort, stringify the JSON response
            return json.dumps(data)
        except Exception as e:
            raise Exception(f"Failed to parse Deepgram response: {e}") from e


class BedrockPostProcessor:
    """
    Simple wrapper around Amazon Bedrock to post-process transcripts.

    This class expects the environment variable `BEDROCK_MODEL_CHAT` to be set to the model identifier
    you'd like to use (for example `amazon.nova-lite-v1:0`). It uses the `bedrock-runtime` client to
    invoke the model's text generation endpoint.

    Usage:
        bp = BedrockPostProcessor()
        cleaned = bp.process(transcript, instructions="Add punctuation and fix casing.")

    Notes:
    - Bedrock is not an ASR service. Use Deepgram (or another ASR) to generate raw text, then
      use Bedrock to clean/format/augment that transcript.
    - The class attempts to read `AWS_*` credentials from the environment or IAM role like other boto3 clients.
    """

    def __init__(self, model_id: Optional[str] = None, region: Optional[str] = None, client: Optional[object] = None):
        self.model_id = model_id or os.getenv("BEDROCK_MODEL_CHAT")
        if not self.model_id:
            raise EnvironmentError("BEDROCK_MODEL_CHAT not set in env and no model_id provided")

        self.region = region or os.getenv("BEDROCK_REGION") or os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION")
        # create a bedrock-runtime client; some SDKs call this 'bedrock-runtime' or 'bedrock'
        self.client = client or boto3.client("bedrock-runtime", region_name=self.region)

    def process(self, transcript: str, instructions: Optional[str] = None, max_tokens: int = 2048) -> str:
        """
        Send the transcript to the Bedrock model to perform post-processing (punctuation, grammar, summarization, etc.).

        Args:
            transcript: Raw ASR text output.
            instructions: Optional instruction prompt for desired transformation (e.g. "Add punctuation and fix casing.").
            max_tokens: Max tokens for the Bedrock model (best-effort; depends on model).

        Returns:
            The model's processed text as a string.
        """
        if not transcript:
            return ""

        prompt = """
You are a helpful text processor. Apply the user's instructions to the transcript below.

Transcript:
"""
        prompt = prompt.strip() + "\n\n"
        if instructions:
            prompt += f"Instructions: {instructions}\n\n"
        prompt += f"Transcript:\n{transcript}\n\nResult:"""

        payload = {"input": prompt}

        try:
            # Bedrock runtime invoke_model expects the body to be bytes/stream.
            response = self.client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(payload).encode("utf-8"),
            )
        except Exception as e:
            raise Exception(f"Bedrock invoke_model failed: {e}") from e

        # Response body might be a stream/bytes; read and decode
        try:
            body = response.get("body")
            if hasattr(body, "read"):
                raw = body.read()
            else:
                raw = body
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")

            # Try to parse JSON first; many model containers return JSON with 'output' or similar.
            try:
                parsed = json.loads(raw)
                # Common shapes vary by model; attempt common fallbacks
                if isinstance(parsed, dict):
                    # look for 'output' or 'generated_text' or 'results' keys
                    for key in ("output", "outputs", "generated_text", "text", "result"):
                        if key in parsed:
                            val = parsed[key]
                            if isinstance(val, list):
                                return "\n".join(map(str, val))
                            return str(val)
                    # fallback to joining stringified values
                    return json.dumps(parsed)
                return str(parsed)
            except ValueError:
                # Not JSON; return raw text
                return str(raw)
        except Exception as e:
            raise Exception(f"Failed to read Bedrock response body: {e}") from e


# End of file
