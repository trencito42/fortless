import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

let dbInstance: Database.Database | null = null;

export function getDatabase(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || config.DATABASE_PATH;
  const resolvedDir = path.dirname(path.resolve(dbPath));

  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Performance & Integrity Pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  if (!customPath) {
    dbInstance = db;
  }

  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Execute a function within a strict, atomic database transaction.
 * If any exception is thrown, the transaction is automatically rolled back.
 */
export function runInTransaction<T>(fn: (db: Database.Database) => T, db: Database.Database = getDatabase()): T {
  return db.transaction(() => fn(db))();
}
