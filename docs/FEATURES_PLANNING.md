# Features Planning

_Backlog of proposed features not yet scheduled. One section per idea: motivation, trigger, and rough acceptance criteria. Promote to a sprint/PR when picked up._

---

## Auto report generation on ≥10 submissions

**Added:** 2026-07-23

**Idea:** Automatically generate a summary report for an assessment once submissions from **10 or more students** are complete, instead of requiring a manual run.

**Motivation:**
- The current batch-evaluation gate only opens when *every enrolled* student has submitted, which in practice never happens for large cohorts (e.g. Quiz 1 sat at 26/395 and never triggered). The first real report had to be built by hand from DynamoDB.
- A count-based threshold (≥10 submitted) is a meaningful sample and fires reliably without waiting on stragglers.

**Trigger:**
- On each student submission, check the count of completed submissions for the assessment; when it crosses 10, enqueue a report-generation job (once — guard against re-firing on every later submission; consider regenerating on a debounce or at defined milestones instead).

**Rough acceptance criteria:**
- Report generates automatically once the 10th submission lands, with no instructor action.
- Fires at most once per threshold crossing (idempotent), not per-submission.
- Output is the summary dashboard (distributions + averages) we currently produce manually.
- Configurable threshold (default 10) per assessment.

**Related:** ties into the per-student auto-evaluation on submit (PR #5) and the batch-eval gate logic; see `autoeval_preset_gap` notes.
