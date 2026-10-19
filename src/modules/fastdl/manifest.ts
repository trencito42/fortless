import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';
import type { FastDlManifestItem } from './types.js';

export function upsertManifestItem(
  db: Database.Database,
  item: Omit<FastDlManifestItem, 'id' | 'syncedAt'> & { id?: string }
): FastDlManifestItem {
  const existing = db
    .prepare('SELECT id FROM fastdl_manifest WHERE service_id = ? AND file_path = ?')
    .get(item.serviceId, item.filePath) as { id: string } | undefined;

  const id = existing?.id || item.id || generateId('fdm');

  db.prepare(`
    INSERT INTO fastdl_manifest (
      id, service_id, file_path, file_size, compressed_size, file_hash,
      is_compressed, storage_rel_path, status, last_error, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
    ON CONFLICT(service_id, file_path) DO UPDATE SET
      file_size = excluded.file_size,
      compressed_size = excluded.compressed_size,
      file_hash = excluded.file_hash,
      is_compressed = excluded.is_compressed,
      storage_rel_path = excluded.storage_rel_path,
      status = excluded.status,
      last_error = excluded.last_error,
      synced_at = datetime('now', 'utc')
  `).run(
    id,
    item.serviceId,
    item.filePath,
    item.fileSize,
    item.compressedSize,
    item.fileHash,
    item.isCompressed ? 1 : 0,
    item.storageRelPath,
    item.status,
    item.lastError || null
  );

  return getManifestItem(db, item.serviceId, item.filePath)!;
}

export function getManifestItem(
  db: Database.Database,
  serviceId: string,
  filePath: string
): FastDlManifestItem | null {
  const row = db
    .prepare('SELECT * FROM fastdl_manifest WHERE service_id = ? AND file_path = ?')
    .get(serviceId, filePath) as any;

  if (!row) return null;
  return {
    id: row.id,
    serviceId: row.service_id,
    filePath: row.file_path,
    fileSize: row.file_size,
    compressedSize: row.compressed_size,
    fileHash: row.file_hash,
    isCompressed: Boolean(row.is_compressed),
    storageRelPath: row.storage_rel_path,
    status: row.status,
    lastError: row.last_error,
    syncedAt: row.synced_at,
  };
}

export function listManifest(
  db: Database.Database,
  serviceId: string,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}
): { items: FastDlManifestItem[]; total: number; page: number; limit: number; totalPages: number } {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = ['service_id = ?'];
  const params: any[] = [serviceId];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  } else {
    conditions.push("status != 'DELETED'");
  }

  if (options.search?.trim()) {
    conditions.push('file_path LIKE ?');
    params.push(`%${options.search.trim().toLowerCase()}%`);
  }

  const whereClause = conditions.join(' AND ');
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM fastdl_manifest WHERE ${whereClause}`)
    .get(...params) as { cnt: number };

  const total = countRow?.cnt || 0;
  const rows = db
    .prepare(`
      SELECT * FROM fastdl_manifest
      WHERE ${whereClause}
      ORDER BY file_path ASC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as any[];

  const items = rows.map((r) => ({
    id: r.id,
    serviceId: r.service_id,
    filePath: r.file_path,
    fileSize: r.file_size,
    compressedSize: r.compressed_size,
    fileHash: r.file_hash,
    isCompressed: Boolean(r.is_compressed),
    storageRelPath: r.storage_rel_path,
    status: r.status,
    lastError: r.last_error,
    syncedAt: r.synced_at,
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export function markManifestDeleted(db: Database.Database, serviceId: string, filePath: string): void {
  db.prepare(`
    UPDATE fastdl_manifest
    SET status = 'DELETED', synced_at = datetime('now', 'utc')
    WHERE service_id = ? AND file_path = ?
  `).run(serviceId, filePath);
}

export function listActiveManifestMap(db: Database.Database, serviceId: string): Map<string, FastDlManifestItem> {
  const rows = db
    .prepare("SELECT * FROM fastdl_manifest WHERE service_id = ? AND status != 'DELETED'")
    .all(serviceId) as any[];

  const map = new Map<string, FastDlManifestItem>();
  for (const r of rows) {
    map.set(r.file_path, {
      id: r.id,
      serviceId: r.service_id,
      filePath: r.file_path,
      fileSize: r.file_size,
      compressedSize: r.compressed_size,
      fileHash: r.file_hash,
      isCompressed: Boolean(r.is_compressed),
      storageRelPath: r.storage_rel_path,
      status: r.status,
      lastError: r.last_error,
      syncedAt: r.synced_at,
    });
  }
  return map;
}

export function getManifestStats(db: Database.Database, serviceId: string): {
  totalFiles: number;
  totalOriginalBytes: number;
  totalStoredBytes: number;
  lastSyncAt: string | null;
} {
  const row = db
    .prepare(`
      SELECT
        COUNT(*) as totalFiles,
        COALESCE(SUM(file_size), 0) as totalOriginalBytes,
        COALESCE(SUM(compressed_size), 0) as totalStoredBytes,
        MAX(synced_at) as lastSyncAt
      FROM fastdl_manifest
      WHERE service_id = ? AND status = 'SYNCED'
    `)
    .get(serviceId) as any;

  return {
    totalFiles: Number(row?.totalFiles || 0),
    totalOriginalBytes: Number(row?.totalOriginalBytes || 0),
    totalStoredBytes: Number(row?.totalStoredBytes || 0),
    lastSyncAt: row?.lastSyncAt || null,
  };
}
