// Captures desktop/mobile x light/dark screenshots of the stories that carry the most interaction risk.
// Needs the preview server on :4173 (npm run build && npx vite preview --port 4173) and PW_CHROMIUM or an installed Chromium.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const IDS = ['button-group', 'segmented-control', 'number-fields', 'secret-field', 'combobox', 'dialog', 'data-table', 'filter-builder', 'audit-trail', 'chart-legend', 'form-wizard', 'files', 'server-console', 'deploy-configurator', 'player-manager', 'command-button', 'checkbox-card-group', 'validation-summary', 'toolbar'];
const SIZES = [{ w: 390, h: 844, tag: 'mobile' }, { w: 1440, h: 900, tag: 'desktop' }];
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';

mkdirSync(new URL('../docs/screenshots/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const captured: string[] = [];
const missing: string[] = [];
for (const id of IDS) {
  let ok = false;
  for (const theme of ['light', 'dark'] as const) for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: theme });
    const page = await ctx.newPage();
    await page.goto(`${base}/?embed=${id}&theme=${theme}`);
    const found = await page.locator(`[data-story="${id}"]`).waitFor({ timeout: 4000 }).then(() => true, () => false);
    if (found) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: new URL(`../docs/screenshots/${id}-${s.tag}-${theme}.png`, import.meta.url).pathname, fullPage: true });
      ok = true;
    }
    await ctx.close();
  }
  (ok ? captured : missing).push(id);
}
// The workbench itself, at both sizes and themes.
for (const theme of ['light', 'dark'] as const) for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(`${base}/?theme=${theme}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: new URL(`../docs/screenshots/_workbench-${s.tag}-${theme}.png`, import.meta.url).pathname });
  await ctx.close();
}
await browser.close();
writeFileSync(new URL('../docs/screenshots.json', import.meta.url), JSON.stringify({ captured, missing, sizes: SIZES.map((s) => `${s.w}x${s.h}`), themes: ['light', 'dark'] }, null, 2));
console.log(`screenshots: ${captured.length} stories captured, missing: ${missing.join(', ') || 'none'}`);
