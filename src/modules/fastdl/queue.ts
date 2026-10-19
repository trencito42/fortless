import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';
import type { FastDlSyncJob } from './types.js';

export type { FastDlSyncJob };

const activeCancellationTokens = new Set<string>();

export function createSyncJob(
  db: Database.Database,
  serviceId: string,
  accountId: string,
  triggerType: FastDlSyncJob['triggerType'] = 'MANUAL'
): FastDlSyncJob {
  const existingActive = getActiveSyncJob(db, serviceId);
  if (existingActive) {
    return existingActive;
  }

  const id = generateId('fsync');
  db.prepare(`
    INSERT INTO fastdl_sync_jobs (
      id, service_id, account_id, trigger_type, status,
      total_files, processed_files, synced_files, deleted_files, failed_files,
      total_bytes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'QUEUED', 0, 0, 0, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))
  `).run(id, serviceId, accountId, triggerType);

  return getSyncJob(db, id)!;
}

export function getSyncJob(db: Database.Database, jobId: string): FastDlSyncJob | null {
  const r = db.prepare('SELECT * FROM fastdl_sync_jobs WHERE id = ?').get(jobId) as any;
  if (!r) return null;
  return rowToJob(r);
}

export function getActiveSyncJob(db: Database.Database, serviceId: string): FastDlSyncJob | null {
  const r = db
    .prepare("SELECT * FROM fastdl_sync_jobs WHERE service_id = ? AND status IN ('QUEUED', 'RUNNING') ORDER BY created_at DESC LIMIT 1")
    .get(serviceId) as any;
  if (!r) return null;
  return rowToJob(r);
}

export function listRecentSyncJobs(db: Database.Database, serviceId: string, limit = 10): FastDlSyncJob[] {
  const rows = db
    .prepare('SELECT * FROM fastdl_sync_jobs WHERE service_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(serviceId, limit) as any[];
  return rows.map(rowToJob);
}

export function updateSyncJobProgress(
  db: Database.Database,
  jobId: string,
  updates: {
    status?: FastDlSyncJob['status'];
    totalFiles?: number;
    processedFiles?: number;
    syncedFiles?: number;
    deletedFiles?: number;
    failedFiles?: number;
    totalBytes?: number;
    currentFile?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }
): void {
  const sets: string[] = ['updated_at = datetime(\'now\', \'utc\')'];
  const values: any[] = [];

  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.totalFiles !== undefined) { sets.push('total_files = ?'); values.push(updates.totalFiles); }
  if (updates.processedFiles !== undefined) { sets.push('processed_files = ?'); values.push(updates.processedFiles); }
  if (updates.syncedFiles !== undefined) { sets.push('synced_files = ?'); values.push(updates.syncedFiles); }
  if (updates.deletedFiles !== undefined) { sets.push('deleted_files = ?'); values.push(updates.deletedFiles); }
  if (updates.failedFiles !== undefined) { sets.push('failed_files = ?'); values.push(updates.failedFiles); }
  if (updates.totalBytes !== undefined) { sets.push('total_bytes = ?'); values.push(updates.totalBytes); }
  if (updates.currentFile !== undefined) { sets.push('current_file = ?'); values.push(updates.currentFile); }
  if (updates.errorMessage !== undefined) { sets.push('error_message = ?'); values.push(updates.errorMessage); }
  if (updates.startedAt !== undefined) { sets.push('started_at = ?'); values.push(updates.startedAt); }
  if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt); }

  values.push(jobId);
  db.prepare(`UPDATE fastdl_sync_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function cancelSyncJob(db: Database.Database, jobId: string): boolean {
  const job = getSyncJob(db, jobId);
  if (!job) return false;
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return false;
  }

  activeCancellationTokens.add(jobId);
  db.prepare(`
    UPDATE fastdl_sync_jobs
    SET status = 'CANCELLED', completed_at = datetime('now', 'utc'), updated_at = datetime('now', 'utc')
    WHERE id = ?
  `).run(jobId);
  return true;
}

export function isJobCancelled(jobId: string): boolean {
  return activeCancellationTokens.has(jobId);
}

export function clearJobCancellation(jobId: string): void {
  activeCancellationTokens.delete(jobId);
}

function rowToJob(r: any): FastDlSyncJob {
  return {
    id: r.id,
    serviceId: r.service_id,
    accountId: r.account_id,
    triggerType: r.trigger_type,
    status: r.status,
    totalFiles: Number(r.total_files || 0),
    processedFiles: Number(r.processed_files || 0),
    syncedFiles: Number(r.synced_files || 0),
    deletedFiles: Number(r.deleted_files || 0),
    failedFiles: Number(r.failed_files || 0),
    totalBytes: Number(r.total_bytes || 0),
    currentFile: r.current_file,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
