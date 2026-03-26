# UX Issues — Oral Assessment Platform

Identified via Playwright browser testing + full code audit. Ordered roughly by severity / user impact.

---

## INSTRUCTOR APP

### I-1. "Due Date" is ambiguous and access modes are not exposed
**Severity: High**

- The Create Assessment form has a single `Due Date` field. It is unclear whether this enforces a hard cutoff (students can't open the link after that time) or is purely informational.
- The backend has `accessMode: 'open' | 'scheduled'` and `scheduledWindowStart / scheduledWindowEnd` fields but these are **never surfaced in the UI**. Instructors can only ever create open-access assessments.
- There is no way for an instructor to set a fixed exam window (e.g. "open from 2pm–4pm on Thursday only").
- The `scheduledWindowStart/End` fields are orphaned infrastructure with no UI.

**To address:** Expose `accessMode` as a radio/toggle on the Create form. When "Scheduled" is chosen, show start and end datetime pickers. Clarify what "Due Date" enforces — if it's a soft display-only deadline, label it accordingly. If it is enforced, the backend must validate it.

---

### I-2. Error state and empty state shown simultaneously on Assessment List
**Severity: High**

When the API call fails (network error, bad token, backend down), the page shows a red "Network Error" banner **and simultaneously** "No assessments yet / Create Your First Assessment". These directly contradict each other — an instructor cannot tell whether the load failed or they genuinely have no assessments.

**To address:** When an error is present, suppress the empty-state message entirely. Show only the error with a Retry button.

---

### I-3. Enrollment count on assessment cards is wrong
**Severity: Medium**

`statsCache` is populated via `getAssessmentProgress`, which returns only students who have *started* the assessment — not the total enrolled count. Cards therefore display `👥 0 enrolled` for assessments that have students uploaded but not yet started. The correct enrollment count should come from `getAssessmentStudents` (or a dedicated count endpoint).

**To address:** Fetch enrollment count from `getAssessmentStudents` (or include it in the `listAssessments` response). Keep progress stats separate from enrollment count.

---

### I-4. SetupStepIndicator step 1 always links to `/assessments/create`
**Severity: Medium**

On steps 2–4, clicking the completed "Create" step navigates to `/assessments/create` — which creates a **new** assessment, abandoning the current one. The completed step should link back to the assessment's own detail/overview, not to the create form.

**To address:** Step 1 completed link should go to `/assessments` (or a future assessment-detail page), not `/assessments/create`.

---

### I-5. "Questions" button navigates to the generation trigger page, not a question list
**Severity: Medium**

The "Questions" button on each assessment card navigates to `/assessments/${id}/generate`, which shows a "Generate Questions" job-trigger UI. If questions have already been generated, the instructor has no way to view or edit them from the list — they must go Monitor → find a student → navigate to that student's question editor. There is no browsable list of generated questions.

**To address:** Create a questions overview page (or repurpose the Generate page post-generation) that lists students and links to their individual question sets. The "Questions" button should navigate there.

---

### I-6. No way to set or edit the assignment brief from the UI
**Severity: Medium**

Question generation quality depends on an assignment brief. The `UpdateBriefRequest` endpoint exists (`PATCH /assessment/:id/brief`) but is never surfaced in the instructor UI. If no brief is set, the instructor gets no warning before triggering generation, and there is no feedback explaining why generated questions might be poor.

**To address:** Add a brief editor on the Generate Questions page (or UploadStudents step). Show a warning if brief is empty before allowing generation to start.

---

### I-7. "Completed" and "Submitted" are two distinct statuses in the filter but merged in the stats card
**Severity: Medium**

The status filter dropdown offers both "Completed" and "Submitted" as separate options. The summary stats card collapses them into one "Completed" count. An instructor filtering by "Completed" will miss students with status "submitted", creating the appearance that fewer students are done. These two statuses are indistinguishable from the instructor's perspective.

**To address:** Either merge these into a single "Submitted" status throughout, or add a tooltip/footnote explaining the difference. The filter options and the stats card must agree.

---

### I-8. "Evaluate" button reappears after page refresh for already-evaluated students
**Severity: Medium**

The `evalProgress` state that gates the "Evaluate" button is transient session state — it resets on page refresh. After a reload, every completed student shows the "Evaluate" button again, even those fully evaluated. There is no persistent evaluated state pulled from the backend.

**To address:** The backend tracks evaluation status per question. Surface this in the progress response, or add an `evaluated: boolean` field to `StudentProgress`. Use this to hide the Evaluate button for already-evaluated students.

---

### I-9. "Release Results" shows no current state — button always appears regardless of prior release
**Severity: Medium**

`AssessmentResponse.resultsReleased: bool` exists in the backend but is never fetched or displayed in `ResultsDashboard`. An instructor who already released results sees the same "Release Results" button on every visit with no indication that results are already live to students.

**To address:** Fetch `resultsReleased` from the assessment metadata and display the current state. Change the button to "Results Released ✓" (disabled or with an undo affordance) when already released.

---

### I-10. ResultsDashboard shows "No Results Available" before the API call completes
**Severity: Medium**

The `if (results.length === 0)` guard runs immediately on mount using the initial Zustand state (an empty array). The loading spinner is never shown — the user sees the empty state, then it switches to data. This is particularly jarring when navigating between assessments (stale data from the previous assessment may flash first).

**To address:** Add an explicit `isLoading` check before the empty-state guard. Show a spinner while loading, show "No Results" only after a successful empty response.

---

### I-11. Student result detail page is unreachable from the results dashboard
**Severity: Medium**

`StudentResultDetail` exists at `/assessments/:id/student/:studentId/results` and contains per-question audio, transcripts, AI scores, and instructor override controls. However the `ResultsDashboard` table has no link or button to reach it — there is no drill-down from the results list. The route is orphaned.

**To address:** Add a "View Details" link/button on each row of the results table that navigates to the student detail page.

---

### I-12. QuestionEditor is unreachable from the normal instructor flow
**Severity: Medium**

`QuestionEditor` is at `/assessments/:assessmentId/questions/:studentId`. Nothing in the current navigation links there. The Monitor Progress table has no "Edit Questions" action per student. The route exists but cannot be reached without manually typing the URL.

**To address:** Add an "Edit Questions" action to each row in the Monitor Progress student table (or in the Generate Questions post-generation view).

---

### I-13. No confirmation or visual feedback when a reminder email is sent
**Severity: Low**

`handleSendReminder` completes silently — no toast, no inline confirmation, no visual change on the button. The instructor has no confirmation the email was sent (or that it failed).

**To address:** Show a success toast or inline "Sent ✓" state on the button for 3 seconds after a successful send. Show an error toast on failure.

---

### I-14. Zustand store state persists across navigation between different assessments
**Severity: Low**

The instructor app uses a single global store. Navigating from Assessment A → Results → Back → Assessment B → Results causes `results` to still hold Assessment A's data during Assessment B's initial render, producing a flash of stale data or incorrectly showing "No Results Available".

**To address:** Clear `results`, `progress`, and `students` from the store when `assessmentId` changes (in the relevant page `useEffect` hooks, reset store state before loading new data).

---

### I-15. "Cancel" on Create Assessment navigates to `/` instead of `/assessments`
**Severity: Low**

The Cancel button calls `navigate('/')` which redirects via the root redirect to `/assessments`. While functionally equivalent, this is semantically wrong and adds a redirect hop. Direct navigation to `/assessments` is cleaner.

**To address:** Change `navigate('/')` to `navigate('/assessments')`.

---

### I-16. No "forgot password" link on the login page
**Severity: Low**

The login form has no password recovery path. The backend has SES email infrastructure for password reset (documented in `AUTH_CURRENT_STATE_AND_PLAN.md`) but no UI link exists.

**To address:** Add a "Forgot password?" link below the sign-in button that triggers the password reset flow.

---

## STUDENT APP

### S-1. Consent modal appears before questions are validated / backend is reachable
**Severity: High**

The `ConsentModal` renders immediately on mount (`!consentGiven`) — before questions are fetched, before the assessment is validated, before any backend response. A student with a broken or expired link will: see consent modal → click through → see the pre-assessment overview → only then hit an error. They have consented to proctoring for an assessment they cannot take.

**To address:** Only show the consent modal after `questions.length > 0` (i.e. the assessment has loaded successfully). Show a loading spinner or error state first.

---

### S-2. PreAssessmentOverview silently skips if `assessment` object is null
**Severity: High**

The overview renders only when `consentGiven && !assessmentStarted && assessment`. If `assessment` is null when consent is given (the `loadQuestions` response hasn't populated it yet, or it's a race condition), the overview never shows and the student is taken directly to question 1. There is no fallback or loading state.

**To address:** Gate `assessmentStarted` correctly — if `assessment` is null after consent, wait for it (show a spinner) rather than skipping the overview.

---

### S-3. Assessment content is accessible behind the consent modal (no `inert`)
**Severity: Medium**

The consent modal uses `z-50` overlay but the assessment body (header, progress tracker, question content) is fully rendered underneath. Screen readers can navigate to the background content, and keyboard focus can escape the modal's trap in some cases. The background is not `inert`.

**To address:** Apply `aria-hidden="true"` and/or the HTML `inert` attribute to the main content container while the consent modal is open.

---

### S-4. Network errors and "invalid link" errors show the same message
**Severity: Medium**

When a student opens a malformed link (wrong UUID, wrong student ID), they see "No response from server. Please check your connection." — identical to a network outage. A 404 from the backend is indistinguishable from a connectivity failure. The student cannot tell whether the problem is their link, the server, or their internet.

**To address:** Differentiate 404 responses ("Assessment not found — please check your link") from network-level failures ("Could not reach the server — please check your connection"). The API error handling layer should propagate HTTP status codes.

---

### S-5. ResultsCard displays raw score as a percentage with wrong colour thresholds
**Severity: High**

```ts
const scorePercentage = Math.round(result.totalScore); // e.g. 7
```

`totalScore` is a raw score (0–10), not a percentage. The badge shows "7%" and the colour scale (`≥90` = green, `≥70` = blue) is percentage-based — so a student who scored 7/10 (70%, a solid result) is shown "7%" in red. Both the label and the colour are wrong.

**To address:** Calculate the percentage correctly: `Math.round((result.totalScore / (result.maxScore ?? 10)) * 100)`. Use this for both the display value and colour thresholds.

---

### S-6. Results page score layout is confusing — percentage, grade, total score, max score are unconnected
**Severity: Medium**

The results overview shows: a large `{results.percentage}%`, a grade badge, then separately "Total Score / Max Score / Questions" as three detached numbers. The relationship between the percentage and total/max scores is not explained. Students who received fractional scores (e.g. 58.3/80) may be confused why the numbers don't obviously compute.

**To address:** Present as a single coherent unit: e.g. "58 / 80 (72%) — Competent". The grade and percentage should be co-located with the score fraction.

---

### S-7. Timer does not check recording state before auto-advancing
**Severity: Medium**

When the timer expires, `handleTimerExpire` checks for a `recordedBlob` to submit. But if the student is *mid-recording* (recording has started but hasn't been stopped yet — `isRecording: true`, `recordedBlob: null`), neither submit branch fires and the student is silently bumped to the next question with no answer captured and no warning.

**To address:** In `handleTimerExpire`, if `isRecording` is true, stop the recording first (await `stopRecording()`), then submit the resulting blob.

---

### S-8. Two competing "Submit Assessment" affordances on the last question
**Severity: Low**

When all questions are answered and the student is on the last question, they see:
1. The green "All questions answered — ready to submit?" banner at the top
2. The "Submit Assessment" button in the navigation row at the bottom

Two triggers for the same action on the same view creates visual noise and uncertainty about which is the "right" one to use.

**To address:** On the last question, hide the navigation-row submit button when the all-answered banner is visible, or vice versa. One clear CTA is enough.

---

### S-9. "All answered" submit banner and navigation warning dialog can stack
**Severity: Low**

If `pendingNavIndex !== null` (unsaved answer warning is showing) and the student also triggers the submit modal, both dialogs can be simultaneously visible. There is no exclusivity check between these two states.

**To address:** Gate the submit modal: don't allow it to open while `pendingNavIndex !== null`. Alternatively, dismiss the pending nav warning when the submit modal opens.

---

### S-10. Header shows raw student ID, not student name
**Severity: Low**

The assessment header displays "Student s12345". Students never know their own technical ID — they receive a link. Their name is never shown anywhere in the student app. This is disorienting if they share a device with another student.

**To address:** The student's name is available in the backend (stored in the enrollment record). Include it in the questions API response or a dedicated student-info endpoint, and display it in the header.

---

### S-11. ProctorCamera PiP cannot be dismissed, minimised, or repositioned
**Severity: Low**

The camera widget is fixed at `bottom-4 right-4` at 160×120px. On mobile or small viewports it overlaps answer controls. Students cannot move, minimise, or temporarily hide it even when it obscures content.

**To address:** Allow the PiP to be minimised to a small dot (with expand-on-hover), or make it draggable. At minimum, ensure it doesn't overlap interactive controls at any common viewport size.

---

### S-12. Text answer input gives no feedback about minimum length requirement
**Severity: Low**

`TextAnswerInput` silently blocks submission if the text is under 20 characters. There is no character counter, no minimum-length indicator, and no error message explaining why the Submit button doesn't respond.

**To address:** Show a character counter beneath the textarea (e.g. "42 characters — minimum 20"). Enable the submit button from 20 characters onward, or show an inline error message on attempted submission below the threshold.

---

## CROSS-CUTTING

### X-1. App title is "C9 Oral Assessment" — internal codename exposed to users
**Severity: Low**

Both apps set `<title>C9 Oral Assessment</title>`. "C9" appears to be an internal project codename that surfaces in browser tabs, bookmarks, OS task switchers, and screen-reader announcements.

**To address:** Change the HTML title (and any `<meta name="application-name">`) in both `index.html` files to the product's real name.

---

### X-2. Student link format and delivery mechanism are never explained
**Severity: Low**

The student app's default page says "paste your assessment link" but gives no indication of: what format the link is in, who sends it (email? LMS?), or what it looks like. Students with a broken link see a generic network error with no guidance.

**To address:** Add a brief "Your instructor will email you a link that looks like: `https://…/s12345/assess/uuid`" explanation. Consider adding a help contact or support email.

---

*30 issues total. Grouped: Instructor (16), Student (12), Cross-cutting (2).*
