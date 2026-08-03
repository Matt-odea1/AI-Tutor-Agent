"""
Tests for the one-page cohort report renderer.

The output is a document an instructor may hand to a course convenor, so the
things worth pinning down are: it stays self-contained (no external fetches),
it never leaks student identifiers, it escapes untrusted text, and it degrades
rather than crashes on an empty or partial cohort.
"""
from __future__ import annotations

import re

import pytest

from src.main.service.AssessmentReportRenderer import render_report_html

FULL_REPORT = {
    "assessmentId": "a-1",
    "assessmentTitle": "Quiz 1",
    "course": "COMP9021",
    "generatedAt": "2026-08-04T09:12:00+00:00",
    "triggeredBy": "auto_threshold",
    "milestone": 3,
    "counts": {"enrolled": 395, "submitted": 32, "evaluated": 30, "notEvaluated": 365},
    "scores": {"average": 71.4, "median": 73.0, "min": 22.0, "max": 98.0, "stdDev": 16.8},
    "gradeDistribution": {
        "Excellent": 6, "Competent": 11, "Developing": 8, "Needs Improvement": 5,
        "_cutoffs": {"excellent": 90, "competent": 75, "developing": 60},
    },
    "histogram": [
        {"bucket": "0-9", "count": 0}, {"bucket": "10-19", "count": 0},
        {"bucket": "20-29", "count": 2}, {"bucket": "30-39", "count": 1},
        {"bucket": "40-49", "count": 2}, {"bucket": "50-59", "count": 3},
        {"bucket": "60-69", "count": 5}, {"bucket": "70-79", "count": 7},
        {"bucket": "80-89", "count": 6}, {"bucket": "90-100", "count": 4},
    ],
    "dimensions": {
        "answersEvaluated": 240, "averageCorrectness": 3.6,
        "averageUnderstanding": 3.4, "needsReviewCount": 7,
    },
    "narrative": "The cohort is tracking at 71.4% on average.",
}


EMPTY_REPORT = {
    "assessmentId": "a-2",
    "assessmentTitle": "Quiz 2",
    "course": "COMP9021",
    "generatedAt": "2026-08-04T09:12:00+00:00",
    "triggeredBy": "manual",
    "milestone": None,
    "counts": {"enrolled": 0, "submitted": 0, "evaluated": 0, "notEvaluated": 0},
    "scores": {"average": None, "median": None, "min": None, "max": None, "stdDev": None},
    "gradeDistribution": {},
    "histogram": [],
    "dimensions": {
        "answersEvaluated": 0, "averageCorrectness": None,
        "averageUnderstanding": None, "needsReviewCount": 0,
    },
    "narrative": None,
}


class TestStructure:
    def test_is_a_complete_html_document(self):
        html = render_report_html(FULL_REPORT)
        assert html.startswith("<!doctype html>")
        assert html.rstrip().endswith("</html>")

    def test_title_carries_the_evaluated_count(self):
        html = render_report_html(FULL_REPORT)
        assert "COMP9021 Quiz 1: Cohort Results Summary (n = 30)" in html

    def test_title_is_escaped_exactly_once(self):
        """Double-escaping would print a literal &amp; on the page."""
        html = render_report_html({**FULL_REPORT, "assessmentTitle": "Ethics & Law"})
        assert "Ethics &amp; Law" in html
        assert "&amp;amp;" not in html

    def test_renders_all_four_cards(self):
        html = render_report_html(FULL_REPORT)
        for card in ["Score distribution", "Grade distribution",
                     "Submission and evaluation", "Marks per answer"]:
            assert f"<h3>{card}</h3>" in html

    def test_headline_stats_present(self):
        html = render_report_html(FULL_REPORT)
        assert "71.4%" in html and "73%" in html and "16.8" in html

    def test_a4_single_page_setup(self):
        html = render_report_html(FULL_REPORT)
        assert "size: A4" in html
        # Cards must not be split across a page break.
        assert "break-inside: avoid" in html


class TestSelfContained:
    def test_no_external_requests(self):
        """A CDN font or remote image would break offline viewing and PDF export."""
        html = render_report_html(FULL_REPORT)
        urls = set(re.findall(r"https?://[^\"'\s>]+", html))
        # The SVG XML namespace is an identifier, not a fetch — nothing else may appear.
        assert urls <= {"http://www.w3.org/2000/svg"}
        assert "@import" not in html
        assert "<script" not in html
        assert "url(" not in html

    def test_charts_are_inline_svg(self):
        html = render_report_html(FULL_REPORT)
        assert html.count("<svg") == 4  # one per card
        assert "<img" not in html


class TestPrivacy:
    def test_no_student_identifiers(self):
        """The renderer only ever sees aggregates — assert it stays that way."""
        html = render_report_html(FULL_REPORT)
        assert "studentId" not in html
        assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", html)  # no email addresses

    def test_escapes_untrusted_text(self):
        """Title and narrative are user/LLM authored — they must not inject markup."""
        report = {
            **FULL_REPORT,
            "assessmentTitle": '<script>alert(1)</script>',
            "narrative": '<img src=x onerror="alert(1)">',
        }
        html = render_report_html(report)

        # The payloads survive as inert text, never as live markup: no unescaped
        # tag delimiters and no attribute-bearing quote around the handler.
        assert "<script>alert(1)</script>" not in html
        assert "<img" not in html
        assert 'onerror="' not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
        assert "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;" in html


class TestNarrative:
    def test_narrative_and_disclaimer_rendered(self):
        html = render_report_html(FULL_REPORT)
        assert "The cohort is tracking at 71.4% on average." in html
        assert "Written by an AI model" in html

    def test_absent_narrative_omits_the_disclaimer(self):
        """No AI attribution line when there is no AI-written text on the page."""
        html = render_report_html({**FULL_REPORT, "narrative": None})
        assert "Written by an AI model" not in html


class TestDegradedInput:
    def test_empty_cohort_renders_without_crashing(self):
        html = render_report_html(EMPTY_REPORT)
        assert "<!doctype html>" in html
        assert "(n = 0)" in html
        assert "—" in html  # null stats render as em dashes

    def test_missing_sections_default_safely(self):
        html = render_report_html({"assessmentTitle": "Bare", "course": ""})
        assert "Bare: Cohort Results Summary (n = 0)" in html

    def test_partial_cohort_is_called_out(self):
        html = render_report_html(FULL_REPORT)
        assert "363 students have not submitted" in html

    def test_full_cohort_omits_the_partial_warning(self):
        report = {
            **FULL_REPORT,
            "counts": {"enrolled": 30, "submitted": 30, "evaluated": 30, "notEvaluated": 0},
        }
        html = render_report_html(report)
        assert "have not submitted" not in html


class TestCharts:
    def test_mean_marker_drawn_when_average_present(self):
        html = render_report_html(FULL_REPORT)
        assert "mean 71.4" in html
        assert "stroke-dasharray" in html

    def test_no_mean_marker_without_an_average(self):
        html = render_report_html(EMPTY_REPORT)
        assert "stroke-dasharray" not in html

    def test_zero_count_buckets_draw_no_bar(self):
        """Two empty buckets in the fixture — bars are only drawn for non-zero counts."""
        html = render_report_html(FULL_REPORT)
        svg = html.split('<h3>Score distribution</h3>')[1].split("</svg>")[0]
        assert svg.count("<rect") == 8  # 10 buckets, 2 of them zero

    @pytest.mark.parametrize("average", [0.0, 100.0, 50.0])
    def test_marker_stays_inside_the_plot(self, average):
        """A 0% or 100% mean must not push the label off the card."""
        report = {**FULL_REPORT, "scores": {**FULL_REPORT["scores"], "average": average}}
        html = render_report_html(report)
        svg = html.split('<h3>Score distribution</h3>')[1].split("</svg>")[0]
        xs = [float(m) for m in re.findall(r'<line x1="([\d.]+)"', svg)]
        assert xs, "expected a marker line"
        assert all(0 <= x <= 340 for x in xs)
