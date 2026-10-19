/** Independent re-verification of authorization and data-exposure findings that were marked FIXED_IN_CODE. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { makeHarness, type Harness } from './helpers/harness.js';
import { createTicket, addTicketAttachment } from '../src/modules/support/tickets.js';
import { createQuote } from '../src/modules/pricing/quote.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

const ticketFor = async (token: string, subject: string) => (await h.call('POST', '/api/v1/tickets', token, { subject, priority: 'NORMAL', message: 'Verification ticket body.' })).json().ticketId as string;
const upload = (token: string, ticketId: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', `/api/v1/tickets/${ticketId}/attachments`, token, { filename: 'note.txt', contentType: 'text/plain', dataBase64: Buffer.from('hello').toString('base64'), ...extra });

describe('NEW-310 / NEW-321: an attachment can only hang off a message of the same ticket', () => {
  it('rejects a message id that belongs to another ticket or another workspace', async () => {
    const a = h.user('u_att_a', { accountId: 'acc_att_a' });
    const b = h.user('u_att_b', { accountId: 'acc_att_b' });
    const t1 = await ticketFor(a.token, 'First ticket');
    const t2 = await ticketFor(a.token, 'Second ticket');
    const tB = await ticketFor(b.token, 'Other tenant');
    const msgOf = (ticketId: string) => (h.db.prepare('SELECT id FROM ticket_messages WHERE ticket_id = ?').get(ticketId) as { id: string }).id;
    expect((await upload(a.token, t1, { messageId: msgOf(t2) })).statusCode).toBe(400);
    expect((await upload(a.token, t1, { messageId: msgOf(tB) })).statusCode).toBe(400);
    expect((await upload(a.token, t1, { messageId: msgOf(t1) })).statusCode).toBe(201);
    expect((await upload(b.token, t1)).statusCode).toBe(404); // another tenant's ticket does not exist for b
  });
});

describe('NEW-311 / NEW-320: no server path in any attachment response', () => {
  it('returns only public fields from upload and list', async () => {
    const a = h.user('u_att_pub', { accountId: 'acc_att_pub' });
    const ticketId = await ticketFor(a.token, 'Path exposure');
    const created = await upload(a.token, ticketId);
    const listed = await h.call('GET', `/api/v1/tickets/${ticketId}/attachments`, a.token);
    for (const body of [JSON.stringify(created.json()), JSON.stringify(listed.json())]) {
      expect(body).not.toMatch(/storage_path|\/data\/attachments|file_hash/);
    }
  });
});

describe('NEW-317: a failed database write leaves no orphan file', () => {
  it('removes the stored bytes when the attachment row cannot be written', () => {
    const a = h.user('u_att_orphan', { accountId: 'acc_att_orphan' });
    const ticket = createTicket({ accountId: a.accountId, userId: a.id, subject: 'Orphan check', priority: 'NORMAL', message: 'Body text here.', ipAddress: '127.0.0.1' }, h.db) as { ticketId: string };
    const dir = fs.mkdtempSync('/tmp/fortless-att-');
    h.db.exec("CREATE TRIGGER block_att BEFORE INSERT ON ticket_attachments BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    try {
      expect(() => addTicketAttachment({ ticketId: ticket.ticketId, accountId: a.accountId, userId: a.id, filename: 'x.txt', contentType: 'text/plain', buffer: Buffer.from('data'), ipAddress: '127.0.0.1', storageBaseDir: dir }, h.db)).toThrow('disk full');
      const leftovers = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('x.txt')) : [];
      expect(leftovers).toHaveLength(0);
    } finally { h.db.exec('DROP TRIGGER block_att'); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('SEC-05: notifications are read per user', () => {
  it('does not let one member mark another member\'s notification read', async () => {
    const owner = h.user('u_not_owner', { accountId: 'acc_not' });
    const peer = h.user('u_not_peer', { accountId: 'acc_not', role: 'VIEWER' });
    h.db.prepare("INSERT INTO notifications (id, account_id, user_id, type, title, message) VALUES ('notif_private', 'acc_not', ?, 'X', 't', 'm')").run(owner.id);
    const res = await h.call('POST', '/api/v1/notifications/notif_private/read', peer.token);
    expect(res.json()).toMatchObject({ updated: false });
    expect((h.db.prepare("SELECT read_at r FROM notifications WHERE id = 'notif_private'").get() as any).r).toBeNull();
    expect((await h.call('POST', '/api/v1/notifications/notif_private/read', owner.token)).json()).toMatchObject({ updated: true });
  });
});

describe('SEC-06: email queue figures are per recipient for customers', () => {
  it('counts only the caller\'s own messages', async () => {
    const a = h.user('u_mail_a', { accountId: 'acc_mail_a' });
    const b = h.user('u_mail_b', { accountId: 'acc_mail_b' });
    const add = (to: string, n: number) => { for (let i = 0; i < n; i++) h.db.prepare("INSERT INTO email_outbox (id, recipient, template, subject, payload_json, status) VALUES (?, ?, 'welcome', 's', '{}', 'SENT')").run(`eml_${to}_${i}`, to); };
    add('u_mail_a@example.test', 2); add('u_mail_b@example.test', 5);
    const res = (await h.call('GET', '/api/v1/email/status', a.token)).json();
    expect(res.sentCount).toBe(2);
    expect((await h.call('GET', '/api/v1/email/status', b.token)).json().sentCount).toBe(5);
  });
});

describe('NEW-323: database passwords need database.view_password', () => {
  it('asks the panel for passwords only when the member holds that permission', async () => {
    const { createServerPanelApi } = await import('../src/modules/provisioning/server-panel.js');
    const { PterodactylHttpAdapter } = await import('../src/modules/provisioning/adapter.js');
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_dbpw', 'reg_fra_1', 'i', 'n', 'n.test', 1000, 1000)").run();
    const owner = h.user('u_dbpw_owner', { accountId: 'acc_dbpw' });
    const guest = h.user('u_dbpw_guest', { accountId: 'acc_dbpw_g' });
    h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id, external_id) VALUES ('svc_dbpw', 'acc_dbpw', 'oi_dbpw', 'PTERODACTYL', 'p', 'ACTIVE', 'n_dbpw', '9')").run();
    h.db.prepare("INSERT INTO service_members (id, service_id, user_id, preset) VALUES ('sm_dbpw', 'svc_dbpw', ?, 'operator')").run(guest.id);
    const calls: string[] = [];
    class Panel extends PterodactylHttpAdapter {
      constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'k' }); }
      override async ensurePanelUser(spec: { correlationTag: string; email: string; username: string }) { return { panelUserId: spec.email.length * 7 + spec.correlationTag.length, username: spec.username, email: spec.email }; }
      override async assignServerOwner() { return false; }
      override async mintAccountClientKey() { return 'ptlc_' + 'x'.repeat(40); }
      override async clientServerCall(_i: string, _k: string, _m: any, sub: string) { calls.push(sub); return { data: [{ attributes: { id: 1, name: 'db', username: 'u', host: { address: 'h', port: 3306 }, relationships: { password: { attributes: { password: 'SECRETPW' } } } } }] }; }
    }
    const api = createServerPanelApi({ adapter: new Panel(), db: h.db, secret: 'k'.repeat(40) });
    const asGuest = await api.databases({ serviceId: 'svc_dbpw', accountId: guest.accountId, userId: guest.id, role: 'OWNER' });
    expect(calls.at(-1)).toBe('/databases');
    expect(asGuest.databases[0]!.password).toBeNull();
    const asOwner = await api.databases({ serviceId: 'svc_dbpw', accountId: owner.accountId, userId: owner.id, role: 'OWNER' });
    expect(calls.at(-1)).toBe('/databases?include=password');
    expect(asOwner.databases[0]!.password).toBe('SECRETPW');
  });
});

describe('NEW-328: quotes only cover plans that are published', () => {
  it('refuses a plan version of an unpublished product', () => {
    const u = h.user('u_quote', { accountId: 'acc_quote' });
    h.db.prepare("UPDATE products SET is_published = 0 WHERE id = (SELECT product_id FROM plan_versions WHERE id = 'plv_mc_4gb')").run();
    expect(() => createQuote(u.accountId, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, h.db)).toThrow(/not available for purchase/);
    h.db.prepare("UPDATE products SET is_published = 1 WHERE id = (SELECT product_id FROM plan_versions WHERE id = 'plv_mc_4gb')").run();
  });
});

describe('NEW-331 / NEW-342: only an owner, with a fresh step-up, can invite an owner', () => {
  it('refuses OWNER invitations from TECH_ADMIN and without step-up', async () => {
    const owner = h.user('u_inv_owner', { accountId: 'acc_inv' });
    const tech = h.user('u_inv_tech', { accountId: 'acc_inv', role: 'TECH_ADMIN' });
    const invite = (token: string, role: string) => h.call('POST', '/api/v1/account/members/invite', token, { email: `new-${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`, role });
    expect((await invite(owner.token, 'OWNER')).statusCode).toBe(403);   // no step-up yet
    h.stepUp(owner.id);
    expect((await invite(owner.token, 'OWNER')).statusCode).toBe(201);
    h.stepUp(tech.id);
    const asTech = await invite(tech.token, 'OWNER');
    expect(asTech.statusCode).toBe(400);
    expect(asTech.json().error).toMatch(/owner/i);
    expect((await invite(tech.token, 'VIEWER')).statusCode).toBe(201);
  });
});

describe('FTL-SEC-203: recovery codes can only be regenerated right after a step-up', () => {
  it('answers STEP_UP_REQUIRED without a recent verification', async () => {
    const u = h.user('u_rc', { accountId: 'acc_rc' });
    const res = await h.call('POST', '/api/v1/auth/mfa/recovery-codes/regenerate', u.token, {});
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('STEP_UP_REQUIRED');
  });
});

describe('FTL-SEC-205: an account-wide failure ceiling holds across addresses', () => {
  it('locks sign-in after ten failures from different addresses, even with the right password', async () => {
    const { registerUser, loginUser } = await import('../src/modules/identity/auth.js');
    const reg = registerUser({ email: 'lockme@example.com', password: 'Password12345!', name: 'L', ipAddress: '127.0.0.1', userAgent: 't' }, h.db);
    h.db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now','utc') WHERE id = ?").run(reg.user.id);
    for (let i = 0; i < 10; i++) {
      expect(() => loginUser({ email: 'lockme@example.com', password: 'wrong-password-123', ipAddress: `198.51.100.${i + 1}`, userAgent: 't' }, h.db)).toThrow();
    }
    expect(() => loginUser({ email: 'lockme@example.com', password: 'Password12345!', ipAddress: '198.51.100.200', userAgent: 't' }, h.db)).toThrow(/Too many sign-in attempts/);
  });
});

describe('FTL-UI-201 / UI-08: the server tells the UI who may control what', () => {
  it('marks a billing-only member as unable to control services and exposes provider/lifecycle state', async () => {
    const owner = h.user('u_ctl_owner', { accountId: 'acc_ctl' });
    const billing = h.user('u_ctl_billing', { accountId: 'acc_ctl', role: 'BILLING_MANAGER' });
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_ctl', 'reg_fra_1', 'i', 'n', 'n.test', 1000, 1000)").run();
    h.db.prepare("INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status) VALUES ('oi_ctl', 'ord_ctl', 'plv_mc_4gb', 'reg_fra_1', '{}', 'FULFILLED')").run();
    h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id) VALUES ('svc_ctl', 'acc_ctl', 'oi_ctl', 'PTERODACTYL', 'p', 'TERMINATED', 'n_ctl')").run();
    const asBilling = (await h.call('GET', '/api/v1/services', billing.token)).json().services as Array<Record<string, any>>;
    const asOwner = (await h.call('GET', '/api/v1/services', owner.token)).json().services as Array<Record<string, any>>;
    expect(asBilling.find((s) => s.id === 'svc_ctl')?.user_can_control).toBe(false);
    expect(asOwner.find((s) => s.id === 'svc_ctl')?.contract_status).toBe('TERMINATED');
  });
});

describe('NEW-312: pages that depend on the visitor are never publicly cacheable', () => {
  it('serves the app and login shells with no-store', async () => {
    for (const url of ['/login', '/register', '/app', '/forgot-password']) {
      const res = await h.app.inject({ method: 'GET', url });
      const cc = String(res.headers['cache-control'] ?? '');
      expect(cc, url).toMatch(/no-store|private/);
      expect(cc, url).not.toMatch(/public/);
    }
  });
});
