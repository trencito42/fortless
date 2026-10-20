import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const open = async (page: Page, n: number, w = 1280) => {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`/?embed=service-detail&scenario=${n}`);
  await page.locator('[data-story="service-detail"]').waitFor();
};
// scenario indexes follow src/workbench/stories/views.tsx
const S = { owner: 0, viewer: 2, operator: 3, loading: 5, error: 6, unsupported: 7, notConfigured: 8, offline: 9, suspended: 10, console: 11, files: 14, players: 15, backups: 16, settings: 17 };

const rail = (page: Page) => page.getByRole('navigation', { name: 'Service sections' });

test('owner view renders header, demo notice and grouped section navigation', async ({ page }) => {
  await open(page, S.owner);
  await expect(page.getByText('Demonstration data').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: /overview/i })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: /console/i })).toBeVisible();
  for (const g of ['Monitor', 'Manage']) await expect(rail(page).getByText(g, { exact: true })).toBeVisible();
});

test('viewer does not get write-only tabs', async ({ page }) => {
  await open(page, S.viewer);
  await rail(page).getByRole('button', { name: /overview/i }).waitFor();
  await expect(rail(page).getByRole('button', { name: /^users/i })).toHaveCount(0);
});

test('loading state is announced, error state offers retry', async ({ page }) => {
  await open(page, S.loading);
  await expect(page.locator('[aria-busy="true"], [role="status"]').first()).toBeVisible();
  await open(page, S.error);
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});

test('files tab lists entries', async ({ page }) => {
  await open(page, S.files);
  await expect(page.getByText('server.properties').first()).toBeVisible();
});

test('provider not configured shows reason, not a blanket Unavailable', async ({ page }) => {
  await open(page, S.notConfigured);
  await expect(page.locator('body')).not.toHaveText(/^Unavailable$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

for (const [name, n] of Object.entries(S)) {
  test(`axe + no overflow: ${name}`, async ({ page }) => {
    for (const w of [320, 1024]) {
      await open(page, n, w);
      await page.waitForTimeout(900);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    }
  });
}

test('power actions are authorised one by one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?embed=server-power&scenario=2');
  await page.locator('[data-story="server-power"]').waitFor();
  const sec = page.locator('section[data-scenario^="Per-action"]');
  await expect(sec.getByRole('button', { name: 'Restart' })).toBeEnabled();
  await expect(sec.getByRole('button', { name: 'Stop' })).toBeDisabled();
  await expect(sec.getByRole('button', { name: 'Kill' })).toBeDisabled();
  await expect(sec.getByText('Your access level cannot stop, kill.')).toBeVisible();
});
