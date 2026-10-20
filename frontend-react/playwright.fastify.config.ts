import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-fastify',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4183', launchOptions: { executablePath: process.env['PW_CHROMIUM'] } },
  webServer: {
    command: 'cd .. && npm run build:react && npx tsx frontend-react/tests-fastify/server.ts',
    url: 'http://127.0.0.1:4183/__test__/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
