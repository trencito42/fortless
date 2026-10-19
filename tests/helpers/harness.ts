import './env.js';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../src/database/index.js';
import { SCHEMA_SQL } from '../../src/database/schema.js';
import { runMigrations } from '../../src/database/migrations.js';
import { seedInitialCatalog } from '../../src/modules/catalog/catalog.js';
import { createSessionForUser } from '../../src/modules/identity/auth.js';
import { buildServer } from '../../src/server.js';

export interface Harness {
  app: FastifyInstance;
  db: Database.Database;
  user(id: string, opts?: { accountId?: string; role?: string; staff?: string; mfa?: boolean }): { token: string; accountId: string; id: string };
  call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token: string | null, body?: unknown): Promise<Awaited<ReturnType<FastifyInstance['inject']>>>;
  stepUp(userId: string): void;
  close(): Promise<void>;
}

export async function makeHarness(): Promise<Harness> {
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  seedInitialCatalog(db);
  db.pragma('foreign_keys = OFF');
  const app = buildServer();
  await app.ready();
  let seq = 0;
  const known = new Set<string>();
  return {
    app, db,
    user(id, opts = {}) {
      const accountId = opts.accountId ?? `acc_${id}`;
      if (!known.has(id)) {
        db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES (?, ?, 'x', ?, 'ACTIVE', '2026-01-01')").run(id, `${id}@example.test`, id);
        known.add(id);
      }
      if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) {
        db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email, created_at) VALUES (?, ?, ?, 'b@example.test', datetime('now', 'utc', ?))").run(accountId, accountId, id, `-${100 - ++seq} days`);
      }
      db.prepare('INSERT OR IGNORE INTO memberships (id, account_id, user_id, role) VALUES (?, ?, ?, ?)').run(`mem_${accountId}_${id}`, accountId, id, opts.role ?? 'OWNER');
      if (opts.staff) {
        db.prepare("INSERT OR REPLACE INTO staff_memberships (user_id, role, status) VALUES (?, ?, 'ACTIVE')").run(id, opts.staff);
        db.prepare("INSERT OR IGNORE INTO mfa_factors (id, user_id, type, secret_encrypted, is_confirmed) VALUES (?, ?, 'TOTP', 'x', 1)").run(`mfa_${id}`, id);
      }
      return { token: createSessionForUser(id, '127.0.0.1', 'test', true, db), accountId, id };
    },
    async call(method, url, token, body) {
      const csrf = (await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).json().csrfToken as string;
      const cookie = `${token ? `fortless_session=${token}; ` : ''}fortless_csrf=${csrf}`;
      return app.inject({ method, url, payload: body as object | undefined, headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' } });
    },
    stepUp(userId) {
      db.prepare('UPDATE sessions SET step_up_verified_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
    },
    close: () => app.close(),
  };
}
