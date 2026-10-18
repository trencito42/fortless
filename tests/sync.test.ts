import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, type PanelServerSummary } from '../src/modules/provisioning/adapter.js';
import { syncRuntimeStates, reconcileWithPanel, relinkService, touchService, resetHotServices, RelinkError } from '../src/modules/provisioning/runtime-sync.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;

const srv = (id: number, mem = 1024, cpu = 100, disk = 5120): PanelServerSummary => ({ id, identifier: `ident${id}`, name: `s${id}`, userId: 7, suspended: false, limits: { memoryMb: mem, cpuPct: cpu, diskMb: disk } });

class FakeAdapter extends PterodactylHttpAdapter {
  panel: PanelServerSummary[] = [];
  users: string[] = [];
  usageCalls: string[] = [];
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'k' }); }
  override async ensurePanelUser() { return { panelUserId: 7, username: 'fl', email: 'a@example.test' }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_' + 'x'.repeat(40); }
  override async listServers() { return this.panel; }
  override async getServerSummary(id: number) { return this.panel.find((p) => p.id === id) ?? null; }
  override async serverExists(id: string) { return this.panel.some((p) => String(p.id) === id); }
  override async getResourceUsage(id: string) { this.usageCalls.push(id); return { state: 'offline', cpuPct: 0, memoryBytes: 0, diskBytes: 0, uptimeMs: 0 }; }
  override async clientServerCall(_i: string, _k: string, _m: any, sub: string) { return sub === '/users' ? { data: this.users.map((u) => ({ attributes: { uuid: u } })) } : null; }
}

function seed(n: number, opts: { mem?: number } = {}) {
  const acc = `acc_${n}`, usr = `usr_${n}`, svc = `svc_${n}`;
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(usr, `${usr}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, 'b@example.test')`).run(acc, usr);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, 'fl', 'a@example.test', ?)`).run(acc, 100 + n, `fortless_acc_${acc}`);
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, identifier, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', ?, ?, 'n', datetime('now'), datetime('now'))`).run(svc, acc, `oi_${n}`, String(n), `old${n}`);
  db.prepare("INSERT INTO service_observed_states (service_id, runtime_state, last_checked_at) VALUES (?, 'RUNNING', datetime('now', '-1 hour'))").run(svc);
  db.prepare('INSERT INTO service_desired_configs (service_id, plan_version_id, cpu_limit_pct, memory_limit_mb, disk_limit_mb, environment_variables) VALUES (?, ?, 100, ?, 5120, \'{}\')').run(svc, `plv_${n}`, opts.mem ?? 1024);
}

beforeEach(() => {
  resetHotServices();
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});
afterEach(() => db.close());

describe('Adaptive polling', () => {
  it('SYN-01: cold services are polled every 5 minutes, services someone is viewing every 30 seconds', async () => {
    seed(1); seed(2);
    const ad = new FakeAdapter();
    await syncRuntimeStates(ad, db, SECRET);
    expect(ad.usageCalls.sort()).toEqual(['1', '2']);
    ad.usageCalls = [];
    db.prepare("UPDATE service_observed_states SET last_checked_at = datetime('now', '-60 seconds')").run();
    await syncRuntimeStates(ad, db, SECRET);
    expect(ad.usageCalls).toEqual([]);
    touchService('svc_2');
    await syncRuntimeStates(ad, db, SECRET);
    expect(ad.usageCalls).toEqual(['2']);
  });

  it('SYN-01b: completed reinstall queues one service-ready email and leaves INSTALLING', async () => {
    seed(1);
    db.prepare("UPDATE service_observed_states SET runtime_state = 'INSTALLING', last_checked_at = datetime('now', '-1 minute') WHERE service_id = 'svc_1'").run();
    db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
      VALUES ('aud_reinstall', 'acc_1', 'usr_1', 'USER', 'service.settings.reinstall', 'service', 'svc_1', 'corr_1', '{}')`).run();
    const ad = new FakeAdapter();

    await syncRuntimeStates(ad, db, SECRET);
    expect(db.prepare("SELECT runtime_state FROM service_observed_states WHERE service_id = 'svc_1'").get()).toEqual({ runtime_state: 'STOPPED' });
    expect(db.prepare("SELECT template FROM email_outbox WHERE recipient = 'usr_1@example.test'").all()).toEqual([{ template: 'service_ready' }]);
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.settings.reinstall_completed'").get()).toEqual({ c: 1 });

    db.prepare("UPDATE service_observed_states SET runtime_state = 'INSTALLING', last_checked_at = datetime('now', '-1 minute') WHERE service_id = 'svc_1'").run();
    await syncRuntimeStates(ad, db, SECRET);
    expect(db.prepare("SELECT COUNT(*) c FROM email_outbox WHERE template = 'service_ready'").get()).toEqual({ c: 1 });
  });
});

describe('Reconcile with the panel', () => {
  it('SYN-02: limit drift is recorded once, never auto-changed, and clears when the panel matches again', async () => {
    seed(1);
    const ad = new FakeAdapter();
    ad.panel = [srv(1, 2048)];
    expect((await reconcileWithPanel(ad, db, SECRET)).drifted).toBe(1);
    expect((await reconcileWithPanel(ad, db, SECRET)).drifted).toBe(0);
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.limits_drift'").get()).toEqual({ c: 1 });
    expect(JSON.parse((db.prepare('SELECT raw_metrics m FROM service_observed_states').get() as { m: string }).m).drift.memoryMb).toEqual({ expected: 1024, actual: 2048 });
    expect(db.prepare('SELECT memory_limit_mb m FROM service_desired_configs').get()).toEqual({ m: 1024 });
    ad.panel = [srv(1, 1024)];
    await reconcileWithPanel(ad, db, SECRET);
    expect(JSON.parse((db.prepare('SELECT raw_metrics m FROM service_observed_states').get() as { m: string }).m).drift).toBeUndefined();
  });

  it('SYN-03: servers missing from the listing are flagged only when a direct lookup agrees', async () => {
    seed(1); seed(2);
    const ad = new FakeAdapter();
    ad.panel = [srv(1)];
    const r = await reconcileWithPanel(ad, db, SECRET);
    expect(r.missing).toBe(1);
    expect(db.prepare("SELECT runtime_state s FROM service_observed_states WHERE service_id = 'svc_2'").get()).toEqual({ s: 'ERROR' });
    expect(db.prepare("SELECT contract_status c FROM services WHERE id = 'svc_2'").get()).toEqual({ c: 'ACTIVE' });
    const ad2 = new FakeAdapter();
    ad2.panel = [srv(1)];
    ad2.serverExists = async () => true;
    seed(3);
    expect((await reconcileWithPanel(ad2, db, SECRET)).missing).toBe(0);
  });

  it('SYN-04: a shared user removed on the panel loses access in Fortless', async () => {
    seed(1);
    db.prepare("INSERT INTO users (id, email, password_hash, name, status) VALUES ('usr_g', 'g@example.test', 'x', 'G', 'ACTIVE')").run();
    db.prepare("INSERT INTO service_members (id, service_id, user_id, preset, panel_subuser_uuid) VALUES ('m1', 'svc_1', 'usr_g', 'viewer', 'uuid-gone'), ('m2', 'svc_1', 'usr_1', 'viewer', 'uuid-live')").run();
    const ad = new FakeAdapter();
    ad.panel = [srv(1)];
    ad.users = ['uuid-live'];
    expect((await reconcileWithPanel(ad, db, SECRET)).membersRevoked).toBe(1);
    expect(db.prepare('SELECT id FROM service_members').all()).toEqual([{ id: 'm2' }]);
  });
});

describe('Staff relink', () => {
  const run = (ad: FakeAdapter, id: unknown) => relinkService({ serviceId: 'svc_1', panelServerId: id, actorUserId: 'usr_staff' }, ad, db);

  it('SYN-05: relink points the service at an existing panel server, audits it and resets the state', async () => {
    seed(1);
    const ad = new FakeAdapter();
    ad.panel = [srv(55)];
    expect(await run(ad, '55')).toEqual({ externalId: '55', identifier: 'ident55' });
    expect(db.prepare("SELECT external_id e, identifier i FROM services WHERE id = 'svc_1'").get()).toEqual({ e: '55', i: 'ident55' });
    expect(db.prepare("SELECT runtime_state s FROM service_observed_states").get()).toEqual({ s: 'UNKNOWN' });
    expect(JSON.parse((db.prepare("SELECT metadata m FROM audit_events WHERE action = 'service.relinked'").get() as { m: string }).m)).toEqual({ from: '1', to: '55' });
  });

  it('SYN-06: relink refuses bad ids, unknown servers, servers owned by another service and terminated services', async () => {
    seed(1); seed(2);
    const ad = new FakeAdapter();
    ad.panel = [srv(55), srv(2)];
    await expect(run(ad, 'abc')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(run(ad, 999)).rejects.toMatchObject({ code: 'NOT_FOUND_ON_PANEL' });
    await expect(run(ad, 2)).rejects.toMatchObject({ code: 'ALREADY_LINKED' });
    db.prepare("UPDATE services SET contract_status = 'TERMINATED' WHERE id = 'svc_1'").run();
    await expect(run(ad, 55)).rejects.toBeInstanceOf(RelinkError);
    expect(db.prepare("SELECT external_id e FROM services WHERE id = 'svc_1'").get()).toEqual({ e: '1' });
  });
});
