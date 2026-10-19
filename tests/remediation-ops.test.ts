import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';
import { csvCell } from '../src/utils/csv.js';
import { SESSION_TTL_HOURS, STEP_UP_TTL_MINUTES } from '../src/modules/identity/auth.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

describe('NEW-399: customer audit views hide staff notes and other people\'s addresses', () => {
  it('a VIEWER cannot export, and exports for managers carry no staff metadata or foreign IPs', async () => {
    const owner = h.user('u_aud_owner', { accountId: 'acc_aud' });
    const viewer = h.user('u_aud_viewer', { accountId: 'acc_aud', role: 'VIEWER' });
    h.db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES ('aud_staff1', 'acc_aud', 'staff_x', 'STAFF', 'account.status_changed', 'account', 'acc_aud', '198.51.100.7', 'cor1', ?)`).run(JSON.stringify({ reason: 'INTERNAL-NOTE chargeback ring' }));
    h.db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES ('aud_member1', 'acc_aud', ?, 'USER', 'service.power', 'service', 'svc', '203.0.113.99', 'cor2', '{}')`).run(viewer.id);

    expect((await h.call('GET', '/api/v1/activity/export', viewer.token)).statusCode).toBe(403);
    const exported = await h.call('GET', '/api/v1/activity/export', owner.token);
    expect(exported.statusCode).toBe(200);
    expect(exported.body).not.toContain('INTERNAL-NOTE');
    expect(exported.body).toContain('account.status_changed');

    const list = await h.call('GET', '/api/v1/audit', viewer.token);
    expect(list.statusCode).toBe(200);
    const logs = list.json().logs as Array<Record<string, any>>;
    const staff = logs.find((l) => l.id === 'aud_staff1')!;
    expect(staff.metadata).toBe('{}');
    expect(staff.ip_address).toBeNull();
    expect(staff.actor_name).toBe('Fortless staff');
    expect(logs.find((l) => l.id === 'aud_member1')!.ip_address).toBe('203.0.113.99'); // a member's own address stays visible to them
  });
});

describe('NEW-400: spreadsheet formulas are neutralised', () => {
  it('prefixes cells that start with = + - @ or a tab', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
      expect(csvCell(evil).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell('plain "quoted"')).toBe('"plain ""quoted"""');
    expect(csvCell(null)).toBe('""');
  });
});

describe('NEW-380: the admin audit export is audited, needs step-up and states truncation', () => {
  it('demands a recent step-up, records the export and marks a cut-off', async () => {
    const auditor = h.user('u_exp_auditor', { accountId: 'acc_exp', staff: 'AUDITOR' });
    expect((await h.call('GET', '/api/v1/admin/audit/export', auditor.token)).statusCode).toBe(403);
    h.stepUp(auditor.id);
    const fill = h.db.prepare("INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata) VALUES (?, NULL, 'SYSTEM', 'test.fill', 'x', 'x', 'c', '{}')");
    h.db.transaction(() => { for (let i = 0; i < 10_050; i++) fill.run(`aud_fill_${i}`); })();
    const res = await h.call('GET', '/api/v1/admin/audit/export', auditor.token);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-fortless-truncated']).toBe('true');
    expect(res.body).toContain('# TRUNCATED');
    expect(h.db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'audit.exported'").get()).toEqual({ c: 1 });
  });
});

describe('NEW-378/NEW-406/NEW-407: staff sync, settings and search', () => {
  it('sync needs services:manage and never reports success when the provider is not configured', async () => {
    const support = h.user('u_sync_support', { accountId: 'acc_sync', staff: 'SUPPORT' });
    const infra = h.user('u_sync_infra', { accountId: 'acc_sync2', staff: 'INFRASTRUCTURE' });
    expect((await h.call('POST', '/api/v1/admin/services/svc_x/sync', support.token)).statusCode).toBe(403);
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_sync', 'reg_fra_1', 'i', 'n', 'n.test', 1000, 1000)").run();
    h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id, external_id) VALUES ('svc_sync', 'acc_sync', 'oi_sync', 'PTERODACTYL', 'p', 'ACTIVE', 'n_sync', '5')").run();
    const res = await h.call('POST', '/api/v1/admin/services/svc_sync/sync', infra.token);
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('settings report the enforced TTLs and hide infrastructure details from non-infrastructure roles', async () => {
    const billing = h.user('u_set_billing', { accountId: 'acc_set1', staff: 'BILLING' });
    const infra = h.user('u_set_infra', { accountId: 'acc_set2', staff: 'INFRASTRUCTURE' });
    const asBilling = (await h.call('GET', '/api/v1/admin/settings', billing.token)).json();
    expect(asBilling.security.sessionTtlHours).toBe(SESSION_TTL_HOURS);
    expect(asBilling.security.stepUpTtlMinutes).toBe(STEP_UP_TTL_MINUTES);
    expect(asBilling.email.user).toBeNull();
    expect(asBilling.email.host).toBeNull();
    expect(asBilling.general.nodeEnv).toBeNull();
    const asInfra = (await h.call('GET', '/api/v1/admin/settings', infra.token)).json();
    expect(asInfra.email.host).toBeTruthy();
  });

  it('search finds admin billing pages for a billing role and shared servers for the member', async () => {
    const billing = h.user('u_srch_billing', { accountId: 'acc_srch1', staff: 'BILLING' });
    const titles = (await h.call('GET', '/api/v1/search?q=', billing.token)).json().results as Record<string, any[]> | undefined;
    const flat = JSON.stringify(titles ?? {});
    expect(flat).toContain('Admin: Billing Operations');
    expect(flat).not.toContain('Admin: Service Inventory');

    const owner = h.user('u_srch_owner', { accountId: 'acc_srch_o' });
    const guest = h.user('u_srch_guest', { accountId: 'acc_srch_g' });
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_srch', 'reg_fra_1', 'i', 'SearchNode', 'n.test', 1000, 1000)").run();
    h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id) VALUES ('svc_srch', ?, 'oi_srch', 'PTERODACTYL', 'p', 'ACTIVE', 'n_srch')").run(owner.accountId);
    h.db.prepare("INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status) VALUES ('oi_srch', 'ord_srch', 'plv_mc_4gb', 'reg_fra_1', '{}', 'FULFILLED')").run();
    h.db.prepare("INSERT INTO service_members (id, service_id, user_id, preset) VALUES ('sm_srch', 'svc_srch', ?, 'viewer')").run(guest.id);
    const found = JSON.stringify((await h.call('GET', '/api/v1/search?q=SearchNode', guest.token)).json());
    expect(found).toContain('svc_srch');
  });
});

describe('SEC-10: the application sets its own security headers', () => {
  it('sends HSTS over HTTPS, nosniff and a CSP that allows only the page\'s own inline scripts', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/login', headers: { 'x-forwarded-proto': 'https' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-inline' https://fonts.googleapis.com'"); // styles only
    expect(csp).toMatch(/script-src 'self'[^;]*(?:'sha256-[A-Za-z0-9+/=]+')?/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    const api = await h.app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    expect(api.headers['content-security-policy']).toBeUndefined();
    const plain = await h.app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    expect(plain.headers['strict-transport-security']).toBeUndefined(); // plain HTTP in tests
  });
});

describe('SEC-07: capability claims need keys and recorded evidence', () => {
  it('reports payments as not operational without keys and never claims verification from a mode switch', async () => {
    const { config } = await import('../src/config/index.js');
    const saved = { m: config.PAYMENTS_MODE, k: config.STRIPE_SECRET_KEY, w: config.STRIPE_WEBHOOK_SECRET, t: config.PAYMENTS_VERIFICATION_TIER };
    const read = async () => (await h.app.inject({ method: 'GET', url: '/api/v1/platform/capabilities' })).json().payments;
    try {
      (config as any).PAYMENTS_MODE = 'stripe_test'; (config as any).STRIPE_SECRET_KEY = ''; (config as any).STRIPE_WEBHOOK_SECRET = '';
      expect(await read()).toMatchObject({ enabled: false, verification: 'NOT_STARTED' });
      (config as any).STRIPE_SECRET_KEY = 'sk_test_x'; (config as any).STRIPE_WEBHOOK_SECRET = 'whsec_x';
      expect(await read()).toMatchObject({ enabled: true, verification: 'CONFIGURED' });
      (config as any).PAYMENTS_VERIFICATION_TIER = 'SANDBOX_VERIFIED';
      expect(await read()).toMatchObject({ enabled: true, verification: 'SANDBOX_VERIFIED' });
    } finally {
      (config as any).PAYMENTS_MODE = saved.m; (config as any).STRIPE_SECRET_KEY = saved.k; (config as any).STRIPE_WEBHOOK_SECRET = saved.w; (config as any).PAYMENTS_VERIFICATION_TIER = saved.t;
    }
  });
});

describe('NEW-390 / NEW-379: destructive operations are confirmed, manual billing runs are stepped up', () => {
  it('refuses reinstall, restore, backup delete and database delete without confirm:true', async () => {
    const owner = h.user('u_conf', { accountId: 'acc_conf' });
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_conf', 'reg_fra_1', 'i', 'n', 'n.test', 1000, 1000)").run();
    h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id, external_id) VALUES ('svc_conf', 'acc_conf', 'oi_conf', 'PTERODACTYL', 'p', 'ACTIVE', 'n_conf', '3')").run();
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const attempts: Array<[string, string, string]> = [
      ['POST', '/api/v1/services/svc_conf/settings/reinstall', 'reinstall'],
      ['POST', `/api/v1/services/svc_conf/backups/${uuid}/restore`, 'restore'],
      ['DELETE', `/api/v1/services/svc_conf/backups/${uuid}`, 'delete backup'],
      ['DELETE', '/api/v1/services/svc_conf/databases/4', 'delete database'],
    ];
    const { config } = await import('../src/config/index.js');
    const saved = { m: config.PROVIDER_MODE, u: config.PTERODACTYL_PANEL_URL, k: config.PTERODACTYL_API_KEY, t: config.PROVIDER_VERIFICATION_TIER };
    Object.assign(config, { PROVIDER_MODE: 'pterodactyl_1', PTERODACTYL_PANEL_URL: 'https://panel.example.test', PTERODACTYL_API_KEY: 'k', PROVIDER_VERIFICATION_TIER: 'SANDBOX_VERIFIED' });
    try {
      for (const [method, url, label] of attempts) {
        const res = await h.call(method as 'POST' | 'DELETE', url, owner.token, {});
        expect(res.statusCode, label).toBe(400);
        expect(res.json().code, label).toBe('CONFIRMATION_REQUIRED');
      }
    } finally {
      Object.assign(config, { PROVIDER_MODE: saved.m, PTERODACTYL_PANEL_URL: saved.u, PTERODACTYL_API_KEY: saved.k, PROVIDER_VERIFICATION_TIER: saved.t });
    }
  });

  it('the manual renewal run needs a fresh step-up and is audited', async () => {
    const admin = h.user('u_renew_admin', { accountId: 'acc_renew', staff: 'ADMINISTRATOR' });
    expect((await h.call('POST', '/api/v1/admin/billing/process-renewals', admin.token, {})).statusCode).toBe(403);
    h.stepUp(admin.id);
    const ok = await h.call('POST', '/api/v1/admin/billing/process-renewals', admin.token, {});
    expect(ok.statusCode).toBe(200);
    expect(h.db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'billing.renewals_run_manually'").get()).toEqual({ c: 1 });
  });
});

describe('NEW-361: cookies are Secure whenever the public origin is HTTPS', () => {
  it('sets Secure on the CSRF and device cookies although NODE_ENV is not production', async () => {
    const { config } = await import('../src/config/index.js');
    expect(config.NODE_ENV).not.toBe('production');
    expect(config.APP_ORIGIN.startsWith('https://')).toBe(true);
    const res = await h.app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('fortless_csrf=') && /;\s*Secure/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith('fortless_device_id=') && /;\s*Secure/i.test(c))).toBe(true);
  });
});
