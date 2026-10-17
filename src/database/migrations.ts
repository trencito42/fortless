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
  {
    version: 6,
    name: 'durable transactional email outbox and account invitations',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_outbox (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          template TEXT NOT NULL CHECK(template IN ('email_verification', 'password_reset', 'account_invitation', 'security_alert')),
          subject TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS account_invitations (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('OWNER', 'BILLING_MANAGER', 'TECH_ADMIN', 'VIEWER')),
          token_hash TEXT NOT NULL UNIQUE,
          invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          accepted_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_account_invitations_account ON account_invitations(account_id, email);
      `);
    },
  },
  {
    version: 7,
    name: 'notifications and activity export support',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          link_url TEXT,
          read_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_account_user ON notifications(account_id, user_id, read_at, created_at);
      `);
    },
  },
  {
    version: 8,
    name: 'outbox leasing, worker concurrency and crash recovery',
    up(db) {
      if (!hasColumn(db, 'outbox_events', 'lease_token')) {
        db.exec('ALTER TABLE outbox_events ADD COLUMN lease_token TEXT');
      }
      if (!hasColumn(db, 'outbox_events', 'lease_expires_at')) {
        db.exec('ALTER TABLE outbox_events ADD COLUMN lease_expires_at TEXT');
      }
      if (!hasColumn(db, 'outbox_events', 'last_error')) {
        db.exec('ALTER TABLE outbox_events ADD COLUMN last_error TEXT');
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_outbox_events_lease 
        ON outbox_events(status, scheduled_at, lease_expires_at);
      `);
    },
  },
  {
    version: 9,
    name: 'email outbox leasing, exponential backoff and dead-lettering',
    up(db) {
      if (!hasColumn(db, 'email_outbox', 'lease_token')) {
        db.exec('ALTER TABLE email_outbox ADD COLUMN lease_token TEXT');
      }
      if (!hasColumn(db, 'email_outbox', 'lease_expires_at')) {
        db.exec('ALTER TABLE email_outbox ADD COLUMN lease_expires_at TEXT');
      }
      if (!hasColumn(db, 'email_outbox', 'dead_lettered_at')) {
        db.exec('ALTER TABLE email_outbox ADD COLUMN dead_lettered_at TEXT');
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_email_outbox_lease 
        ON email_outbox(status, scheduled_at, lease_expires_at);
      `);
    },
  },
  {
    version: 10,
    name: 'webauthn passkey credentials and challenge tracking',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS passkey_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          credential_id TEXT UNIQUE NOT NULL,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          device_label TEXT NOT NULL,
          aaguid TEXT,
          transports TEXT,
          backup_eligible INTEGER NOT NULL DEFAULT 0,
          backup_state INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE IF NOT EXISTS webauthn_challenges (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          challenge TEXT UNIQUE NOT NULL,
          purpose TEXT NOT NULL CHECK(purpose IN ('REGISTRATION', 'AUTHENTICATION', 'STEP_UP')),
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials(user_id);
        CREATE INDEX IF NOT EXISTS idx_passkey_cred_id ON passkey_credentials(credential_id);
        CREATE INDEX IF NOT EXISTS idx_webauthn_challenge ON webauthn_challenges(challenge, expires_at);
      `);
    },
  },
  {
    version: 11,
    name: 'ticket attachments and multi-tenant file storage',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_attachments (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          message_id TEXT REFERENCES ticket_messages(id) ON DELETE CASCADE,
          uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          file_hash TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
      `);
    },
  },
  {
    version: 12,
    name: 'subscription dunning lifecycle and public system status incident tracking',
    up(db) {
      if (!hasColumn(db, 'subscriptions', 'grace_period_end')) {
        db.exec('ALTER TABLE subscriptions ADD COLUMN grace_period_end TEXT');
      }
      if (!hasColumn(db, 'subscriptions', 'dunning_attempts')) {
        db.exec('ALTER TABLE subscriptions ADD COLUMN dunning_attempts INTEGER NOT NULL DEFAULT 0');
      }
      if (!hasColumn(db, 'subscriptions', 'last_dunning_at')) {
        db.exec('ALTER TABLE subscriptions ADD COLUMN last_dunning_at TEXT');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS system_components (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          group_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK(status IN ('OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE', 'MAINTENANCE')),
          order_index INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          impact TEXT NOT NULL DEFAULT 'MINOR' CHECK(impact IN ('NONE', 'MINOR', 'MAJOR', 'CRITICAL')),
          status TEXT NOT NULL DEFAULT 'INVESTIGATING' CHECK(status IN ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED')),
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS incident_updates (
          id TEXT PRIMARY KEY,
          incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED')),
          message TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE INDEX IF NOT EXISTS idx_system_components_slug ON system_components(slug);
        CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_incident_updates_incident ON incident_updates(incident_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal ON subscriptions(status, next_renewal_date);
      `);

      // Seed default components if none exist
      const count = (db.prepare('SELECT COUNT(*) as c FROM system_components').get() as { c: number }).c;
      if (count === 0) {
        const seedStmt = db.prepare(`
          INSERT INTO system_components (id, name, slug, group_name, status, order_index, updated_at)
          VALUES (?, ?, ?, ?, 'OPERATIONAL', ?, datetime('now', 'utc'))
        `);
        seedStmt.run('cmp_api', 'REST API & Authentication', 'api', 'Core Platform', 1);
        seedStmt.run('cmp_dashboard', 'Customer Management Portal', 'dashboard', 'Core Platform', 2);
        seedStmt.run('cmp_payments', 'Stripe Payments & Checkout', 'payments', 'Billing Engine', 3);
        seedStmt.run('cmp_nodes_fra', 'Frankfurt Edge Node (reg_fra_1)', 'node-fra-1', 'Infrastructure', 4);
        seedStmt.run('cmp_nodes_lon', 'London Edge Node (reg_lon_1)', 'node-lon-1', 'Infrastructure', 5);
        seedStmt.run('cmp_email', 'Transactional Email Outbox', 'email', 'Platform Services', 6);
      }
    },
  },
  {
    version: 13,
    name: 'seed_web_apps_catalog',
    up(db) {
      // Seed Web Apps category if it does not exist
      const existingCat = db.prepare("SELECT id FROM categories WHERE slug = 'apps'").get();
      if (!existingCat) {
        db.prepare(`
          INSERT INTO categories (id, slug, name, description, sort_order, is_active)
          VALUES ('cat_web_apps', 'apps', 'Web & Cloud Apps', 'Containerized modern Node.js web apps with automated build & port management.', 3, 1)
        `).run();
      }

      // Seed Node.js Web Application product if not exists
      const existingProd = db.prepare("SELECT id FROM products WHERE slug = 'nodejs-app'").get();
      if (!existingProd) {
        db.prepare(`
          INSERT INTO products (id, category_id, slug, name, provider_type, is_published)
          VALUES ('prod_nodejs_app', 'cat_web_apps', 'nodejs-app', 'Node.js Web Application', 'PTERODACTYL', 1)
        `).run();

        // Seed Starter and Pro plans
        const plvStarter = 'plv_node_starter';
        const plvPro = 'plv_node_pro';

        db.prepare(`
          INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
          VALUES (?, 'prod_nodejs_app', 1, 'Node.js Starter (1GB RAM)', ?, 'ACTIVE')
        `).run(plvStarter, JSON.stringify({
          memoryMb: 1024,
          cpuPct: 100,
          diskMb: 10240,
          databases: 1,
          backups: 2,
          eggId: 15,
          dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20',
        }));

        db.prepare(`
          INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
          VALUES ('prc_node_starter_m', ?, 'EUR', 'MONTHLY', 500, 0)
        `).run(plvStarter);

        db.prepare(`
          INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
          VALUES (?, 'prod_nodejs_app', 2, 'Node.js Pro (2GB RAM)', ?, 'ACTIVE')
        `).run(plvPro, JSON.stringify({
          memoryMb: 2048,
          cpuPct: 200,
          diskMb: 25600,
          databases: 2,
          backups: 5,
          eggId: 15,
          dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20',
        }));

        db.prepare(`
          INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
          VALUES ('prc_node_pro_m', ?, 'EUR', 'MONTHLY', 1000, 0)
        `).run(plvPro);
      }
    },
  },
  {
    version: 14,
    name: 'domain_zones_and_dns_records',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS domain_zones (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          domain_name TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          auto_renew INTEGER NOT NULL DEFAULT 1,
          nameservers TEXT NOT NULL DEFAULT '["ns1.fortless.net","ns2.fortless.net"]',
          whois_privacy INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          expires_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_domain_zones_account ON domain_zones(account_id);
        CREATE INDEX IF NOT EXISTS idx_domain_zones_name ON domain_zones(domain_name);

        CREATE TABLE IF NOT EXISTS dns_records (
          id TEXT PRIMARY KEY,
          zone_id TEXT NOT NULL REFERENCES domain_zones(id) ON DELETE CASCADE,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          record_type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          ttl INTEGER NOT NULL DEFAULT 3600,
          priority INTEGER,
          weight INTEGER,
          port INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE INDEX IF NOT EXISTS idx_dns_records_zone ON dns_records(zone_id);
        CREATE INDEX IF NOT EXISTS idx_dns_records_account ON dns_records(account_id);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): number {
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

  let newCount = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    })();
    newCount++;
  }
  return newCount;
}

export function migrateDatabase(db: Database.Database): number {
  return runMigrations(db);
}
