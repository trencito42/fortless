// Responsive screenshots of the Service Detail view (demo adapter). Needs vite preview on :4173.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = new URL('../docs/screenshots/service-detail/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const SCN: Array<[string, number]> = [['owner', 0], ['owner-shell', 1], ['viewer', 2], ['loading', 5], ['error', 6], ['unsupported-provider', 7], ['not-configured', 8], ['console-refused', 11], ['files', 14], ['players', 15], ['backups', 16], ['settings', 17]];
const W = [320, 375, 768, 1024, 1440];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const theme of ['light', 'dark'] as const) for (const [name, n] of SCN) for (const w of W) {
  if (theme === 'dark' && ![320, 1440].includes(w)) continue;
  const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme });
  const p = await c.newPage();
  await p.goto(`${base}/?embed=service-detail&scenario=${n}&theme=${theme}`);
  await p.locator('[data-story="service-detail"]').waitFor();
  await p.waitForTimeout(name === 'loading' ? 300 : 1400);
  await p.screenshot({ path: `${out}${name}-${w}-${theme}.png`, fullPage: true });
  await c.close();
}
await b.close();
