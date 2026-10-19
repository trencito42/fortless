import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, ProviderError } from '../src/modules/provisioning/adapter.js';
import { createServerPanelApi } from '../src/modules/provisioning/server-panel.js';
import { listServiceActivity, ACTIVITY_PAGE_SIZE } from '../src/modules/provisioning/services.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;

class FakeAdapter extends PterodactylHttpAdapter {
  calls: Array<{ method: string; sub: string; body: unknown; key: string }> = [];
  reply: any = {};
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'app-key' }); }
  override async ensurePanelUser() { return { panelUserId: 7, username: 'fl_x', email: 'a@example.test' }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_' + 'x'.repeat(40); }
  override async clientServerCall(_i: string, key: string, method: any, sub: string, body?: unknown) {
    this.calls.push({ method, sub, body, key });
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}

function seed(accountId: string, serviceId: string) {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(`usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, ?)`).run(accountId, `usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, 'fl_x', 'a@example.test', ?)`).run(accountId, 100 + Number(accountId.replace(/\D/g, '')), `fortless_acc_${accountId}`);
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', '12', 'n', datetime('now'), datetime('now'))`).run(serviceId, accountId, `oi_${serviceId}`);
}

const ctx = (a: string, s: string) => ({ serviceId: s, accountId: a, userId: `usr_${a}`, role: 'OWNER' });
const UUID = '0b0c1f1e-1111-4222-8333-444455556666';

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});
afterEach(() => db.close());

describe('Server panel API (backups, network, startup, settings)', () => {
  it('SRV-01: backups map the panel response, use the account key and are audited', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    ad.reply = { data: [{ attributes: { uuid: UUID, name: 'daily', bytes: 10, created_at: 't', completed_at: 't2', is_successful: true, is_locked: true } }], meta: { backup_count: 1 } };
    const res = await api.backups(ctx('acc_1', 'svc_1'));
    expect(res.backups[0]).toMatchObject({ uuid: UUID, name: 'daily', locked: true, successful: true });
    ad.reply = null;
    await api.createBackup(ctx('acc_1', 'svc_1'), { name: 'before-update', locked: true });
    await api.restoreBackup(ctx('acc_1', 'svc_1'), UUID, true);
    expect(ad.calls.every((c) => c.key.startsWith('ptlc_'))).toBe(true);
    expect(ad.calls[1]).toMatchObject({ method: 'POST', sub: '/backups', body: { name: 'before-update', is_locked: true } });
    expect(ad.calls[2]).toMatchObject({ sub: `/backups/${UUID}/restore`, body: { truncate: true } });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action LIKE 'service.backup.%'").get()).toEqual({ c: 2 });
  });

  it('SRV-02: another tenant gets 404 and nothing reaches the panel', async () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    await expect(api.deleteBackup(ctx('acc_2', 'svc_1'), UUID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(api.reinstall(ctx('acc_2', 'svc_1'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(api.setVariable(ctx('acc_2', 'svc_1'), 'MOTD', 'x')).rejects.toMatchObject({ statusCode: 404 });
    expect(ad.calls).toHaveLength(0);
  });

  it('SRV-03: input is validated before any panel call', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    const c = ctx('acc_1', 'svc_1');
    await expect(api.deleteBackup(c, '../../etc')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.setPrimaryAllocation(c, '1/../2')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.setVariable(c, 'lower', 'x')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.setVariable(c, 'MOTD', 'a\0b')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.setImage(c, 'x; rm -rf /')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.rename(c, '', '')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(ad.calls).toHaveLength(0);
  });

  it('SRV-04: startup, network and settings are mapped; SFTP username includes the server identifier', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    ad.reply = { data: [{ attributes: { env_variable: 'MOTD', name: 'MOTD', description: '', server_value: 'hi', is_editable: true, rules: 'string' } }], meta: { startup_command: 'java -jar x', docker_images: { 'Java 21': 'ghcr.io/pterodactyl/yolks:java_21' } } };
    const st = await api.startup(ctx('acc_1', 'svc_1'));
    expect(st.variables[0]).toMatchObject({ key: 'MOTD', value: 'hi', editable: true });
    expect(st.images['Java 21']).toBe('ghcr.io/pterodactyl/yolks:java_21');
    ad.reply = { data: [{ attributes: { id: 5, ip: '10.0.0.2', ip_alias: '1.2.3.4', port: 25565, notes: null, is_default: true } }] };
    expect((await api.network(ctx('acc_1', 'svc_1'))).allocations[0]).toMatchObject({ id: 5, alias: '1.2.3.4', primary: true, notes: '' });
    ad.reply = { attributes: { name: 'srv', description: '', identifier: 'ce8f5497', docker_image: 'img', sftp_details: { ip: 'node.example.test', port: 2022 } } };
    expect(await api.settings(ctx('acc_1', 'svc_1'))).toMatchObject({ name: 'srv', image: 'img', sftp: { host: 'node.example.test', port: 2022, username: 'fl_x.ce8f5497' } });
    ad.reply = null;
    await api.reinstall(ctx('acc_1', 'svc_1'));
    expect(db.prepare("SELECT runtime_state FROM service_observed_states WHERE service_id = 'svc_1'").get()).toEqual({ runtime_state: 'INSTALLING' });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.settings.reinstall'").get()).toEqual({ c: 1 });
  });

  it('SRV-05: the client call is limited to the exposed panel areas, and panel refusals keep their detail', async () => {
    const real = new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'k' });
    for (const bad of ['/account/api-keys', '/files/list', '/../x', '/backups/a/b/c/d']) {
      await expect(real.clientServerCall('abcd1234', 'ptlc_k', 'GET', bad)).rejects.toMatchObject({ code: 'UNSUPPORTED_PATH' });
    }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ errors: [{ detail: 'This server has reached its limit for backups.' }] }), { status: 400 }));
    try {
      await real.clientServerCall('abcd1234', 'ptlc_k', 'POST', '/backups', {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).detail).toBe('This server has reached its limit for backups.');
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('Service activity', () => {
  const ev = (acc: string, action: string, resType: string, resId: string, meta = '{}', at = "datetime('now')") =>
    db.prepare(`INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata, created_at)
      VALUES (?, ?, 'USER', ?, ?, ?, 'c', ?, ${at})`).run(`aud_${Math.random()}`, acc, action, resType, resId, meta);

  it('ACT-01: noise is hidden, categories and search filter, other accounts are never visible', () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    ev('acc_1', 'service.console_token', 'service', 'svc_1');
    ev('acc_1', 'service.file.download_url', 'service', 'svc_1');
    ev('acc_1', 'service.power', 'service', 'svc_1', '{"action":"START"}');
    ev('acc_1', 'service.file.write', 'service', 'svc_1', '{"path":"/server.properties"}');
    ev('acc_2', 'service.power', 'service', 'svc_2');
    const all = listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1' }, db);
    expect(all.events.map((e) => e.action).sort()).toEqual(['service.file.write', 'service.power']);
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', category: 'power' }, db).total).toBe(1);
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', q: 'server.properties' }, db).total).toBe(1);
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', q: '%' }, db).total).toBe(0);
    expect(() => listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_2' }, db)).toThrow('Service not found');
  });

  it('ACT-02: pagination is stable, clamps the page and range filters by age', () => {
    seed('acc_1', 'svc_1');
    for (let i = 0; i < ACTIVITY_PAGE_SIZE + 3; i++) ev('acc_1', 'service.power', 'service', 'svc_1', '{"action":"START"}');
    ev('acc_1', 'service.power', 'service', 'svc_1', '{}', "datetime('now', '-10 days')");
    const p1 = listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', range: 'all' }, db);
    expect(p1.total).toBe(ACTIVITY_PAGE_SIZE + 4);
    expect(p1.events).toHaveLength(ACTIVITY_PAGE_SIZE);
    const p2 = listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', range: 'all', page: 2 }, db);
    expect(p2.events).toHaveLength(4);
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', range: 'all', page: 99 }, db).page).toBe(2);
    expect(listServiceActivity({ serviceId: 'svc_1', accountId: 'acc_1', range: '7' }, db).total).toBe(ACTIVITY_PAGE_SIZE + 3);
  });
});

describe('Databases and schedules', () => {
  it('SRV-07: databases are mapped (password only when the panel returns it), validated and gated by permission', async () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    const c = ctx('acc_1', 'svc_1');
    ad.reply = { data: [{ attributes: { id: 3, name: 's1_main', username: 'u_x', host: { address: 'db.example.test', port: 3306 }, connections_from: '%', relationships: { password: { attributes: { password: 'pw' } } } } }] };
    expect((await api.databases(c)).databases[0]).toMatchObject({ id: '3', host: 'db.example.test:3306', password: 'pw' });
    expect(ad.calls[0]!.sub).toBe('/databases?include=password');
    await expect(api.createDatabase(c, { name: 'bad name;' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.createDatabase(c, { name: 'ok', remote: "'; DROP" })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.deleteDatabase(c, '1/../2')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.databases(ctx('acc_2', 'svc_1'))).rejects.toMatchObject({ statusCode: 404 });
    db.prepare("INSERT INTO service_members (id, service_id, user_id, preset) VALUES ('m1', 'svc_1', 'usr_acc_2', 'operator')").run();
    await expect(api.createDatabase(ctx('acc_2', 'svc_1'), { name: 'x' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('SRV-08: schedules are mapped, cron and task input is validated, and changes are audited', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    const c = ctx('acc_1', 'svc_1');
    ad.reply = { data: [{ attributes: { id: 9, name: 'restart', cron: { minute: '0', hour: '4', day_of_month: '*', month: '*', day_of_week: '*' }, is_active: true, only_when_online: false, next_run_at: 't', relationships: { tasks: { data: [{ attributes: { id: 1, sequence_id: 1, action: 'power', payload: 'restart', time_offset: 0 } }] } } } }] };
    const res = await api.schedules(c);
    expect(res.schedules[0]).toMatchObject({ id: 9, cron: { hour: '4' }, tasks: [{ action: 'power', payload: 'restart' }] });
    ad.reply = null;
    const good = { name: 'nightly', minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '1-5' };
    await api.saveSchedule(c, null, good);
    expect(ad.calls.at(-1)).toMatchObject({ sub: '/schedules', body: { name: 'nightly', day_of_week: '1-5', is_active: true } });
    await expect(api.saveSchedule(c, null, { ...good, minute: '0; rm' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.saveSchedule(c, '1/x', good)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await api.addTask(c, '9', { action: 'power', payload: 'restart', offset: 5 });
    await api.addTask(c, '9', { action: 'backup' });
    await expect(api.addTask(c, '9', { action: 'power', payload: 'format' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.addTask(c, '9', { action: 'rm', payload: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.addTask(c, '9', { action: 'command', payload: 'say hi', offset: 901 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await api.executeSchedule(c, '9');
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action LIKE 'service.schedule.%'").get()).toEqual({ c: 4 });
  });
});

describe('Task editing and panel activity', () => {
  it('SRV-10: tasks can be edited with the same validation, and panel events are mapped and paged', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const api = createServerPanelApi({ adapter: ad, db, secret: SECRET });
    const c = ctx('acc_1', 'svc_1');
    await api.updateTask(c, '9', '4', { action: 'command', payload: 'say hi', offset: 3, continueOnFailure: true });
    expect(ad.calls.at(-1)).toMatchObject({ sub: '/schedules/9/tasks/4', body: { action: 'command', payload: 'say hi', time_offset: 3, continue_on_failure: true } });
    await expect(api.updateTask(c, '9', 'x/../1', { action: 'command', payload: 'a' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(api.updateTask(c, '9', '4', { action: 'power', payload: 'format' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    ad.reply = { data: [{ attributes: { event: 'server:file.write', timestamp: 't', is_api: false, relationships: { actor: { attributes: { username: 'alex' } } } } }], meta: { pagination: { current_page: 2, total_pages: 5, total: 70 } } };
    expect(await api.panelActivity(c, '2')).toEqual({ events: [{ event: 'server:file.write', timestamp: 't', api: false, actor: 'alex' }], page: 2, pages: 5, total: 70 });
    expect(ad.calls.at(-1)!.sub).toBe('/activity?page=2');
    await api.panelActivity(c, 'abc; drop');
    expect(ad.calls.at(-1)!.sub).toBe('/activity?page=1');
  });
});
