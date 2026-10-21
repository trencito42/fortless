import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';
import { createTicket } from '../src/modules/support/tickets.js';
import {
  announcementEditBody, billingProfileBody, categoryBody, couponBody, departmentBody, macroBody, parseOptions, planCreateBody, productCreateBody, productEditBody, routingBody, templateBody,
} from '../frontend-react/src/admin/live/bodies.js';

/**
 * Contract test for the React Admin mutations. Each request body is built by the same pure functions the UI forms use
 * (frontend-react/src/admin/live/bodies.ts) and is sent to the real Fastify routes with a throw-away database, so a UI/backend drift fails here.
 */
let h: Harness;
let owner: ReturnType<Harness['user']>;
beforeAll(async () => {
  h = await makeHarness();
  owner = h.user('ra_owner', { staff: 'OWNER' });
  h.stepUp(owner.id);
});
afterAll(async () => { await h.close(); });

const ok = (r: { statusCode: number; body: string }, codes = [200, 201]) => expect(codes, r.body).toContain(r.statusCode);

describe('catalog mutations', () => {
  let productId = '';
  let planId = '';
  it('creates, edits and lists a product through the form bodies', async () => {
    const category = h.db.prepare('SELECT id FROM categories LIMIT 1').get() as { id: string };
    const created = await h.call('POST', '/api/v1/admin/catalog/products', owner.token, productCreateBody({ categoryId: category.id, slug: 'ui-contract', name: 'UI contract product', description: 'Created by the contract test', providerType: 'PTERODACTYL' }));
    ok(created); productId = (created.json() as { id: string }).id;
    ok(await h.call('PUT', `/api/v1/admin/catalog/products/${productId}`, owner.token, productEditBody({ categoryId: category.id, name: 'UI contract product v2', description: 'Edited', countries: 'DE, ro', max: '3', from: '', until: '', verified: 'yes' })));
    const listed = (await h.call('GET', '/api/v1/admin/catalog/products', owner.token)).json() as { products: Array<{ id: string; name: string; restrictions: { allowedCountries: string[]; maxServicesPerAccount: number } }> };
    const row = listed.products.find((p) => p.id === productId)!;
    expect(row.name).toBe('UI contract product v2');
    expect(row.restrictions).toMatchObject({ allowedCountries: ['DE', 'RO'], maxServicesPerAccount: 3 });
  });

  it('creates a plan with decimal prices converted to minor units, then changes status and options', async () => {
    const body = planCreateBody(productId, { name: 'Contract 2 GB', memoryMb: '2048', cpuPct: '150', diskMb: '20480', databases: '1', backups: '2', eggId: '3', EUR_MONTHLY: '8.99', EUR_ANNUAL: '89.90', USD_MONTHLY: '9.99' });
    expect(body.prices).toEqual(expect.arrayContaining([{ currency: 'EUR', interval: 'MONTHLY', priceMinorUnits: 899, setupFeeMinorUnits: 0 }, { currency: 'EUR', interval: 'ANNUAL', priceMinorUnits: 8990, setupFeeMinorUnits: 0 }]));
    const created = await h.call('POST', '/api/v1/admin/catalog/plans', owner.token, body);
    ok(created); planId = (created.json() as { planVersionId: string }).planVersionId;
    const parsed = parseOptions('extra_backups | Extra backups | INTEGER | no | 150 | 0..5\nserver_type | Server type | SELECT | yes | 0 | paper; fabric');
    expect(parsed.error).toBeUndefined();
    ok(await h.call('PUT', `/api/v1/admin/catalog/plans/${planId}/options`, owner.token, { options: parsed.options }));
    ok(await h.call('PATCH', `/api/v1/admin/catalog/plans/${planId}/status`, owner.token, { status: 'ACTIVE' }));
    const plan = ((await h.call('GET', '/api/v1/admin/catalog/products', owner.token)).json() as { products: Array<{ id: string; plans: Array<{ id: string; status: string; options: unknown[] }> }> }).products.find((p) => p.id === productId)!.plans.find((p) => p.id === planId)!;
    expect(plan.status).toBe('ACTIVE'); expect(plan.options).toHaveLength(2);
  });

  it('rejects what the form validation also rejects', async () => {
    expect(parseOptions('Bad Key | x | BOOLEAN | no | 0').error).toMatch(/key/);
    const category = h.db.prepare('SELECT id FROM categories LIMIT 1').get() as { id: string };
    expect((await h.call('POST', '/api/v1/admin/catalog/products', owner.token, productCreateBody({ categoryId: category.id, slug: 'x', name: 'x', providerType: 'PTERODACTYL' }))).statusCode).toBe(400);
    const noEgg = planCreateBody(productId, { name: 'No egg', memoryMb: '1024', cpuPct: '100', diskMb: '10240', EUR_MONTHLY: '1.00' });
    expect((await h.call('POST', '/api/v1/admin/catalog/plans', owner.token, noEgg)).statusCode).toBe(422);
  });

  it('creates a coupon and refuses mutations to roles without catalog:manage', async () => {
    ok(await h.call('POST', '/api/v1/admin/catalog/coupons', owner.token, couponBody({ code: 'UICONTRACT10', type: 'PERCENTAGE', value: '10', max: '50', expires: '2099-12-31' })));
    const billing = h.user('ra_billing', { staff: 'BILLING' });
    expect((await h.call('POST', '/api/v1/admin/catalog/coupons', billing.token, couponBody({ code: 'NOPE1234', type: 'PERCENTAGE', value: '10', max: '5', expires: '2099-12-31' }))).statusCode).toBe(403);
  });

  it('publishing is step-up protected', async () => {
    const fresh = h.user('ra_owner_nostepup', { staff: 'OWNER' });
    const r = await h.call('PATCH', `/api/v1/admin/catalog/products/${productId}/publish`, fresh.token, { isPublished: true });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });
});

describe('billing', () => {
  it('updates the billing profile and returns it in the account detail', async () => {
    const cust = h.user('ra_customer');
    ok(await h.call('PUT', `/api/v1/admin/accounts/${cust.accountId}/billing-profile`, owner.token, billingProfileBody({ companyName: 'Contract GmbH', taxId: 'DE123456789', taxIdType: '', addressLine1: '1 Test Street', addressLine2: '', city: 'Berlin', postalCode: '10115', country: 'de' })));
    const detail = (await h.call('GET', `/api/v1/admin/accounts/${cust.accountId}`, owner.token)).json() as { billingProfile: { company_name: string; country: string; address_line2: string | null } };
    expect(detail.billingProfile).toMatchObject({ company_name: 'Contract GmbH', country: 'DE', address_line2: null });
    expect((await h.call('PUT', `/api/v1/admin/accounts/${cust.accountId}/billing-profile`, owner.token, billingProfileBody({ addressLine1: 'x', city: 'B', postalCode: '!', country: 'DEU' }))).statusCode).toBe(400);
  });
  it('runs renewals now (step-up) and reports counters', async () => {
    const r = await h.call('POST', '/api/v1/admin/billing/process-renewals', owner.token, {});
    ok(r); expect(typeof r.json()).toBe('object');
  });
});

describe('support', () => {
  it('creates a department and a macro, routes a ticket and stores an attachment', async () => {
    const dept = await h.call('POST', '/api/v1/admin/support/departments', owner.token, departmentBody({ name: 'Contract desk', description: 'Created by the contract test' }));
    ok(dept); const departmentId = (dept.json() as { id: string }).id;
    ok(await h.call('POST', '/api/v1/admin/support/macros', owner.token, macroBody({ name: 'Contract macro', body: 'Thanks, we are looking into it.', status: 'WAITING_CUSTOMER', departmentId })));
    const meta = (await h.call('GET', '/api/v1/admin/support/meta', owner.token)).json() as { departments: Array<{ id: string }>; macros: Array<{ name: string }>; staff: Array<{ id: string }> };
    expect(meta.departments.map((d) => d.id)).toContain(departmentId);
    expect(meta.macros.map((m) => m.name)).toContain('Contract macro');
    const cust = h.user('ra_ticket_customer');
    const ticket = createTicket({ accountId: cust.accountId, userId: cust.id, subject: 'Contract ticket', message: 'Please help', priority: 'NORMAL', ipAddress: '127.0.0.1' } as never, h.db) as { id?: string; ticketId?: string };
    const ticketId = ticket.id ?? ticket.ticketId!;
    ok(await h.call('PATCH', `/api/v1/admin/tickets/${ticketId}/routing`, owner.token, routingBody({ staff: owner.id, department: departmentId, priority: 'HIGH' })));
    const detail = (await h.call('GET', `/api/v1/admin/tickets/${ticketId}`, owner.token)).json() as { ticket: { assigned_staff_id: string; department_id: string; priority: string } };
    expect(detail.ticket).toMatchObject({ assigned_staff_id: owner.id, department_id: departmentId, priority: 'HIGH' });
    const attach = await h.call('POST', `/api/v1/admin/tickets/${ticketId}/attachments`, owner.token, { filename: 'notes.txt', contentType: 'text/plain', dataBase64: Buffer.from('hello').toString('base64') });
    ok(attach);
    const bad = await h.call('POST', `/api/v1/admin/tickets/${ticketId}/attachments`, owner.token, { filename: 'run.exe', contentType: 'application/x-msdownload', dataBase64: Buffer.from('MZ').toString('base64') });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('content', () => {
  it('edits and deletes categories and announcements with step-up', async () => {
    const cat = await h.call('POST', '/api/v1/admin/content/announcement-categories', owner.token, categoryBody({ slug: 'contract', name: 'Contract', description: '', sortOrder: '5' }));
    ok(cat); const catId = (cat.json() as { category: { id: string } }).category.id;
    ok(await h.call('PUT', `/api/v1/admin/content/announcement-categories/${catId}`, owner.token, categoryBody({ slug: 'contract', name: 'Contract renamed', description: 'd', sortOrder: '6' })));
    const created = await h.call('POST', '/api/v1/admin/content/announcements', owner.token, { slug: 'contract-news', title: 'Contract news', category: 'contract', kind: 'NEWS', bodyMarkdown: 'Body', isPublished: false });
    ok(created); const annId = (created.json() as { announcement: { id: string } }).announcement.id;
    ok(await h.call('PUT', `/api/v1/admin/content/announcements/${annId}`, owner.token, announcementEditBody({ slug: 'contract-news', category: 'contract', kind: 'NEWS', title: 'Contract news edited', body: 'Body 2', publication: 'PUBLISHED' })));
    const content = (await h.call('GET', '/api/v1/admin/content', owner.token)).json() as { announcements: Array<{ id: string; title: string; isPublished: boolean }> };
    expect(content.announcements.find((a) => a.id === annId)).toMatchObject({ title: 'Contract news edited', isPublished: true });
    ok(await h.call('DELETE', `/api/v1/admin/content/announcements/${annId}`, owner.token, {}));
    ok(await h.call('DELETE', `/api/v1/admin/content/announcement-categories/${catId}`, owner.token, {}));
    const fresh = h.user('ra_content_nostepup', { staff: 'OWNER' });
    expect((await h.call('DELETE', `/api/v1/admin/content/announcement-categories/${catId}`, fresh.token, {})).statusCode).toBe(403);
  });
});

describe('settings, audit and list transport', () => {
  it('overrides and resets an email template', async () => {
    const all = ((await h.call('GET', '/api/v1/admin/settings/email-templates', owner.token)).json() as { templates: Array<{ template: string; subject: string; text: string; html: string }> }).templates;
    const t = all.find((x) => !['email_verification', 'password_reset', 'account_invitation', 'service_invitation'].includes(x.template))!;
    const link = all.find((x) => x.template === 'email_verification')!;
    // Built-in link templates carry a sample URL, not the placeholder: saving them unchanged must be refused, exactly as the form warns.
    expect((await h.call('PUT', `/api/v1/admin/settings/email-templates/${link.template}`, owner.token, templateBody({ subject: link.subject, text: link.text, html: link.html }))).statusCode).toBe(422);
    ok(await h.call('PUT', `/api/v1/admin/settings/email-templates/${t.template}`, owner.token, templateBody({ subject: `${t.subject} (edited)`, text: t.text, html: t.html })));
    const after = ((await h.call('GET', '/api/v1/admin/settings/email-templates', owner.token)).json() as { templates: Array<{ template: string; subject: string; overridden: boolean }> }).templates.find((x) => x.template === t.template)!;
    expect(after).toMatchObject({ overridden: true, subject: `${t.subject} (edited)` });
    ok(await h.call('DELETE', `/api/v1/admin/settings/email-templates/${t.template}`, owner.token, {}));
  });
  it('reports unconfigured integrations as typed 503s instead of success', async () => {
    expect((await h.call('POST', '/api/v1/admin/settings/test-smtp', owner.token, {})).statusCode).toBe(503);
    expect((await h.call('POST', '/api/v1/admin/settings/test-stripe', owner.token, {})).statusCode).toBe(503);
    expect((await h.call('POST', '/api/v1/admin/settings/test-provider', owner.token, {})).statusCode).toBe(503);
  });
  it('exports the audit log as CSV and audits the export itself', async () => {
    const r = await h.call('GET', '/api/v1/admin/audit/export?q=catalog&from=2020-01-01', owner.token);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.body.split('\n')[0]).toContain('correlation_id');
    expect(h.db.prepare("SELECT count(*) AS n FROM audit_events WHERE action = 'audit.exported'").get()).toMatchObject({ n: 1 });
  });
  it('supports server-side search and offset paging on lists', async () => {
    for (let i = 0; i < 3; i++) h.user(`ra_page_${i}`);
    const page1 = (await h.call('GET', '/api/v1/admin/accounts?limit=2&offset=0&q=acc_ra_page', owner.token)).json() as { accounts: Array<{ id: string }>; total: number; limit: number; offset: number };
    const page2 = (await h.call('GET', '/api/v1/admin/accounts?limit=2&offset=2&q=acc_ra_page', owner.token)).json() as { accounts: Array<{ id: string }>; total: number };
    expect(page1).toMatchObject({ total: 3, limit: 2, offset: 0 }); expect(page1.accounts).toHaveLength(2); expect(page2.accounts).toHaveLength(1);
    expect(new Set([...page1.accounts, ...page2.accounts].map((a) => a.id)).size).toBe(3);
  });
});
