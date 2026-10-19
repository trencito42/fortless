import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
const ssrf = vi.hoisted(() => ({ validate: async (_u: string): Promise<unknown> => undefined }));
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: (u: string) => ssrf.validate(u) }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, ProviderNetworkError } from '../src/modules/provisioning/adapter.js';
import { createFilesApi, normalizeServerPath, validateEntryName } from '../src/modules/provisioning/files.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;

class FakeAdapter extends PterodactylHttpAdapter {
  calls: Array<{ op: string; args: unknown[]; key: string }> = [];
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'app-key' }); }
  override async ensurePanelUser() { return { panelUserId: 7, username: 'fl_x', email: 'a@example.test' }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_' + 'x'.repeat(40); }
  override async listFiles(_i: string, dir: string, key: string) {
    this.calls.push({ op: 'list', args: [dir], key });
    return [
      { name: 'b.txt', isFile: true, isSymlink: false, size: 3, mime: 'text/plain', modifiedAt: '' },
      { name: 'zdir', isFile: false, isSymlink: false, size: 0, mime: 'inode/directory', modifiedAt: '' },
      { name: 'adir', isFile: false, isSymlink: false, size: 0, mime: 'inode/directory', modifiedAt: '' },
    ];
  }
  override async readFile(_i: string, path: string, key: string) { this.calls.push({ op: 'read', args: [path], key }); return 'hello'; }
  override async writeFile(_i: string, path: string, content: string, key: string) { this.calls.push({ op: 'write', args: [path, content], key }); }
  override async compressFiles(_i: string, dir: string, names: string[], key: string) { this.calls.push({ op: 'compress', args: [dir, names], key }); return 'archive-1.tar.gz'; }
  override async decompressFile(_i: string, dir: string, file: string, key: string) { this.calls.push({ op: 'decompress', args: [dir, file], key }); }
  override async copyFile(_i: string, path: string, key: string) { this.calls.push({ op: 'copy', args: [path], key }); }
  override async renameFile(_i: string, dir: string, from: string, to: string, key: string) { this.calls.push({ op: 'rename', args: [dir, from, to], key }); }
  override async chmodFiles(_i: string, dir: string, names: string[], mode: string, key: string) { this.calls.push({ op: 'chmod', args: [dir, names, mode], key }); }
  override async pullFile(_i: string, dir: string, url: string, name: string | undefined, key: string) { this.calls.push({ op: 'pull', args: [dir, url, name], key }); }
  override async deleteFiles(_i: string, dir: string, names: string[], key: string) { this.calls.push({ op: 'delete', args: [dir, names], key }); }
}

function seed(accountId: string, serviceId: string) {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(`usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, ?)`).run(accountId, `usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, 'fl_x', 'a@example.test', ?)`).run(accountId, 100 + Number(accountId.replace(/\D/g, '')), `fortless_acc_${accountId}`);
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', '12', 'n', datetime('now'), datetime('now'))`).run(serviceId, accountId, `oi_${serviceId}`);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});
afterEach(() => db.close());

describe('Path validation', () => {
  it('FIL-01: normalises paths and rejects traversal, NUL and backslashes', () => {
    expect(normalizeServerPath('plugins//EssentialsX/./config.yml')).toBe('/plugins/EssentialsX/config.yml');
    expect(normalizeServerPath('/')).toBe('/');
    for (const bad of ['../etc/passwd', '/a/../../b', 'a\0b', 'a\\b', '', 42, null]) {
      expect(() => normalizeServerPath(bad)).toThrow(/Invalid path/);
    }
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'x'.repeat(256)]) {
      expect(() => validateEntryName(bad)).toThrow(/Invalid file name/);
    }
  });
});

describe('File manager service layer', () => {
  const ctx = (accountId: string, serviceId: string) => ({ serviceId, accountId, userId: `usr_${accountId}`, role: 'OWNER' });

  it('FIL-02: lists folders first, uses the account key, scopes to the service owner', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    const res = await api.list(ctx('acc_1', 'svc_1'), '/');
    expect(res.entries.map((e) => e.name)).toEqual(['adir', 'zdir', 'b.txt']);
    expect(ad.calls[0]!.key).toMatch(/^ptlc_/);
  });

  it('FIL-03: another tenant gets 404 and no provider call is made', async () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    await expect(api.read(ctx('acc_2', 'svc_1'), '/server.properties')).rejects.toMatchObject({ statusCode: 404 });
    await expect(api.remove(ctx('acc_2', 'svc_1'), '/', ['world'])).rejects.toMatchObject({ statusCode: 404 });
    expect(ad.calls).toHaveLength(0);
  });

  it('FIL-04: writes and deletes are audited without file content; oversize writes are refused', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    await api.write(ctx('acc_1', 'svc_1'), '/server.properties', 'motd=secret-value');
    await api.remove(ctx('acc_1', 'svc_1'), '/', ['old.log']);
    const rows = db.prepare("SELECT action, metadata FROM audit_events WHERE action LIKE 'service.file.%' ORDER BY action").all() as { action: string; metadata: string }[];
    expect(rows.map((r) => r.action)).toEqual(['service.file.delete', 'service.file.write']);
    expect(rows.map((r) => r.metadata).join()).not.toContain('secret-value');
    await expect(api.write(ctx('acc_1', 'svc_1'), '/big.txt', 'x'.repeat(1024 * 1024 + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(api.write(ctx('acc_1', 'svc_1'), '../x', 'a')).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });
});

describe('Archive and copy', () => {
  const ctx = (accountId: string, serviceId: string) => ({ serviceId, accountId, userId: `usr_${accountId}`, role: 'OWNER' });

  it('FIL-06b: archive, unarchive and copy validate input, use the account key and are audited', async () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    expect(await api.archive(ctx('acc_1', 'svc_1'), '/plugins', ['a', 'b'])).toEqual({ archive: 'archive-1.tar.gz', pending: false });
    await api.unarchive(ctx('acc_1', 'svc_1'), '/plugins', 'archive-1.tar.gz');
    await api.copy(ctx('acc_1', 'svc_1'), '/server.properties');
    expect(ad.calls.map((c) => c.op)).toEqual(['compress', 'decompress', 'copy']);
    expect(ad.calls.every((c) => c.key.startsWith('ptlc_'))).toBe(true);
    await expect(api.archive(ctx('acc_1', 'svc_1'), '/', [])).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(api.archive(ctx('acc_1', 'svc_1'), '/', ['../x'])).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(api.copy(ctx('acc_1', 'svc_1'), '/')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(api.unarchive(ctx('acc_2', 'svc_1'), '/', 'x.zip')).rejects.toMatchObject({ statusCode: 404 });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action IN ('service.file.archive','service.file.unarchive','service.file.copy')").get()).toEqual({ c: 3 });
  });
});

describe('Move, permissions and remote download', () => {
  const ctx = { serviceId: 'svc_1', accountId: 'acc_1', userId: 'usr_acc_1', role: 'OWNER' };

  it('FIL-08: move sends a relative target, refuses no-op and self-nesting; chmod validates the mode', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    await api.move(ctx, '/plugins', 'Essentials.jar', '/backup/old');
    expect(ad.calls.at(-1)).toMatchObject({ op: 'rename', args: ['/plugins', 'Essentials.jar', '../backup/old/Essentials.jar'] });
    await expect(api.move(ctx, '/plugins', 'a.jar', '/plugins')).rejects.toMatchObject({ code: 'SAME_FOLDER' });
    await expect(api.move(ctx, '/', 'world', '/world/region')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(api.move(ctx, '/', 'a', '../x')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await api.chmod(ctx, '/', ['start.sh'], '755');
    expect(ad.calls.at(-1)).toMatchObject({ op: 'chmod', args: ['/', ['start.sh'], '755'] });
    for (const bad of ['999', 'rwx', '77777', '', 644]) await expect(api.chmod(ctx, '/', ['a'], bad)).rejects.toMatchObject({ code: 'INVALID_MODE' });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action IN ('service.file.move','service.file.chmod')").get()).toEqual({ c: 2 });
  });

  it('FIL-09: remote download only accepts public https, never logs the query string, and reports timeouts as pending', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    expect(await api.pull(ctx, '/plugins', 'https://cdn.example.com/a.jar?token=SECRET', 'a.jar')).toEqual({ pending: false });
    expect(JSON.stringify(db.prepare("SELECT metadata FROM audit_events WHERE action = 'service.file.pull'").all())).not.toContain('SECRET');
    for (const bad of ['http://example.com/a.jar', 'ftp://example.com/a', 'https://user:pw@example.com/a', 'not a url', 42]) {
      await expect(api.pull(ctx, '/', bad, undefined)).rejects.toMatchObject({ code: 'INVALID_URL' });
    }
    ssrf.validate = async () => { throw new Error('private address'); };
    await expect(api.pull(ctx, '/', 'https://internal.example/a.jar', undefined)).rejects.toMatchObject({ code: 'INVALID_URL' });
    ssrf.validate = async () => undefined;
    ad.pullFile = async () => { throw new ProviderNetworkError('timed out'); };
    expect(await api.pull(ctx, '/', 'https://cdn.example.com/big.zip', undefined)).toEqual({ pending: true });
  });
});

describe('Archive timeouts', () => {
  it('FIL-07: a timeout is an unknown outcome and is reported as pending, not as a failure', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    ad.compressFiles = async () => { throw new ProviderNetworkError('timed out'); };
    ad.decompressFile = async () => { throw new ProviderNetworkError('timed out'); };
    const api = createFilesApi({ adapter: ad, db, secret: SECRET });
    const c = { serviceId: 'svc_1', accountId: 'acc_1', userId: 'usr_acc_1', role: 'OWNER' };
    expect(await api.archive(c, '/world', ['region'])).toEqual({ archive: null, pending: true });
    expect(await api.unarchive(c, '/', 'big.zip')).toEqual({ pending: true });
    const rows = db.prepare("SELECT metadata FROM audit_events WHERE action IN ('service.file.archive','service.file.unarchive')").all() as { metadata: string }[];
    expect(rows.every((r) => JSON.parse(r.metadata).pending === true)).toBe(true);
    ad.compressFiles = async () => { throw new Error('boom'); };
    await expect(api.archive(c, '/world', ['region'])).rejects.toThrow('boom');
  });
});

describe('Adapter file requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('FIL-05: write sends raw text/plain with the account key; signed URLs must be https', async () => {
    const seen: Array<{ url: string; ct: string; auth: string; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      seen.push({ url, ct: h['Content-Type']!, auth: h['Authorization']!, body: init.body });
      if (url.includes('/files/upload')) return new Response(JSON.stringify({ attributes: { url: 'http://node/upload?token=t' } }), { status: 200 });
      // Some Wings versions answer successful file writes with HTTP 200 and an empty body.
      return new Response('', { status: 200 });
    });
    const ad = new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'APP-SECRET' });
    await ad.writeFile('abcd1234', '/a b.txt', 'line1\n{"json":false}', 'ptlc_acct');
    expect(seen[0]!.url).toBe('https://panel.example.test/api/client/servers/abcd1234/files/write?file=%2Fa%20b.txt');
    expect(seen[0]!.ct).toBe('text/plain');
    expect(seen[0]!.auth).toBe('Bearer ptlc_acct');
    expect(seen[0]!.body).toBe('line1\n{"json":false}');
    await expect(ad.signedFileUrl('abcd1234', 'upload', '/', 'ptlc_acct')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
});
