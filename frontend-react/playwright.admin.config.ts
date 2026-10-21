import { defineConfig } from '@playwright/test';

// Admin preview tests run against the Vite dev server, where /admin-preview is mounted. Nothing here touches Fastify, nginx or production.
const port = Number(process.env['ADMIN_PREVIEW_PORT'] ?? 4180);
export default defineConfig({
  testDir: './tests-admin',
  timeout: 90_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, launchOptions: { executablePath: process.env['PW_CHROMIUM'] ?? undefined } },
  webServer: { command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}/admin-preview`, reuseExistingServer: true, timeout: 120_000 },
});
