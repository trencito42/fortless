import { defineConfig } from '@playwright/test';

const baseURL = process.env['PW_BASE_URL'] ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  reporter: [['list'], ['json', { outputFile: 'reports/report.json' }]],
  use: { baseURL, launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined } },
  webServer: { command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
