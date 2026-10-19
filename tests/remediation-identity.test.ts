import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';
import { registerUser, verifyEmail, authenticateSession, createSessionForUser, switchWorkspace, listUserWorkspaces } from '../src/modules/identity/auth.js';
import { getServiceAccess, PERMISSION_PRESETS } from '../src/modules/provisioning/service-access.js';
import { updateAccountStatus } from '../src/modules/admin/read-model.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

describe('NEW-363: the verification link proves the mailbox but never signs anyone in', () => {
  it('activates the account without issuing a session, and the route asks the visitor to sign in', async () => {
    const pre = registerUser({ email: 'victim@example.com', password: 'AttackerChosen12345!', name: 'Attacker', ipAddress: '203.0.113.9', userAgent: 'attacker' }, h.db);
    const res = await h.call('POST', '/api/v1/auth/verify-email', null, { token: pre.verificationToken });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verified: true, loginRequired: true });
    expect(String(res.headers['set-cookie'] ?? '')).not.toContain('fortless_session');
    expect(h.db.prepare("SELECT COUNT(*) c FROM sessions WHERE user_id = ?").get(pre.user.id)).toEqual({ c: 0 });
    expect((h.db.prepare('SELECT status FROM users WHERE id = ?').get(pre.user.id) as any).status).toBe('ACTIVE');
  });

  it('the library default still issues a session for callers that sign the user in themselves', () => {
    const pre = registerUser({ email: 'second@example.com', password: 'Password12345!', name: 'Second', ipAddress: '127.0.0.1', userAgent: 't' }, h.db);
    expect(verifyEmail(pre.verificationToken, { ipAddress: '127.0.0.1', userAgent: 't' }, h.db).token.length).toBeGreaterThan(10);
  });
});

describe('NEW-368: the workspace belongs to the session', () => {
  it('joining an older workspace does not change the active workspace, and switching is explicit and audited', () => {
    const own = registerUser({ email: 'ws-user@example.com', password: 'Password12345!', name: 'WS User', ipAddress: '127.0.0.1', userAgent: 't' }, h.db);
    h.db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now', 'utc') WHERE id = ?").run(own.user.id);
    h.db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email, created_at) VALUES ('acc_older', 'Older', ?, 'o@example.test', '2000-01-01 00:00:00')").run('owner_other');
    const token = createSessionForUser(own.user.id, '127.0.0.1', 't', true, h.db);
    expect(authenticateSession(token, h.db)?.account.id).toBe(own.account.id);
    h.db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('mem_join', 'acc_older', ?, 'VIEWER')").run(own.user.id);
    expect(authenticateSession(token, h.db)?.account.id).toBe(own.account.id); // still the workspace the session started in
    const sessionId = (h.db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(own.user.id) as any).id as string;
    expect(switchWorkspace({ userId: own.user.id, sessionId, accountId: 'acc_nope', ipAddress: '127.0.0.1' }, h.db)).toBe(false);
    expect(switchWorkspace({ userId: own.user.id, sessionId, accountId: 'acc_older', ipAddress: '127.0.0.1' }, h.db)).toBe(true);
    const ctx = authenticateSession(token, h.db);
    expect(ctx?.account.id).toBe('acc_older');
    expect(ctx?.membership.role).toBe('VIEWER');
    expect(listUserWorkspaces(own.user.id, 'acc_older', h.db).map((w) => w.current)).toContain(true);
    expect(h.db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'session.workspace_switched'").get()).toEqual({ c: 1 });
  });

  it('the switch route needs membership', async () => {
    const a = h.user('u_ws_http', { accountId: 'acc_ws_http' });
    expect((await h.call('POST', '/api/v1/auth/workspace', a.token, { accountId: 'acc_not_mine' })).statusCode).toBe(404);
    expect((await h.call('POST', '/api/v1/auth/workspace', a.token, { accountId: 'acc_ws_http' })).statusCode).toBe(200);
    expect((await h.call('GET', '/api/v1/auth/workspaces', a.token)).json().workspaces).toHaveLength(1);
  });
});

describe('NEW-404: the shared viewer preset cannot send commands or read file contents', () => {
  it('has no control.console or file.read-content', () => {
    expect(PERMISSION_PRESETS.viewer).not.toContain('control.console');
    expect(PERMISSION_PRESETS.viewer).not.toContain('file.read-content');
    expect(PERMISSION_PRESETS.viewer).toContain('websocket.connect');
  });
});

describe('NEW-409: locking an account contains it', () => {
  it('suspends services, cuts shares, keys and invitations, denies shared access, and unlocking restores only what the lock took', () => {
    const owner = h.user('u_lock_owner', { accountId: 'acc_lock' });
    const guest = h.user('u_lock_guest', { accountId: 'acc_guest' });
    h.db.prepare("INSERT OR IGNORE INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n_lock', 'reg_fra_1', 'i', 'n', 'n.test', 1000, 1000)").run();
    const svc = (id: string, status: string, reason: string | null) => h.db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id, suspension_reason, external_id) VALUES (?, 'acc_lock', ?, 'PTERODACTYL', 'p', ?, 'n_lock', ?, '77')").run(id, `oi_${id}`, status, reason);
    svc('svc_lock_a', 'ACTIVE', null);
    svc('svc_lock_b', 'SUSPENDED', 'DISPUTE');
    h.db.prepare("INSERT INTO service_members (id, service_id, user_id, preset) VALUES ('sm_lock', 'svc_lock_a', ?, 'viewer')").run(guest.id);
    h.db.prepare("INSERT INTO panel_client_keys (account_id, encrypted_key) VALUES ('acc_lock', 'enc')").run();
    expect(getServiceAccess(h.db, { serviceId: 'svc_lock_a', accountId: 'acc_guest', userId: guest.id })?.kind).toBe('MEMBER');

    updateAccountStatus({ accountId: 'acc_lock', status: 'FLAGGED_FRAUD', reason: 'chargeback ring', actorUserId: 'staff', ipAddress: '127.0.0.1' }, h.db);
    const row = (id: string) => h.db.prepare('SELECT contract_status s, suspension_reason r FROM services WHERE id = ?').get(id) as any;
    expect(row('svc_lock_a')).toEqual({ s: 'SUSPENDED', r: 'ACCOUNT_LOCK' });
    expect(row('svc_lock_b')).toEqual({ s: 'SUSPENDED', r: 'DISPUTE' });
    expect(h.db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE event_type = 'service.suspend.v1' AND aggregate_id = 'svc_lock_a'").get()).toEqual({ c: 1 });
    expect(h.db.prepare('SELECT COUNT(*) c FROM service_members WHERE service_id = ?').get('svc_lock_a')).toEqual({ c: 0 });
    expect(h.db.prepare("SELECT COUNT(*) c FROM panel_client_keys WHERE account_id = 'acc_lock'").get()).toEqual({ c: 0 });
    expect(getServiceAccess(h.db, { serviceId: 'svc_lock_a', accountId: 'acc_lock', userId: owner.id })).toBeUndefined();
    expect(getServiceAccess(h.db, { serviceId: 'svc_lock_a', accountId: 'acc_guest', userId: guest.id })).toBeUndefined();

    updateAccountStatus({ accountId: 'acc_lock', status: 'ACTIVE', reason: 'cleared', actorUserId: 'staff', ipAddress: '127.0.0.1' }, h.db);
    expect(row('svc_lock_a')).toEqual({ s: 'ACTIVE', r: null });
    expect(row('svc_lock_b')).toEqual({ s: 'SUSPENDED', r: 'DISPUTE' }); // a dispute suspension is not lifted by unlocking
  });
});

describe('NEW-403: tax country is server-side', () => {
  it('ignores the country and B2B flag sent by the client and uses the billing profile (default DE)', async () => {
    const buyer = h.user('u_tax', { accountId: 'acc_tax' });
    const plan = (h.db.prepare("SELECT id FROM plan_versions WHERE id = 'plv_mc_4gb'").get() as any).id as string;
    const ask = async (extra: object) => (await h.call('POST', '/api/v1/quotes', buyer.token, { items: [{ planVersionId: plan, quantity: 1 }], ...extra })).json();
    const asClaimed = await ask({ billingCountry: 'US', isB2B: true, taxId: 'FR12345678901' });
    expect(asClaimed.taxEvidence.taxRateBasisPoints).toBe(1900);
    expect(asClaimed.taxEvidence.isB2B).toBe(false);
    h.db.prepare("INSERT INTO billing_profiles (id, account_id, address_line1, city, postal_code, country) VALUES ('bp_tax', 'acc_tax', 'Street 1', 'Paris', '75001', 'FR')").run();
    const withProfile = await ask({ billingCountry: 'DE' });
    expect(withProfile.taxEvidence.taxRateBasisPoints).toBe(2000);
  });
});
