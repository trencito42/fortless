import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, ProviderError } from '../src/modules/provisioning/adapter.js';
import { createServiceSharing, SharingError } from '../src/modules/provisioning/service-members.js';
import { createFilesApi } from '../src/modules/provisioning/files.js';
import { getServiceAccess, allows, PERMISSION_PRESETS } from '../src/modules/provisioning/service-access.js';
import { listServiceActivity } from '../src/modules/provisioning/services.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;

class FakeAdapter extends PterodactylHttpAdapter {
  calls: Array<{ method: string; sub: string; body: any; key: string }> = [];
  refuse: string | null = null;
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'app-key' }); }
  override async ensurePanelUser(spec: { correlationTag: string; email: string; username: string }) { return { panelUserId: 500 + this.calls.length + spec.email.length, username: spec.username, email: spec.email }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey(tag: string) { return `ptlc_${tag}_${'x'.repeat(30)}`; }
  override async clientServerCall(_i: string, key: string, method: any, sub: string, body?: any) {
    this.calls.push({ method, sub, body, key });
    if (this.refuse) throw new ProviderError('refused', 'HTTP_422', 422, this.refuse);
    return method === 'POST' && sub === '/users' ? { attributes: { uuid: 'sub-uuid-1' } } : null;
  }
  override async listFiles(_i: string, _d: string, key: string) { this.calls.push({ method: 'GET', sub: 'files', body: null, key }); return []; }
}

function user(id: string, email: string, status = 'ACTIVE') {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', ?, ?)`).run(id, email, `Name ${id}`, status);
}
let panelSeq = 100;
function account(accId: string, ownerId: string) {
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, ?, ?, 'b@example.test')`).run(accId, `Acc ${accId}`, ownerId);
  db.prepare(`INSERT INTO memberships (id, account_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`).run(`mem_${accId}`, accId, ownerId);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, ?, ?, ?)`).run(accId, ++panelSeq, `fl_${accId}`, `${ownerId}@example.test`, `fortless_acc_${accId}`);
}
function service(serviceId: string, accId: string) {
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', '12', 'n', datetime('now'), datetime('now'))`).run(serviceId, accId, `oi_${serviceId}`);
}
const tokenFromEmail = () => {
  const row = db.prepare("SELECT payload_json AS payload FROM email_outbox WHERE template = 'service_invitation' ORDER BY rowid DESC LIMIT 1").get() as { payload: string };
  return String(JSON.parse(row.payload).inviteUrl).split('/invite/service/')[1]!;
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
  user('usr_o', 'owner@example.test'); account('acc_o', 'usr_o'); service('svc_1', 'acc_o');
  user('usr_g', 'guest@example.test'); account('acc_g', 'usr_g');
  user('usr_x', 'stranger@example.test'); account('acc_x', 'usr_x');
});
afterEach(() => db.close());

const owner = { serviceId: 'svc_1', accountId: 'acc_o', userId: 'usr_o', role: 'OWNER' };
const guest = { userId: 'usr_g', accountId: 'acc_g' };

describe('Service sharing', () => {
  it('SHR-01: invite queues a hashed-token email, validates input, and only the owner may invite', () => {
    const sharing = createServiceSharing({ adapter: new FakeAdapter(), db, secret: SECRET });
    expect(() => sharing.invite(owner, { email: 'nope', preset: 'viewer' })).toThrow(/valid email/);
    expect(() => sharing.invite(owner, { email: 'guest@example.test', preset: 'root' })).toThrow(/access level/);
    expect(() => sharing.invite(owner, { email: 'OWNER@example.test', preset: 'viewer' })).toThrow(/already have full access/);
    sharing.invite(owner, { email: 'Guest@Example.test', preset: 'operator' });
    const raw = tokenFromEmail();
    const stored = db.prepare('SELECT token_hash, email FROM service_invitations').get() as { token_hash: string; email: string };
    expect(stored.email).toBe('guest@example.test');
    expect(stored.token_hash).not.toContain(raw);
    expect(() => sharing.invite({ ...owner, accountId: 'acc_x', userId: 'usr_x' }, { email: 'a@example.test', preset: 'viewer' })).toThrow(/Service not found/);
    expect(() => sharing.invite({ ...owner, role: 'VIEWER' }, { email: 'a@example.test', preset: 'viewer' })).toThrow(/Only the owner/);
  });

  it('SHR-02: accept creates a panel subuser with the preset permissions and grants access', async () => {
    const ad = new FakeAdapter();
    const sharing = createServiceSharing({ adapter: ad, db, secret: SECRET });
    sharing.invite(owner, { email: 'guest@example.test', preset: 'viewer' });
    const raw = tokenFromEmail();
    expect(sharing.peek(raw)).toMatchObject({ email: 'guest@example.test', userExists: true });
    await expect(sharing.accept(raw, { userId: 'usr_x', accountId: 'acc_x' })).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
    await sharing.accept(raw, guest);
    const call = ad.calls.find((c) => c.sub === '/users')!;
    expect(call.method).toBe('POST');
    expect(call.body.permissions).toEqual([...PERMISSION_PRESETS.viewer]);
    expect(call.body.email).toBe('guest@example.test'.replace('guest', 'usr_g'));
    expect(call.key).toContain('fortless_acc_acc_o');
    const access = getServiceAccess(db, { serviceId: 'svc_1', accountId: 'acc_g', userId: 'usr_g', role: 'OWNER' })!;
    expect(access.kind).toBe('MEMBER');
    expect(allows(access, 'file.read')).toBe(true);
    expect(allows(access, 'file.delete')).toBe(false);
    await expect(sharing.accept(raw, guest)).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    expect(getServiceAccess(db, { serviceId: 'svc_1', accountId: 'acc_x', userId: 'usr_x', role: 'OWNER' })).toBeUndefined();
  });

  it('SHR-03: a refusal from the panel keeps the invitation pending and creates no member', async () => {
    const ad = new FakeAdapter();
    ad.refuse = 'The user could not be added.';
    const sharing = createServiceSharing({ adapter: ad, db, secret: SECRET });
    sharing.invite(owner, { email: 'guest@example.test', preset: 'admin' });
    await expect(sharing.accept(tokenFromEmail(), guest)).rejects.toMatchObject({ code: 'PANEL_REFUSED' });
    expect(db.prepare('SELECT COUNT(*) c FROM service_members').get()).toEqual({ c: 0 });
    expect(sharing.list(owner).invitations).toHaveLength(1);
  });

  it('SHR-04: an unverified user cannot accept; expired and revoked tokens are rejected', async () => {
    const sharing = createServiceSharing({ adapter: new FakeAdapter(), db, secret: SECRET });
    db.prepare("UPDATE users SET status = 'PENDING_VERIFICATION' WHERE id = 'usr_g'").run();
    sharing.invite(owner, { email: 'guest@example.test', preset: 'viewer' });
    const raw = tokenFromEmail();
    await expect(sharing.accept(raw, guest)).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
    db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = 'usr_g'").run();
    db.prepare("UPDATE service_invitations SET expires_at = datetime('now', '-1 day')").run();
    await expect(sharing.accept(raw, guest)).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
    expect(sharing.peek(raw)).toBeNull();
    sharing.invite(owner, { email: 'guest@example.test', preset: 'viewer' });
    const id = (sharing.list(owner).invitations[0] as { id: string }).id;
    sharing.revokeInvitation(owner, id);
    await expect(sharing.accept(tokenFromEmail(), guest)).rejects.toMatchObject({ code: 'INVALID_INVITATION' });
  });

  it('SHR-05: a shared viewer reads files with their own key but cannot write; activity respects access', async () => {
    const ad = new FakeAdapter();
    const sharing = createServiceSharing({ adapter: ad, db, secret: SECRET });
    sharing.invite(owner, { email: 'guest@example.test', preset: 'viewer' });
    await sharing.accept(tokenFromEmail(), guest);
    const files = createFilesApi({ adapter: ad, db, secret: SECRET });
    const ctx = { serviceId: 'svc_1', accountId: 'acc_g', userId: 'usr_g', role: 'OWNER' };
    await files.list(ctx, '/');
    expect(ad.calls.filter((c) => c.sub === 'files').pop()!.key).toContain('fortless_acc_acc_g');
    await expect(files.write(ctx, '/server.properties', 'x')).rejects.toMatchObject({ statusCode: 403 });
    await expect(files.remove(ctx, '/', ['world'])).rejects.toMatchObject({ statusCode: 403 });
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_g', userId: 'usr_g', role: 'OWNER' }, db).total).toBeGreaterThanOrEqual(0);
    expect(() => listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_x', userId: 'usr_x', role: 'OWNER' }, db)).toThrow('Service not found');
  });

  it('SHR-06: removing a member deletes the panel subuser and ends access; only the owner can remove', async () => {
    const ad = new FakeAdapter();
    const sharing = createServiceSharing({ adapter: ad, db, secret: SECRET });
    sharing.invite(owner, { email: 'guest@example.test', preset: 'operator' });
    await sharing.accept(tokenFromEmail(), guest);
    const mid = (sharing.list(owner).members[0] as { id: string }).id;
    await expect(sharing.remove({ serviceId: 'svc_1', accountId: 'acc_g', userId: 'usr_g', role: 'OWNER' }, mid)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await sharing.setPreset(owner, mid, 'viewer');
    expect(ad.calls.find((c) => c.sub === '/users/sub-uuid-1')!.body.permissions).toEqual([...PERMISSION_PRESETS.viewer]);
    await sharing.remove(owner, mid);
    expect(ad.calls.some((c) => c.method === 'DELETE' && c.sub === '/users/sub-uuid-1')).toBe(true);
    expect(getServiceAccess(db, { serviceId: 'svc_1', accountId: 'acc_g', userId: 'usr_g', role: 'OWNER' })).toBeUndefined();
  });

  it('SHR-07: sharing fails with a typed error when the provider or key-mint is not configured', () => {
    const noSecret = createServiceSharing({ adapter: new FakeAdapter(), db, secret: '' });
    expect(() => noSecret.invite(owner, { email: 'guest@example.test', preset: 'viewer' })).toThrow(SharingError);
    expect(db.prepare('SELECT COUNT(*) c FROM service_invitations').get()).toEqual({ c: 0 });
  });
});
