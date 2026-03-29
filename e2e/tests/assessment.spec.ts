/**
 * E2E critical path — Student assessment flow:
 *   1. Landing page link entry
 *   2. Consent modal
 *   3. Pre-assessment overview
 *   4. Written answer → Submit Answer → advance to Q2
 *   5. Submit Assessment + confirmation modal
 *   6. Results page
 *
 * All API calls are intercepted by page.route() so no real backend is needed.
 */

import { test, expect } from '@playwright/test';
import { setupStudentMockApi, mockJwt } from './helpers/mockApi';

const STUDENT_BASE = 'http://localhost:5176';
const STUDENT_ID = 'stu-e2e-001';
const ASSESSMENT_ID = 'asmt-e2e-001';

async function injectStudentSession(page: import('@playwright/test').Page) {
  const token = mockJwt({ sub: STUDENT_ID });
  await page.addInitScript(([sid, aid, tok]) => {
    sessionStorage.setItem('studentToken', tok);
    sessionStorage.setItem('authToken', tok);
    sessionStorage.setItem('studentId', sid);
    sessionStorage.setItem('assessmentId', aid);
  }, [STUDENT_ID, ASSESSMENT_ID, token]);
}

// ─── Student: Results viewing ────────────────────────────────────────

test.describe('Student assessment results', () => {
  test.beforeEach(async ({ page }) => {
    await setupStudentMockApi(page, { studentId: STUDENT_ID, assessmentId: ASSESSMENT_ID });
    // Override progress to return 'submitted' so ViewResults shows the results page
    await page.route(
      `**/api/student/${STUDENT_ID}/assessment/${ASSESSMENT_ID}/progress`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ answeredQuestions: 2, totalQuestions: 2, status: 'submitted' }),
        });
      }
    );
    await injectStudentSession(page);
  });

  test('student can view results after submission', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/results/${ASSESSMENT_ID}`);

    await expect(page.getByText('Assessment Results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('(70%)')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Competent')).toBeVisible();
    await expect(page.getByText('Question Details')).toBeVisible();
  });

  test('results page shows pending when not released', async ({ page }) => {
    // Override results to return a 403 (not released)
    await page.route(
      `**/api/student/${STUDENT_ID}/assessment/${ASSESSMENT_ID}/results`,
      async (route) => {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Results not released yet' }),
        });
      }
    );

    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/results/${ASSESSMENT_ID}`);

    await expect(page.getByText('Results Pending Release')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Student: Full assessment-taking flow ────────────────────────────

test.describe('Student assessment-taking flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupStudentMockApi(page, { studentId: STUDENT_ID, assessmentId: ASSESSMENT_ID });
    await injectStudentSession(page);
  });

  test('consent modal → overview → answer Q1 → Q2 → submit', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/${ASSESSMENT_ID}`);

    // 1. Consent modal appears first
    await expect(page.getByRole('heading', { name: 'Proctoring' })).toBeVisible({ timeout: 10_000 });

    // Decline proctoring to proceed without camera
    await page.getByRole('button', { name: /continue without recording/i }).click();

    // 2. Pre-assessment overview
    await expect(page.getByText('E2E Test Assessment')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('COMP9021')).toBeVisible();

    await page.getByRole('button', { name: /start assessment/i }).click();

    // 3. Question 1 — written mode (text appears in both banner and body, scope to banner)
    await expect(page.getByRole('banner').getByText('Question 1 of 2')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Explain your implementation approach.')).toBeVisible();

    // 4. Type a sufficient text answer
    const textarea = page.getByPlaceholder('Type your answer here...');
    await textarea.fill(
      'I used a recursive approach with dynamic programming and memoization to achieve optimal performance.'
    );

    // Submit the answer — store calls API then auto-advances via loadQuestions()
    await page.getByRole('button', { name: /submit answer/i }).click();

    // 5. Question 2 appears automatically after the store reloads from server
    await expect(page.getByRole('banner').getByText('Question 2 of 2')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('What are the time complexity trade-offs?')).toBeVisible();

    // Answer Q2
    const textarea2 = page.getByPlaceholder('Type your answer here...');
    await textarea2.fill(
      'The time complexity is O(n log n) for the merge sort approach, with O(n) space complexity.'
    );
    await page.getByRole('button', { name: /submit answer/i }).click();

    // 6. After Q2 submitted, "Submit Assessment" appears (Q2 is the last question)
    await expect(
      page.getByRole('button', { name: /submit assessment/i })
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /submit assessment/i }).click();

    // 7. Confirmation modal
    await expect(page.getByText('Submit Assessment?')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/your assessment will be sent for evaluation/i)).toBeVisible();

    // Confirm submission — button text is just "Submit" inside the modal
    await page.getByRole('button', { name: /^submit$/i }).click();

    // 8. Navigate to results page
    await expect(page.getByText('Assessment Results')).toBeVisible({ timeout: 15_000 });
  });

  test('consent modal shows proctoring info', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/${ASSESSMENT_ID}`);

    await expect(page.getByRole('heading', { name: 'Proctoring' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/webcam proctoring/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /i consent/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue without recording/i })).toBeVisible();
  });

  test('text answer submit button disabled until minimum characters reached', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/${ASSESSMENT_ID}`);

    await page.getByRole('button', { name: /continue without recording/i }).click();
    await page.getByRole('button', { name: /start assessment/i }).click();

    await expect(page.getByPlaceholder('Type your answer here...')).toBeVisible({ timeout: 10_000 });

    // Too short
    await page.getByPlaceholder('Type your answer here...').fill('Short');
    await expect(page.getByRole('button', { name: /submit answer/i })).toBeDisabled();

    // Should show characters needed
    await expect(page.getByText(/more characters needed/)).toBeVisible();
  });

  test('question timer is visible', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/${ASSESSMENT_ID}`);

    await page.getByRole('button', { name: /continue without recording/i }).click();
    await page.getByRole('button', { name: /start assessment/i }).click();

    // Timer should be displayed (300 seconds = 5:00)
    await expect(page.locator('[role="timer"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('5:00')).toBeVisible();
  });

  test('progress tracker shows current question number', async ({ page }) => {
    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/${ASSESSMENT_ID}`);

    await page.getByRole('button', { name: /continue without recording/i }).click();
    await page.getByRole('button', { name: /start assessment/i }).click();

    // "Question 1 of 2" appears in both header and body — scope to the header
    await expect(page.getByRole('banner').getByText('Question 1 of 2')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Student: Landing page ──────────────────────────────────────────

test.describe('Student landing page', () => {
  test('shows platform heading and link input', async ({ page }) => {
    await page.goto(STUDENT_BASE);

    await expect(page.getByText('Oral Assessment Platform')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/paste your assessment link/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /go/i })).toBeVisible();
  });
});
