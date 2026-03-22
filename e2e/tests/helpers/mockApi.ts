/**
 * Reusable API mock helpers for Playwright tests.
 *
 * These intercept the Axios calls made by the frontend apps and return
 * deterministic fixture data — no real backend or AWS credentials required.
 *
 * Usage:
 *   import { setupMockApi } from './helpers/mockApi';
 *   test('...', async ({ page }) => {
 *     await setupMockApi(page, { studentId: 'stu-1', assessmentId: 'asmt-1' });
 *     ...
 *   });
 */

import { Page } from '@playwright/test';

export interface MockContext {
  studentId: string;
  assessmentId: string;
  /** Override individual fixture fields */
  overrides?: Record<string, unknown>;
}

// Use ** glob prefix to match any host — dev servers may point to localhost:8000
// or a remote EC2 IP depending on the local .env.local file.
// The glob matches the path portion regardless of which base URL is in use.
const G = '**/api';

export async function setupMockApi(page: Page, ctx: MockContext): Promise<void> {
  const { studentId, assessmentId } = ctx;

  // Student: exchange invite token → session JWT (not a real JWT — tests stub auth)
  await page.route(`${G}/auth/student/exchange`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'mock-session-jwt', studentId }),
    });
  });

  // Student: get assessment questions
  await page.route(`${G}/student/${studentId}/assessment/${assessmentId}/questions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        questions: [
          { id: 'q-1', text: 'Explain your implementation approach?', questionNumber: 1, questionType: 'specific', timeLimit: 5 },
          { id: 'q-2', text: 'What are the time complexity trade-offs?', questionNumber: 2, questionType: 'general', timeLimit: 5 },
        ],
        assessmentId,
        studentId,
      }),
    });
  });

  // Student: get presigned upload URL
  await page.route(`${G}/student/*/presigned-url`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://s3.example.com/mock-upload', key: 'mock/key.webm' }),
    });
  });

  // Student: submit answer
  await page.route(`${G}/student/${studentId}/answer`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Student: submit assessment
  await page.route(`${G}/student/${studentId}/submit`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'submitted' }) });
  });

  // Student: get results (released)
  await page.route(`${G}/student/${studentId}/assessment/${assessmentId}/results`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        studentId,
        assessmentId,
        totalScore: 14,
        maxScore: 20,
        percentage: 70,
        grade: 'Competent',
        completedAt: new Date().toISOString(),
        questions: [
          {
            questionId: 'q-1',
            questionText: 'Explain your implementation approach?',
            aiScore: 7,
            effectiveScore: 7,
            maxScore: 10,
            feedback: 'Good explanation with clear structure.',
            strengths: 'Clear and concise.',
            improvements: 'Add more examples.',
          },
          {
            questionId: 'q-2',
            questionText: 'What are the time complexity trade-offs?',
            aiScore: 7,
            effectiveScore: 7,
            maxScore: 10,
            feedback: 'Correct analysis.',
            strengths: 'Accurate complexity analysis.',
            improvements: 'Discuss space complexity.',
          },
        ],
      }),
    });
  });
}
