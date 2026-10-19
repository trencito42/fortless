import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter } from '../src/modules/provisioning/adapter.js';
import {
  applyProperties, parseProperties, recommendedImage, saveProfile, validateConfigValues, validateProfile, ProfileError, listProfiles, describeProfileChange,
} from '../src/modules/provisioning/game-profiles.js';
import { createGameTools, clearEggCache } from '../src/modules/provisioning/game-tools.js';

const SECRET = 'k'.repeat(40);
let db: Database.Database;
const shipped = JSON.parse(fs.readFileSync('data/game-profiles/minecraft-java.json', 'utf8'));

class FakeAdapter extends PterodactylHttpAdapter {
  files = new Map<string, string>([['/server.properties', '# Minecraft server properties\nmotd=Hello\nmax-players=20\ncustom-key=keep-me\n']]);
  writes: Array<{ path: string; content: string }> = [];
  mcVersion = '1.21.4';
  image = 'ghcr.io/pterodactyl/yolks:java_17';
  uploads: string[] = [];
  powerActions: string[] = [];
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'k' }); }
  override async ensurePanelUser() { return { panelUserId: 7, username: 'fl_x', email: 'a@example.test' }; }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_' + 'x'.repeat(40); }
  override async getServerEggName() { return 'Paper'; }
  override async readFile(_i: string, p: string) { const c = this.files.get(p); if (c === undefined) { const { ProviderError } = await import('../src/modules/provisioning/adapter.js'); throw new ProviderError('nf', 'HTTP_404', 404); } return c; }
  override async writeFile(_i: string, p: string, content: string) { this.writes.push({ path: p, content }); this.files.set(p, content); }
  override async powerAction(_i: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL') { this.powerActions.push(action); }
  override async listFiles() { return [{ name: 'Essentials.jar', isFile: true, isSymlink: false, size: 10, mime: '', modifiedAt: '' }, { name: 'config', isFile: false, isSymlink: false, size: 0, mime: '', modifiedAt: '' }]; }
  override async signedFileUrl(_i: string, kind: string, p: string) { this.uploads.push(`${kind}:${p}`); return 'https://node.example.test:8080/upload/file?token=t'; }
  override async clientServerCall(_i: string, _k: string, _m: any, sub: string) {
    if (sub === '/startup') return { data: [{ attributes: { env_variable: 'MINECRAFT_VERSION', name: 'v', server_value: this.mcVersion, is_editable: true } }], meta: { startup_command: 'x', docker_images: { 'Java 17': 'ghcr.io/pterodactyl/yolks:java_17', 'Java 21': 'ghcr.io/pterodactyl/yolks:java_21' } } };
    if (sub === '') return { attributes: { name: 's', identifier: 'abcd1234', docker_image: this.image, sftp_details: {} } };
    return null;
  }
}

function seed(n: number) {
  const acc = `acc_${n}`;
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(`usr_${n}`, `u${n}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, 'b@example.test')`).run(acc, `usr_${n}`);
  db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, ?, 'fl', 'a@example.test', ?)`).run(acc, 100 + n, `fortless_acc_${acc}`);
  db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', ?, 'n', datetime('now'), datetime('now'))`).run(`svc_${n}`, acc, `oi_${n}`, String(10 + n));
}
const ctx = (n: number) => ({ serviceId: `svc_${n}`, accountId: `acc_${n}`, userId: `usr_${n}`, role: 'OWNER' });

beforeEach(() => {
  clearEggCache();
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
  saveProfile(db, shipped);
});
afterEach(() => db.close());

describe('Game profiles are validated data', () => {
  it('GAM-01: the shipped Minecraft profile is valid, and bad profiles are refused', () => {
    expect(validateProfile(shipped).configSchema.length).toBeGreaterThan(10);
    const bad = (patch: Record<string, unknown>) => () => validateProfile({ ...shipped, ...patch });
    expect(bad({ slug: 'Bad Slug' })).toThrow(ProfileError);
    expect(bad({ eggNames: [] })).toThrow(ProfileError);
    expect(bad({ configSchema: [{ key: 'a', label: 'A', type: 'script' }] })).toThrow(ProfileError);
    expect(bad({ configSchema: [{ key: 'a', label: 'A', type: 'bool' }, { key: 'a', label: 'B', type: 'bool' }] })).toThrow(/duplicate/i);
    expect(bad({ configSchema: [{ key: 'a', label: 'A', type: 'enum', options: [] }] })).toThrow(ProfileError);
    expect(bad({ configFile: '../../etc/passwd' })).toThrow();
    expect(bad({ installSources: [{ ...shipped.installSources[0], provider: 'curseforge' }] })).toThrow(/modrinth/);
    expect(bad({ installSources: [{ ...shipped.installSources[0], downloadHosts: [] }] })).toThrow(ProfileError);
    expect(bad({ javaRules: [{ minGameVersion: 'latest', image: 'x' }] })).toThrow(ProfileError);
    expect(db.prepare('SELECT COUNT(*) c FROM game_profiles').get()).toEqual({ c: 1 });
  });

  it('GAM-02: properties files keep comments and unknown keys, and values cannot inject lines', () => {
    const original = '# header\nmotd=Hello\n\nmax-players=20\ncustom-key=keep-me\n';
    expect(parseProperties(original).get('motd')).toBe('Hello');
    const updated = applyProperties(original, { motd: 'New', pvp: 'false' });
    expect(updated).toBe('# header\nmotd=New\n\nmax-players=20\ncustom-key=keep-me\npvp=false\n');
    const schema = validateProfile(shipped).configSchema;
    expect(() => validateConfigValues(schema, { motd: 'x\nop-permission-level=4' })).toThrow(/Invalid value/);
    expect(() => validateConfigValues(schema, { 'rcon.password': 'x' })).toThrow(/not a configurable/);
    expect(() => validateConfigValues(schema, { 'max-players': '5000' })).toThrow(/whole number/);
    expect(() => validateConfigValues(schema, { difficulty: 'impossible' })).toThrow(/valid option/);
    expect(() => validateConfigValues(schema, { pvp: 'maybe' })).toThrow(/on or off/);
    expect(validateConfigValues(schema, { pvp: false, 'max-players': 50, difficulty: 'hard' })).toEqual({ pvp: 'false', 'max-players': '50', difficulty: 'hard' });
  });

  it('GAM-03: Java is recommended from the game version and stays unknown for "latest"', () => {
    const rules = shipped.javaRules;
    expect(recommendedImage(rules, '1.21.4')).toContain('java_21');
    expect(recommendedImage(rules, '1.20.5')).toContain('java_21');
    expect(recommendedImage(rules, '1.20.4')).toContain('java_17');
    expect(recommendedImage(rules, '1.17.1')).toContain('java_16');
    expect(recommendedImage(rules, '1.16.5')).toContain('java_11');
    expect(recommendedImage(rules, null)).toBeNull();
    expect(recommendedImage(rules, 'latest')).toBeNull();
  });
});

describe('Game tools', () => {
  it('GAM-04b: "latest" falls back to the version recorded by the server jar', async () => {
    seed(1);
    const ad = new FakeAdapter();
    ad.mcVersion = 'latest';
    ad.files.set('/version_history.json', '{"currentVersion":"1.21.4-232-abc (MC: 1.21.4)"}');
    const info: any = await createGameTools({ adapter: ad, db, secret: SECRET }).info(ctx(1));
    expect(info.java.gameVersion).toBe('1.21.4');
    ad.files.delete('/version_history.json');
    expect((await createGameTools({ adapter: ad, db, secret: SECRET }).info(ctx(1)) as any).java.gameVersion).toBeNull();
  });

  it('GAM-04: info returns the schema, current values and a Java mismatch', async () => {
    seed(1);
    const ad = new FakeAdapter();
    const tools = createGameTools({ adapter: ad, db, secret: SECRET });
    const info: any = await tools.info(ctx(1));
    expect(info.profile.slug).toBe('minecraft-java');
    expect(info.values.motd).toBe('Hello');
    expect(info.java).toMatchObject({ gameVersion: '1.21.4', matches: false });
    expect(info.java.recommended).toContain('java_21');
    await expect(tools.info(ctx(2))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('GAM-05: saving changes only the chosen keys and refuses invalid input before touching the server', async () => {
    seed(1);
    const ad = new FakeAdapter();
    const tools = createGameTools({ adapter: ad, db, secret: SECRET });
    await tools.saveConfig(ctx(1), { values: { motd: 'Welcome', pvp: false } });
    expect(ad.writes.at(-1)!.content).toBe('# Minecraft server properties\nmotd=Welcome\nmax-players=20\ncustom-key=keep-me\npvp=false\n');
    ad.writes = [];
    await expect(tools.saveConfig(ctx(1), { values: { motd: 'a\nb' } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(tools.saveConfig(ctx(1), { values: { 'server-port': '1' } })).rejects.toMatchObject({ statusCode: 400 });
    expect(ad.writes).toHaveLength(0);
  });

  it('GAM-05b: Minecraft EULA approval is detected, persisted, restarted and audited', async () => {
    seed(1);
    const ad = new FakeAdapter();
    ad.files.set('/eula.txt', '# Generated by Minecraft\neula=false\n');
    const tools = createGameTools({ adapter: ad, db, secret: SECRET });
    expect((await tools.info(ctx(1)) as any).eula).toBe('required');
    await expect(tools.acceptEula(ctx(1))).resolves.toEqual({ accepted: true, restarted: true });
    expect(ad.files.get('/eula.txt')).toContain('eula=true');
    expect(ad.powerActions).toEqual(['RESTART']);
    expect((await tools.info(ctx(1)) as any).eula).toBe('accepted');
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.game.eula_accepted'").get()).toEqual({ c: 1 });
    await expect(tools.acceptEula(ctx(1))).rejects.toMatchObject({ code: 'EULA_NOT_REQUIRED' });
  });

  it('GAM-06: a shared viewer can neither read the config file (it may hold credentials) nor save settings (NEW-404)', async () => {
    seed(1); seed(2);
    db.prepare("INSERT INTO service_members (id, service_id, user_id, preset) VALUES ('m1', 'svc_1', 'usr_2', 'viewer')").run();
    const ad = new FakeAdapter();
    const tools = createGameTools({ adapter: ad, db, secret: SECRET });
    const viewer = { serviceId: 'svc_1', accountId: 'acc_2', userId: 'usr_2', role: 'OWNER' };
    await expect(tools.info(viewer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(tools.saveConfig(viewer, { values: { pvp: false } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(tools.installMod(viewer, { source: 0, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Installer and icon', () => {
  const jar = Buffer.from('PK-fake-jar-content');
  const sha = (b: Buffer) => crypto.createHash('sha512').update(b).digest('hex');
  const stub = (opts: { hash?: string; host?: string; uploadOk?: boolean } = {}) => {
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(String(url));
      const u = String(url);
      if (u.includes('/search')) return Response.json({ hits: [{ project_id: 'hXiIvTyT', slug: 'essentialsx', title: 'EssentialsX', description: 'd', author: 'a', downloads: 5, icon_url: 'https://cdn.modrinth.com/i.png' }], total_hits: 1 });
      if (u.includes('/version')) return Response.json([{ id: 'abcd1234', version_number: '2.22.0', files: [{ primary: true, filename: 'EssentialsX-2.22.0.jar', size: jar.length, url: `https://${opts.host ?? 'cdn.modrinth.com'}/data/x/EssentialsX-2.22.0.jar`, hashes: { sha512: opts.hash ?? sha(jar) } }] }]);
      if (u.includes('node.example.test')) return new Response(null, { status: opts.uploadOk === false ? 500 : 204 });
      return new Response(jar, { status: 200 });
    }) as unknown as typeof fetch;
    return { fn, calls };
  };

  it('NEW-411: installs run one at a time per server, stream to disk and leave no temporary files behind', async () => {
    seed(1);
    const ad = new FakeAdapter();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const s = stub();
    const slow = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('node.example.test')) await gate; // hold the first install open at the upload step
      return s.fn(url, init);
    }) as unknown as typeof fetch;
    const tools = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: slow });
    const tmpBefore = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('fortless-mod-')).length;
    const first = tools.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' });
    await new Promise((r) => setTimeout(r, 50));
    await expect(tools.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ code: 'INSTALL_IN_PROGRESS', statusCode: 429 });
    release();
    await expect(first).resolves.toMatchObject({ file: 'EssentialsX-2.22.0.jar' });
    expect(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('fortless-mod-')).length).toBe(tmpBefore);
    await expect(tools.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' })).resolves.toBeDefined(); // the slot was released
  });

  it('NEW-410: download hosts must be public DNS names, and a profile change is recorded with before and after', () => {
    const base = JSON.parse(JSON.stringify(listProfiles(db)[0] ?? {}));
    const withHost = (host: string) => ({ ...base, installSources: [{ ...base.installSources[0], downloadHosts: [host] }] });
    for (const bad of ['127.0.0.1', 'localhost', 'metadata.internal', 'intranet', '10.0.0.5', 'a..b.com']) {
      expect(() => validateProfile(withHost(bad))).toThrow(/download host|download hosts/);
    }
    expect(() => validateProfile(withHost('cdn.modrinth.com'))).not.toThrow();
    const changed = saveProfile(db, withHost('mirror.example.org'), base.id);
    const diff = describeProfileChange(listProfiles(db).find((p) => p.id === base.id) ? { ...changed, installSources: base.installSources } as never : null, changed) as any;
    expect(diff.changed).toContain('installSources');
    expect(diff.installSources.after[0].downloadHosts).toEqual(['mirror.example.org']);
  });

  it('GAM-07: search uses the profile facets and the server version; install verifies the checksum and uploads', async () => {
    seed(1);
    const ad = new FakeAdapter();
    const s = stub();
    const tools = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: s.fn });
    const res: any = await tools.searchMods(ctx(1), { source: 0, q: 'essentials', page: 0 });
    expect(res.hits[0]).toMatchObject({ projectId: 'hXiIvTyT', title: 'EssentialsX' });
    const searchUrl = decodeURIComponent(s.calls.find((c) => c.includes('/search'))!);
    expect(searchUrl).toContain('versions:1.21.4');
    expect(searchUrl).toContain('categories:paper');
    const out = await tools.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' });
    expect(out).toEqual({ file: 'EssentialsX-2.22.0.jar', dir: '/plugins', version: '2.22.0' });
    expect(ad.uploads).toContain('upload:/plugins');
    expect(s.calls.some((c) => c.includes('node.example.test') && c.includes('directory=%2Fplugins'))).toBe(true);
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.mod.install'").get()).toEqual({ c: 1 });
  });

  it('GAM-08: a checksum mismatch, a foreign host or a bad id installs nothing', async () => {
    seed(1);
    const ad = new FakeAdapter();
    const bad = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: stub({ hash: 'f'.repeat(128) }).fn });
    await expect(bad.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ code: 'HASH_MISMATCH' });
    const foreign = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: stub({ host: 'evil.example.com' }).fn });
    await expect(foreign.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ code: 'DOWNLOAD_NOT_ALLOWED' });
    await expect(foreign.installMod(ctx(1), { source: 0, projectId: '../../x' })).rejects.toMatchObject({ code: 'INVALID_PROJECT' });
    await expect(foreign.installMod(ctx(1), { source: 9, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    const rejected = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: stub({ uploadOk: false }).fn });
    await expect(rejected.installMod(ctx(1), { source: 0, projectId: 'hXiIvTyT' })).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'service.mod.install'").get()).toEqual({ c: 0 });
  });

  const png = (w: number, h: number) => {
    const b = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return b.toString('base64');
  };

  it('GAM-09: the icon must be a real 64x64 PNG and is uploaded under the profile file name', async () => {
    seed(1);
    const ad = new FakeAdapter();
    const s = stub();
    const tools = createGameTools({ adapter: ad, db, secret: SECRET, fetchFn: s.fn });
    await tools.setIcon(ctx(1), { png: png(64, 64) });
    expect(ad.uploads).toContain('upload:/');
    await expect(tools.setIcon(ctx(1), { png: png(128, 128) })).rejects.toMatchObject({ code: 'INVALID_ICON' });
    await expect(tools.setIcon(ctx(1), { png: Buffer.from('<svg onload=alert(1)>'.repeat(3)).toString('base64') })).rejects.toMatchObject({ code: 'INVALID_ICON' });
    await expect(tools.setIcon(ctx(1), { png: 'not base64!!' })).rejects.toMatchObject({ code: 'INVALID_ICON' });
  });
});
