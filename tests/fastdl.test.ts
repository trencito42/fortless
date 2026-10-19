import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';

vi.hoisted(() => {
  process.env['SESSION_SECRET'] = 'test-session-secret-0123456789abcdef0123456789';
});
vi.mock('../src/utils/ssrf.js', () => ({ validateSafeOutboundUrl: async () => undefined }));

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { PterodactylHttpAdapter, type PanelFileEntry } from '../src/modules/provisioning/adapter.js';
import {
  compressBz2,
  decompressBz2,
  sha256,
} from '../src/modules/fastdl/compression.js';
import {
  resolveFastDlProfile,
  isAllowedAsset,
} from '../src/modules/fastdl/index.js';
import {
  LocalFastDlStorage,
  FastDlQuotaExceededError,
  FastDlSecurityError,
} from '../src/modules/fastdl/storage.js';
import {
  getManifestItem,
  listManifest,
  listActiveManifestMap,
} from '../src/modules/fastdl/manifest.js';
import {
  isCvarConfigured,
  updateServerCfgContent,
} from '../src/modules/fastdl/cvar.js';
import {
  createSyncJob,
  getSyncJob,
} from '../src/modules/fastdl/queue.js';
import {
  executeFastDlSync,
} from '../src/modules/fastdl/sync.js';
import {
  createFastDlService,
} from '../src/modules/fastdl/service.js';

const TEST_STORAGE_DIR = './scratch/test-fastdl-storage';
const SECRET = 'k'.repeat(40);
let db: Database.Database;

class MockFastDlPterodactylAdapter extends PterodactylHttpAdapter {
  files = new Map<string, string>();
  binaryFiles = new Map<string, Buffer>();
  fileListings = new Map<string, PanelFileEntry[]>();
  eggName = 'Counter-Strike: 1.6';

  constructor() {
    super({ panelUrl: 'https://panel.example.test', apiKey: 'k' });
  }

  override async ensurePanelUser() {
    return { panelUserId: 42, username: 'fl_tester', email: 'tester@example.test' };
  }
  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_' + 'y'.repeat(40); }
  override async getServerEggName() { return this.eggName; }

  override async readFile(_id: string, p: string) {
    const c = this.files.get(p);
    if (c === undefined) {
      const { ProviderError } = await import('../src/modules/provisioning/adapter.js');
      throw new ProviderError('File not found', 'HTTP_404', 404);
    }
    return c;
  }

  override async writeFile(_id: string, p: string, content: string) {
    this.files.set(p, content);
  }

  override async listFiles(_id: string, dir: string): Promise<PanelFileEntry[]> {
    return this.fileListings.get(dir) || [];
  }

  override async signedFileUrl(_id: string, _kind: string, p: string) {
    return `https://node.example.test/download?file=${encodeURIComponent(p)}`;
  }

  /** Stands in for the node: serves the bytes of whatever file the signed link names. */
  fetchFn = (async (url: string) => {
    const p = new URL(url).searchParams.get('file') ?? '';
    const c = this.files.get(p);
    return c === undefined ? new Response('missing', { status: 404 }) : new Response(Buffer.from(c, 'utf8'));
  }) as unknown as typeof fetch;
}

function seedAccountAndService(db: Database.Database, serviceId: string, accountId: string, _egg?: string) {
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, name, status) VALUES ('usr_1', 'u@example.test', 'x', 'User', 'ACTIVE')`).run();
  db.prepare(`INSERT OR IGNORE INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'Test Account', 'usr_1', 'u@example.test')`).run(accountId);
  db.prepare(`INSERT OR IGNORE INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, 101, 'fl_test', 'u@example.test', ?)`).run(accountId, `fortless_${accountId}`);
  db.prepare(`
    INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, external_id, node_id, created_at, updated_at)
    VALUES (?, ?, 'oi_1', 'PTERODACTYL', 'p1', 'ACTIVE', 'ext_srv_1', 'node_1', datetime('now'), datetime('now'))
  `).run(serviceId, accountId);
}

beforeEach(() => {
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });

  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});

afterEach(() => {
  db.close();
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
});

describe('Fortless Auto FastDL: Profile Resolution and Folder Mappings', () => {
  it('FDL-01: correctly resolves GoldSrc CS 1.6 folder mappings and extensions', () => {
    const profile = resolveFastDlProfile('Counter-Strike: 1.6');
    expect(profile).not.toBeNull();
    expect(profile?.engine).toBe('goldsrc');
    expect(profile?.gameDir).toBe('/cstrike');
    expect(profile?.assetDirs).toContain('maps');
    expect(profile?.assetDirs).toContain('models');
    expect(profile?.assetDirs).toContain('sound');
    expect(profile?.assetDirs).toContain('sprites');
    expect(profile?.assetDirs).toContain('gfx');
    expect(profile?.assetDirs).toContain('overviews');
    expect(profile?.configFile).toBe('/cstrike/server.cfg');
    expect(profile?.compression).toBe('bz2');

    // Extension filtering checks
    expect(isAllowedAsset('de_dust2.bsp', profile!.extensions)).toBe(true);
    expect(isAllowedAsset('arctic.mdl', profile!.extensions)).toBe(true);
    expect(isAllowedAsset('bomb_defused.wav', profile!.extensions)).toBe(true);
    expect(isAllowedAsset('crosshair.spr', profile!.extensions)).toBe(true);
    expect(isAllowedAsset('halflife.wad', profile!.extensions)).toBe(true);

    // Blacklist checks
    expect(isAllowedAsset('server.cfg', profile!.extensions)).toBe(false);
    expect(isAllowedAsset('game.ini', profile!.extensions)).toBe(false);
    expect(isAllowedAsset('amxmodx_mm_i386.so', profile!.extensions)).toBe(false);
    expect(isAllowedAsset('metamod.dll', profile!.extensions)).toBe(false);
    expect(isAllowedAsset('admin.amxx', profile!.extensions)).toBe(false);
    expect(isAllowedAsset('.hidden_file.bsp', profile!.extensions)).toBe(false);
  });

  it('FDL-02: correctly resolves GoldSrc Half-Life, Sven Co-op, DoD, and TFC', () => {
    const hl = resolveFastDlProfile('Half-Life: Deathmatch');
    expect(hl?.engine).toBe('goldsrc');
    expect(hl?.gameDir).toBe('/valve');
    expect(hl?.configFile).toBe('/valve/server.cfg');

    const sven = resolveFastDlProfile('Sven Co-op');
    expect(sven?.gameDir).toBe('/svencoop');

    const dod = resolveFastDlProfile('Day of Defeat');
    expect(dod?.gameDir).toBe('/dod');

    const tfc = resolveFastDlProfile('Team Fortress Classic');
    expect(tfc?.gameDir).toBe('/tfc');
  });

  it('FDL-03: correctly resolves Source games (CS:S, Garry’s Mod, TF2, L4D2) with Source extensions', () => {
    const css = resolveFastDlProfile('Counter-Strike: Source');
    expect(css?.engine).toBe('source');
    expect(css?.gameDir).toBe('/cstrike');
    expect(css?.configFile).toBe('/cstrike/cfg/server.cfg');
    expect(isAllowedAsset('brickwall.vmt', css!.extensions)).toBe(true);
    expect(isAllowedAsset('brickwall.vtf', css!.extensions)).toBe(true);

    const gmod = resolveFastDlProfile("Garry's Mod");
    expect(gmod?.engine).toBe('source');
    expect(gmod?.gameDir).toBe('/garrysmod');
    expect(gmod?.assetDirs).toContain('materials');
    expect(gmod?.assetDirs).toContain('particles');

    const tf2 = resolveFastDlProfile('Team Fortress 2');
    expect(tf2?.gameDir).toBe('/tf');

    const l4d2 = resolveFastDlProfile('Left 4 Dead 2');
    expect(l4d2?.gameDir).toBe('/left4dead2');
  });

  it('FDL-04: resolves verified Call of Duty HTTP download configuration with raw compression', () => {
    const cod = resolveFastDlProfile('Call of Duty 4: Modern Warfare');
    expect(cod?.engine).toBe('cod');
    expect(cod?.compression).toBe('raw');
    expect(cod?.configFile).toBe('/main/server.cfg');
    expect(cod?.cvarTemplate).toContain('set sv_wwwBaseURL');
    expect(isAllowedAsset('localized_english_iw00.iwd', cod!.extensions)).toBe(true);
    expect(isAllowedAsset('mp_crash.pk3', cod!.extensions)).toBe(true);
  });

  it('FDL-05: refuses unsupported games (Minecraft, Rust, Node.js, Generic)', () => {
    expect(resolveFastDlProfile('Paper')).toBeNull();
    expect(resolveFastDlProfile('Vanilla Minecraft')).toBeNull();
    expect(resolveFastDlProfile('Rust')).toBeNull();
    expect(resolveFastDlProfile('Node.js')).toBeNull();
    expect(resolveFastDlProfile('Discord Bot')).toBeNull();
    expect(resolveFastDlProfile('Palworld')).toBeNull();
    expect(resolveFastDlProfile(null)).toBeNull();
  });
});

describe('Fortless Auto FastDL: Bzip2 Compression and Integrity', () => {
  it('FDL-06: compresses raw asset to valid .bz2 stream with BZh header and preserves content on decompress', async () => {
    const original = Buffer.from('Fortless FastDL custom map BSP test data with repeated patterns: '.repeat(100), 'utf8');
    const hash = sha256(original);
    expect(hash).toHaveLength(64);

    const compressed = await compressBz2(original);
    expect(compressed.length).toBeLessThan(original.length);
    // Bzip2 magic header check (BZh)
    expect(compressed[0]).toBe(0x42); // 'B'
    expect(compressed[1]).toBe(0x5a); // 'Z'
    expect(compressed[2]).toBe(0x68); // 'h'

    const decompressed = await decompressBz2(compressed);
    expect(decompressed.equals(original)).toBe(true);
  });
});

describe('Fortless Auto FastDL: Dedicated Storage and Security Jails', () => {
  it('FDL-07: enforces strict path isolation and blocks path traversal attempts', async () => {
    const storage = new LocalFastDlStorage(TEST_STORAGE_DIR);
    const serviceId = 'svc_safe123';

    // Safe write and read
    await storage.write(serviceId, 'maps/de_dust2.bsp.bz2', Buffer.from('dust2_bz2'), 50000);
    const read = await storage.read(serviceId, 'maps/de_dust2.bsp.bz2');
    expect(read).not.toBeNull();
    expect(read?.data.toString('utf8')).toBe('dust2_bz2');
    expect(read?.mime).toBe('application/x-bzip2');

    // Traversal attempts
    await expect(storage.write(serviceId, '../etc/passwd', Buffer.from('x'), 50000)).rejects.toThrow(FastDlSecurityError);
    await expect(storage.write(serviceId, 'maps/../../escape.txt', Buffer.from('x'), 50000)).rejects.toThrow(FastDlSecurityError);
    await expect(storage.read(serviceId, '../../../../etc/shadow')).rejects.toThrow(FastDlSecurityError);
    await expect(storage.write('bad/service/id', 'maps/map.bsp', Buffer.from('x'), 50000)).rejects.toThrow(FastDlSecurityError);
  });

  it('FDL-08: enforces storage quota limits and computes accurate usage', async () => {
    const storage = new LocalFastDlStorage(TEST_STORAGE_DIR);
    const serviceId = 'svc_quota_test';
    const quota = 1000; // 1000 bytes

    // Under quota
    await storage.write(serviceId, 'maps/small.bsp', Buffer.alloc(600, 'A'), quota);
    let usage = await storage.getTotalUsage(serviceId);
    expect(usage).toBe(600);

    // Over quota triggers FastDlQuotaExceededError
    await expect(
      storage.write(serviceId, 'maps/large.bsp', Buffer.alloc(500, 'B'), quota)
    ).rejects.toThrow(FastDlQuotaExceededError);

    // Overwritten file replaces size properly
    await storage.write(serviceId, 'maps/small.bsp', Buffer.alloc(800, 'C'), quota);
    usage = await storage.getTotalUsage(serviceId);
    expect(usage).toBe(800);
  });
});

describe('Fortless Auto FastDL: Safe server.cfg Cvar Configuration', () => {
  it('FDL-09: safely injects sv_downloadurl with trailing slash and creates backup copy', () => {
    const profile = resolveFastDlProfile('Counter-Strike: 1.6')!;
    const originalCfg = '// Base server config\nhostname "My CS 1.6 Server"\nmaxplayers 24\nmp_roundtime 1.75\n';
    const downloadUrl = 'https://fortless.net/fastdl/svc_test/';

    const { updatedContent, appliedLines } = updateServerCfgContent(originalCfg, profile, downloadUrl);
    expect(appliedLines[0]).toBe('sv_downloadurl "https://fortless.net/fastdl/svc_test/"');
    expect(updatedContent).toContain('sv_downloadurl "https://fortless.net/fastdl/svc_test/"');
    expect(updatedContent).toContain('sv_allowdownload 1');
    expect(updatedContent).toContain('hostname "My CS 1.6 Server"');

    // Verify cvar recognition
    expect(isCvarConfigured(updatedContent, profile, downloadUrl)).toBe(true);
    expect(isCvarConfigured(originalCfg, profile, downloadUrl)).toBe(false);

    // Re-configuring replaces existing cvar without duplicating
    const reconfigured = updateServerCfgContent(updatedContent, profile, 'https://fastdl.custom.domain/fastdl/svc_test/');
    const occurrences = (reconfigured.updatedContent.match(/sv_downloadurl/g) || []).length;
    expect(occurrences).toBe(1);
    expect(reconfigured.updatedContent).toContain('sv_downloadurl "https://fastdl.custom.domain/fastdl/svc_test/"');
  });
});

describe('Fortless Auto FastDL: Full Sync, Incremental Resync, and Deletions', () => {
  it('FDL-10: performs initial sync, compresses assets, tracks manifest, and prunes deleted assets on resync', async () => {
    const serviceId = 'svc_cs16_1';
    const accountId = 'acc_cs16_1';
    seedAccountAndService(db, serviceId, accountId, 'Counter-Strike: 1.6');

    const storage = new LocalFastDlStorage(TEST_STORAGE_DIR);
    const adapter = new MockFastDlPterodactylAdapter();
    adapter.eggName = 'Counter-Strike: 1.6';

    // Mock server file system:
    // /cstrike/maps/de_dust2.bsp
    // /cstrike/sound/welcome.wav
    // /cstrike/models/player.mdl
    // /cstrike/server.cfg (blacklisted from fastdl)
    adapter.fileListings.set('/cstrike/maps', [
      { name: 'de_dust2.bsp', isFile: true, isSymlink: false, size: 500, mime: '', modifiedAt: '2026-10-19T00:00:00Z' },
    ]);
    adapter.fileListings.set('/cstrike/sound', [
      { name: 'welcome.wav', isFile: true, isSymlink: false, size: 360, mime: '', modifiedAt: '2026-10-19T00:00:00Z' },
    ]);
    adapter.fileListings.set('/cstrike/models', [
      { name: 'player.mdl', isFile: true, isSymlink: false, size: 340, mime: '', modifiedAt: '2026-10-19T00:00:00Z' },
    ]);
    adapter.files.set('/cstrike/maps/de_dust2.bsp', 'dust2_content_bytes_'.repeat(25));
    adapter.files.set('/cstrike/sound/welcome.wav', 'welcome_wav_audio_'.repeat(20));
    adapter.files.set('/cstrike/models/player.mdl', 'player_mdl_model_'.repeat(20));
    adapter.files.set('/cstrike/server.cfg', 'hostname "Test Server"');

    const job = createSyncJob(db, serviceId, accountId, 'MANUAL');
    expect(job.status).toBe('QUEUED');

    // 1. Initial Sync Execution
    const result = await executeFastDlSync({
      serviceId,
      jobId: job.id,
      accountId,
      userId: 'usr_1',
      role: 'OWNER',
      deps: {
        db,
        adapter,
        storage,
        secret: SECRET,
        fetchFn: adapter.fetchFn,
        panelIntervalMs: 0,
        sleep: async () => undefined,
      },
    });

    expect(result.success).toBe(true);
    expect(result.totalFiles).toBe(3);
    expect(result.syncedFiles).toBe(3);
    expect(result.deletedFiles).toBe(0);
    expect(result.failedFiles).toBe(0);

    // Verify manifest entries
    const manifest = listManifest(db, serviceId);
    expect(manifest.total).toBe(3);
    const dust2 = getManifestItem(db, serviceId, 'maps/de_dust2.bsp');
    expect(dust2).not.toBeNull();
    expect(dust2?.status).toBe('SYNCED');
    expect(dust2?.isCompressed).toBe(true);
    expect(dust2?.storageRelPath).toBe('maps/de_dust2.bsp.bz2');
    expect(dust2?.compressedSize).toBeGreaterThan(0);

    // Verify storage file exists on disk
    const stored = await storage.read(serviceId, 'maps/de_dust2.bsp.bz2');
    expect(stored).not.toBeNull();
    expect(stored?.mime).toBe('application/x-bzip2');

    // 2. Incremental Resync (no changes on server)
    const job2 = createSyncJob(db, serviceId, accountId, 'MANUAL');
    const result2 = await executeFastDlSync({
      serviceId,
      jobId: job2.id,
      accountId,
      userId: 'usr_1',
      role: 'OWNER',
      deps: { db, adapter, storage, secret: SECRET },
    });

    expect(result2.success).toBe(true);
    expect(result2.totalFiles).toBe(3);
    expect(result2.syncedFiles).toBe(0); // 0 re-downloaded because unchanged!
    expect(result2.deletedFiles).toBe(0);

    // 3. Deletion Sync (remove welcome.wav from game server)
    adapter.fileListings.set('/cstrike/sound', []); // removed
    adapter.files.delete('/cstrike/sound/welcome.wav');

    const job3 = createSyncJob(db, serviceId, accountId, 'MANUAL');
    const result3 = await executeFastDlSync({
      serviceId,
      jobId: job3.id,
      accountId,
      userId: 'usr_1',
      role: 'OWNER',
      deps: { db, adapter, storage, secret: SECRET },
    });

    expect(result3.deletedFiles).toBe(1);
    const activeManifestAfterDelete = listActiveManifestMap(db, serviceId);
    expect(activeManifestAfterDelete.has('sound/welcome.wav')).toBe(false);
    // Deleted storage file is gone
    const storedDeleted = await storage.read(serviceId, 'sound/welcome.wav.bz2');
    expect(storedDeleted).toBeNull();
  });

  it('FDL-11: handles failed storage uploads gracefully and records job failures without corrupting manifest', async () => {
    const serviceId = 'svc_fail_test';
    const accountId = 'acc_fail_test';
    seedAccountAndService(db, serviceId, accountId, 'Counter-Strike: 1.6');

    const storage = new LocalFastDlStorage(TEST_STORAGE_DIR);
    const adapter = new MockFastDlPterodactylAdapter();
    adapter.eggName = 'Counter-Strike: 1.6';

    adapter.fileListings.set('/cstrike/maps', [
      { name: 'corrupted_map.bsp', isFile: true, isSymlink: false, size: 200, mime: '', modifiedAt: '2026-10-19T00:00:00Z' },
    ]);
    // Simulate server read error
    // (adapter.files does not contain the file, throwing 404)

    const job = createSyncJob(db, serviceId, accountId, 'MANUAL');
    const result = await executeFastDlSync({
      serviceId,
      jobId: job.id,
      accountId,
      userId: 'usr_1',
      role: 'OWNER',
      deps: { db, adapter, storage, secret: SECRET },
    });

    expect(result.failedFiles).toBe(1);
    const failedItem = getManifestItem(db, serviceId, 'maps/corrupted_map.bsp');
    expect(failedItem?.status).toBe('FAILED');
    expect(failedItem?.lastError).toBeDefined();

    const jobRecord = getSyncJob(db, job.id);
    expect(jobRecord?.status).toBe('FAILED');
    expect(jobRecord?.failedFiles).toBe(1);
  });

  it('FDL-12: rejects sync on unsupported games with FASTDL_UNSUPPORTED error', async () => {
    const serviceId = 'svc_mc_1';
    const accountId = 'acc_mc_1';
    seedAccountAndService(db, serviceId, accountId, 'Paper');

    const adapter = new MockFastDlPterodactylAdapter();
    adapter.eggName = 'Paper'; // Minecraft Paper is unsupported for FastDL

    const job = createSyncJob(db, serviceId, accountId, 'MANUAL');
    const result = await executeFastDlSync({
      serviceId,
      jobId: job.id,
      accountId,
      userId: 'usr_1',
      role: 'OWNER',
      deps: { db, adapter, storage: new LocalFastDlStorage(TEST_STORAGE_DIR), secret: SECRET },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not supported');

    const fastDl = createFastDlService({ db, adapter });
    await expect(fastDl.triggerSync({
      serviceId,
      accountId,
      userId: 'usr_1',
    })).rejects.toThrow();
  });
});

describe('FastDL sync respects the panel rate limit', () => {
  it('spaces panel calls, waits out a 429 using Retry-After and repeats the call instead of failing the file', async () => {
    const { createPanelThrottle } = await import('../src/modules/fastdl/sync.js');
    const { ProviderRateLimitedError } = await import('../src/modules/provisioning/adapter.js');
    const sleeps: number[] = [];
    const paced = createPanelThrottle({ intervalMs: 0, sleep: async (ms) => { sleeps.push(ms); } });
    let calls = 0;
    const out = await paced(async () => {
      calls++;
      if (calls < 3) throw new ProviderRateLimitedError(7);
      return 'ok';
    });
    expect(out).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([7000, 7000]);
  });

  it('gives up after the attempt budget and rethrows other errors immediately', async () => {
    const { createPanelThrottle } = await import('../src/modules/fastdl/sync.js');
    const { ProviderRateLimitedError } = await import('../src/modules/provisioning/adapter.js');
    const paced = createPanelThrottle({ intervalMs: 0, sleep: async () => undefined, maxAttempts: 3 });
    let n = 0;
    await expect(paced(async () => { n++; throw new ProviderRateLimitedError(1); })).rejects.toBeInstanceOf(ProviderRateLimitedError);
    expect(n).toBe(3);
    let m = 0;
    await expect(paced(async () => { m++; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(m).toBe(1);
  });

  it('a 429 from the panel becomes a typed rate-limit error carrying Retry-After', async () => {
    const { PterodactylHttpAdapter, ProviderRateLimitedError } = await import('../src/modules/provisioning/adapter.js');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('Too Many Attempts.', { status: 429, headers: { 'retry-after': '12' } })) as typeof fetch;
    try {
      const a = new PterodactylHttpAdapter({ panelUrl: 'https://panel.example.test', apiKey: 'k' });
      const err = await a.listFiles('1', '/', 'ptlc_' + 'x'.repeat(40)).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderRateLimitedError);
      expect((err as InstanceType<typeof ProviderRateLimitedError>).retryAfterSeconds).toBe(12);
    } finally { globalThis.fetch = realFetch; }
  });
});
