"""
InstructorQuestionBankService - Question bank management for assessments

Handles:
- Adding manually-authored bank questions (max 20 per assessment)
- Listing and deleting bank questions
- AI-suggested general questions generated from the assessment brief

Bank questions are stored at PK=ASSESSMENT#{id}, SK=BANK_QUESTION#{id}
and are mixed into every student's question list at read time.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from boto3.dynamodb.conditions import Key

logger = logging.getLogger(__name__)

MAX_BANK_QUESTIONS = 20
MIN_QUESTION_LENGTH = 10


class InstructorQuestionBankServiceError(Exception):
    pass


class InstructorQuestionBankService:
    def __init__(self, *, table, llm_client):
        self.table = table
        self.llm_client = llm_client

    # ─────────────────────────────────────────────────────────────
    # CRUD
    # ─────────────────────────────────────────────────────────────

    def add_question(
        self,
        assessment_id: str,
        text: str,
        topic: str = "general",
        difficulty: str = "medium",
        time_limit: Optional[int] = None,
        source: str = "manual",
    ) -> Dict[str, Any]:
        """
        Add a question to the assessment bank.
        Maximum 20 bank questions per assessment.
        """
        if len(text.strip()) < MIN_QUESTION_LENGTH:
            raise InstructorQuestionBankServiceError(
                f"Question text must be at least {MIN_QUESTION_LENGTH} characters"
            )
        if difficulty not in ("easy", "medium", "hard"):
            raise InstructorQuestionBankServiceError(
                "difficulty must be 'easy', 'medium', or 'hard'"
            )

        existing = self.list_questions(assessment_id)
        if len(existing) >= MAX_BANK_QUESTIONS:
            raise InstructorQuestionBankServiceError(
                f"Assessment already has {MAX_BANK_QUESTIONS} bank questions (maximum)"
            )

        question_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat()
        item: Dict[str, Any] = {
            "PK": f"ASSESSMENT#{assessment_id}",
            "SK": f"BANK_QUESTION#{question_id}",
            "id": question_id,
            "assessmentId": assessment_id,
            "text": text.strip(),
            "topic": topic,
            "difficulty": difficulty,
            "source": source,
            "createdAt": created_at,
        }
        if time_limit is not None:
            item["timeLimit"] = time_limit

        self.table.put_item(Item=item)
        logger.info("Added bank question %s to assessment %s", question_id, assessment_id)
        return self._to_view(item)

    def list_questions(self, assessment_id: str) -> List[Dict[str, Any]]:
        """Return all bank questions for an assessment, sorted by creation date."""
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"ASSESSMENT#{assessment_id}")
            & Key("SK").begins_with("BANK_QUESTION#")
        )
        items = response.get("Items", [])
        items.sort(key=lambda x: x.get("createdAt", ""))
        return [self._to_view(item) for item in items]

    def delete_question(self, assessment_id: str, question_id: str) -> None:
        """Delete a bank question. Silently succeeds if not found."""
        self.table.delete_item(
            Key={
                "PK": f"ASSESSMENT#{assessment_id}",
                "SK": f"BANK_QUESTION#{question_id}",
            }
        )
        logger.info("Deleted bank question %s from assessment %s", question_id, assessment_id)

    # ─────────────────────────────────────────────────────────────
    # AI suggestions
    # ─────────────────────────────────────────────────────────────

    def suggest_questions(
        self, assessment_id: str, count: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Use the LLM to suggest general bank questions based on the assessment brief.
        Returns suggested questions without saving them — the instructor chooses
        which ones to add.

        Args:
            assessment_id: Assessment identifier
            count: Number of questions to suggest (1–10)

        Returns:
            List of suggested question dicts (not yet persisted)
        """
        count = max(1, min(count, 10))

        # Fetch assessment brief
        response = self.table.get_item(
            Key={"PK": f"ASSESSMENT#{assessment_id}", "SK": "METADATA"}
        )
        item = response.get("Item")
        if not item:
            raise InstructorQuestionBankServiceError(
                f"Assessment {assessment_id} not found"
            )

        brief = item.get("assignmentBrief") or item.get("description") or ""
        if len(brief.strip()) < 20:
            raise InstructorQuestionBankServiceError(
                "Assessment brief is too short to generate suggestions (minimum 20 characters)"
            )

        title = item.get("title", "")
        course = item.get("course", "")

        prompt = (
            f"You are generating general oral exam questions for a {course} assessment titled '{title}'.\n\n"
            f"Assignment brief:\n{brief}\n\n"
            f"Generate exactly {count} general conceptual questions that test deep understanding "
            f"of the topics in this brief. These are NOT about any specific student's code — they are "
            f"general knowledge questions any student in this course should be able to answer.\n\n"
            "Respond with ONLY a valid JSON array. Each object must have:\n"
            '{"text": "<question text>", "topic": "<topic tag>", "difficulty": "easy"|"medium"|"hard"}\n\n'
            "Return ONLY the JSON array, no other text."
        )

        messages = [{"role": "user", "content": [{"text": prompt}]}]
        try:
            result = self.llm_client.chat(messages)
        except Exception as e:
            raise InstructorQuestionBankServiceError(f"LLM call failed: {e}") from e

        response_text = (
            result.get("text") or result.get("content") or result.get("answer") or ""
            if isinstance(result, dict)
            else str(result)
        )

        suggestions = self._parse_suggestions(response_text, count)
        logger.info(
            "Generated %d bank question suggestions for assessment %s", len(suggestions), assessment_id
        )
        return suggestions

    # ─────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _to_view(item: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": item.get("id", item["SK"].replace("BANK_QUESTION#", "")),
            "assessmentId": item.get("assessmentId", ""),
            "text": item.get("text", ""),
            "topic": item.get("topic", "general"),
            "difficulty": item.get("difficulty", "medium"),
            "source": item.get("source", "manual"),
            "timeLimit": item.get("timeLimit"),
            "createdAt": item.get("createdAt", ""),
        }

    @staticmethod
    def _parse_suggestions(response_text: str, expected_count: int) -> List[Dict[str, Any]]:
        """Parse LLM JSON response into suggestion dicts."""
        text = response_text.strip()

        # Strip markdown code fences
        if "```json" in text:
            start = text.find("```json") + 7
            text = text[start: text.find("```", start)].strip()
        elif "```" in text:
            start = text.find("```") + 3
            text = text[start: text.find("```", start)].strip()

        try:
            items = json.loads(text)
        except json.JSONDecodeError as e:
            raise InstructorQuestionBankServiceError(
                f"LLM returned invalid JSON for suggestions: {e}"
            ) from e

        if not isinstance(items, list):
            raise InstructorQuestionBankServiceError(
                "LLM response was not a JSON array"
            )

        valid = []
        for raw in items[:expected_count]:
            if isinstance(raw, dict) and raw.get("text"):
                valid.append(
                    {
                        "text": raw.get("text", ""),
                        "topic": raw.get("topic", "general"),
                        "difficulty": raw.get("difficulty", "medium")
                        if raw.get("difficulty") in ("easy", "medium", "hard")
                        else "medium",
                        "source": "ai_suggested",
                    }
                )
        return valid
