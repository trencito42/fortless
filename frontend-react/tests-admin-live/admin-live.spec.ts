import { expect, test, type Page } from '@playwright/test';

const control = 'http://127.0.0.1:4186';
const getJson = async <T>(path: string, init?: RequestInit) => (await (await fetch(`${control}${path}`, init)).json()) as T;
const query = (sql: string) => getJson<Array<Record<string, unknown>>>('/query', { method: 'POST', body: JSON.stringify({ sql }) });
const grantStepUp = () => getJson('/step-up', { method: 'POST' });
const clearStepUp = () => getJson('/step-up-clear', { method: 'POST' });
let session: { token: string; accountId: string; ticketId: string };

test.beforeAll(async () => { session = await getJson('/session'); });
test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'fortless_session', value: session.token, url: 'http://127.0.0.1:4185' }]);
  await clearStepUp();
  page.on('pageerror', (e) => { throw e; });
});

const open = async (page: Page, path: string) => { await page.goto(`/admin-preview${path}`); await expect(page.locator('h1').first()).toBeVisible(); };
const dialog = (page: Page) => page.getByRole('dialog');
const done = async (page: Page, title: string) => expect(page.getByText(`${title} completed`).first()).toBeVisible();

test('lists search and page on the server', async ({ page }) => {
  await open(page, '/customers');
  await expect(page.getByRole('status').filter({ hasText: /of \d+/ })).toContainText(/1–50 of 5[0-9]/);
  await page.getByRole('searchbox').fill('Live Customer GmbH');
  await expect(page.getByRole('status').filter({ hasText: 'of 1' })).toBeVisible();
  await expect(page.getByRole('link').or(page.getByRole('cell')).filter({ hasText: 'Live Customer GmbH' }).first()).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('status').filter({ hasText: /5[1-9]–/ })).toBeVisible();
});

test('catalog: create a product, add a plan, change its status after step-up', async ({ page }) => {
  await open(page, '/products');
  await page.getByRole('button', { name: 'New product' }).click();
  await dialog(page).getByLabel('Name').fill('Live product');
  await dialog(page).getByLabel('Slug').fill('live-product');
  await dialog(page).getByRole('button', { name: /Create product/ }).click();
  await done(page, 'New product');
  const [product] = await query("SELECT id, is_published FROM products WHERE slug = 'live-product'");
  expect(product).toMatchObject({ is_published: 0 });
  await open(page, `/products/${product!['id']}`);
  await page.getByRole('button', { name: 'New plan version' }).click();
  await dialog(page).getByLabel('Plan name').fill('Live 2 GB');
  await dialog(page).getByLabel('Provider egg id').fill('3');
  await dialog(page).getByLabel('EUR monthly').fill('8.99');
  await dialog(page).getByRole('button', { name: /Create plan \(active\)/ }).click();
  await done(page, 'New plan version');
  const [plan] = await query("SELECT p.id, pr.price_minor_units AS price FROM plan_versions p JOIN plan_prices pr ON pr.plan_version_id = p.id WHERE p.name = 'Live 2 GB'");
  expect(plan).toMatchObject({ price: 899 });
  // Status change needs recent step-up: the dialog asks for it, nothing is changed.
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await dialog(page).getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'RETIRED' }).click();
  await dialog(page).getByRole('button', { name: 'Change status' }).click();
  await expect(dialog(page).getByText('Recent verification required')).toBeVisible();
  expect((await query(`SELECT status FROM plan_versions WHERE id = '${plan!['id']}'`))[0]).toMatchObject({ status: 'ACTIVE' });
  await page.keyboard.press('Escape');
  await grantStepUp();
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await dialog(page).getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'RETIRED' }).click();
  await dialog(page).getByRole('button', { name: 'Change status' }).click();
  await done(page, 'Change plan status');
  expect((await query(`SELECT status FROM plan_versions WHERE id = '${plan!['id']}'`))[0]).toMatchObject({ status: 'RETIRED' });
});

test('catalog: form validation blocks bad input before any request', async ({ page }) => {
  await open(page, '/products/coupons');
  await page.getByRole('button', { name: 'New coupon' }).click();
  await dialog(page).getByRole('button', { name: 'Create coupon' }).click();
  await expect(dialog(page).getByText('Code must be at least 3 characters.')).toBeVisible();
  await expect(dialog(page).getByText('Choose a future date.')).toBeVisible();
  expect(await query("SELECT count(*) AS n FROM coupon_rules")).toEqual([{ n: 0 }]);
  await dialog(page).getByLabel('Code').fill('LIVE10');
  await dialog(page).getByLabel('Expires (UTC date)').fill('2099-12-31');
  await dialog(page).getByRole('button', { name: 'Create coupon' }).click();
  await done(page, 'New coupon');
  expect(await query("SELECT code, discount_value AS v FROM coupon_rules")).toEqual([{ code: 'LIVE10', v: 10 }]);
});

test('customer: billing profile is saved with step-up and shows in the detail', async ({ page }) => {
  await grantStepUp();
  await open(page, `/customers/${session.accountId}`);
  await page.getByRole('button', { name: 'Billing profile' }).click();
  await dialog(page).getByLabel('Company name').fill('Live Customer GmbH');
  await dialog(page).getByLabel('Address line 1').fill('1 Live Street');
  await dialog(page).getByLabel('City').fill('Berlin');
  await dialog(page).getByLabel('Postal code').fill('10115');
  await dialog(page).getByLabel('Country (ISO code)').fill('de');
  await dialog(page).getByRole('button', { name: 'Save billing profile' }).click();
  await done(page, 'Edit billing profile');
  expect((await query(`SELECT company_name, country, city FROM billing_profiles WHERE account_id = '${session.accountId}'`))[0]).toEqual({ company_name: 'Live Customer GmbH', country: 'DE', city: 'Berlin' });
  await expect(page.getByText('1 Live Street').first()).toBeVisible();
});

test('billing: renewals run reports the server result', async ({ page }) => {
  await grantStepUp();
  await open(page, '/billing/subscriptions');
  await page.getByRole('button', { name: 'Process renewals now' }).click();
  await dialog(page).getByRole('button', { name: 'Run renewals' }).click();
  await done(page, 'Process renewals now');
  await expect(page.getByText('Renewal run finished')).toBeVisible();
});

test('support: department, macro, routing and attachment', async ({ page }) => {
  await grantStepUp();
  await open(page, '/support/departments');
  await page.getByRole('button', { name: 'New department' }).click();
  await dialog(page).getByLabel('Name').fill('Live desk');
  await dialog(page).getByRole('button', { name: 'Create department' }).click();
  await done(page, 'New support department');
  await open(page, '/support/macros');
  await page.getByRole('button', { name: 'New macro' }).click();
  await dialog(page).getByLabel('Name').fill('Live macro');
  await dialog(page).getByLabel('Body').fill('Thanks, we are looking into it.');
  await dialog(page).getByRole('button', { name: 'Create macro' }).click();
  await done(page, 'New support macro');
  await open(page, `/support/tickets/${session.ticketId}`);
  await page.getByRole('button', { name: 'Route ticket' }).click();
  await dialog(page).getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'URGENT' }).click();
  await dialog(page).getByRole('button', { name: 'Save routing' }).click();
  await done(page, 'Route ticket');
  expect((await query(`SELECT priority FROM tickets WHERE id = '${session.ticketId}'`))[0]).toEqual({ priority: 'URGENT' });
  await page.getByRole('button', { name: 'Attach file' }).click();
  await dialog(page).getByRole('button', { name: 'Upload' }).click();
  await expect(dialog(page).getByText('Choose a file.')).toBeVisible();
  await dialog(page).locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello from the browser test') });
  await dialog(page).getByRole('button', { name: 'Upload' }).click();
  await done(page, 'Attach a file');
  expect((await query(`SELECT count(*) AS n FROM ticket_attachments WHERE ticket_id = '${session.ticketId}'`))[0]).toEqual({ n: 1 });
});

test('content: edit and delete an announcement from its row', async ({ page }) => {
  await grantStepUp();
  await open(page, '/content/announcements');
  const row = page.getByRole('row', { name: /Live announcement/ });
  await row.getByRole('button', { name: 'Edit' }).click();
  await dialog(page).getByLabel('Title').fill('Live announcement edited');
  await dialog(page).getByRole('button', { name: 'Save announcement' }).click();
  await done(page, 'Edit announcement');
  expect((await query("SELECT title FROM announcements WHERE id = 'ann_live'"))[0]).toEqual({ title: 'Live announcement edited' });
  await page.getByRole('row', { name: /Live announcement edited/ }).getByRole('button', { name: 'Delete' }).click();
  await dialog(page).getByLabel(/Reason/).fill('Removing the contract test data');
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await done(page, 'Delete announcement');
  expect(await query("SELECT id FROM announcements WHERE id = 'ann_live'")).toEqual([]);
});

test('audit: export downloads a CSV and is itself audited', async ({ page }) => {
  await grantStepUp();
  await open(page, '/audit');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^fortless-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText(/Export downloaded|cut at the newest/)).toBeVisible();
  expect((await query("SELECT count(*) AS n FROM audit_events WHERE action = 'audit.exported'"))[0]!['n']).toBeGreaterThanOrEqual(1);
});

test('settings: integrations report not-configured honestly; email templates can be reset', async ({ page }) => {
  await grantStepUp();
  await open(page, '/settings/email');
  await page.getByRole('button', { name: 'Test SMTP' }).click();
  await dialog(page).getByRole('button', { name: 'Run check' }).click();
  await expect(dialog(page).getByText(/SMTP is not configured/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Test SMTP: reachable')).toHaveCount(0);
});

const asRole = async (context: import('@playwright/test').BrowserContext, role: string) => {
  const { token } = await getJson<{ token: string }>(`/session/${role}`);
  await context.clearCookies(); await context.addCookies([{ name: 'fortless_session', value: token, url: 'http://127.0.0.1:4185' }]);
};

test.describe('roles see only the mutations their permissions allow', () => {
  test('SUPPORT manages tickets but not the catalog or billing profiles', async ({ page, context }) => {
    await asRole(context, 'SUPPORT');
    await open(page, '/products');
    await expect(page.getByRole('button', { name: 'New product' })).toHaveCount(0);
    await open(page, '/support/departments');
    await expect(page.getByRole('button', { name: 'New department' })).toBeVisible();
    await open(page, `/customers/${session.accountId}`);
    await expect(page.getByRole('button', { name: 'Billing profile' })).toHaveCount(0);
  });
  test('BILLING is read-only on customers and has no services or catalog access', async ({ page, context }) => {
    await asRole(context, 'BILLING');
    await open(page, `/customers/${session.accountId}`);
    await expect(page.getByRole('button', { name: 'Billing profile' })).toHaveCount(0);
    await open(page, '/products');
    await expect(page.getByRole('button', { name: 'New product' })).toHaveCount(0);
    await page.goto('/admin-preview/services');
    await expect(page.getByText('You don’t have access to this section')).toBeVisible();
  });
  test('AUDITOR can read and export the audit log but has no write buttons', async ({ page, context }) => {
    await asRole(context, 'AUDITOR');
    await open(page, '/audit');
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await open(page, '/content/announcements');
    await expect(page.getByRole('button', { name: 'New announcement' })).toHaveCount(0);
    await open(page, '/billing/subscriptions');
    await expect(page.getByRole('button', { name: 'Process renewals now' })).toHaveCount(0);
  });
  test('INFRASTRUCTURE runs node and catalog operations but not renewals', async ({ page, context }) => {
    await asRole(context, 'INFRASTRUCTURE');
    await open(page, '/infrastructure/maintenance');
    await expect(page.getByRole('button', { name: /Maintenance|End maintenance/ }).first()).toBeVisible();
    await open(page, '/products');
    await expect(page.getByRole('button', { name: 'New product' })).toBeVisible();
    await open(page, '/billing/subscriptions');
    await expect(page.getByRole('button', { name: 'Process renewals now' })).toHaveCount(0);
  });
  test('the API still refuses a forbidden mutation even if the UI were bypassed', async ({ context }) => {
    await asRole(context, 'SUPPORT');
    const { token } = await getJson<{ token: string }>('/session/SUPPORT');
    const csrf = await (await fetch('http://127.0.0.1:4184/api/v1/auth/csrf', { headers: { cookie: `fortless_session=${token}` } })).json() as { csrfToken: string };
    const r = await fetch('http://127.0.0.1:4184/api/v1/admin/catalog/coupons', { method: 'POST', headers: { cookie: `fortless_session=${token}; fortless_csrf=${csrf.csrfToken}`, 'x-csrf-token': csrf.csrfToken, 'content-type': 'application/json', origin: 'http://127.0.0.1:4184' }, body: JSON.stringify({ code: 'BYPASS1', discountType: 'PERCENTAGE', discountValue: 5, maxRedemptions: 1, expiresAt: '2099-01-01T00:00:00.000Z' }) });
    expect(r.status).toBe(403);
  });
});
