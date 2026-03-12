# Platform Plan: Oral/Video Assessment Platform

_Written for future Claude instances. This document covers the agreed tech stack, full user story backlog, sprint plan, and cost estimates for the expanded assessment platform._

> **Scale assumption:** Maximum ~20 concurrent students. Infrastructure is sized accordingly — deliberately lightweight. See Section 5 for costs.

---

## 1. What We're Building

An assessment platform where:
- **Instructors** upload student code submissions, AI generates personalised questions + bank questions, they schedule assessment windows, monitor live progress, and review AI-evaluated results with score overrides.
- **Students** receive a signed invitation link, take assessments with text/audio/video responses under per-question time limits, with their webcam recorded for proctoring throughout.

---

## 2. Tech Stack Decisions

These supersede the current implementation where noted.

### Auth
- **Instructors**: Keep existing `PyJWT` + email/password + Google OAuth. Add HTTP-only refresh token cookie (60-min access token, 7-day refresh).
- **Students**: Signed invitation JWT (HS256) generated per-student by instructor portal. Student exchanges it once (single-use, marked `used` in DynamoDB) for a short-lived session JWT stored in `sessionStorage`. No student passwords.

### Database
- **DynamoDB only**: All data — answers, progress, job state, enrollments, results. The existing single-table design is sound and handles 20-student aggregations fine with in-Python aggregation (no separate read model needed at this scale).
- ~~Aurora Serverless v2 Postgres~~ — dropped. Adds $44/month minimum for no benefit at this scale.

### Async Jobs
- **Replace** `BatchJobManager` (in-memory threading — loses state on restart) with:
  - **One SQS Standard Queue** for all async jobs (generation + evaluation)
  - Job state persisted to DynamoDB under `JOB#{jobId}` with 7-day TTL; DynamoDB job state check prevents duplicate evaluations (no FIFO needed at this scale)
  - Worker runs **in the same process** as the API via a background thread pool — no separate container
  - Dead-letter queue after 3 failures

### Video Processing
- **FFmpeg runs inside the worker process** (installed on the EC2 instance). Extracts audio from video answers, passes to Deepgram. No Lambda, no MediaConvert.
- Proctoring chunks (WebM from browser) stored as-is in S3. No server-side transcoding.
- ~~Lambda + FFmpeg layer~~ — dropped.
- ~~AWS MediaConvert~~ — dropped. Adds ~$4.50/assessment for playback normalisation that isn't necessary for a small cohort.

### Real-time Updates
- **SSE via FastAPI `StreamingResponse`**: Replaces polling for job status (generation, evaluation). Worker updates DynamoDB; SSE endpoint streams updates to client. No WebSocket infra needed.

### CDN
- **Direct S3 presigned URLs** (15-min expiry) for audio/video playback. Simple, zero cost.
- ~~CloudFront~~ — dropped. At 20 students, cache hit rates are negligible and the distribution setup/cost is not justified.

### Frontend State
- **Keep Zustand**: Local UI state (recording state, current question index, modal visibility).
- **Add TanStack Query (React Query)**: All server state (assessment list, questions, job status, results). Replaces the manual `useEffect` + `setLoading` + `setError` pattern throughout both apps.

### Forms
- **React Hook Form + Zod**: For all instructor forms (`CreateAssessmentForm`, `BulkUploadCSV`, `UploadStudents`). Zod schemas derived from FastAPI's OpenAPI output where possible.

### Video Recording
- **Raw `MediaRecorder` API** wrapped in a `useVideoRecorder` hook (mirrors existing `AudioRecorder` pattern).
  - `video/webm; codecs=vp8,opus` on Chrome/Firefox/Edge
  - `video/mp4` fallback on Safari
  - Proctoring: `timeslice=30000` auto-chunks every 30 seconds without stopping the recorder

### Testing
- **Backend**: `pytest` + `pytest-asyncio` (already exists) + `moto` (mock DynamoDB/S3/SQS — no real AWS in CI) + `pytest-mock` (Bedrock/Deepgram)
- **Frontend**: Vitest + React Testing Library (add to both oral assessment apps — currently only in `ai-tutor-frontend`)
- **E2E**: Playwright — one critical path: invitation link → take assessment → submit → view results
- **CI**: GitHub Actions; merge blocked on failure

---

## 3. User Story Backlog

### EPIC-1: Assessment Lifecycle

**EPIC-1-1** — Instructor login
- As an instructor, I want to log in with email/password or Google OAuth and get access + refresh tokens
- AC: Invalid credentials return 401 with non-enumerable error; access token 60 min; refresh renews transparently; logout clears both
- **Complexity: S**

**EPIC-1-2** — Create assessment
- As an instructor, I want to create an assessment with title, course, assignment brief, and question count
- AC: Required field validation; saved to DynamoDB with `status=draft`; redirects to assessment detail; unique URL-safe ID
- **Complexity: S**

**EPIC-1-3** — Assessment scheduling window
- As an instructor, I want to set a scheduled window (start + end datetime) or leave it open access
- AC: Student access blocked before start and after end if window set; server enforces on every question fetch and answer submission; assessment status reflects `draft`/`scheduled`/`open`/`closed`; window editable until assessment opens
- **Complexity: M**

**EPIC-1-4** — List assessments
- As an instructor, I want to see all my assessments with status, student count, and due date
- AC: Sorted by creation date desc; other instructors' assessments not visible; shows question count and student count
- **Complexity: S**

**EPIC-1-5** — Delete draft assessment
- As an instructor, I want to delete a draft assessment with confirmation
- AC: Only available for `draft` status; confirmation modal required; all DynamoDB items (enrollments, questions) deleted
- **Complexity: S**

---

### EPIC-2: Student Submission Upload

**EPIC-2-1** — CSV bulk enrolment
- As an instructor, I want to upload a CSV to enrol students (student_id, name, email)
- AC: Case-insensitive header matching; per-row validation errors shown before upload; invalid rows exported as error report; duplicate student IDs rejected; 500 students in <30 seconds
- **Complexity: M**

**EPIC-2-2** — Single student code file upload
- As an instructor, I want to upload one or more code files for a student
- AC: Accepts `.py .js .ts .java .cpp .c .go .rb .txt`; multiple files concatenated with filename headers; 500 KB per file limit; stored in S3 `submissions/{assessmentId}/{studentId}/`; progress bar
- **Complexity: M**

**EPIC-2-3** — Zip archive upload
- As an instructor, I want to upload a zip of all student submissions (one file per student, named by student ID)
- AC: Server-side extraction; matched to enrolled students by filename stem; unmatched files reported as warnings; completes in <60 seconds for 50 students
- **Complexity: L**

**EPIC-2-4** — Assignment brief editor
- As an instructor, I want to write a rich-text assignment brief that the AI uses as context
- AC: Min 50 characters; stored at assessment level; editable before questions are generated; word + character count shown
- **Complexity: S**

---

### EPIC-3: Question Generation and Bank

**EPIC-3-1** — Batch AI question generation
- As an instructor, I want to trigger AI question generation for all enrolled students at once
- AC: Job submitted to SQS; survives server restart; SSE streams per-student progress (`pending` → `running` → `completed/failed`); failed students listed separately; can re-trigger for failed students without affecting successful ones
- **Complexity: L**

**EPIC-3-2** — Question bank
- As an instructor, I want to create a question bank for an assessment with manually-authored or AI-suggested general questions
- AC: Add questions with text, topic tag, difficulty; AI suggests N general questions from brief; bank questions appended to every student's question list; editable before assessment opens; max 20 bank questions
- **Complexity: L**

**EPIC-3-3** — Question preview and editing
- As an instructor, I want to preview, edit, and delete generated questions per student before the assessment opens
- AC: Questions listed per student with type badge and code reference; inline edit + save; delete (min 1 must remain); add manual question for specific student; editing locked once assessment opens
- **Complexity: M**

**EPIC-3-4** — Per-question time limits
- As an instructor, I want to set a time limit per question (overrides assessment default)
- AC: Assessment-level default in seconds; per-question override; student UI shows countdown; timer starts on first load (not revisit); expired timer auto-submits in-progress recording; 0 = no limit
- **Complexity: M**

---

### EPIC-4: Student Assessment Experience

**EPIC-4-1** — Invitation email
- As a student, I want to receive a signed invitation link via email
- AC: Instructor triggers SES send; link contains signed JWT with student_id + assessment_id; valid for window duration or 7 days; single-use (invalidated on exchange); if window not open, student sees countdown; instructor can revoke and reissue
- **Complexity: M**

**EPIC-4-2** — Question-by-question UI with timer
- As a student, I want questions presented one at a time with a countdown timer
- AC: Sequential presentation; can navigate back to previous questions; timer changes orange at 60s, red at 30s; timer starts on first load; progress bar shows answered/total; submit disabled until all answered (tooltip explains why)
- **Complexity: M**

**EPIC-4-3** — Text, audio, and video response modes
- As a student, I want to answer in text, audio, or video format per question
- AC: Three tabs per question; text = textarea 2000 char limit; audio = existing recorder; video = `useVideoRecorder` hook with webcam; mode switch warns existing recording will be discarded; re-recording allowed until final submit; S3 upload progress shown; cannot advance until upload confirmed
- **Complexity: L**

**EPIC-4-4** — Proctoring camera
- As a student, my webcam is recorded continuously throughout my session
- AC: Camera + mic permissions required to start; PiP preview bottom-right with red REC indicator; 30s chunks uploaded to S3 `proctoring/{assessmentId}/{studentId}/chunk_{n}.webm`; chunk manifest stored in DynamoDB; if permission revoked, overlay pauses assessment; footage accessible only to instructor via portal; consent confirmation modal before start
- **Complexity: XL**

**EPIC-4-5** — Submit assessment
- As a student, I want to submit my completed assessment with confirmation
- AC: Available only when all questions answered; confirmation modal lists question count; waits for all pending S3 uploads before marking `submitted`; locked on submit (re-entry shows confirmation screen); submission timestamp recorded
- **Complexity: S**

---

### EPIC-5: AI Evaluation

**EPIC-5-1** — Transcription pipeline
- As the system, audio and video answers are automatically transcribed
- AC: S3 `ObjectCreated` event → SQS → worker → Deepgram (audio); video → FFmpeg Lambda → audio track → Deepgram; transcript stored on `ANSWER#` item; 3 retries with exponential backoff; text answers bypass transcription; per-answer status tracked (`pending/completed/failed`)
- **Complexity: L**

**EPIC-5-2** — Instructor-triggered batch evaluation
- As an instructor, I want to trigger AI evaluation of all submitted responses
- AC: Available once ≥1 student has submitted; SQS FIFO job per student (deduplication); SSE streams per-student progress; each question scored on correctness (0-10), understanding (0-10), communication (0-10); structured feedback: overall comment + strengths[] + improvements[]; results in DynamoDB `EVALUATION#{questionId}`; failed evaluations retried once then marked `failed`
- **Complexity: L**

**EPIC-5-3** — Auto-evaluation on full submission
- As the system, evaluation starts automatically when all students have submitted
- AC: Last student submission triggers evaluation jobs; only if `auto_evaluate=true` (default); instructor notified via SES on completion; instructor can still manually re-trigger afterwards
- **Complexity: M**

**EPIC-5-4** — Custom evaluation rubric
- As an instructor, I want to provide a rubric that the AI uses when evaluating responses
- AC: Free-text rubric field on assessment (min 20 chars if provided); injected into evaluation prompt; editable before evaluation runs; default rubric used if none provided; rubric shown on results page for transparency
- **Complexity: S**

---

### EPIC-6: Results and Dashboards

**EPIC-6-1** — Instructor class-level results dashboard
- As an instructor, I want to see all students' scores in a sortable table with class analytics
- AC: Table: name, score %, grade, submission time, evaluation status; sortable by score/name/time; class average + median + score distribution histogram; click row → per-student detail; auto-refreshes on evaluation completion (SSE); CSV export
- **Complexity: L**

**EPIC-6-2** — Per-student results with override
- As an instructor, I want to review a student's answers with playback, transcript, and AI scores — and override them
- AC: Per-question: question text, response mode badge, transcript, AI score breakdown, feedback; inline audio/video playback (CloudFront-signed URL); instructor can override score (0-10) + add comment; overall score recalculates; proctoring footage accessible in collapsible section
- **Complexity: L**

**EPIC-6-3** — Student results page
- As a student, I want to see my results and per-question feedback after evaluation
- AC: Visible only after instructor releases (`Release Results` toggle); shows overall score, grade, per-question feedback + strengths/improvements; playback of own recordings; PDF download; before release shows "results pending" with expected availability
- **Complexity: M**

**EPIC-6-4** — Live assessment progress monitor
- As an instructor, I want to see live per-student progress during an active assessment
- AC: Per-student row: not started / in progress (N/M answered) / submitted; auto-refreshes every 30s or SSE push; "Send reminder" button per student triggers SES email; students inactive >30 min flagged; assessment window time remaining shown prominently
- **Complexity: M**

---

### EPIC-7: Platform Hardening

**EPIC-7-1** — SQS job queue + DynamoDB job persistence
- As a developer, async jobs survive server restarts
- AC: `BatchJobManager` in-memory threading fully replaced; all job state in DynamoDB `JOB#{jobId}` with 7-day TTL; single SQS Standard queue for all jobs; worker runs in-process via thread pool; DynamoDB state check prevents duplicate evaluations; DLQ after 3 failures; job status API reads DynamoDB
- **Complexity: L**

**EPIC-7-2** — Structured logging + CloudWatch alarms
- As a developer, all errors are searchable and alertable in production
- AC: JSON logs with `timestamp, level, service, job_id, assessment_id, student_id, message`; FastAPI middleware logs method/path/status/duration; CloudWatch Log Groups with 30-day retention (Terraform-managed); CloudWatch Alarm on >5% error rate over 5 min; local dev uses pretty-print
- **Complexity: M**

**EPIC-7-3** — Test suite + CI enforcement
- As a developer, regressions are caught before deployment
- AC: Backend ≥80% coverage on service/controller layers; `moto` mocks for all DynamoDB/S3/SQS; `pytest-mock` for Bedrock/Deepgram; Vitest + Testing Library for both oral assessment frontends; Playwright E2E: invitation link → text answer assessment → submit → view results; GitHub Actions blocks merge on failure
- **Complexity: XL**

**EPIC-7-4** — Student invitation token auth
- As a developer, students authenticate securely without passwords
- AC: Per-student signed JWT with `student_id, assessment_id, exp` claims; exchanged via `POST /api/auth/student/exchange` for session JWT; session stored in `sessionStorage`; invitation is single-use (marked `used` in DynamoDB); all student endpoints validate `student_id` claim matches resource; instructor can revoke + reissue
- **Complexity: M**

**EPIC-7-5** — Terraform for new infrastructure
- As a developer, all new AWS components are reproducible and version-controlled
- AC: Resources added for SQS (standard queue + DLQ), CloudWatch log groups + alarms, SES configuration; EC2 instance + security group; FFmpeg installed via user-data script; all names parameterised via `variables.tf`; `terraform plan` shows zero diff after fresh `apply`
- **Complexity: M**

---

## 4. Sprint Plan

9 × 2-week sprints (~18 weeks).

| Sprint | Theme | Stories | Key Gate |
|--------|-------|---------|---------|
| **1** | Foundation Hardening | 7-1, 7-4, 1-1 | Job state survives restart; student can exchange invite token |
| **2** | Assessment Lifecycle + Infra | 1-2, 1-3, 1-4, 1-5, 7-5 | Instructor can create/schedule/list/delete; SQS queue + EC2 provisioned via Terraform |
| **3** | Submission Upload | 2-1, 2-2, 2-3, 2-4 | 50-student zip upload works; submissions in S3 |
| **4** | Question Generation + Bank | 3-1, 3-2, 3-4 | Per-student questions generated via SQS worker; bank questions mixed in |
| **5** | Core Student Experience | 4-1, 4-2, 4-3 (text+audio), 4-5 | Student takes full assessment end-to-end in text or audio |
| **6** | Video + Proctoring | 4-3 (video), 4-4 | Student records video answer; proctoring chunks in S3 |
| **7** | AI Evaluation Pipeline | 5-1, 5-2, 5-3, 5-4 | Transcription → evaluation → scores fully automated |
| **8** | Results Dashboards | 6-1, 6-2, 6-3, 6-4 | Instructor sees class results; student sees feedback; PDF export works |
| **9** | Quality + Observability | 3-3, 7-2, 7-3 | CI enforced; CloudWatch alerts live; Playwright E2E passing |

Sprint 6 is intentionally narrow — video recording and proctoring are both large and need full focus.

---

## 5. Cost Estimates

All estimates in USD. Assumes AWS `us-east-1`. Pricing as of mid-2025. **Sized for max ~20 concurrent students.**

### Infrastructure Dropped vs Original Plan

| Component | Reason Dropped | Saving |
|-----------|---------------|--------|
| Aurora Serverless v2 Postgres | DynamoDB handles 20-student aggregations fine | ~$44/month |
| CloudFront | Direct S3 presigned URLs sufficient at this scale | ~$1–5/month |
| AWS MediaConvert | FFmpeg in worker process is adequate | ~$4.50/assessment |
| Lambda (FFmpeg layer) | Folded into worker process | negligible |
| ECS Fargate (separate worker) | Worker runs in-process on same EC2 instance | ~$7/month |
| SQS FIFO queue | Standard queue + DynamoDB deduplication sufficient | negligible |

### Per-Assessment Variable Costs (20 students, 8 questions each)

| Component | Assumption | Cost |
|-----------|-----------|------|
| Bedrock Nova Lite — question generation | 20 students × 3K input + 1K output tokens | ~$0.01 |
| Bedrock Nova Lite — evaluation | 20 × 8 questions × 1.5K input + 400 output tokens | ~$0.02 |
| Deepgram transcription (audio answers) | 20 students × 8 questions × 2 min avg = 320 min | ~$1.38 |
| Deepgram (video answers, 20% use video) | 4 students × 8 questions × 2 min | ~$0.28 |
| FFmpeg audio extraction (in-process) | Runs on EC2; no incremental cost | $0 |
| S3 storage — audio answers | 20 × 8 × 3 MB = 480 MB | ~$0.01 |
| S3 storage — video answers | 32 answers × 20 MB = 640 MB | ~$0.01 |
| S3 storage — proctoring chunks | 20 students × 30 min × 1 MB/min = 600 MB | ~$0.01 |
| SES emails | ~60 emails | <$0.01 |
| SQS messages | ~100 messages | <$0.01 |
| **Total per assessment** | | **~$1.70** |

Audio-only assessment (no video): **~$1.40**

### Fixed Monthly Infrastructure Costs

| Component | Spec | Monthly Cost |
|-----------|------|-------------|
| EC2 t3.small (API + worker, 24/7) | 2 vCPU, 2 GB RAM | ~$15 |
| DynamoDB (on-demand) | Baseline at rest | ~$2 |
| S3 storage (accumulating media) | ~5 GB/month growth | ~$0.12 |
| CloudWatch | Log ingestion baseline | ~$2 |
| SQS | Queue at rest | <$1 |
| **Total fixed / month** | | **~$19–20/month** |

> Scale up to `t3.medium` (~$30/month) if video processing (FFmpeg) causes CPU contention during active assessments.

### Total Monthly Cost (20-student scale)

| Usage | Assessments/Month | Fixed | Variable | **Total** |
|-------|------------------|-------|---------|-----------|
| Light (1 assessment) | 1 | ~$20 | ~$2 | **~$22/month** |
| Moderate (5 assessments) | 5 | ~$20 | ~$9 | **~$29/month** |
| Heavy (20 assessments) | 20 | ~$20 | ~$34 | **~$54/month** |

### Scaling Up Later

If the platform grows beyond 20 students, the incremental additions in order of priority:
1. **Separate worker process** (second EC2 or ECS task) — when FFmpeg/LLM calls block the API under load
2. **CloudFront** — when S3 egress for media playback becomes measurable
3. **Aurora Serverless v2** — when cross-assessment analytics queries become unwieldy
4. **MediaConvert + Lambda** — when video transcoding needs to run at scale without tying up the API

### Dominant Cost: Deepgram

Deepgram transcription is ~80% of variable cost at this scale. It remains ~5× cheaper than AWS Transcribe ($0.0043/min vs $0.024/min) — keep it. If spend grows: negotiate a Deepgram volume discount at $500+/month.

---

## 6. Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| MediaRecorder unreliable on slow connections | High | High | Zustand upload queue with per-chunk retry; `beforeunload` warning if uploads pending; S3 multipart for large video |
| Proctoring storage costs grow unexpectedly | Medium | Medium | MediaConvert to 500 Kbps H.264; S3 lifecycle to Glacier after 90 days |
| Bedrock evaluation latency (240 LLM calls per 100-student assessment ~12 min sequential) | High | Medium | SQS worker processes students in parallel (configurable concurrency); Bedrock provisioned throughput |
| Aurora Serverless v2 cold start delays on first query | Medium | Low | Keep a warm connection via a lightweight heartbeat Lambda; or use RDS t3.micro (no cold start) |
| Safari MediaRecorder `video/webm` unsupported | High | Medium | Feature-detect and fall back to `video/mp4` in `useVideoRecorder`; send MIME type to presign endpoint |
| Student invitation link forwarding (identity spoofing) | Low | High | Single-use token exchange; session bound to `student_id` claim; IP binding optional for high-stakes assessments |
| In-memory job loss (current) | High (already occurring) | High | **Sprint 1 priority — SQS + DynamoDB job state** |
