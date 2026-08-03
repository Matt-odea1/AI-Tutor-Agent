import { defineConfig, devices } from '@playwright/test';

/**
 * Full local integration test configuration.
 *
 * Starts the three local dev servers before running tests:
 *   - Backend API:         http://localhost:8000  (uvicorn app.py)
 *   - Instructor frontend: http://localhost:5175  (oral-assessment-instructor)
 *   - Student frontend:    http://localhost:5176  (oral-assessment-student)
 *
 * Tests use page.route() to intercept API calls so no real AWS credentials
 * are needed in CI.  The backend health endpoint at /health is used as the
 * readiness check so the API server must be running before page tests start.
 *
 * To run against a real backend (with .env configured), set:
 *   MOCK_API=false playwright test
 */

const MOCK_API = process.env.MOCK_API !== 'false';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,           // serial — servers are shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  // Playwright defaults to 'list' only under CI, so the workflow's
  // "Upload Playwright report" step had nothing to collect and warned
  // "No files were found". Emit the HTML report explicitly.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Spin up all three local servers in CI / local dev.
  // Set SKIP_WEBSERVER=true if they are already running.
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : [
        {
          // Backend API — must be first so frontends can reach it during build
          command: 'cd .. && python app.py',
          url: 'http://localhost:8000/health',
          reuseExistingServer: true,
          timeout: 30_000,
          env: {
            LOG_FORMAT: 'text',
            LOG_LEVEL: 'WARNING',
          },
        },
        {
          command: 'cd ../oral-assessment-student && npm run dev',
          url: 'http://localhost:5176',
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: 'cd ../oral-assessment-instructor && npm run dev',
          url: 'http://localhost:5175',
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ],
});
