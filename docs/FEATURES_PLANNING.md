# Features Planning

_Backlog of proposed features not yet scheduled. One section per idea: motivation, trigger, and rough acceptance criteria. Promote to a sprint/PR when picked up._

---

## Backlog

_(empty)_

---

## Shipped

### Auto report generation on ≥10 submissions

**Added:** 2026-07-23 · **Shipped:** 2026-08-04

**Idea:** Automatically generate a summary report for an assessment once submissions from **10 or more students** are complete, instead of requiring a manual run.

**Motivation:**
- The batch-evaluation gate only opened when *every enrolled* student had submitted, which in practice never happened for large cohorts (Quiz 1 sat at 26/395 and never triggered). The first real report had to be built by hand from DynamoDB.
- A count-based threshold (≥10 submitted) is a meaningful sample and fires reliably without waiting on stragglers.

**As built**

`src/main/service/AssessmentReportService.py`.

- **Trigger.** `submit_assessment` spawns a background thread calling `should_generate_on_submit()`, which counts submissions (`Select: COUNT` query filtered on `attribute_exists(submittedAt)`) and computes `milestone = submitted // threshold`. It never blocks the student's submit response.
- **Idempotency.** `claim_milestone()` does a conditional `update_item` on an `ASSESSMENT#{id}` / `REPORT_TRIGGER` marker with `attribute_not_exists(lastMilestone) OR lastMilestone < :m`. Exactly one caller wins per milestone, so concurrent submissions racing the same crossing produce one report — not a read-then-write check, which would race.
- **Regeneration policy.** The original note left this open ("debounce or defined milestones"). Resolved as: **regenerate at each multiple of the threshold** — 10, 20, 30, … That fires at the first crossing as specified, keeps the report fresh as stragglers arrive, and bounds regenerations to `submitted // threshold` rather than one per submission. A stale lower milestone can never re-fire.
- **Configuration.** `autoReportThreshold` (default 10, per assessment) and `autoReport` (default on; set false to opt out). Both are exposed in the create-assessment form's advanced settings. A non-positive threshold also disables.
- **Execution.** New `report_generation` SQS job type — one message per job, not per student. The automatic path goes through the queue; the manual endpoint runs inline since the instructor is waiting on the response.
- **Output.** Counts (enrolled/submitted/evaluated/notEvaluated), score stats (average, median, min, max, std dev), grade distribution seeded with all four bands, a fixed-decile histogram, and correctness-vs-understanding averages with a needs-review count. Stored at `ASSESSMENT#{id}` / `REPORT#LATEST`.
  - Statistics are computed over **evaluated students only** — "Not Evaluated" rows carry a placeholder 0% that would otherwise drag every average down. Both populations are reported in `counts`.
  - Per-question aggregation is deliberately absent: questions are generated per student, so there is no shared question set to average across. The score *dimensions* are the only comparable cross-student breakdown.
  - Reports are **aggregate only** — no student names, emails, or IDs — so they can be exported or pasted into an appendix as-is.
- **Narrative layer (optional).** A short LLM-written prose summary over the finished statistics, via `BEDROCK_MODEL_REPORT` (falls back to `BEDROCK_MODEL_CHAT` when unset). It runs once per report rather than once per answer, so a stronger model than the per-answer evaluator is affordable here. The prompt receives only the aggregates — no student data leaves the building — and forbids inventing figures. Generation is last and failure-tolerant: the numbers are the report, the prose is a convenience, and an LLM outage still saves the report with `narrative: null`.
- **Endpoints.** `GET /api/assessment/{id}/report` (returns `generated: false` when none exists), `POST /api/assessment/{id}/report/generate`, and the formatted one-pager at `GET /api/assessment/{id}/report.html` and `report.pdf`.
- **UI.** `CohortReport.tsx` above the results dashboard on the instructor's Results page — headline stats, a collapsible distribution view, and One-pager / PDF / Refresh buttons.

**One-page format** (`AssessmentReportRenderer.py`)

Follows the house summary layout: source line, `Course Title: Cohort Results Summary (n = N)` heading, a five-stat strip, a 2×2 card grid of distributions, and a closing prose paragraph.

- **Cards:** score distribution (decile histogram with a dashed mean marker), grade distribution, submission-and-evaluation pipeline, and marks per answer (correctness vs understanding). Fixed at four — the reference carries six, but a cohort report only has four distributions worth plotting and padding the grid would make the page look fuller while saying less.
- **Self-contained.** Charts are inline SVG and the CSS is inline; there are no external requests at all (the only URL in the output is the SVG XML namespace, which is an identifier, not a fetch). It renders the same in a browser, as an email attachment, or through WeasyPrint. Fonts are a system humanist-sans stack for the same reason — a webfont would be dropped offline.
- **Verified one page** at A4 with a full 10-bucket histogram, four grade bands, and a five-sentence narrative.
- **PDF** goes through WeasyPrint, already a declared dependency. Its native libraries (pango/cairo) are commonly missing on a dev Mac, so the endpoint returns a 503 naming the `brew install` rather than a bare `ImportError`; the HTML one-pager always works.
- Untrusted text (assessment title, LLM narrative) is escaped exactly once — an early version double-encoded, which would have printed a literal `&amp;` for a course like "Ethics & Law".

**Tests:** `tests/service/test_assessment_report_service.py` (41), `tests/service/test_assessment_report_renderer.py` (22), report cases in `tests/controllers/test_cohort_report.py`, and the report branches in `tests/service/test_sqs_job_dispatcher.py`.

**Known gap:** the threshold defaults to on for assessments created from now on. Assessments created before this shipped carry no `autoReport` field; `should_generate_on_submit` treats absent as enabled, so they will start producing reports on their next submission. That is the intended behaviour but worth knowing if an old assessment suddenly grows a report.
