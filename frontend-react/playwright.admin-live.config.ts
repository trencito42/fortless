import { defineConfig } from '@playwright/test';

// Live React Admin against a disposable Fastify + temp database (tests-admin-live/server.ts). Vite proxies /api to it. Never touches production.
export default defineConfig({
  testDir: './tests-admin-live',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4185', launchOptions: { executablePath: process.env['PW_CHROMIUM'] ?? undefined } },
  webServer: [
    { command: 'npx tsx tests-admin-live/server.ts', cwd: '.', url: 'http://127.0.0.1:4186/session', reuseExistingServer: false, timeout: 120_000 },
    { command: 'FORTLESS_PREVIEW_BACKEND=http://127.0.0.1:4184 FORTLESS_PREVIEW_ORIGIN=http://127.0.0.1:4184 npx vite --host 127.0.0.1 --port 4185 --strictPort', url: 'http://127.0.0.1:4185/admin-preview', reuseExistingServer: false, timeout: 120_000 },
  ],
});
