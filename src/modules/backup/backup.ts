import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';

export interface BackupMetadata {
  backupId: string;
  createdAt: string;
  sourceDbPath: string;
  backupFilePath: string;
  sha256: string;
  byteSize: number;
  isEncrypted: boolean;
  algorithm?: string;
  tableCounts: Record<string, number>;
  sqliteVersion: string;
  /** NEW-375: identifies the SESSION_SECRET that protects MFA secrets and recovery codes inside this backup. */
  secretFingerprint?: string;
}

export interface RestoreReport {
  success: boolean;
  targetDbPath: string;
  restoredAt: string;
  integrityCheck: string;
  foreignKeyViolations: number;
  tableCounts: Record<string, number>;
}

export interface BackupOptions {
  sourceDb?: Database.Database;
  sourceDbPath?: string;
  targetDir?: string;
  encryptionKey?: string; // 32-byte hex or string key
}

export interface RestoreOptions {
  backupFilePath: string;
  targetDbPath: string;
  encryptionKey?: string;
  expectedSha256?: string;
  /** NEW-375: restoring without the SESSION_SECRET the backup was made under breaks every MFA factor; opt in explicitly. */
  allowSecretMismatch?: boolean;
}

/** Fingerprint of the session secret (never the secret itself) that must be present again to use MFA after a restore. */
export function sessionSecretFingerprint(secret: string = config.SESSION_SECRET): string {
  return crypto.createHmac('sha256', secret).update('fortless-backup-secret-fingerprint-v1').digest('hex').slice(0, 16);
}

/** NEW-373: backup keys must be real secrets; there is no built-in default. */
export function requireBackupKey(key: string | undefined): string {
  if (!key || key.length < 32) {
    throw new Error('FORTLESS_BACKUP_KEY is missing or shorter than 32 characters. Set a strong key; there is no default.');
  }
  return key;
}

/**
 * Derives a 32-byte AES key from string input via SHA-256
 */
function deriveKey(keyInput: string): Buffer {
  return crypto.createHash('sha256').update(keyInput).digest();
}

/**
 * Performs an online, non-blocking snapshot of the SQLite database.
 * Supports optional AES-256-GCM authenticated encryption.
 */
export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupMetadata> {
  if (config.NODE_ENV === 'production' && !options.encryptionKey) {
    throw new Error('Encryption key is required for database backups in production environment.');
  }

  const sourceDbPath = options.sourceDbPath || config.DATABASE_PATH || './data/fortless.db';
  const targetDir = options.targetDir || path.resolve(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  }

  const backupId = `bkp_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`;
  // The unencrypted snapshot only ever exists inside a private (0700) directory and is removed afterwards.
  const workDir = fs.mkdtempSync(path.join(targetDir, '.work-'));
  fs.chmodSync(workDir, 0o700);
  const rawSnapshotPath = path.join(workDir, `${backupId}.raw.db`);
  const finalBackupPath = options.encryptionKey
    ? path.join(targetDir, `${backupId}.enc.db`)
    : path.join(targetDir, `${backupId}.db`);

  const db = options.sourceDb || getDatabase();

  // 1. Snapshot database using online backup API
  await db.backup(rawSnapshotPath);

  // 2. Collect table counts for integrity baseline
  const snapshotDb = new Database(rawSnapshotPath, { readonly: true });
  const tables = snapshotDb.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;

  const tableCounts: Record<string, number> = {};
  for (const t of tables) {
    const countRow = snapshotDb.prepare(`SELECT count(*) as count FROM "${t.name}"`).get() as { count: number };
    tableCounts[t.name] = countRow.count;
  }

  const sqliteVersionRow = snapshotDb.prepare('SELECT sqlite_version() as v').get() as { v: string };
  const sqliteVersion = sqliteVersionRow.v;
  snapshotDb.close();

  // 3. Compute SHA-256 of raw snapshot
  const rawBytes = fs.readFileSync(rawSnapshotPath);
  const sha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');

  let isEncrypted = false;
  let algorithm: string | undefined;

  // 4. Encrypt if key provided
  if (options.encryptionKey) {
    isEncrypted = true;
    algorithm = 'aes-256-gcm';
    const key = deriveKey(options.encryptionKey);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(rawBytes), cipher.final()]);
    const tag = cipher.getAuthTag();

    // File structure: [12-byte IV][16-byte AuthTag][Encrypted ciphertext]
    const encryptedPayload = Buffer.concat([iv, tag, encrypted]);
    fs.writeFileSync(finalBackupPath, encryptedPayload, { mode: 0o600 });
  } else {
    fs.copyFileSync(rawSnapshotPath, finalBackupPath);
    fs.chmodSync(finalBackupPath, 0o600);
  }
  fs.rmSync(workDir, { recursive: true, force: true });

  const finalStats = fs.statSync(finalBackupPath);
  const metadata: BackupMetadata = {
    backupId,
    createdAt: new Date().toISOString(),
    sourceDbPath,
    backupFilePath: finalBackupPath,
    sha256,
    byteSize: finalStats.size,
    isEncrypted,
    algorithm,
    tableCounts,
    sqliteVersion,
    secretFingerprint: sessionSecretFingerprint(),
  };

  const metadataPath = path.join(targetDir, `${backupId}.meta.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });

  return metadata;
}

/**
 * Verifies integrity of a backup file and restores it into a designated target database.
 */
export async function verifyAndRestoreBackup(options: RestoreOptions): Promise<RestoreReport> {
  if (!fs.existsSync(options.backupFilePath)) {
    throw new Error(`Backup file not found at: ${options.backupFilePath}`);
  }

  const metaPath = options.backupFilePath.replace(/\.enc\.db$|\.db$/, '') + '.meta.json';
  if (fs.existsSync(metaPath) && !options.allowSecretMismatch) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BackupMetadata;
      if (meta.secretFingerprint && meta.secretFingerprint !== sessionSecretFingerprint()) {
        throw new Error('SECRET_MISMATCH: this backup was made under a different SESSION_SECRET. Restoring it would make every MFA factor and recovery code unusable. Restore the original SESSION_SECRET first, or pass --allow-secret-mismatch to proceed knowingly.');
      }
    } catch (err) {
      if ((err as Error).message.startsWith('SECRET_MISMATCH')) throw err;
    }
  }

  const fileBytes = fs.readFileSync(options.backupFilePath);
  let rawDbBytes: Buffer;

  // 1. Decrypt if encrypted
  if (options.backupFilePath.endsWith('.enc.db')) {
    if (!options.encryptionKey) {
      throw new Error('Encryption key is required to decrypt this backup file.');
    }
    if (fileBytes.length < 28) {
      throw new Error('Invalid encrypted backup payload: file too short.');
    }

    const key = deriveKey(options.encryptionKey);
    const iv = fileBytes.subarray(0, 12);
    const tag = fileBytes.subarray(12, 28);
    const ciphertext = fileBytes.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    rawDbBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } else {
    rawDbBytes = fileBytes;
  }

  // 2. Checksum validation
  const actualSha256 = crypto.createHash('sha256').update(rawDbBytes).digest('hex');
  if (options.expectedSha256 && actualSha256 !== options.expectedSha256) {
    throw new Error(`Checksum mismatch! Expected: ${options.expectedSha256}, Actual: ${actualSha256}`);
  }

  // 3. Stage into temporary file before touching target
  const targetDir = path.dirname(options.targetDbPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  }

  const tempTarget = `${options.targetDbPath}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tempTarget, rawDbBytes, { mode: 0o600 });

  // 4. Verify integrity and foreign keys on isolated staged database BEFORE applying
  const restoredDb = new Database(tempTarget);
  let integrityResult = 'UNKNOWN';
  let fkViolations = 0;
  const tableCounts: Record<string, number> = {};

  try {
    const integrityRow = restoredDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    integrityResult = integrityRow.integrity_check;

    const fkViolationRows = restoredDb.prepare('PRAGMA foreign_key_check').all() as any[];
    fkViolations = fkViolationRows.length;

    const tables = restoredDb.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;

    for (const t of tables) {
      const countRow = restoredDb.prepare(`SELECT count(*) as count FROM "${t.name}"`).get() as { count: number };
      tableCounts[t.name] = countRow.count;
    }
  } finally {
    restoredDb.close();
  }

  if (integrityResult !== 'ok') {
    try { fs.unlinkSync(tempTarget); } catch {}
    throw new Error(`Restored database failed integrity check: ${integrityResult}`);
  }

  if (fkViolations > 0) {
    try { fs.unlinkSync(tempTarget); } catch {}
    throw new Error(`Restored database failed foreign key constraint check: ${fkViolations} violations detected.`);
  }

  // 5. Atomic swap into target location
  fs.renameSync(tempTarget, options.targetDbPath);
  fs.chmodSync(options.targetDbPath, 0o600);

  return {
    success: true,
    targetDbPath: options.targetDbPath,
    restoredAt: new Date().toISOString(),
    integrityCheck: integrityResult,
    foreignKeyViolations: fkViolations,
    tableCounts,
  };
}
