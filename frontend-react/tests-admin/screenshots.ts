/**
 * Regenerates docs/admin-screenshots from the running dev server:
 *   npx vite --port 4180 &  npx tsx tests-admin/screenshots.ts
 * Not part of the test run. Uses the same deterministic demo data as the app.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IDS } from './routes';

const base = process.env['ADMIN_PREVIEW_URL'] ?? 'http://127.0.0.1:4180';
const out = join(process.cwd(), '..', 'docs', 'admin-screenshots');
const sizes = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } } as const;
type Vp = keyof typeof sizes;

const GROUPS: Record<string, Array<[string, string]>> = {
  '1-foundation': [['dashboard', '/'], ['action-center', '/actions'], ['action-detail', `/actions/${IDS.action}`]],
  '2-business': [['customers', '/customers'], ['customer-360', '/customers/acc_0003'], ['customer-billing', '/customers/acc_0004/billing'], ['services', '/services'], ['service-operations', '/services/svc_0001/operations'], ['service-provider', '/services/svc_0001/provider'], ['service-migration', '/services/svc_0001/migrate'], ['orders', '/orders'], ['order-failed', `/orders/${IDS.failedOrder}`], ['billing-overview', '/billing'], ['invoice', `/billing/invoices/${IDS.invoice}`], ['transaction-unreconciled', `/billing/transactions/${IDS.unreconciledPayment}`], ['refunds', '/billing/refunds'], ['reports', '/billing/reports'], ['catalog', '/products'], ['plan-builder', '/products/plans/pln_mc_iron'], ['coupons', '/products/coupons']],
  '3-operations': [['infrastructure', '/infrastructure'], ['node-detail', '/infrastructure/nodes/node-fra-02'], ['capacity', '/infrastructure/capacity'], ['allocations', '/infrastructure/allocations'], ['node-maintenance', '/infrastructure/maintenance'], ['providers', '/infrastructure/providers'], ['job-queue', '/provisioning/jobs'], ['job-unknown-outcome', `/provisioning/jobs/${IDS.unknownJob}`], ['order-timeline', `/provisioning/timeline?order=${IDS.failedOrder}`], ['webhooks', '/provisioning/webhooks'], ['monitoring', '/monitoring'], ['incident', '/monitoring/incidents/inc_0006'], ['incident-editor', '/monitoring/incidents/new'], ['maintenance-calendar', '/monitoring/maintenance'], ['public-status', '/monitoring/public']],
  '4-customer-experience': [['support-inbox', '/support'], ['ticket', `/support/tickets/${IDS.urgentTicket}`], ['support-performance', '/support/performance'], ['content-overview', '/content'], ['kb-editor', '/content/knowledge/kba_001'], ['legal-detail', '/content/legal/leg_privacy_en'], ['marketing', '/marketing'], ['referrals-unsupported', '/marketing/referrals'], ['analytics', '/marketing/analytics']],
  '5-system': [['staff', '/staff'], ['roles-matrix', '/staff/roles'], ['approvals', '/staff/approvals'], ['audit-log', '/audit'], ['audit-event', `/audit/events/${IDS.audit}`], ['security-policy', '/audit/policy'], ['settings-payments', '/settings/payments'], ['settings-email', '/settings/email'], ['feature-flags', '/settings/flags'], ['system-health', '/settings/system']],
};
// Which viewport/theme combinations to capture. Every route gets desktop light; the rest are sampled so the folder stays reviewable.
const EXTRA: Array<[Vp, 'light' | 'dark', (i: number) => boolean]> = [['desktop', 'dark', (i) => i % 3 === 0], ['tablet', 'light', (i) => i % 4 === 0], ['mobile', 'light', (i) => i % 2 === 0], ['mobile', 'dark', (i) => i % 6 === 0]];

async function shoot(page: Page, dir: string, name: string, path: string, vp: Vp, theme: 'light' | 'dark') {
  await page.goto(`${base}/admin-preview${path === '/' ? '' : path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(dir, `${name}.${vp}.${theme}.jpg`), type: 'jpeg', quality: 80 });
}

const browser = await chromium.launch();
for (const [vp, theme, pick] of [['desktop', 'light', () => true] as const, ...EXTRA]) {
  const ctx = await browser.newContext({ viewport: sizes[vp], colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('fl-theme', t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  let i = 0;
  for (const [group, items] of Object.entries(GROUPS)) {
    const dir = join(out, group); mkdirSync(dir, { recursive: true });
    for (const [name, path] of items) { if (pick(i++)) await shoot(page, dir, name, path, vp, theme); }
  }
  await ctx.close();
}

// Interaction states.
const dir = join(out, '0-interactions'); mkdirSync(dir, { recursive: true });
const ctx = await browser.newContext({ viewport: sizes.desktop });
const page = await ctx.newPage();
const profile = async (name: RegExp | string) => { await page.getByRole('button', { name: /Profile and preview settings/ }).first().click(); await page.getByRole('menuitemradio', { name }).click(); await page.keyboard.press('Escape'); };
await page.goto(`${base}/admin-preview`, { waitUntil: 'networkidle' });
await page.keyboard.press('Control+k'); await page.getByRole('combobox').fill('north'); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'command-palette.desktop.light.jpg'), type: 'jpeg', quality: 80 }); await page.keyboard.press('Escape');
await page.getByRole('button', { name: /^Notifications, \d+ unread/ }).click(); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'notifications.desktop.light.jpg'), type: 'jpeg', quality: 80 }); await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Profile and preview settings/ }).first().click(); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'profile-menu-role-switcher.desktop.light.jpg'), type: 'jpeg', quality: 80 }); await page.keyboard.press('Escape');
await page.goto(`${base}/admin-preview/services/svc_0001`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Suspend', exact: true }).click(); await page.waitForTimeout(300); await page.screenshot({ path: join(dir, 'action-dialog-step-up.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await page.getByRole('button', { name: 'Simulate step-up' }).click(); await page.getByRole('dialog').getByLabel(/Reason/).fill('Abuse report confirmed in the linked ticket'); await page.waitForTimeout(200); await page.screenshot({ path: join(dir, 'action-dialog-ready.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await page.keyboard.press('Escape');
await profile(/^Auditor/); await page.waitForTimeout(200); await page.screenshot({ path: join(dir, 'role-auditor-disabled-actions.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await profile(/^Owner/);
await page.goto(`${base}/admin-preview/orders`, { waitUntil: 'networkidle' });
await profile('Error'); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'list-error-state.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await profile('Loading'); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'list-loading-state.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await profile('Empty'); await page.waitForTimeout(250); await page.screenshot({ path: join(dir, 'list-empty-state.desktop.light.jpg'), type: 'jpeg', quality: 80 });
await ctx.close();
const m = await browser.newContext({ viewport: sizes.mobile }); const mp = await m.newPage();
await mp.goto(`${base}/admin-preview`, { waitUntil: 'networkidle' }); await mp.getByRole('button', { name: 'More' }).click(); await mp.waitForTimeout(500); await mp.screenshot({ path: join(dir, 'mobile-navigation-sheet.mobile.light.jpg'), type: 'jpeg', quality: 80 });
await browser.close();
console.log('screenshots written to', out);
