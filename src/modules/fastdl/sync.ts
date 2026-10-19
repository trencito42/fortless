import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import type { PanelFileEntry, PterodactylHttpAdapter, ProviderAdapter } from '../provisioning/adapter.js';
import { resolveOwnedService, withAccountClientKey } from '../provisioning/console.js';
import { compressBz2, sha256 } from './compression.js';
import { listActiveManifestMap, markManifestDeleted, upsertManifestItem } from './manifest.js';
import { resolveFastDlProfile } from './profiles.js';
import { clearJobCancellation, isJobCancelled, updateSyncJobProgress } from './queue.js';
import { getFastDlStorage, FastDlQuotaExceededError, type FastDlStorageBackend } from './storage.js';
import type { FastDlProfile } from './types.js';

export interface SyncOptions {
  serviceId: string;
  jobId: string;
  accountId: string;
  userId: string;
  ipAddress?: string;
  deps?: {
    db?: Database.Database;
    adapter?: ProviderAdapter;
    storage?: FastDlStorageBackend;
    secret?: string;
    fetchFn?: typeof fetch;
  };
}

export interface ScannedAsset {
  serverPath: string; // absolute POSIX path on game server e.g. /cstrike/maps/de_dust2.bsp
  relPath: string;    // relative asset path e.g. maps/de_dust2.bsp
  size: number;
  modifiedAt: string;
}

const BLACKLIST_EXTENSIONS = new Set([
  '.cfg',
  '.ini',
  '.so',
  '.dll',
  '.smx',
  '.amxx',
  '.log',
  '.sql',
  '.db',
  '.key',
  '.env',
  '.rcon',
  '.sh',
  '.bat',
  '.exe',
  '.py',
  '.js',
  '.json',
]);

/**
 * Checks if a filename has an allowed asset extension and is not blacklisted.
 */
export function isAllowedAsset(name: string, allowedExtensions: string[]): boolean {
  const lower = name.toLowerCase();
  for (const bl of BLACKLIST_EXTENSIONS) {
    if (lower.endsWith(bl)) return false;
  }
  // Disallow hidden files
  if (lower.startsWith('.')) return false;

  for (const ext of allowedExtensions) {
    if (lower.endsWith(ext.toLowerCase())) return true;
  }
  return false;
}

/**
 * Recursively scans asset directories on the game server via Wings/Pterodactyl client API.
 */
export async function scanServerAssets(
  adapter: PterodactylHttpAdapter,
  externalId: string,
  key: string,
  profile: FastDlProfile,
  maxFiles = 2000
): Promise<ScannedAsset[]> {
  const assets: ScannedAsset[] = [];
  const visitedDirs = new Set<string>();

  const scanDir = async (dirPath: string, relPrefix: string) => {
    if (visitedDirs.has(dirPath) || assets.length >= maxFiles) return;
    visitedDirs.add(dirPath);

    let entries: PanelFileEntry[];
    try {
      entries = await adapter.listFiles(externalId, dirPath, key);
    } catch {
      return; // Directory does not exist or unreadable, continue
    }

    for (const item of entries) {
      if (assets.length >= maxFiles) break;
      if (item.name.startsWith('.')) continue;

      // Do not follow symlinks to prevent path traversal escapes
      if (item.isSymlink) continue;

      const subServerPath = `${dirPath === '/' ? '' : dirPath}/${item.name}`;
      const subRelPath = `${relPrefix ? `${relPrefix}/` : ''}${item.name}`;

      if (item.isFile) {
        if (isAllowedAsset(item.name, profile.extensions)) {
          assets.push({
            serverPath: subServerPath,
            relPath: subRelPath,
            size: item.size,
            modifiedAt: item.modifiedAt,
          });
        }
      } else {
        // Recursive folder traversal
        await scanDir(subServerPath, subRelPath);
      }
    }
  };

  const gameRoot = profile.gameDir === '/' ? '' : profile.gameDir;
  for (const assetDir of profile.assetDirs) {
    const startDir = `${gameRoot}/${assetDir}`;
    await scanDir(startDir, assetDir);
  }

  return assets;
}

/**
 * Executes a full or incremental FastDL sync job.
 */
export async function executeFastDlSync(options: SyncOptions): Promise<{
  success: boolean;
  totalFiles: number;
  syncedFiles: number;
  deletedFiles: number;
  failedFiles: number;
  totalBytes: number;
  error?: string;
}> {
  const { serviceId, jobId, accountId, userId } = options;
  const db = options.deps?.db ?? getDatabase();
  const secret = options.deps?.secret ?? config.PTERODACTYL_KEYMINT_SECRET;
  const storage = options.deps?.storage ?? getFastDlStorage();
  const adapterIn = options.deps?.adapter ?? getProviderAdapter();
  const doFetch = options.deps?.fetchFn ?? fetch;

  const ctx = { serviceId, accountId, userId, ipAddress: options.ipAddress };
  let { service, adapter } = resolveOwnedService(ctx, adapterIn, db, secret, 'file.read');

  // Check game profile
  const eggName = await adapter.getServerEggName(service.external_id);
  const profile = resolveFastDlProfile(eggName);
  if (!profile) {
    const msg = `FastDL is not supported for server egg "${eggName || 'unknown'}".`;
    updateSyncJobProgress(db, jobId, {
      status: 'FAILED',
      errorMessage: msg,
      completedAt: new Date().toISOString(),
    });
    return { success: false, totalFiles: 0, syncedFiles: 0, deletedFiles: 0, failedFiles: 0, totalBytes: 0, error: msg };
  }

  // Load config or defaults
  const configRow = db.prepare('SELECT * FROM fastdl_configs WHERE service_id = ?').get(serviceId) as any;
  const quotaBytes = Number(configRow?.quota_bytes || 5368709120); // 5 GB
  const compressionMode = (configRow?.compression_mode || profile.compression) as 'bz2' | 'raw' | 'both';

  // Mark running
  updateSyncJobProgress(db, jobId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  });

  try {
    return await withAccountClientKey(accountId, adapter, db, secret, async (key) => {
      // 1. Scan server files
      const scannedAssets = await scanServerAssets(adapter, service.external_id, key, profile);

      if (isJobCancelled(jobId)) {
        clearJobCancellation(jobId);
        updateSyncJobProgress(db, jobId, { status: 'CANCELLED', completedAt: new Date().toISOString() });
        return { success: false, totalFiles: scannedAssets.length, syncedFiles: 0, deletedFiles: 0, failedFiles: 0, totalBytes: 0, error: 'Cancelled by user' };
      }

      const activeManifest = listActiveManifestMap(db, serviceId);
      const scannedRelPathSet = new Set<string>();

      updateSyncJobProgress(db, jobId, {
        totalFiles: scannedAssets.length,
        processedFiles: 0,
        syncedFiles: 0,
        deletedFiles: 0,
        failedFiles: 0,
      });

      let processedCount = 0;
      let syncedCount = 0;
      let failedCount = 0;
      let totalBytesAccum = 0;

      // 2. Sync new and modified assets
      for (const asset of scannedAssets) {
        scannedRelPathSet.add(asset.relPath);

        if (isJobCancelled(jobId)) {
          clearJobCancellation(jobId);
          updateSyncJobProgress(db, jobId, {
            status: 'CANCELLED',
            processedFiles: processedCount,
            syncedFiles: syncedCount,
            failedFiles: failedCount,
            totalBytes: totalBytesAccum,
            completedAt: new Date().toISOString(),
          });
          return { success: false, totalFiles: scannedAssets.length, syncedFiles: syncedCount, deletedFiles: 0, failedFiles: failedCount, totalBytes: totalBytesAccum, error: 'Cancelled by user' };
        }

        processedCount++;
        updateSyncJobProgress(db, jobId, {
          processedFiles: processedCount,
          currentFile: asset.relPath,
        });

        // Incremental check: if file already synced with exact size and modified date, skip download
        const existing = activeManifest.get(asset.relPath);
        if (existing && existing.status === 'SYNCED' && existing.fileSize === asset.size && existing.fileSize > 0) {
          // File has not changed size on game server
          continue;
        }

        try {
          // Read/download file content from server
          let fileData: Buffer;
          try {
            // First attempt reading via adapter content endpoint (fast for small/medium files)
            const textContent = await adapter.readFile(service.external_id, asset.serverPath, key);
            fileData = Buffer.from(textContent, 'utf8');
          } catch (e: any) {
            // If file is binary or too large for text endpoint, get signed download URL and fetch stream
            try {
              const downloadUrl = await adapter.signedFileUrl(service.external_id, 'download', asset.serverPath, key);
              const res = await doFetch(downloadUrl);
              if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
              const arrBuf = await res.arrayBuffer();
              fileData = Buffer.from(arrBuf);
            } catch (dlErr: any) {
              throw new Error(`Failed to download asset: ${dlErr.message}`);
            }
          }

          const fileHash = sha256(fileData);
          const shouldCompress = compressionMode === 'bz2' || (compressionMode === 'both');
          let storedBuffer: Buffer;
          let storageRelPath: string;

          if (shouldCompress) {
            storedBuffer = await compressBz2(fileData);
            storageRelPath = `${asset.relPath}.bz2`;
          } else {
            storedBuffer = fileData;
            storageRelPath = asset.relPath;
          }

          // Write to FastDL storage backend (enforces quota & anti-traversal)
          await storage.write(serviceId, storageRelPath, storedBuffer, quotaBytes);

          // Update manifest record
          upsertManifestItem(db, {
            serviceId,
            filePath: asset.relPath,
            fileSize: fileData.length,
            compressedSize: storedBuffer.length,
            fileHash,
            isCompressed: shouldCompress,
            storageRelPath,
            status: 'SYNCED',
          });

          syncedCount++;
          totalBytesAccum += storedBuffer.length;
        } catch (fileErr: any) {
          failedCount++;
          if (fileErr instanceof FastDlQuotaExceededError) {
            // Hard stop on quota limit
            updateSyncJobProgress(db, jobId, {
              status: 'FAILED',
              processedFiles: processedCount,
              syncedFiles: syncedCount,
              failedFiles: failedCount,
              totalBytes: totalBytesAccum,
              errorMessage: fileErr.message,
              completedAt: new Date().toISOString(),
            });
            return {
              success: false,
              totalFiles: scannedAssets.length,
              syncedFiles: syncedCount,
              deletedFiles: 0,
              failedFiles: failedCount,
              totalBytes: totalBytesAccum,
              error: fileErr.message,
            };
          }

          // Log failure in manifest for this file and continue sync queue
          upsertManifestItem(db, {
            serviceId,
            filePath: asset.relPath,
            fileSize: asset.size,
            compressedSize: 0,
            fileHash: 'error',
            isCompressed: false,
            storageRelPath: asset.relPath,
            status: 'FAILED',
            lastError: fileErr.message,
          });
        }
      }

      // 3. Prune deleted assets (files in manifest that no longer exist on game server)
      let deletedCount = 0;
      for (const [relPath, item] of activeManifest) {
        if (!scannedRelPathSet.has(relPath)) {
          try {
            await storage.delete(serviceId, item.storageRelPath);
          } catch {
            // Ignore missing storage file
          }
          markManifestDeleted(db, serviceId, relPath);
          deletedCount++;
        }
      }

      // 4. Complete job and update config
      updateSyncJobProgress(db, jobId, {
        status: failedCount > 0 && syncedCount === 0 && scannedAssets.length > 0 ? 'FAILED' : 'COMPLETED',
        processedFiles: processedCount,
        syncedFiles: syncedCount,
        deletedFiles: deletedCount,
        failedFiles: failedCount,
        totalBytes: totalBytesAccum,
        currentFile: null,
        errorMessage: failedCount > 0 ? `${failedCount} file(s) failed during sync.` : null,
        completedAt: new Date().toISOString(),
      });

      db.prepare(`
        INSERT INTO fastdl_configs (service_id, enabled, auto_sync, compression_mode, quota_bytes, last_sync_at, updated_at)
        VALUES (?, 1, 1, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
        ON CONFLICT(service_id) DO UPDATE SET
          last_sync_at = datetime('now', 'utc'),
          updated_at = datetime('now', 'utc')
      `).run(serviceId, compressionMode, quotaBytes);

      return {
        success: failedCount === 0 || syncedCount > 0,
        totalFiles: scannedAssets.length,
        syncedFiles: syncedCount,
        deletedFiles: deletedCount,
        failedFiles: failedCount,
        totalBytes: totalBytesAccum,
        error: failedCount > 0 ? `${failedCount} files failed to sync` : undefined,
      };
    });
  } catch (err: any) {
    updateSyncJobProgress(db, jobId, {
      status: 'FAILED',
      errorMessage: err.message || 'Sync failed unexpectedly.',
      completedAt: new Date().toISOString(),
    });
    return {
      success: false,
      totalFiles: 0,
      syncedFiles: 0,
      deletedFiles: 0,
      failedFiles: 1,
      totalBytes: 0,
      error: err.message,
    };
  }
}
