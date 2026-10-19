import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['ADMIN_E2E_BASE_URL'] || 'http://127.0.0.1:3021';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: process.env['ADMIN_E2E_SERVER_COMMAND'] || 'npm run start',
    url: baseURL,
    reuseExistingServer: !process.env['ADMIN_AUTH_FIXTURE'],
    timeout: 30_000,
  },
});
