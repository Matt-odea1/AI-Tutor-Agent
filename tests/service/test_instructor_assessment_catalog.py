"""
Unit tests for InstructorAssessmentCatalog.to_assessment_view.

These deliberately exercise the real serializer rather than a mock. The
auto-evaluation trigger, the cohort report service and the instructor API all
read assessment config through this one function, and because it is an explicit
allow-list an omitted field is invisible with no error. That is exactly how
`autoEvaluate` came to be dropped: `submit_assessment` read it as None and
returned early, so no student was ever auto-marked, while the mocked tests in
tests/controllers/test_sprint7.py kept passing because their fake
`get_assessment` returned a dict that included the field.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.main.service.InstructorAssessmentCatalog import InstructorAssessmentCatalog


def _stored_item(**overrides):
    """A METADATA item shaped like what create_assessment actually writes."""
    item = {
        "PK": "ASSESSMENT#a-1",
        "SK": "METADATA",
        "id": "a-1",
        "createdBy": "instructor-1",
        "title": "Quiz 6 - Practice Exercise",
        "course": "COMP9021",
        "description": "",
        "dueDate": "2026-08-12T23:59",
        "totalQuestions": 8,
        "timeLimit": 300,
        "createdAt": "2026-08-04T02:56:18+00:00",
    }
    item.update(overrides)
    return item


class TestBehaviourFlagsSurvive:
    """Every flag the backend branches on must survive the projection."""

    def test_auto_evaluate_true_is_preserved(self):
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(autoEvaluate=True)
        )
        assert view["autoEvaluate"] is True

    def test_formative_preset_round_trips(self):
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(
                autoEvaluate=True,
                proctored=False,
                allowReview=True,
                feedbackRelease="immediate",
                answerMode="written",
            )
        )
        assert view["autoEvaluate"] is True
        assert view["proctored"] is False
        assert view["allowReview"] is True
        assert view["feedbackRelease"] == "immediate"
        assert view["answerMode"] == "written"

    def test_auto_report_opt_out_is_preserved(self):
        # AssessmentReportService checks `is False`, so a dropped flag silently
        # re-enabled reporting for assessments that had opted out.
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(autoReport=False)
        )
        assert view["autoReport"] is False

    def test_custom_report_threshold_is_preserved(self):
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(autoReportThreshold=25)
        )
        assert view["autoReportThreshold"] == 25

    def test_scoring_overrides_are_preserved(self):
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(
                maxScorePerQuestion=20,
                gradeCutoffs={
                    "excellent": Decimal("80"),
                    "competent": Decimal("60"),
                    "developing": Decimal("40"),
                },
            )
        )
        assert view["maxScorePerQuestion"] == 20
        assert view["gradeCutoffs"] == {
            "excellent": 80.0,
            "competent": 60.0,
            "developing": 40.0,
        }
        assert all(isinstance(v, float) for v in view["gradeCutoffs"].values())

    def test_rubric_and_results_released_are_preserved(self):
        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(rubric="Grade strictly on accuracy.", resultsReleased=True)
        )
        assert view["rubric"] == "Grade strictly on accuracy."
        assert view["resultsReleased"] is True


class TestLegacyDefaults:
    """Items written before the flags existed must keep their old behaviour."""

    def test_missing_flags_default_to_pre_flag_behaviour(self):
        view = InstructorAssessmentCatalog.to_assessment_view(_stored_item())
        assert view["autoEvaluate"] is False
        assert view["autoReport"] is True
        assert view["autoReportThreshold"] is None
        assert view["allowReview"] is False
        assert view["feedbackRelease"] == "manual"
        assert view["resultsReleased"] is False
        assert view["gradeCutoffs"] is None
        assert view["maxScorePerQuestion"] is None

    def test_proctored_defaults_to_oral_only(self):
        oral = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(answerMode="oral")
        )
        written = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(answerMode="written")
        )
        assert oral["proctored"] is True
        assert written["proctored"] is False

    def test_answer_mode_defaults_to_oral(self):
        assert InstructorAssessmentCatalog.to_assessment_view(_stored_item())["answerMode"] == "oral"


class TestExistingBehaviourUnchanged:
    def test_time_limit_converted_seconds_to_minutes(self):
        view = InstructorAssessmentCatalog.to_assessment_view(_stored_item(timeLimit=300))
        assert view["timeLimit"] == 5

    def test_null_time_limit_stays_none(self):
        view = InstructorAssessmentCatalog.to_assessment_view(_stored_item(timeLimit=None))
        assert view["timeLimit"] is None

    def test_updated_at_falls_back_to_created_at(self):
        view = InstructorAssessmentCatalog.to_assessment_view(_stored_item())
        assert view["updatedAt"] == view["createdAt"]


class TestResponseContract:
    def test_view_satisfies_the_api_response_model(self):
        """The view must populate AssessmentResponse rather than fall back to its
        defaults — the defaults are what made the API report autoEvaluate=false
        for every assessment regardless of what was stored."""
        from src.main.dtos.InstructorAssessmentDTOs import AssessmentResponse

        view = InstructorAssessmentCatalog.to_assessment_view(
            _stored_item(
                autoEvaluate=True,
                proctored=False,
                allowReview=True,
                feedbackRelease="immediate",
                answerMode="written",
            )
        )
        response = AssessmentResponse(**view)
        assert response.autoEvaluate is True
        assert response.feedbackRelease == "immediate"
        assert response.allowReview is True
        assert response.proctored is False

    @pytest.mark.parametrize(
        "field",
        [
            "autoEvaluate",
            "autoReport",
            "autoReportThreshold",
            "proctored",
            "allowReview",
            "feedbackRelease",
            "answerMode",
            "preparationTime",
            "rubric",
            "maxScorePerQuestion",
            "gradeCutoffs",
            "resultsReleased",
        ],
    )
    def test_config_field_is_present_in_view(self, field):
        assert field in InstructorAssessmentCatalog.to_assessment_view(_stored_item())
