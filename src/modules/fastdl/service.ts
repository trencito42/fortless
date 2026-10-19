import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import type { ProviderAdapter } from '../provisioning/adapter.js';
import { ConsoleAccessError, resolveOwnedService } from '../provisioning/console.js';
import { createFilesApi } from '../provisioning/files.js';
import { isCvarConfigured, recordCvarConfiguration, updateServerCfgContent } from './cvar.js';
import { getManifestStats, listManifest as listManifestRepo } from './manifest.js';
import { resolveFastDlProfile } from './profiles.js';
import { cancelSyncJob, createSyncJob, getActiveSyncJob, getSyncJob } from './queue.js';
import { getFastDlStorage, type FastDlStorageBackend } from './storage.js';
import { executeFastDlSync } from './sync.js';
import type { FastDlGlobalSettings, FastDlProfile, FastDlStatusResponse, FastDlSyncJob } from './types.js';

export interface FastDlDeps {
  db?: Database.Database;
  adapter?: ProviderAdapter;
  storage?: FastDlStorageBackend;
  secret?: string;
  fetchFn?: typeof fetch;
}

export interface ServiceContext {
  serviceId: string;
  accountId: string;
  userId: string;
  role?: string;
  ipAddress?: string;
}

export function getFastDlPublicUrl(serviceId: string, customDomain?: string): string {
  const base = (customDomain || config.APP_ORIGIN).replace(/\/$/, '');
  return `${base}/fastdl/${encodeURIComponent(serviceId)}/`;
}

export function getGlobalSettings(db: Database.Database): FastDlGlobalSettings {
  const row = db.prepare('SELECT * FROM fastdl_settings WHERE id = ?').get('default') as any;
  if (!row) {
    return {
      id: 'default',
      publicDomain: '',
      storageBackend: 'local',
      storagePath: './data/fastdl',
      defaultQuotaBytes: 5368709120,
      maxFileSizeBytes: 524288000,
      autoSyncEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    id: row.id,
    publicDomain: row.public_domain,
    storageBackend: row.storage_backend,
    storagePath: row.storage_path,
    defaultQuotaBytes: Number(row.default_quota_bytes),
    maxFileSizeBytes: Number(row.max_file_size_bytes),
    autoSyncEnabled: Boolean(row.auto_sync_enabled),
    updatedAt: row.updated_at,
  };
}

export function updateGlobalSettings(
  db: Database.Database,
  patch: Partial<Omit<FastDlGlobalSettings, 'id' | 'updatedAt'>>
): FastDlGlobalSettings {
  const current = getGlobalSettings(db);
  const next = { ...current, ...patch };

  db.prepare(`
    INSERT INTO fastdl_settings (id, public_domain, storage_backend, storage_path, default_quota_bytes, max_file_size_bytes, auto_sync_enabled, updated_at)
    VALUES ('default', ?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
    ON CONFLICT(id) DO UPDATE SET
      public_domain = excluded.public_domain,
      storage_backend = excluded.storage_backend,
      storage_path = excluded.storage_path,
      default_quota_bytes = excluded.default_quota_bytes,
      max_file_size_bytes = excluded.max_file_size_bytes,
      auto_sync_enabled = excluded.auto_sync_enabled,
      updated_at = datetime('now', 'utc')
  `).run(
    next.publicDomain,
    next.storageBackend,
    next.storagePath,
    next.defaultQuotaBytes,
    next.maxFileSizeBytes,
    next.autoSyncEnabled ? 1 : 0
  );

  return getGlobalSettings(db);
}

export function createFastDlService(deps: FastDlDeps = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;
  const storage = () => deps.storage ?? getFastDlStorage();
  const adapterIn = () => deps.adapter ?? getProviderAdapter();
  const filesApi = createFilesApi(deps);

  async function resolveProfileForService(ctx: ServiceContext): Promise<{ profile: FastDlProfile | null; externalId: string }> {
    const { service, adapter } = resolveOwnedService(ctx, adapterIn(), db(), secret(), 'file.read');
    const eggName = await adapter.getServerEggName(service.external_id);
    return { profile: resolveFastDlProfile(eggName), externalId: service.external_id };
  }

  return {
    async getStatus(ctx: ServiceContext): Promise<FastDlStatusResponse> {
      const { profile } = await resolveProfileForService(ctx);
      if (!profile) {
        return { supported: false, reason: 'This game engine does not support HTTP FastDL.' };
      }

      const globalSettings = getGlobalSettings(db());
      const configRow = db().prepare('SELECT * FROM fastdl_configs WHERE service_id = ?').get(ctx.serviceId) as any;
      const quotaBytes = Number(configRow?.quota_bytes || globalSettings.defaultQuotaBytes);
      const manifestStats = getManifestStats(db(), ctx.serviceId);
      const storageUsage = await storage().getTotalUsage(ctx.serviceId);
      const activeJob = getActiveSyncJob(db(), ctx.serviceId);

      const publicDownloadUrl = getFastDlPublicUrl(ctx.serviceId, configRow?.custom_public_url || globalSettings.publicDomain);

      // Check if cvar is configured in server.cfg
      let cvarConfigured = Boolean(configRow?.cvar_configured_at);
      // While a sync runs the page polls this endpoint; skip the live panel read then so polling cannot use up the
      // panel's per-key request budget that the sync needs.
      if (!activeJob) try {
        const file = await filesApi.read(ctx, profile.configFile);
        cvarConfigured = isCvarConfigured(file.content, profile, publicDownloadUrl);
      } catch {
        // file not created yet or unreadable
      }

      return {
        supported: true,
        profile,
        config: {
          enabled: configRow ? Boolean(configRow.enabled) : true,
          autoSync: configRow ? Boolean(configRow.auto_sync) : true,
          compressionMode: configRow?.compression_mode || profile.compression,
          quotaBytes,
          customPublicUrl: configRow?.custom_public_url || null,
          lastSyncAt: configRow?.last_sync_at || manifestStats.lastSyncAt,
          cvarConfiguredAt: configRow?.cvar_configured_at || null,
          cvarBackupPath: configRow?.cvar_backup_path || null,
        },
        stats: {
          totalFiles: manifestStats.totalFiles,
          totalOriginalBytes: manifestStats.totalOriginalBytes,
          totalStoredBytes: storageUsage,
          quotaBytes,
          percentUsed: quotaBytes > 0 ? Math.min(100, Math.round((storageUsage / quotaBytes) * 100)) : 0,
          cvarConfigured,
        },
        activeJob,
        publicDownloadUrl,
      };
    },

    async triggerSync(ctx: ServiceContext, triggerType: FastDlSyncJob['triggerType'] = 'MANUAL'): Promise<FastDlSyncJob> {
      const { profile } = await resolveProfileForService(ctx);
      if (!profile) {
        throw new ConsoleAccessError('FastDL is not supported for this game server.', 'FASTDL_UNSUPPORTED', 400);
      }

      const existing = getActiveSyncJob(db(), ctx.serviceId);
      if (existing) {
        return existing;
      }

      const job = createSyncJob(db(), ctx.serviceId, ctx.accountId, triggerType);

      // Launch async synchronization in background
      void executeFastDlSync({
        serviceId: ctx.serviceId,
        jobId: job.id,
        accountId: ctx.accountId,
        userId: ctx.userId,
        role: ctx.role,
        ipAddress: ctx.ipAddress,
        deps: {
          db: db(),
          adapter: adapterIn(),
          storage: storage(),
          secret: secret(),
          fetchFn: deps.fetchFn,
        },
      });

      return getSyncJob(db(), job.id)!;
    },

    async cancelSync(ctx: ServiceContext): Promise<{ cancelled: boolean }> {
      const active = getActiveSyncJob(db(), ctx.serviceId);
      if (!active) {
        return { cancelled: false };
      }
      const ok = cancelSyncJob(db(), active.id);
      return { cancelled: ok };
    },

    async retrySync(ctx: ServiceContext): Promise<FastDlSyncJob> {
      return this.triggerSync(ctx, 'RETRY');
    },

    async configureCvar(ctx: ServiceContext): Promise<{ success: boolean; backupPath: string | null; downloadUrl: string }> {
      const { profile } = await resolveProfileForService(ctx);
      if (!profile) {
        throw new ConsoleAccessError('FastDL is not supported for this game server.', 'FASTDL_UNSUPPORTED', 400);
      }

      const globalSettings = getGlobalSettings(db());
      const configRow = db().prepare('SELECT * FROM fastdl_configs WHERE service_id = ?').get(ctx.serviceId) as any;
      const downloadUrl = getFastDlPublicUrl(ctx.serviceId, configRow?.custom_public_url || globalSettings.publicDomain);

      // 1. Read existing server.cfg
      let originalContent = '';
      let fileExists = true;
      try {
        const file = await filesApi.read(ctx, profile.configFile);
        originalContent = file.content;
      } catch (err: any) {
        if (err.statusCode === 404 || err.code === 'HTTP_404') {
          fileExists = false;
        } else {
          throw err;
        }
      }

      // 2. Create backup if file already existed
      let backupPath: string | null = null;
      if (fileExists && originalContent.trim().length > 0) {
        backupPath = `${profile.configFile}.bak`;
        try {
          await filesApi.write(ctx, backupPath, originalContent);
        } catch {
          // Non-fatal if backup cannot be written, but record in audit
        }
      }

      // 3. Update or append cvars
      const { updatedContent } = updateServerCfgContent(originalContent, profile, downloadUrl);
      await filesApi.write(ctx, profile.configFile, updatedContent);

      // 4. Record configuration in DB
      recordCvarConfiguration(db(), ctx.serviceId, backupPath);

      return {
        success: true,
        backupPath,
        downloadUrl,
      };
    },

    async listManifest(
      ctx: ServiceContext,
      query: { page?: number; limit?: number; search?: string; status?: string }
    ) {
      resolveOwnedService(ctx, adapterIn(), db(), secret(), 'file.read');
      return listManifestRepo(db(), ctx.serviceId, query);
    },

    async updateConfig(
      ctx: ServiceContext,
      patch: { autoSync?: boolean; compressionMode?: 'bz2' | 'raw' | 'both'; quotaBytes?: number }
    ) {
      resolveOwnedService(ctx, adapterIn(), db(), secret(), 'file.update');
      const sets: string[] = ['updated_at = datetime(\'now\', \'utc\')'];
      const values: any[] = [];

      if (patch.autoSync !== undefined) { sets.push('auto_sync = ?'); values.push(patch.autoSync ? 1 : 0); }
      if (patch.compressionMode !== undefined) { sets.push('compression_mode = ?'); values.push(patch.compressionMode); }
      if (patch.quotaBytes !== undefined) { sets.push('quota_bytes = ?'); values.push(patch.quotaBytes); }

      values.push(ctx.serviceId);
      db().prepare(`
        INSERT INTO fastdl_configs (service_id, enabled, auto_sync, compression_mode, quota_bytes)
        VALUES (?, 1, 1, 'bz2', 5368709120)
        ON CONFLICT(service_id) DO UPDATE SET ${sets.join(', ')}
      `).run(ctx.serviceId);

      return this.getStatus(ctx);
    },
  };
}

const debouncedSyncTimers = new Map<string, NodeJS.Timeout>();

export function triggerAutoSyncOnFileEvent(
  serviceId: string,
  accountId: string,
  changedFilePath?: string,
  db?: Database.Database
): void {
  if (changedFilePath) {
    const lower = changedFilePath.toLowerCase();
    if (lower.endsWith('.cfg') || lower.endsWith('.ini') || lower.endsWith('.log') || lower.startsWith('/.')) {
      return;
    }
  }

  const database = db ?? getDatabase();
  const config = database.prepare('SELECT enabled, auto_sync FROM fastdl_configs WHERE service_id = ?').get(serviceId) as { enabled: number; auto_sync: number } | undefined;
  if (!config || !config.enabled || !config.auto_sync) return;

  const existing = debouncedSyncTimers.get(serviceId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    debouncedSyncTimers.delete(serviceId);
    try {
      const active = getActiveSyncJob(database, serviceId);
      if (active) return;
      const fastDl = createFastDlService({ db: database });
      void fastDl.triggerSync({
        serviceId,
        accountId,
        userId: 'system',
        role: 'OWNER',
      }, 'FILE_EVENT');
    } catch {
      // Ignore background trigger errors
    }
  }, 5000);

  debouncedSyncTimers.set(serviceId, timer);
}

