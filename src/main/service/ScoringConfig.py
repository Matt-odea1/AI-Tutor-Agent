"""
ScoringConfig — single source of truth for per-question max score and grade
cutoffs.

Historically these were hard-coded in five places (ResponseEvaluationEngine,
EvaluationWorkflowRunner, ResponseEvaluationRepository, and both results
aggregators). They are now resolved from the assessment METADATA item with the
historical values as defaults, so an instructor can override them per assessment
while existing assessments (which carry no override) behave exactly as before.

Backward compatibility: an assessment metadata item with neither
``maxScorePerQuestion`` nor ``gradeCutoffs`` produces a ScoringConfig identical
to the previous hard-coded behaviour (max 10/question; 90/75/60 cutoffs).
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Historical defaults — must reproduce prior hard-coded behaviour exactly.
DEFAULT_MAX_SCORE_PER_QUESTION = 10
DEFAULT_GRADE_CUTOFFS = {"excellent": 90, "competent": 75, "developing": 60}


def _to_number(value: Any, fallback: float) -> float:
    """Coerce a DynamoDB value (Decimal/str/int/float) to float, else fallback."""
    if value is None:
        return float(fallback)
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)


class ScoringConfig:
    """Resolved scoring configuration for one assessment."""

    def __init__(
        self,
        max_score_per_question: Any = DEFAULT_MAX_SCORE_PER_QUESTION,
        cutoffs: Optional[Dict[str, Any]] = None,
    ):
        mspq = _to_number(max_score_per_question, DEFAULT_MAX_SCORE_PER_QUESTION)
        # Max score is an integer number of marks; guard against non-positive.
        self.max_score_per_question = int(mspq) if mspq and mspq > 0 else DEFAULT_MAX_SCORE_PER_QUESTION

        cutoffs = cutoffs or {}
        excellent = _to_number(cutoffs.get("excellent"), DEFAULT_GRADE_CUTOFFS["excellent"])
        competent = _to_number(cutoffs.get("competent"), DEFAULT_GRADE_CUTOFFS["competent"])
        developing = _to_number(cutoffs.get("developing"), DEFAULT_GRADE_CUTOFFS["developing"])

        # Reject nonsensical cutoffs (out of [0, 100] or mis-ordered) and fall back
        # to defaults rather than silently producing wrong grades for real students.
        # Defends against bad instructor input AND any malformed stored metadata.
        if 0 <= developing <= competent <= excellent <= 100:
            self.excellent, self.competent, self.developing = excellent, competent, developing
        else:
            logger.warning(
                "Invalid grade cutoffs (developing=%s, competent=%s, excellent=%s); "
                "falling back to defaults %s",
                developing, competent, excellent, DEFAULT_GRADE_CUTOFFS,
            )
            self.excellent = float(DEFAULT_GRADE_CUTOFFS["excellent"])
            self.competent = float(DEFAULT_GRADE_CUTOFFS["competent"])
            self.developing = float(DEFAULT_GRADE_CUTOFFS["developing"])

    def grade(self, percentage: float) -> str:
        """Map a percentage to a grade label using the resolved cutoffs."""
        if percentage >= self.excellent:
            return "Excellent"
        if percentage >= self.competent:
            return "Competent"
        if percentage >= self.developing:
            return "Developing"
        return "Unsatisfactory"

    @classmethod
    def from_metadata(cls, metadata: Optional[Dict[str, Any]]) -> "ScoringConfig":
        """
        Build a ScoringConfig from an assessment METADATA item.

        Recognised optional overrides:
          - ``maxScorePerQuestion``: number (marks per question)
          - ``gradeCutoffs``: map with ``excellent`` / ``competent`` / ``developing``
        Missing fields fall back to the historical defaults.
        """
        metadata = metadata or {}
        return cls(
            max_score_per_question=metadata.get("maxScorePerQuestion", DEFAULT_MAX_SCORE_PER_QUESTION),
            cutoffs=metadata.get("gradeCutoffs"),
        )
