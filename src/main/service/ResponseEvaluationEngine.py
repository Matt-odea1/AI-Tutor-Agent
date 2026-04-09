from __future__ import annotations

import json
from typing import Any, Dict


class ResponseEvaluationEngineError(Exception):
    pass


class ResponseEvaluationEngine:
    def __init__(self, agent_client, evaluation_prompt: str):
        self.agent_client = agent_client
        self.evaluation_prompt = evaluation_prompt

    @staticmethod
    def _empty_evaluation(question: Dict[str, Any]) -> Dict[str, Any]:
        """Return a zero-score evaluation for an empty or missing response."""
        return {
            "correctness_score": 0,
            "understanding_score": 0,
            "total_score": 0,
            "feedback": "No response was provided for this question.",
            "strengths": [],
            "weaknesses": ["No answer submitted."],
            "suggested_improvements": ["Ensure you provide a verbal response to each question."],
            "question_id": question.get("id", ""),
            "question_number": question.get("questionNumber", 0),
            "question_type": question.get("questionType", ""),
        }

    def evaluate_qa_pair(self, qa_pair: Dict[str, Any], rubric: str = "", course_context: str = "") -> Dict[str, Any]:
        question = qa_pair["question"]
        answer = qa_pair["answer"]

        transcript = (answer.get("transcript") or "").strip()
        if not transcript:
            return self._empty_evaluation(question)

        course_section = f"\n**Course Context:**\n{course_context}\n" if course_context else ""
        rubric_section = f"\n**Custom Rubric:**\n{rubric}\n" if rubric else ""

        user_prompt = f"""{course_section}
**Question Type:** {question.get('questionType', 'general')}

**Question:**
{question.get('text', '')}

**Code Reference:**
```python
{question.get('codeContext', '')}
```
{rubric_section}
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
        transcript = (response_data.get("transcript") or "").strip()
        if not transcript:
            return {
                "correctness_score": 0,
                "understanding_score": 0,
                "total_score": 0,
                "feedback": "No response was provided for this question.",
                "strengths": [],
                "weaknesses": ["No answer submitted."],
                "suggested_improvements": ["Ensure you provide a verbal response to each question."],
                "question_number": int(response_data.get("question_number", 0)),
                "question": response_data.get("question", ""),
                "question_type": response_data.get("question_type", ""),
            }

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
        if percentage >= 90:
            return "Excellent"
        if percentage >= 75:
            return "Competent"
        if percentage >= 60:
            return "Developing"
        return "Unsatisfactory"
