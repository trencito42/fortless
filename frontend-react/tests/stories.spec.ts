import { test, expect, type ConsoleMessage } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

/** Story ids are read from the registry listing page so the suite never drifts from the workbench. */
const ids: string[] = JSON.parse(readFileSync(new URL('./story-ids.json', import.meta.url), 'utf8'));
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const IGNORED_CONSOLE = [/Download the React DevTools/];

function watch(page: import('@playwright/test').Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error' && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()}`); });
  return problems;
}

for (const id of ids) {
  test.describe(id, () => {
    for (const scheme of ['light', 'dark'] as const) for (const w of WIDTHS) {
      test(`renders at ${w}px (${scheme}) without overflow or errors`, async ({ page }) => {
        const problems = watch(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(`/?embed=${id}&theme=${scheme}`);
        await page.locator(`[data-story="${id}"]`).waitFor();
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
        expect(problems).toEqual([]);
      });
    }
    for (const scheme of ['light', 'dark'] as const) for (const w of [320, 1024]) {
      test(`has no axe violations at ${w}px (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(`/?embed=${id}&theme=${scheme}`);
        await page.locator(`[data-story="${id}"]`).waitFor();
        await page.waitForTimeout(400);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const out = r.violations.map((v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
        expect(out).toEqual([]);
      });
    }
  });
}
