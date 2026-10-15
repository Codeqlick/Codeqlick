import { defineConfig, devices } from '@playwright/test';

/*
 * Browser tests of the key flows against a running stack (web + API + database):
 * locally the Docker dev stack, in CI the one .github/workflows/e2e.yml starts.
 *
 *   E2E_BASE_URL=http://localhost:3001 E2E_API_URL=http://localhost:4000/v1 npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The flows share accounts and the API's login rate limit: one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Locally, the installed Chrome; CI installs Playwright's Chromium.
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
});
