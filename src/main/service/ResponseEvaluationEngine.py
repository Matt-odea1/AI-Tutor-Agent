from __future__ import annotations

import json
from typing import Any, Dict


class ResponseEvaluationEngineError(Exception):
    pass


class ResponseEvaluationEngine:
    def __init__(self, agent_client, evaluation_prompt: str):
        self.agent_client = agent_client
        self.evaluation_prompt = evaluation_prompt

    def evaluate_qa_pair(self, qa_pair: Dict[str, Any]) -> Dict[str, Any]:
        question = qa_pair["question"]
        answer = qa_pair["answer"]

        user_prompt = f"""
**Question Type:** {question.get('questionType', 'general')}

**Question:**
{question.get('text', '')}

**Code Reference:**
```python
{question.get('codeContext', '')}
```

**Student's Answer (Transcribed from audio):**
{answer.get('transcript', 'No transcript available')}

---

Evaluate this response and provide your assessment in JSON format as specified.
"""

        messages = [
            {
                "role": "user",
                "content": [
                    {"text": self.evaluation_prompt},
                    {"text": user_prompt},
                ],
            }
        ]

        try:
            result = self.agent_client.chat(messages)
            response_text = result if isinstance(result, str) else result.get("text", "")
            evaluation = self.parse_evaluation_response(response_text)
            evaluation["question_id"] = question["id"]
            evaluation["question_number"] = question.get("questionNumber", 0)
            evaluation["question_type"] = question.get("questionType", "")
            return evaluation
        except Exception as error:
            raise ResponseEvaluationEngineError(f"Failed to evaluate question: {error}")

    def evaluate_single_question(self, response_data: Dict[str, str]) -> Dict[str, Any]:
        user_prompt = self.build_evaluation_prompt(response_data)

        messages = [
            {
                "role": "user",
                "content": [
                    {"text": self.evaluation_prompt},
                    {"text": user_prompt},
                ],
            }
        ]

        try:
            result = self.agent_client.chat(messages)
            response_text = result if isinstance(result, str) else result.get("text", "")
            evaluation = self.parse_evaluation_response(response_text)
            evaluation["question_number"] = int(response_data.get("question_number", 0))
            evaluation["question"] = response_data.get("question", "")
            evaluation["question_type"] = response_data.get("question_type", "")
            return evaluation
        except Exception as error:
            raise ResponseEvaluationEngineError(f"Failed to evaluate question: {error}")

    def build_evaluation_prompt(self, response_data: Dict[str, str]) -> str:
        question_type = response_data.get("question_type", "general")
        question = response_data.get("question", "")
        code_ref = response_data.get("code_reference", "")
        transcript = response_data.get("transcript", "")

        prompt = f"""
**Question Type:** {question_type}

**Question:**
{question}
"""

        if code_ref and code_ref.strip():
            prompt += f"""
**Code Reference:**
```python
{code_ref}
```
"""

        prompt += f"""
**Student's Answer (Transcribed):**
{transcript}

---

Evaluate this response and provide your assessment in JSON format as specified.
"""

        return prompt

    def parse_evaluation_response(self, response_text: str) -> Dict[str, Any]:
        if "```json" in response_text:
            start = response_text.find("```json") + 7
            end = response_text.find("```", start)
            json_str = response_text[start:end].strip()
        elif "```" in response_text:
            start = response_text.find("```") + 3
            end = response_text.find("```", start)
            json_str = response_text[start:end].strip()
        else:
            json_str = response_text.strip()

        try:
            evaluation = json.loads(json_str)
        except json.JSONDecodeError as error:
            raise ResponseEvaluationEngineError(
                f"Failed to parse JSON response: {error}\\nResponse: {response_text[:500]}"
            )

        required_fields = ["correctness_score", "understanding_score", "total_score", "feedback"]
        for field in required_fields:
            if field not in evaluation:
                raise ResponseEvaluationEngineError(f"Missing required field: {field}")

        return evaluation

    @staticmethod
    def calculate_grade(percentage: float) -> str:
        if percentage >= 80:
            return "Excellent"
        if percentage >= 60:
            return "Competent"
        if percentage >= 40:
            return "Developing"
        return "Unsatisfactory"
