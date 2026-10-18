import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
  process.env['PTERODACTYL_KEYMINT_SECRET'] = 'k'.repeat(40);
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, ProviderAuthenticationError, ProviderError } from '../src/modules/provisioning/adapter.js';
import { syncRuntimeStates, resetHotServices } from '../src/modules/provisioning/runtime-sync.js';
import { executeServicePowerAction } from '../src/modules/provisioning/services.js';
import {
  ConsoleAccessError, decryptClientKey, encryptClientKey, getServiceConsoleCredentials,
} from '../src/modules/provisioning/console.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;

class FakeAdapter extends PterodactylHttpAdapter {
  mints: string[] = [];
  wsKeys: string[] = [];
  rejectKey: string | null = null;
  powered: Array<{ action: string; key?: string }> = [];
  override async powerAction(_e: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL', key?: string) { this.powered.push({ action, key }); }
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'app-key' }); }
  override async ensurePanelUser() { return { panelUserId: 7, username: 'fl_x', email: 'a@example.test' }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey(tag: string) { this.mints.push(tag); return `ptlc_${this.mints.length}_${'x'.repeat(30)}`; }
  override async getWebsocketCredentials(_ext: string, key: string) {
    this.wsKeys.push(key);
    if (key === this.rejectKey) throw new ProviderAuthenticationError('rejected', 401);
    return { token: 'wings-jwt', socket: 'wss://node.example.test:8080/api/servers/abc/ws' };
  }
}

function seed(accountId: string, serviceId: string, status = 'ACTIVE', external: string | null = '12') {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(`usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, ?)`).run(accountId, `usr_${accountId}`, `${accountId}@example.test`);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, 'fl_x', 'a@example.test', ?)`).run(accountId, 100 + Number(accountId.replace(/\D/g, '')), `fortless_acc_${accountId}`);
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', ?, ?, 'n', datetime('now'), datetime('now'))`).run(serviceId, accountId, `oi_${serviceId}`, status, external);
}

beforeEach(() => {
  resetHotServices();
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});
afterEach(() => db.close());

describe('Console credentials (per-account panel keys)', () => {
  it('CON-01: mints one key per account, stores it encrypted, reuses it', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const p = { serviceId: 'svc_1', accountId: 'acc_1', userId: 'usr_acc_1' };
    const a = await getServiceConsoleCredentials(p, ad, db, SECRET);
    await getServiceConsoleCredentials(p, ad, db, SECRET);
    expect(a).toEqual({ token: 'wings-jwt', socket: 'wss://node.example.test:8080/api/servers/abc/ws' });
    expect(ad.mints).toEqual(['fortless_acc_acc_1']);
    const row = db.prepare('SELECT encrypted_key FROM panel_client_keys WHERE account_id = ?').get('acc_1') as { encrypted_key: string };
    expect(row.encrypted_key).not.toContain('ptlc_');
    expect(decryptClientKey(row.encrypted_key)).toBe(ad.wsKeys[0]);
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.console_token'").get()).toEqual({ c: 2 });
  });

  it('CON-02: another tenant cannot get credentials for a service it does not own', async () => {
    seed('acc_1', 'svc_1');
    seed('acc_2', 'svc_2');
    const ad = new FakeAdapter();
    await expect(getServiceConsoleCredentials({ serviceId: 'svc_1', accountId: 'acc_2', userId: 'u' }, ad, db, SECRET))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(ad.mints).toHaveLength(0);
  });

  it('CON-03: refuses suspended, provisioning and unconfigured cases with typed errors', async () => {
    seed('acc_1', 'svc_s', 'SUSPENDED');
    seed('acc_2', 'svc_p', 'ACTIVE', null);
    seed('acc_3', 'svc_ok');
    const ad = new FakeAdapter();
    await expect(getServiceConsoleCredentials({ serviceId: 'svc_s', accountId: 'acc_1', userId: 'u' }, ad, db, SECRET)).rejects.toMatchObject({ code: 'SERVICE_NOT_ACTIVE' });
    await expect(getServiceConsoleCredentials({ serviceId: 'svc_p', accountId: 'acc_2', userId: 'u' }, ad, db, SECRET)).rejects.toMatchObject({ code: 'SERVICE_PROVISIONING' });
    await expect(getServiceConsoleCredentials({ serviceId: 'svc_ok', accountId: 'acc_3', userId: 'u' }, ad, db, '')).rejects.toMatchObject({ code: 'KEYMINT_NOT_CONFIGURED' });
    await expect(getServiceConsoleCredentials({ serviceId: 'svc_ok', accountId: 'acc_3', userId: 'u' }, { providerType: 'VPS' } as never, db, SECRET)).rejects.toBeInstanceOf(ConsoleAccessError);
  });

  it('CON-04: a revoked key triggers exactly one re-mint, a second rejection surfaces', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    const p = { serviceId: 'svc_1', accountId: 'acc_1', userId: 'u' };
    await getServiceConsoleCredentials(p, ad, db, SECRET);
    ad.rejectKey = ad.wsKeys[0]!;
    await getServiceConsoleCredentials(p, ad, db, SECRET);
    expect(ad.mints).toHaveLength(2);
    ad.rejectKey = null;
    ad.getWebsocketCredentials = async () => { throw new ProviderAuthenticationError('rejected', 401); };
    await expect(getServiceConsoleCredentials(p, ad, db, SECRET)).rejects.toBeInstanceOf(ProviderAuthenticationError);
    expect(ad.mints).toHaveLength(3);
  });

  it('CON-05: encryption round-trips and rejects tampering', () => {
    const enc = encryptClientKey('ptlc_secret');
    expect(decryptClientKey(enc)).toBe('ptlc_secret');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptClientKey(parts.join('.'))).toThrow();
  });
});

describe('Power actions use the account key', () => {
  it('CON-08b: START is sent with the account key, never the shared client key', async () => {
    seed('acc_1', 'svc_1');
    const ad = new FakeAdapter();
    await executeServicePowerAction({ serviceId: 'svc_1', accountId: 'acc_1', userId: 'u', action: 'START' }, ad, db);
    expect(ad.powered).toHaveLength(1);
    expect(ad.powered[0]!.key).toMatch(/^ptlc_1_/);
    await expect(executeServicePowerAction({ serviceId: 'svc_1', accountId: 'acc_other', userId: 'u', action: 'STOP' }, ad, db)).rejects.toThrow('Service not found');
    expect(ad.powered).toHaveLength(1);
  });
});

describe('Runtime state sync', () => {
  it('CON-09: lists follow the live state; transitional states are left alone', async () => {
    seed('acc_1', 'svc_1');
    db.prepare("INSERT INTO service_observed_states (service_id, runtime_state) VALUES ('svc_1', 'RUNNING')").run();
    const ad = new FakeAdapter();
    let live = 'offline';
    ad.getResourceUsage = async () => ({ state: live, cpuPct: 0, memoryBytes: 0, diskBytes: 0, uptimeMs: 0 });
    const state = () => (db.prepare("SELECT runtime_state s FROM service_observed_states WHERE service_id='svc_1'").get() as { s: string }).s;
    const age = () => db.prepare("UPDATE service_observed_states SET last_checked_at = datetime('now', '-1 hour')").run();
    age();
    expect(await syncRuntimeStates(ad, db, SECRET)).toBe(1);
    expect(state()).toBe('STOPPED');
    live = 'starting';
    age();
    await syncRuntimeStates(ad, db, SECRET);
    expect(state()).toBe('STOPPED');
    live = 'running';
    age();
    await syncRuntimeStates(ad, db, SECRET);
    expect(state()).toBe('RUNNING');
  });
});

describe('Server deleted on the panel', () => {
  it('CON-10: a confirmed 404 flags the service ERROR once; a client-only 404 does not', async () => {
    seed('acc_1', 'svc_1');
    db.prepare("INSERT INTO service_observed_states (service_id, runtime_state) VALUES ('svc_1', 'RUNNING')").run();
    const ad = new FakeAdapter();
    ad.getResourceUsage = async () => { throw new ProviderError('nf', 'HTTP_404', 404); };
    ad.serverExists = async () => true;
    const age = () => db.prepare("UPDATE service_observed_states SET last_checked_at = datetime('now', '-1 hour')").run();
    age();
    await syncRuntimeStates(ad, db, SECRET);
    expect((db.prepare("SELECT runtime_state s FROM service_observed_states").get() as { s: string }).s).toBe('RUNNING');
    ad.serverExists = async () => false;
    age();
    expect(await syncRuntimeStates(ad, db, SECRET)).toBe(1);
    age();
    expect(await syncRuntimeStates(ad, db, SECRET)).toBe(0);
    expect((db.prepare("SELECT runtime_state s FROM service_observed_states").get() as { s: string }).s).toBe('ERROR');
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action='service.provider_missing'").get()).toEqual({ c: 1 });
    expect(db.prepare("SELECT contract_status s FROM services WHERE id='svc_1'").get()).toEqual({ s: 'ACTIVE' });
  });
});

describe('Key mint request to the panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('CON-06: signs external_id with HMAC and never sends the app API key', async () => {
    let sent: { url: string; auth: string; body: Record<string, string> } | undefined;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent = { url, auth: (init.headers as Record<string, string>)['Authorization']!, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ token: 'ptlc_' + 'a'.repeat(40) }), { status: 200 });
    });
    const ad = new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'APP-SECRET-KEY' });
    const token = await ad.mintAccountClientKey('fortless_acc_acc_1', SECRET);
    expect(token).toMatch(/^ptlc_/);
    expect(sent!.url).toBe('https://panel.example.test/auth/sso/fortless/client-key');
    expect(sent!.auth).not.toContain('APP-SECRET-KEY');
    const { external_id, timestamp, nonce, signature } = sent!.body;
    expect(signature).toBe(crypto.createHmac('sha256', SECRET).update(`${timestamp}.${nonce}.${external_id}`).digest('hex'));
    await expect(ad.mintAccountClientKey('x', 'short')).rejects.toMatchObject({ code: 'KEYMINT_NOT_CONFIGURED' });
  });

  it('CON-07: rejects malformed websocket responses (non-ws socket URL)', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: { token: 't', socket: 'javascript:alert(1)' } }), { status: 200 }));
    const ad = new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'k' });
    await expect(ad.getWebsocketCredentials('abcd1234', 'ptlc_k')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
});
