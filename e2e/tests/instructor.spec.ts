/**
 * E2E tests for the Instructor frontend.
 *
 * Covers: login, assessment list, create, upload, generate, results, score override,
 * progress monitoring.
 */

import { test, expect } from '@playwright/test';
import { setupInstructorMockApi, mockJwt } from './helpers/mockApi';

const INSTRUCTOR_BASE = 'http://localhost:5175';
const ASSESSMENT_ID = 'asmt-e2e-001';

function injectInstructorAuth(page: import('@playwright/test').Page) {
  const token = mockJwt({ sub: 'instructor-1', role: 'instructor' });
  return page.addInitScript((tok) => {
    localStorage.setItem('authToken', tok);
  }, token);
}

// ─── Login ───────────────────────────────────────────────────────────

test.describe('Instructor login', () => {
  test('login form authenticates and redirects to assessment list', async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });

    await page.goto(`${INSTRUCTOR_BASE}/login`);

    await expect(page.getByText('Instructor Sign In')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Email').fill('instructor@uni.edu');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to assessment list and show assessment data
    await expect(page.getByText('Oral Assessments')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Introduction to Algorithms')).toBeVisible({ timeout: 10_000 });
  });

  test('login shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    });

    await page.goto(`${INSTRUCTOR_BASE}/login`);
    await expect(page.getByText('Instructor Sign In')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Email').fill('bad@uni.edu');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5_000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments`);
    await expect(page.getByText('Instructor Sign In')).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Assessment list ─────────────────────────────────────────────────

test.describe('Instructor assessment list', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('assessment list loads and shows assessment cards', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments`);

    await expect(page.getByText('Oral Assessments')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Introduction to Algorithms')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('CS101')).toBeVisible();
  });

  test('create assessment button navigates to form', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments`);

    await expect(page.getByText('Oral Assessments')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: /create assessment/i }).click();

    await expect(page.getByText('Assessment Title')).toBeVisible({ timeout: 5_000 });
  });

  test('assessment card shows open button', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments`);

    await expect(page.getByText('Introduction to Algorithms')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: /open/i })).toBeVisible();
  });
});

// ─── Create assessment ───────────────────────────────────────────────

test.describe('Instructor create assessment', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('form validation prevents empty submission', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/create`);

    await expect(page.getByText('Assessment Title')).toBeVisible({ timeout: 10_000 });

    // Click submit without filling required fields
    await page.getByRole('button', { name: /create assessment/i }).click();

    // Should still be on the create page (native HTML validation or custom error)
    await expect(page.getByText('Assessment Title')).toBeVisible();
  });

  test('form can be filled and submitted', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/create`);

    await expect(page.getByText('Assessment Title')).toBeVisible({ timeout: 10_000 });

    await page.getByLabel('Assessment Title').fill('Midterm Oral Exam');
    await page.getByLabel('Description').fill('Test assessment for the midterm period.');
    await page.getByLabel('Course').fill('COMP9021');

    // datetime-local inputs require the full ISO datetime format (not just the date)
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
    await page.getByLabel('Display Deadline').fill(tomorrow);

    await page.getByLabel('Number of Questions').clear();
    await page.getByLabel('Number of Questions').fill('5');

    await page.getByRole('button', { name: /create assessment/i }).click();

    // Should navigate to upload page
    await expect(page).toHaveURL(/\/upload/, { timeout: 10_000 });
  });

  test('answer mode toggle shows preparation time for oral only', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/create`);

    await expect(page.getByText('Answer Mode')).toBeVisible({ timeout: 10_000 });

    // Oral mode is default — prep time should be visible
    await expect(page.getByText(/preparation time/i)).toBeVisible();

    // Switch to written mode
    await page.getByRole('radio', { name: /written/i }).check();

    // Prep time should be hidden
    await expect(page.locator('#preparationTime')).not.toBeVisible();
  });
});

// ─── Upload students ─────────────────────────────────────────────────

test.describe('Instructor upload students', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('upload page loads and shows CSV format requirements', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/upload`);

    // Page loads assessment title from API
    await expect(page.getByText('CSV Format Requirements')).toBeVisible({ timeout: 10_000 });
  });

  test('template download link is present', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/upload`);

    await expect(page.getByText('CSV Format Requirements')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/download template/i)).toBeVisible();
  });
});

// ─── Generate questions ──────────────────────────────────────────────

test.describe('Instructor generate questions', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('generate page shows assignment brief field', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/generate`);

    await expect(page.getByRole('heading', { name: 'Assignment Brief' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/minimum 50 characters/i)).toBeVisible();
  });

  test('save brief button is visible', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/generate`);

    await expect(page.getByRole('heading', { name: 'Assignment Brief' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /save brief/i })).toBeVisible();
  });
});

// ─── Results dashboard ───────────────────────────────────────────────

test.describe('Instructor results dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('results page shows student names and scores', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/results`);

    await expect(page.getByText('Alice Johnson')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Bob Smith')).toBeVisible();
    // Scores now shown as "16/20 (80%)" in combined format
    await expect(page.getByText(/80%/)).toBeVisible();
    await expect(page.getByText(/70%/)).toBeVisible();
  });

  test('results page shows grade badges', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/results`);

    // Use first() to avoid strict mode with dropdown filter options having same text
    await expect(page.getByText('Proficient').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Competent').first()).toBeVisible();
  });
});

// ─── Student result detail ───────────────────────────────────────────

test.describe('Instructor student result detail', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('student detail page shows score summary', async ({ page }) => {
    await page.goto(
      `${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/student/stu-001/results`
    );

    await expect(page.getByText('Alice Johnson')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('80%')).toBeVisible();
    await expect(page.getByText('Proficient')).toBeVisible();
  });

  test('student detail shows question results', async ({ page }) => {
    await page.goto(
      `${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/student/stu-001/results`
    );

    await expect(page.getByText('Question Results')).toBeVisible({ timeout: 10_000 });
    // Q1 and Q2 expandable rows
    await expect(page.getByText('Q1')).toBeVisible();
    await expect(page.getByText('Q2')).toBeVisible();
  });

  test('expanding a question shows AI feedback', async ({ page }) => {
    await page.goto(
      `${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/student/stu-001/results`
    );

    await expect(page.getByText('Q1')).toBeVisible({ timeout: 10_000 });

    // Expand Q1
    await page.getByText('Q1').click();

    await expect(page.getByText('Excellent explanation.')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Clear structure and good examples.')).toBeVisible();
  });
});

// ─── Progress monitoring ─────────────────────────────────────────────

test.describe('Instructor progress monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await setupInstructorMockApi(page, { studentId: 'stu-001', assessmentId: ASSESSMENT_ID });
    await injectInstructorAuth(page);
  });

  test('monitor page shows student progress', async ({ page }) => {
    await page.goto(`${INSTRUCTOR_BASE}/assessments/${ASSESSMENT_ID}/monitor`);

    // Use exact text to avoid strict mode violation (name + email both match /alice/)
    await expect(page.getByText('Alice Johnson').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Bob Smith').first()).toBeVisible();
  });
});
