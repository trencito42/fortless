import { test, expect, type Page } from '@playwright/test';

/** Customer app (fixture data). These are prototype tests: they prove UI behaviour against the fixture adapter, not against a live backend. */
const go = async (page: Page, path: string, w = 1280) => { await page.setViewportSize({ width: w, height: 900 }); await page.goto(path); await page.locator('h1').first().waitFor(); };

const advance = async (page: Page, title: RegExp) => { for (let i = 0; i < 12 && !(await page.getByRole('heading', { name: title }).isVisible()); i++) await page.getByRole('button', { name: /^continue/i }).click(); await expect(page.getByRole('heading', { name: title })).toBeVisible(); };

test('deploy wizard: Minecraft quick path through checkout to progress', async ({ page }) => {
  await go(page, '/app/deploy');
  await page.getByRole('radio', { name: /^Minecraft/ }).click();
  await advance(page, /Name and configure it/);
  await page.getByRole('switch', { name: /Minecraft EULA/ }).click();
  await advance(page, /Choose a plan/);
  await page.getByRole('radio', { name: /Flame/ }).click();
  await expect(page.getByLabel('Order summary')).toContainText('Due today');
  await advance(page, /Choose a region/);
  await page.getByRole('radio', { name: /Frankfurt/ }).click();
  await advance(page, /Checkout preview/);
  await page.getByRole('combobox', { name: 'Payment method' }).click();
  await page.getByRole('option', { name: /VISA/i }).first().click();
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).click();
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page.getByText('Simulated deployment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to my servers' })).toBeEnabled({ timeout: 10000 });
});

test('deploy wizard: required steps block Next with a message', async ({ page }) => {
  await go(page, '/app/deploy');
  await page.getByRole('button', { name: /^continue/i }).click();
  await expect(page.getByText('Choose what you want to run.')).toBeVisible();
});

test('deploy wizard: a declined card shows the failure and nothing is placed', async ({ page }) => {
  await go(page, '/app/deploy?workload=nodejs');
  await advance(page, /Name and configure it/);
  await page.getByLabel('App name').fill('shop-api');
  await advance(page, /Choose a plan/);
  await page.getByRole('radio', { name: /Spark/ }).click();
  await advance(page, /Choose a region/);
  await page.getByRole('radio', { name: /Frankfurt/ }).click();
  await advance(page, /Checkout preview/);
  await page.getByRole('combobox', { name: 'Payment method' }).click();
  await page.getByRole('option', { name: /0087/ }).click();
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).click();
  await page.getByRole('button', { name: /place order/i }).click();
  await expect(page.getByText(/declined by the issuer/)).toBeVisible();
});

// ---------- navigation smoke, responsive and accessibility over every customer route ----------
const ROUTES = [
  '/app', '/app/services', '/app/services/svc_survival', '/app/services/svc_cs16/fastdl', '/app/services/svc_bot/startup', '/app/deploy',
  '/app/domains', '/app/domains/search', '/app/domains/shop.example', '/app/usage',
  '/app/billing', '/app/billing/invoices', '/app/billing/invoices/inv_0141', '/app/billing/subscriptions', '/app/billing/orders', '/app/billing/cart', '/app/billing/plans', '/app/billing/payment-methods', '/app/billing/profile',
  '/app/support', '/app/support/new', '/app/account', '/app/account/security', '/app/account/api-keys', '/app/account/team', '/app/account/notifications', '/app/account/activity',
  '/app/announcements', '/app/knowledge',
  '/auth/login', '/auth/register', '/auth/reset', '/auth/mfa', '/auth/verify-email',
  '/system/403', '/system/404', '/system/500', '/system/maintenance', '/system/unavailable', '/system/session-expired',
];
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440, 1920];

test.describe('every customer route', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const route of ROUTES) {
    test(`renders without errors or horizontal overflow: ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      for (const w of WIDTHS) {
        await go(page, route, w);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `overflow at ${w}px`).toBeLessThanOrEqual(0);
      }
      expect(errors).toEqual([]);
    });
  }
});

import AxeBuilder from '@axe-core/playwright';
const AXE_ROUTES = ROUTES.filter((r) => !r.startsWith('/app/services/'));
for (const route of AXE_ROUTES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe wcag2aa ${theme}: ${route}`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('fl-theme', t); } catch { /* ignore */ } }, theme);
      for (const w of [320, 1024]) {
        await page.emulateMedia({ colorScheme: theme });
        await go(page, route, w);
        await page.waitForTimeout(700);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
      }
    });
  }
}
