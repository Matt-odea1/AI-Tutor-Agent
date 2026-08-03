"""
AssessmentReportRenderer — one-page cohort report, formatted to the house
summary layout (see docs: single A4 page, card grid of distributions, closing
prose paragraph).

Charts are inline SVG and the CSS is inline: the output is a single
self-contained HTML file with no external requests, so it renders identically
whether it is opened in a browser, emailed as an attachment, or handed to
WeasyPrint for PDF.

The layout is deliberately fixed at four cards. The reference layout carries
six, but a cohort report only has four distributions worth plotting — padding
the grid with filler would make the page look fuller and say less.
"""

from __future__ import annotations

import html
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

# ── Palette ──────────────────────────────────────────────────────────────────
INK = "#202124"
GREY = "#5f6368"
GREY_LIGHT = "#80868b"
BORDER = "#e8eaed"
BLUE = "#4285f4"
RED = "#d93025"
GRID = "#e8eaed"

# Humanist sans matching the reference. All fallbacks are system fonts, so the
# file stays self-contained — no webfont fetch, which a strict PDF renderer or
# an offline viewer would drop anyway.
FONT_STACK = (
    "'Lato', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
)


def _esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _fmt(value: Optional[float], suffix: str = "") -> str:
    """Render a number for display, or an em dash when absent."""
    if value is None:
        return "—"
    if isinstance(value, float) and value.is_integer():
        return f"{int(value)}{suffix}"
    return f"{value}{suffix}"


# ── Charts ───────────────────────────────────────────────────────────────────

def _vbar_svg(
    buckets: Sequence[Dict[str, Any]],
    *,
    markers: Sequence[Tuple[str, float]] = (),
    width: int = 340,
    height: int = 142,
) -> str:
    """
    Vertical histogram with optional dashed marker lines (mean, median).

    `markers` are (label, percentage) pairs positioned along the 0-100 x axis,
    matching the reference layout's dashed mean line.
    """
    # `top` reserves a clear band above the plot for the marker label, so it
    # never collides with the top gridline or a tall bar's value label.
    left, right, top, bottom = 26, 8, 28, 26
    plot_w = width - left - right
    plot_h = height - top - bottom
    counts = [int(b.get("count", 0)) for b in buckets]
    peak = max(counts) if counts and max(counts) > 0 else 1

    # Keep the y axis on whole students — a "2.5 students" tick is nonsense.
    tick_step = max(1, -(-peak // 4))
    ticks = list(range(0, peak + tick_step, tick_step))

    parts: List[str] = [
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg" role="img">'
    ]

    for t in ticks:
        y = top + plot_h - (t / peak) * plot_h
        parts.append(
            f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}" '
            f'stroke="{GRID}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{left - 5}" y="{y + 3:.1f}" text-anchor="end" '
            f'font-size="7" fill="{GREY_LIGHT}">{t}</text>'
        )

    n = len(buckets) or 1
    slot = plot_w / n
    bar_w = slot * 0.62
    for i, bucket in enumerate(buckets):
        count = int(bucket.get("count", 0))
        x = left + i * slot + (slot - bar_w) / 2
        bar_h = (count / peak) * plot_h
        y = top + plot_h - bar_h
        if count:
            parts.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}" '
                f'fill="{BLUE}"/>'
            )
            parts.append(
                f'<text x="{x + bar_w / 2:.1f}" y="{y - 3:.1f}" text-anchor="middle" '
                f'font-size="7" fill="{GREY}">{count}</text>'
            )
        label = _esc(str(bucket.get("bucket", "")).split("-")[0])
        parts.append(
            f'<text x="{left + i * slot + slot / 2:.1f}" y="{top + plot_h + 11:.1f}" '
            f'text-anchor="middle" font-size="7" fill="{GREY_LIGHT}">{label}</text>'
        )

    for label, pct in markers:
        if pct is None:
            continue
        x = left + (max(0.0, min(100.0, float(pct))) / 100.0) * plot_w
        parts.append(
            f'<line x1="{x:.1f}" y1="{top - 3}" x2="{x:.1f}" y2="{top + plot_h}" '
            f'stroke="{RED}" stroke-width="1" stroke-dasharray="3,2"/>'
        )
        # Nudge the label inward at the extremes so it can't run off the card.
        anchor = "middle"
        if x < left + 22:
            anchor = "start"
        elif x > left + plot_w - 22:
            anchor = "end"
        parts.append(
            f'<text x="{x:.1f}" y="{top - 7}" text-anchor="{anchor}" font-size="7" '
            f'fill="{GREY}">{_esc(label)}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def _hbar_svg(
    rows: Sequence[Tuple[str, float, str]],
    *,
    width: int = 340,
    label_w: int = 118,
    row_h: int = 17,
    scale_max: Optional[float] = None,
) -> str:
    """Horizontal bars: (label, value, display value) per row."""
    if not rows:
        return ""
    height = row_h * len(rows) + 6
    value_w = 26
    plot_w = width - label_w - value_w - 6
    peak = scale_max if scale_max else max([r[1] for r in rows] + [1])
    peak = peak or 1

    parts = [
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg" role="img">'
    ]
    for i, (label, value, display) in enumerate(rows):
        y = 3 + i * row_h
        bar_h = row_h - 7
        parts.append(
            f'<text x="{label_w - 6}" y="{y + bar_h - 1}" text-anchor="end" '
            f'font-size="7.5" fill="{GREY}">{_esc(label)}</text>'
        )
        bar_w = (max(0.0, float(value)) / peak) * plot_w
        if bar_w > 0:
            parts.append(
                f'<rect x="{label_w}" y="{y}" width="{bar_w:.1f}" height="{bar_h}" '
                f'fill="{BLUE}"/>'
            )
        parts.append(
            f'<text x="{label_w + bar_w + 4:.1f}" y="{y + bar_h - 1}" '
            f'font-size="7.5" fill="{GREY}">{_esc(display)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


# ── Page ─────────────────────────────────────────────────────────────────────

_CSS = f"""
@page {{ size: A4; margin: 13mm 12mm; }}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 0;
  font-family: {FONT_STACK};
  color: {INK};
  font-size: 10pt;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}}
.wrap {{ max-width: 780px; margin: 0 auto; padding: 8px 4px; }}
.source {{ font-size: 8pt; color: {GREY}; margin: 0 0 14px; }}
h1 {{ font-size: 18pt; font-weight: 700; margin: 0 0 5px; letter-spacing: -0.2px; }}
.subtitle {{ font-size: 9.5pt; color: {GREY}; margin: 0 0 20px; }}
h2 {{ font-size: 11pt; font-weight: 700; margin: 0 0 11px; }}
.grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
.card {{
  border: 1px solid {BORDER}; border-radius: 8px;
  padding: 13px 14px 11px; background: #fff;
  break-inside: avoid; page-break-inside: avoid;
}}
.card h3 {{ font-size: 10.5pt; font-weight: 700; margin: 0 0 4px; }}
.card .note {{ font-size: 8pt; color: {GREY}; margin: 0 0 8px; line-height: 1.45; }}
.card .foot {{ font-size: 7.5pt; color: {GREY_LIGHT}; margin: 7px 0 0; line-height: 1.4; }}
.stats {{
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 8px; margin: 0 0 18px;
  border: 1px solid {BORDER}; border-radius: 8px; padding: 11px 14px;
}}
.stats div {{ text-align: left; }}
.stats .k {{ font-size: 7.5pt; color: {GREY}; margin: 0 0 2px; }}
.stats .v {{ font-size: 13pt; font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }}
.summary {{ font-size: 9.5pt; line-height: 1.72; margin: 18px 0 0; }}
.summary strong {{ font-weight: 700; }}
.disclaimer {{ font-size: 7.5pt; color: {GREY_LIGHT}; margin: 9px 0 0; line-height: 1.45; }}
"""

_SHELL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{title}</title>
<style>{css}</style>
</head><body><div class="wrap">
{source}
<h1>{heading}</h1>
<p class="subtitle">{subtitle}</p>
{stats}
<h2>Response distributions</h2>
<div class="grid">{cards}</div>
{summary}
</div></body></html>"""


def _card(title: str, note: str, chart: str, foot: str = "") -> str:
    foot_html = f'<p class="foot">{foot}</p>' if foot else ""
    return (
        f'<div class="card"><h3>{title}</h3>'
        f'<p class="note">{note}</p>{chart}{foot_html}</div>'
    )


def render_report_html(report: Dict[str, Any]) -> str:
    """Render a stored cohort report as a one-page, self-contained HTML document."""
    counts = report.get("counts") or {}
    scores = report.get("scores") or {}
    dims = report.get("dimensions") or {}
    histogram = report.get("histogram") or []
    grades = report.get("gradeDistribution") or {}

    evaluated = int(counts.get("evaluated") or 0)
    submitted = int(counts.get("submitted") or 0)
    enrolled = int(counts.get("enrolled") or 0)

    # Built from raw values and escaped once, at output. Escaping here as well
    # would double-encode, so a title containing "&" or "'" would render the
    # entity itself on the page.
    title = str(report.get("assessmentTitle") or "Assessment")
    course = str(report.get("course") or "")
    heading = f"{course}{' ' if course else ''}{title}: Cohort Results Summary (n = {evaluated})"

    generated = _esc(report.get("generatedAt", ""))[:16].replace("T", " ")
    trigger = report.get("triggeredBy")
    milestone = report.get("milestone")
    if trigger == "auto_threshold" and milestone:
        origin = f"auto-generated at {submitted} submissions"
    else:
        origin = "generated on request"

    source = (
        f'<p class="source">Generated {generated} UTC · {origin} · '
        f"statistics computed over the {evaluated} evaluated "
        f'{"submission" if evaluated == 1 else "submissions"}</p>'
    )

    subtitle = (
        f"Cohort performance across {submitted} of {enrolled} enrolled students. "
        f"Grades and averages cover evaluated submissions only."
    )

    stats = (
        '<div class="stats">'
        f'<div><p class="k">Average</p><p class="v">{_fmt(scores.get("average"), "%")}</p></div>'
        f'<div><p class="k">Median</p><p class="v">{_fmt(scores.get("median"), "%")}</p></div>'
        f'<div><p class="k">Lowest</p><p class="v">{_fmt(scores.get("min"), "%")}</p></div>'
        f'<div><p class="k">Highest</p><p class="v">{_fmt(scores.get("max"), "%")}</p></div>'
        f'<div><p class="k">Std dev</p><p class="v">{_fmt(scores.get("stdDev"))}</p></div>'
        "</div>"
    )

    # Card 1 — score distribution, the centrepiece of the reference layout.
    markers = []
    if scores.get("average") is not None:
        markers.append((f'mean {_fmt(scores.get("average"))}', float(scores["average"])))
    hist_card = _card(
        "Score distribution",
        "Students per score band (%). Dashed line: mean.",
        _vbar_svg(histogram, markers=markers),
        f"{counts.get('notEvaluated', 0)} enrolled students not yet evaluated and excluded."
        if counts.get("notEvaluated") else "",
    )

    # Card 2 — grade bands.
    bands = ["Excellent", "Competent", "Developing", "Needs Improvement"]
    grade_rows = [(b, float(grades.get(b, 0) or 0), str(int(grades.get(b, 0) or 0))) for b in bands]
    cutoffs = grades.get("_cutoffs") or {}
    cutoff_note = ""
    if cutoffs:
        cutoff_note = (
            f"Cutoffs: excellent {_fmt(cutoffs.get('excellent'))}%, "
            f"competent {_fmt(cutoffs.get('competent'))}%, "
            f"developing {_fmt(cutoffs.get('developing'))}%."
        )
    grade_card = _card(
        "Grade distribution",
        f"Evaluated students in each band (of {evaluated}).",
        _hbar_svg(grade_rows),
        cutoff_note,
    )

    # Card 3 — where the cohort is in the pipeline.
    pipeline_rows = [
        ("Enrolled", float(enrolled), str(enrolled)),
        ("Submitted", float(submitted), str(submitted)),
        ("Evaluated", float(evaluated), str(evaluated)),
        ("Awaiting evaluation", float(counts.get("notEvaluated") or 0), str(counts.get("notEvaluated") or 0)),
    ]
    pipeline_card = _card(
        "Submission and evaluation",
        "Students at each stage of the pipeline.",
        _hbar_svg(pipeline_rows, scale_max=float(enrolled or 1)),
        "" if submitted >= enrolled else
        f"Reporting on a partial cohort — {enrolled - submitted} students have not submitted.",
    )

    # Card 4 — the only cross-student breakdown that is comparable, since
    # questions are generated per student.
    answers = int(dims.get("answersEvaluated") or 0)
    dim_rows = [
        ("Correctness", float(dims.get("averageCorrectness") or 0), _fmt(dims.get("averageCorrectness"))),
        ("Understanding", float(dims.get("averageUnderstanding") or 0), _fmt(dims.get("averageUnderstanding"))),
    ]
    flagged = int(dims.get("needsReviewCount") or 0)
    dim_card = _card(
        "Marks per answer",
        f"Mean score on each dimension across {answers} evaluated "
        f"{'answer' if answers == 1 else 'answers'}.",
        _hbar_svg(dim_rows, scale_max=5.0),
        f"{flagged} {'answer' if flagged == 1 else 'answers'} flagged for human review."
        if flagged else "Nothing flagged for human review.",
    )

    cards = hist_card + grade_card + pipeline_card + dim_card

    narrative = report.get("narrative")
    if narrative:
        summary = (
            f'<p class="summary">{_esc(narrative)}</p>'
            '<p class="disclaimer">Written by an AI model from the figures above. '
            "The statistics themselves are computed directly, not by the model.</p>"
        )
    else:
        summary = ""

    return _SHELL.format(
        title=_esc(heading),
        css=_CSS,
        source=source,
        heading=_esc(heading),
        subtitle=_esc(subtitle),
        stats=stats,
        cards=cards,
        summary=summary,
    )


def render_report_pdf(report: Dict[str, Any]) -> bytes:
    """
    Render the same one-pager to PDF via WeasyPrint.

    WeasyPrint is a declared dependency but needs native pango/cairo libraries
    that are commonly absent on a dev Mac, so the import is local and the
    failure message says what to install rather than surfacing a bare ImportError.
    """
    try:
        from weasyprint import HTML  # noqa: PLC0415
    except Exception as e:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            "PDF rendering needs WeasyPrint's native libraries "
            "(macOS: `brew install pango cairo gdk-pixbuf libffi`). "
            f"Use the HTML report instead. Underlying error: {e}"
        )
    return HTML(string=render_report_html(report)).write_pdf()
