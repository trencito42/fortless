import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { createDatabaseBackup, verifyAndRestoreBackup, requireBackupKey, sessionSecretFingerprint } from '../src/modules/backup/backup.js';
import { runScheduledBackup, pruneBackups, cleanStrayBackupFiles } from '../src/modules/backup/scheduler.js';
import { config } from '../src/config/index.js';

const KEY = 'k'.repeat(40);
let dir: string; let db: Database.Database;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortless-bkp-'));
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES ('u1', 'a@example.test', 'x', 'A')").run();
});
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('NEW-373: no built-in backup key', () => {
  it('rejects a missing or short key', () => {
    expect(() => requireBackupKey(undefined)).toThrow(/FORTLESS_BACKUP_KEY/);
    expect(() => requireBackupKey('short')).toThrow(/32/);
    expect(requireBackupKey(KEY)).toBe(KEY);
  });

  it('the script contains no literal fallback key', () => {
    const script = fs.readFileSync(path.resolve('src/scripts/backup-restore.ts'), 'utf8');
    expect(script).not.toContain('default-fortless-backup');
  });
});

describe('NEW-374: scheduled, retained and copied backups', () => {
  it('writes an encrypted backup, leaves no raw snapshot, copies it and keeps only the newest N', async () => {
    const target = path.join(dir, 'backups'); const copy = path.join(dir, 'offsite');
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await runScheduledBackup({ db, encryptionKey: KEY, targetDir: target, retentionCount: 2, copyDir: copy }));
      await new Promise((r) => setTimeout(r, 15)); // distinct timestamps in the backup id
    }
    expect(results.every((r) => r.copied)).toBe(true);
    const files = fs.readdirSync(target);
    expect(files.filter((f) => f.endsWith('.enc.db'))).toHaveLength(2);
    expect(files.some((f) => /\.raw\.db|^\.work-/.test(f))).toBe(false);
    expect(fs.readdirSync(copy).filter((f) => f.endsWith('.enc.db'))).toHaveLength(2);
    const backupFile = path.join(target, files.find((f) => f.endsWith('.enc.db'))!);
    expect(fs.statSync(backupFile).mode & 0o077).toBe(0);
    expect(fs.readFileSync(backupFile).includes(Buffer.from('a@example.test'))).toBe(false);
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'backup.completed'").get() as any).c).toBe(4);
  });

  it('a failed run is audited, and without a key nothing is written', async () => {
    const target = path.join(dir, 'backups');
    await expect(runScheduledBackup({ db, encryptionKey: '', targetDir: target, retentionCount: 2 })).rejects.toThrow(/FORTLESS_BACKUP_KEY/);
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'backup.failed'").get() as any).c).toBe(1);
    expect(fs.existsSync(target) ? fs.readdirSync(target).filter((f) => f.endsWith('.db')) : []).toHaveLength(0);
  });

  it('prune and stray cleanup only touch what they should', () => {
    const t = path.join(dir, 'b'); fs.mkdirSync(t);
    for (const id of ['bkp_2026-01-01', 'bkp_2026-01-02', 'bkp_2026-01-03']) { fs.writeFileSync(path.join(t, `${id}.enc.db`), 'x'); fs.writeFileSync(path.join(t, `${id}.meta.json`), '{}'); }
    fs.writeFileSync(path.join(t, 'bkp_old.raw.db-wal'), 'x');
    fs.utimesSync(path.join(t, 'bkp_old.raw.db-wal'), new Date(0), new Date(0));
    expect(pruneBackups(t, 1)).toBe(2);
    expect(fs.existsSync(path.join(t, 'bkp_2026-01-03.enc.db'))).toBe(true);
    expect(cleanStrayBackupFiles(t)).toBe(1);
    expect(fs.existsSync(path.join(t, 'bkp_2026-01-03.meta.json'))).toBe(true);
  });
});

describe('NEW-375: restore refuses a different SESSION_SECRET unless told otherwise', () => {
  it('records the fingerprint and blocks a mismatching restore', async () => {
    const meta = await createDatabaseBackup({ sourceDb: db, encryptionKey: KEY, targetDir: path.join(dir, 'b') });
    expect(meta.secretFingerprint).toBe(sessionSecretFingerprint());
    expect(JSON.stringify(meta)).not.toContain(config.SESSION_SECRET);
    const metaPath = meta.backupFilePath.replace(/\.enc\.db$/, '.meta.json');
    const doctored = { ...JSON.parse(fs.readFileSync(metaPath, 'utf8')), secretFingerprint: 'deadbeefdeadbeef' };
    fs.writeFileSync(metaPath, JSON.stringify(doctored));
    const target = path.join(dir, 'restored.db');
    await expect(verifyAndRestoreBackup({ backupFilePath: meta.backupFilePath, targetDbPath: target, encryptionKey: KEY })).rejects.toThrow(/SECRET_MISMATCH/);
    expect(fs.existsSync(target)).toBe(false);
    const report = await verifyAndRestoreBackup({ backupFilePath: meta.backupFilePath, targetDbPath: target, encryptionKey: KEY, allowSecretMismatch: true });
    expect(report.success).toBe(true);
  });
});
