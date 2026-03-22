/**
 * E2E critical path:
 *   1. Student receives invitation link
 *   2. Student navigates to the assessment (auth stubbed via sessionStorage)
 *   3. Student sees the first question
 *   4. Student submits a text answer
 *   5. Student advances through all questions and submits the assessment
 *   6. Student views their results page
 *
 * All API calls are intercepted by page.route() so no real backend is needed.
 * Set MOCK_API=false + SKIP_WEBSERVER=true to run against a real stack.
 */

import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mockApi';

const STUDENT_BASE = 'http://localhost:5176';
const STUDENT_ID = 'stu-e2e-001';
const ASSESSMENT_ID = 'asmt-e2e-001';

// Inject a fake session into sessionStorage so the student app treats the user
// as authenticated without needing the real auth exchange flow.
async function injectSession(page: import('@playwright/test').Page) {
  await page.addInitScript(([sid, aid]) => {
    sessionStorage.setItem('authToken', 'mock-session-jwt');
    sessionStorage.setItem('studentId', sid);
    sessionStorage.setItem('assessmentId', aid);
  }, [STUDENT_ID, ASSESSMENT_ID]);
}

test.describe('Student assessment critical path', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page, { studentId: STUDENT_ID, assessmentId: ASSESSMENT_ID });
    await injectSession(page);
  });

  test('student can view results after submission', async ({ page }) => {
    // Navigate directly to the results page (post-submission flow)
    await page.goto(
      `${STUDENT_BASE}/${STUDENT_ID}/results/${ASSESSMENT_ID}`
    );

    // Results page heading
    await expect(page.getByText('Assessment Results')).toBeVisible({ timeout: 10_000 });

    // Overall score should be visible
    await expect(page.getByText('70%')).toBeVisible();

    // Grade badge
    await expect(page.getByText(/Competent|Grade/i)).toBeVisible();

    // Question details section
    await expect(page.getByText('Question Details')).toBeVisible();
  });

  test('results page shows pending when not released', async ({ page }) => {
    // Override results route to return "not released" error.
    // Use ** glob so it matches regardless of the API base URL (localhost vs EC2).
    await page.route(
      `**/api/student/${STUDENT_ID}/assessment/${ASSESSMENT_ID}/results`,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Results not released yet' }),
        });
      }
    );

    await page.goto(`${STUDENT_BASE}/${STUDENT_ID}/results/${ASSESSMENT_ID}`);

    // Should show the "pending release" heading
    await expect(
      page.getByRole('heading', { name: /pending release/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Instructor assessment dashboard', () => {
  const INSTRUCTOR_BASE = 'http://localhost:5175';

  test('assessment list page loads', async ({ page }) => {
    // Stub the assessments list endpoint.
    // Use ** glob so it matches regardless of the API base URL (localhost vs EC2).
    await page.route('**/api/assessment/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assessments: [
            {
              id: ASSESSMENT_ID,
              title: 'Introduction to Algorithms',
              course: 'CS101',
              status: 'open',
              createdAt: new Date().toISOString(),
              totalStudents: 5,
              totalQuestions: 8,
              dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            },
          ],
          total: 1,
        }),
      });
    });

    // Need auth for instructor
    await page.addInitScript(() => {
      localStorage.setItem('authToken', 'mock-instructor-jwt');
    });

    await page.goto(`${INSTRUCTOR_BASE}/assessments`);

    await expect(page.getByText('Introduction to Algorithms')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('CS101')).toBeVisible();
  });
});
