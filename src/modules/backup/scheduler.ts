import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { createDatabaseBackup, requireBackupKey, type BackupMetadata } from './backup.js';

export interface ScheduledBackupOptions {
  db: Database.Database;
  encryptionKey: string;
  targetDir?: string;
  retentionCount: number;
  /** A directory on another disk or a mounted remote share. Empty means no copy is made. */
  copyDir?: string;
}

export interface ScheduledBackupResult { backupId: string; copied: boolean; pruned: number }

const audit = (db: Database.Database, action: string, metadata: Record<string, unknown>) => {
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
    VALUES (?, NULL, 'SYSTEM', ?, 'backup', ?, ?, ?)
  `).run(`aud_${crypto.randomUUID()}`, action, String(metadata['backupId'] ?? 'scheduled'), `corr_${crypto.randomUUID()}`, JSON.stringify(metadata));
};

const sha256File = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * NEW-374: one scheduled, encrypted backup with retention and an optional second copy. Every outcome, including a
 * failure, is written to the audit trail so a missing backup is visible instead of silent.
 */
export async function runScheduledBackup(options: ScheduledBackupOptions): Promise<ScheduledBackupResult> {
  const targetDir = options.targetDir ?? path.resolve(process.cwd(), 'data', 'backups');
  let meta: BackupMetadata;
  try {
    meta = await createDatabaseBackup({ sourceDb: options.db, encryptionKey: requireBackupKey(options.encryptionKey), targetDir });
  } catch (err) {
    audit(options.db, 'backup.failed', { reason: (err as Error).message.slice(0, 200) });
    throw err;
  }

  let copied = false;
  if (options.copyDir) {
    try {
      fs.mkdirSync(options.copyDir, { recursive: true, mode: 0o700 });
      const copyPath = path.join(options.copyDir, path.basename(meta.backupFilePath));
      fs.copyFileSync(meta.backupFilePath, copyPath);
      fs.chmodSync(copyPath, 0o600);
      if (sha256File(copyPath) !== sha256File(meta.backupFilePath)) throw new Error('copy checksum mismatch');
      fs.copyFileSync(meta.backupFilePath.replace(/\.enc\.db$/, '.meta.json'), path.join(options.copyDir, `${meta.backupId}.meta.json`));
      copied = true;
    } catch (err) {
      audit(options.db, 'backup.copy_failed', { backupId: meta.backupId, reason: (err as Error).message.slice(0, 200) });
    }
  }

  const pruned = pruneBackups(targetDir, options.retentionCount) + (options.copyDir ? pruneBackups(options.copyDir, options.retentionCount) : 0);
  audit(options.db, 'backup.completed', { backupId: meta.backupId, bytes: meta.byteSize, encrypted: meta.isEncrypted, copied, pruned });
  return { backupId: meta.backupId, copied, pruned };
}

/** Keeps the newest `keep` encrypted backups (by id, which starts with a timestamp) and removes the rest with their metadata. */
export function pruneBackups(dir: string, keep: number): number {
  if (!fs.existsSync(dir)) return 0;
  const ids = fs.readdirSync(dir).filter((f) => /^bkp_.*\.enc\.db$/.test(f)).map((f) => f.replace(/\.enc\.db$/, '')).sort().reverse();
  const stale = ids.slice(keep);
  for (const id of stale) {
    for (const suffix of ['.enc.db', '.meta.json']) fs.rmSync(path.join(dir, `${id}${suffix}`), { force: true });
  }
  return stale.length;
}

/** Removes leftovers of interrupted runs (raw snapshots and work directories) older than an hour. */
export function cleanStrayBackupFiles(dir: string, olderThanMs = 3_600_000): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.raw\.db(-shm|-wal)?$/.test(name) && !name.startsWith('.work-')) continue;
    const full = path.join(dir, name);
    if (Date.now() - fs.statSync(full).mtimeMs < olderThanMs) continue;
    fs.rmSync(full, { recursive: true, force: true });
    removed++;
  }
  return removed;
}
