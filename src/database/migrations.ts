import type Database from 'better-sqlite3';

type Migration = { version: number; name: string; up: (db: Database.Database) => void };

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((item) => item.name === column);
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'identity verification, recovery and session hardening',
    up(db) {
      if (!hasColumn(db, 'sessions', 'mfa_verified_at')) {
        db.exec('ALTER TABLE sessions ADD COLUMN mfa_verified_at TEXT');
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS auth_login_attempts (
          id TEXT PRIMARY KEY,
          identifier_hash TEXT NOT NULL,
          ip_address TEXT NOT NULL,
          succeeded INTEGER NOT NULL DEFAULT 0,
          attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at);
        CREATE INDEX IF NOT EXISTS idx_auth_attempts_lookup ON auth_login_attempts(identifier_hash, ip_address, attempted_at);
      `);

      // The previous implementation stored bearer tokens directly as session IDs.
      // They cannot be safely transformed because the browser only holds the raw value,
      // so the security migration intentionally rotates every legacy session.
      db.prepare('DELETE FROM sessions').run();
    },
  },
  {
    version: 2,
    name: 'grandfather verified state for legacy active identities',
    up(db) {
      const identityMigration = db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 1')
        .get() as { applied_at: string } | undefined;
      if (!identityMigration) throw new Error('Identity migration v1 must be applied before v2.');

      // Before verification existed, ACTIVE was the only persisted proof that an
      // identity had completed onboarding. Trust only that closed legacy set; new
      // registrations remain PENDING_VERIFICATION until their token is consumed.
      db.prepare(`
        INSERT INTO audit_events (
          id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata
        )
        SELECT
          'aud_' || lower(hex(randomblob(12))),
          (SELECT m.account_id FROM memberships m WHERE m.user_id = u.id ORDER BY m.created_at ASC LIMIT 1),
          'SYSTEM',
          'user.email_verification_grandfathered',
          'user',
          u.id,
          'cor_' || lower(hex(randomblob(12))),
          json_object('reason', 'legacy_active_identity', 'cutoff', ?)
        FROM users u
        WHERE u.status = 'ACTIVE'
          AND u.email_verified_at IS NULL
          AND datetime(u.created_at) <= datetime(?)
      `).run(identityMigration.applied_at, identityMigration.applied_at);

      db.prepare(`
        UPDATE users
        SET email_verified_at = created_at, updated_at = datetime('now', 'utc')
        WHERE status = 'ACTIVE'
          AND email_verified_at IS NULL
          AND datetime(created_at) <= datetime(?)
      `).run(identityMigration.applied_at);
    },
  },
  {
    version: 3,
    name: 'totp multi-factor authentication and recovery codes',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS mfa_factors (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('TOTP')),
          secret_encrypted TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT 'Authenticator app',
          is_confirmed INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          UNIQUE(user_id, type)
        );
        CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL UNIQUE,
          consumed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS mfa_attempts (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          succeeded INTEGER NOT NULL DEFAULT 0,
          attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_mfa_factors_user ON mfa_factors(user_id, is_confirmed);
        CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(user_id, consumed_at);
        CREATE INDEX IF NOT EXISTS idx_mfa_attempts_session ON mfa_attempts(session_id, attempted_at);
      `);
    },
  },
  {
    version: 4,
    name: 'persisted staff roles and revocable access',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS staff_memberships (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('OWNER', 'ADMINISTRATOR', 'BILLING', 'SUPPORT', 'INFRASTRUCTURE', 'AUDITOR')),
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REVOKED')),
          created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_staff_memberships_status ON staff_memberships(status, role);
      `);

      // Preserve the closed set of pre-RBAC staff identities without creating
      // any new administrator. Future grants require an explicit audited flow.
      db.prepare(`
        INSERT OR IGNORE INTO staff_memberships (user_id, role, status)
        SELECT id, 'ADMINISTRATOR', 'ACTIVE' FROM users WHERE is_staff = 1
      `).run();
    },
  },
  {
    version: 5,
    name: 'recent step-up authentication evidence',
    up(db) {
      if (!hasColumn(db, 'sessions', 'step_up_verified_at')) {
        db.exec('ALTER TABLE sessions ADD COLUMN step_up_verified_at TEXT');
      }
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((row) => row.version)
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    })();
  }
}
