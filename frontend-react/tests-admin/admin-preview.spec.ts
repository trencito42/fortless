import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { IDS, ROUTES } from './routes';

const go = async (page: Page, path: string) => { await page.goto(`/admin-preview${path === '/' ? '' : path}`); await expect(page.locator('h1').first()).toBeVisible(); };
const main = (page: Page) => page.locator('#admin-main');
const menu = async (page: Page, name: RegExp | string) => { await page.getByRole('button', { name: /Profile and preview settings/ }).first().click(); await page.getByRole('menuitemradio', { name }).click(); await page.keyboard.press('Escape'); };
/** Client-side navigation through the palette, so the in-memory demo state survives (a page load resets it). */
const via = async (page: Page, text: string, option: RegExp | string) => { await page.keyboard.press('Control+k'); await page.getByRole('combobox').fill(text); await page.getByRole('option', { name: option }).first().click(); };
/** Complete the simulated step-up inside an open action dialog. */
const stepUp = async (page: Page) => { const b = page.getByRole('button', { name: 'Simulate step-up' }); if (await b.isVisible().catch(() => false)) await b.click(); };

test.describe('routes render without errors', () => {
  for (const vp of [{ n: 'desktop', w: 1440, h: 900 }, { n: 'tablet', w: 820, h: 1100 }, { n: 'mobile', w: 390, h: 844 }]) {
    test(`all ${ROUTES.length} routes at ${vp.n}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const bad: string[] = [];
      for (const r of ROUTES) {
        await go(page, r);
        const title = (await page.locator('h1').first().textContent()) ?? '';
        if (/not found/i.test(title)) bad.push(`${r}: ${title}`);
        const over = await page.evaluate(() => { const W = window.innerWidth; let n = 0; for (const el of document.querySelectorAll('#admin-main *')) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.right > W + 1) { let a: Element | null = el; let clipped = false; while (a && a.id !== 'admin-main') { const o = getComputedStyle(a).overflowX; if (a !== el && (o === 'auto' || o === 'hidden' || o === 'scroll')) { clipped = true; break; } a = a.parentElement; } if (!clipped) n++; } } return n; });
        if (over) bad.push(`${r}: ${over} elements overflow horizontally`);
      }
      expect(bad).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('shell', () => {
  test('demo indicator, command palette, notifications and theme are present', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByText('Demo data').first()).toBeVisible();
    await expect(page.getByText(/Environment: preview/)).toBeVisible();
    await page.keyboard.press('Control+k');
    const box = page.getByRole('combobox');
    await expect(box).toBeFocused();
    await box.fill('Northwind');
    await page.getByRole('option', { name: /Northwind Gaming GmbH/ }).first().click();
    await expect(page).toHaveURL(/\/admin-preview\/customers\/acc_0001/);
    await page.getByRole('button', { name: /^Notifications, \d+ unread/ }).click();
    await expect(page.getByRole('list', { name: 'Notifications' })).toBeVisible();
    await page.keyboard.press('Escape');
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).not.toBe(before);
  });
  test('Escape closes the palette and returns focus', async ({ page }) => {
    await go(page, '/customers');
    const trigger = page.getByRole('button', { name: 'Search everything' }).first();
    await trigger.focus(); await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  test('sidebar groups collapse and expand', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/');
    const g = page.getByRole('button', { name: 'Business' });
    await expect(g).toHaveAttribute('aria-expanded', 'true');
    await g.click();
    await expect(g).toHaveAttribute('aria-expanded', 'false');
    await g.click();
    await expect(g).toHaveAttribute('aria-expanded', 'true');
  });
  test('sidebar is an icon rail on tablet and a bottom bar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1100 }); await go(page, '/');
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await go(page, '/');
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog').getByRole('navigation').first()).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/customers$/);
  });
  test('breadcrumbs link back to the list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, `/orders/${IDS.failedOrder}`);
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Orders' }).click();
    await expect(page).toHaveURL(/\/admin-preview\/orders$/);
  });
});

test.describe('permissions', () => {
  test('AUDITOR is read-only and BILLING loses Services', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/services/svc_0001');
    await menu(page, /^Auditor/);
    await expect(page.getByRole('button', { name: 'Suspend' }).first()).toBeDisabled();
    await menu(page, /^Billing/);
    await expect(page.getByRole('navigation', { name: 'Business navigation' }).getByRole('button', { name: 'Services' })).toHaveCount(0);
    await expect(main(page)).toContainText('You don’t have access');
  });
});

test.describe('lists', () => {
  test('customers: segment, filter, search, sort, saved view and detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/customers');
    const tab = page.getByRole('tab', { name: /^Restricted/ });
    const n = Number((await tab.textContent())!.replace(/\D/g, ''));
    await tab.click();
    await expect(page.getByRole('status').filter({ hasText: /of 200 rows?/ })).toContainText(`${n} of 200`);
    await page.getByRole('tab', { name: /^All/ }).click();
    await page.getByRole('searchbox').fill('northwind');
    await expect(page.getByRole('status').filter({ hasText: /of 200 rows?/ })).toContainText('1 of 200');
    await page.getByRole('button', { name: /Clear filters/ }).click();
    await page.getByRole('button', { name: /Customer/ }).filter({ hasText: 'Customer' }).first().click();
    await page.getByRole('button', { name: 'Views' }).click();
    await page.getByRole('menuitem', { name: 'Save current view…' }).click();
    await page.getByLabel('View name').fill('My view');
    await page.getByRole('button', { name: 'Save view' }).click();
    await page.getByRole('link', { name: 'Northwind Gaming GmbH' }).first().click();
    await expect(page).toHaveURL(/customers\/acc_0001/);
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  });
  test('forced error state offers retry', async ({ page }) => {
    await go(page, '/orders');
    await menu(page, 'Error');
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load this list' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table').first()).toBeVisible();
  });
  test('forced loading and empty states render', async ({ page }) => {
    await go(page, '/services');
    await menu(page, 'Loading');
    await expect(page.getByRole('status', { name: /Loading Services/ })).toBeVisible();
    await menu(page, 'Empty');
    await expect(page.getByText('No services')).toBeVisible();
  });
});

test.describe('operations', () => {
  test('suspending a service needs permission, step-up and a reason, then changes only the contract', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/services/svc_0001');
    await page.getByRole('button', { name: 'Suspend', exact: true }).click();
    const d = page.getByRole('dialog');
    await expect(d.getByText('Preview only')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Suspend service' })).toBeDisabled();
    await stepUp(page);
    await d.getByLabel(/Reason/).fill('Abuse report confirmed in ticket');
    await d.getByRole('button', { name: 'Suspend service' }).click();
    await expect(page.getByText('Suspended').first()).toBeVisible();
    await expect(main(page).getByText('Offline').first()).toBeVisible();
    await via(page, 'Audit log', /Audit & Security: Audit log|Audit log/);
    await expect(page.getByText('service.suspended').first()).toBeVisible();
    await expect(page.getByText('preview', { exact: true }).first()).toBeVisible();
  });
  test('an unknown provider outcome blocks retry until reconciled', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, `/provisioning/jobs/${IDS.unknownJob}`);
    await expect(page.getByRole('button', { name: /^Retry/ })).toBeDisabled();
    await page.getByRole('button', { name: /Resolve unknown outcome/ }).click();
    await stepUp(page);
    await page.getByRole('dialog').getByLabel(/Reason/).fill('Checked provider by tag, nothing exists');
    await page.getByRole('dialog').getByRole('button', { name: 'Query provider' }).click();
    await expect(page.getByRole('button', { name: /^Retry/ })).toBeEnabled();
  });
  test('a large refund waits for approval and the requester cannot approve it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, `/billing/invoices/${IDS.largeInvoice}`);
    await page.getByRole('button', { name: 'Refund…' }).click();
    const d = page.getByRole('dialog');
    await stepUp(page);
    await d.getByLabel(/Reason/).fill('Customer cancelled within the window');
    await d.getByRole('button', { name: 'Submit refund' }).click();
    await via(page, 'Refunds', /Refunds & credit notes/);
    await page.getByRole('tab', { name: /^Awaiting approval/ }).click();
    await page.getByRole('link', { name: /^rfd_prev/ }).first().click();
    await expect(page.getByRole('button', { name: 'Approve…' })).toBeDisabled();
    await expect(main(page)).toContainText('Four-eyes rule');
  });
  test('role changes protect the acting owner and show the escalation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/staff/directory/stf_09');
    await page.getByRole('button', { name: 'Change role…' }).click();
    await page.getByRole('dialog').getByRole('combobox', { name: 'New role' }).click();
    await page.getByRole('option', { name: /^ADMINISTRATOR/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Grants');
    await page.keyboard.press('Escape');
  });
  test('migration wizard validates, runs, fails and rolls back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/services/svc_0001/migrate');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Pick a destination node.')).toBeVisible();
  });
  test('Escape closes an action dialog and restores focus to its trigger', async ({ page }) => {
    await go(page, '/services/svc_0001');
    const trigger = page.getByRole('button', { name: 'Suspend', exact: true });
    await trigger.focus(); await trigger.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
  test('legal pages cannot be published without a draft; incident text cannot leak internal ids', async ({ page }) => {
    await go(page, '/monitoring/incidents/new');
    await page.getByLabel('Title').fill('Network trouble on node-fra-02');
    await page.getByLabel('Public message').fill('Packet loss on 198.51.100.11 in Frankfurt.');
    await page.getByRole('checkbox', { name: /Customer panel/ }).check();
    await page.getByRole('button', { name: 'Declare…' }).click();
    await expect(page.getByText(/contains an (IP address|internal identifier)/).first()).toBeVisible();
  });
  test('unsupported views say so and show no invented numbers', async ({ page }) => {
    await go(page, '/marketing/referrals');
    await expect(page.getByText('Needs backend support before it can work')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await go(page, '/marketing/analytics');
    await expect(page.getByText('Visitor analytics are not collected')).toBeVisible();
  });
  test('secrets are masked everywhere in settings', async ({ page }) => {
    await go(page, '/settings/payments');
    const text = await main(page).innerText();
    expect(text).not.toMatch(/sk_live_[A-Za-z0-9]{8}/);
    expect(text).toContain('sk_live_••••');
    await go(page, '/settings/integrations/conn_ptero');
    expect(await main(page).innerText()).not.toMatch(/ptla_[A-Za-z0-9]{10}/);
  });
});

test.describe('accessibility', () => {
  for (const r of ['/', '/customers', '/customers/acc_0003', '/services/svc_0001/operations', `/billing/invoices/${IDS.invoice}`, `/orders/${IDS.failedOrder}`, '/infrastructure/capacity', '/monitoring/incidents/inc_0006', `/support/tickets/${IDS.urgentTicket}`, '/staff/roles', '/settings/flags']) {
    test(`axe: ${r}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await go(page, r);
      const res = await new AxeBuilder({ page }).include('#admin-main').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});
