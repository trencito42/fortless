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
          template TEXT NOT NULL CHECK(template IN ('email_verification', 'password_reset', 'account_invitation', 'security_alert', 'payment_confirmed', 'service_provisioned', 'ticket_reply')),
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
  {
    version: 15,
    name: 'seed_cloud_vps_catalog',
    up(db) {
      const existingCat = db.prepare("SELECT id FROM categories WHERE slug = 'vps'").get();
      if (!existingCat) {
        db.prepare(`
          INSERT INTO categories (id, slug, name, description, sort_order, is_active)
          VALUES ('cat_cloud_vps', 'vps', 'Cloud VPS Compute', 'High-performance KVM virtual machines with dedicated vCPU, NVMe storage, and cloud-init guest OS automation.', 4, 1)
        `).run();
      }

      const existingProd = db.prepare("SELECT id FROM products WHERE slug = 'kvm-vps'").get();
      if (!existingProd) {
        db.prepare(`
          INSERT INTO products (id, category_id, slug, name, provider_type, is_published)
          VALUES ('prod_kvm_vps', 'cat_cloud_vps', 'kvm-vps', 'KVM Cloud VPS', 'VPS', 1)
        `).run();

        // 1. VPS Micro (1 vCPU, 2GB RAM, 40GB NVMe) - €8.00/mo
        const plvMicro = 'plv_vps_micro';
        db.prepare(`
          INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
          VALUES (?, 'prod_kvm_vps', 1, 'VPS Micro (1 vCPU, 2GB RAM, 40GB NVMe)', ?, 'ACTIVE')
        `).run(plvMicro, JSON.stringify({
          memoryMb: 2048,
          cpuPct: 100,
          diskMb: 40960,
          databases: 1,
          backups: 1,
          vcpu: 1,
          cores: 1,
          osImage: 'debian-12-cloudinit',
          dedicatedIp: true,
        }));
        db.prepare(`
          INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
          VALUES ('prc_vps_micro_m', ?, 'EUR', 'MONTHLY', 800, 0)
        `).run(plvMicro);

        // 2. VPS Standard (2 vCPU, 4GB RAM, 80GB NVMe) - €16.00/mo
        const plvStandard = 'plv_vps_standard';
        db.prepare(`
          INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
          VALUES (?, 'prod_kvm_vps', 2, 'VPS Standard (2 vCPU, 4GB RAM, 80GB NVMe)', ?, 'ACTIVE')
        `).run(plvStandard, JSON.stringify({
          memoryMb: 4096,
          cpuPct: 200,
          diskMb: 81920,
          databases: 2,
          backups: 2,
          vcpu: 2,
          cores: 2,
          osImage: 'debian-12-cloudinit',
          dedicatedIp: true,
        }));
        db.prepare(`
          INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
          VALUES ('prc_vps_standard_m', ?, 'EUR', 'MONTHLY', 1600, 0)
        `).run(plvStandard);

        // 3. VPS Pro (4 vCPU, 8GB RAM, 160GB NVMe) - €32.00/mo
        const plvPro = 'plv_vps_pro';
        db.prepare(`
          INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
          VALUES (?, 'prod_kvm_vps', 3, 'VPS Pro (4 vCPU, 8GB RAM, 160GB NVMe)', ?, 'ACTIVE')
        `).run(plvPro, JSON.stringify({
          memoryMb: 8192,
          cpuPct: 400,
          diskMb: 163840,
          databases: 4,
          backups: 4,
          vcpu: 4,
          cores: 4,
          osImage: 'debian-12-cloudinit',
          dedicatedIp: true,
        }));
        db.prepare(`
          INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
          VALUES ('prc_vps_pro_m', ?, 'EUR', 'MONTHLY', 3200, 0)
        `).run(plvPro);
      }
    },
  },
  {
    version: 16,
    name: 'ai_diagnostics_and_knowledge_base',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_articles (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          summary TEXT NOT NULL,
          content_markdown TEXT NOT NULL,
          tags TEXT NOT NULL,
          is_published INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_articles(category, is_published);
        CREATE INDEX IF NOT EXISTS idx_kb_slug ON knowledge_articles(slug);

        CREATE TABLE IF NOT EXISTS ai_diagnostic_logs (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          context_type TEXT NOT NULL,
          target_resource_id TEXT,
          prompt_summary TEXT NOT NULL,
          suggested_action TEXT,
          confidence_score REAL,
          model_used TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_ai_diag_account ON ai_diagnostic_logs(account_id, created_at);
      `);

      // Seed authoritative foundational knowledge base articles
      const seedArticles = [
        {
          id: 'kb_art_mc_eula',
          slug: 'minecraft-crash-eula-memory',
          title: 'Minecraft Server Crash on Startup (EULA Acceptance & Memory Allocation)',
          category: 'GAME_SERVERS',
          summary: 'How to diagnose and resolve immediate server shutdown caused by unaccepted EULA or OutOfMemoryError exceptions.',
          content_markdown: `## Troubleshooting Minecraft Startup Crashes

### 1. Unaccepted EULA Agreement
If your server console shows \`You need to agree to the EULA in order to run the server\`:
1. Navigate to the **Files** manager in your Fortless server panel.
2. Open \`eula.txt\`.
3. Change \`eula=false\` to \`eula=true\`.
4. Save the file and restart your server.

### 2. OutOfMemoryError (OOM)
When Minecraft exhausts its configured heap, the JVM crashes with:
\`\`\`
java.lang.OutOfMemoryError: Java heap space
\`\`\`
- Check active modpacks and view distances in \`server.properties\`. High chunk view distances (> 12) dramatically increase RAM utilization.
- Consider upgrading your plan to a higher RAM tier if running heavy Fabric/Forge modpacks with 10+ concurrent players.`,
          tags: JSON.stringify(['minecraft', 'eula', 'crash', 'oom', 'memory', 'java']),
        },
        {
          id: 'kb_art_nodejs_env',
          slug: 'nodejs-webapp-port-binding',
          title: 'Node.js Web App Deployment: Binding process.env.PORT & Health Checks',
          category: 'WEB_APPS',
          summary: 'Configure your Node.js or containerized web service to bind to dynamic environment ports and pass health checks.',
          content_markdown: `## Configuring Node.js Web Applications on Fortless

### 1. Dynamic Port Binding
Fortless dynamically assigns network ports to container instances via the \`PORT\` environment variable. Never hardcode \`3000\` or \`8080\` in your production server listener:

\`\`\`javascript
const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(\`Server listening on 0.0.0.0:\${port}\`);
});
\`\`\`

### 2. EADDRINUSE Error
If you receive \`Error: listen EADDRINUSE: address already in use\`, verify:
- You are not starting duplicate background processes or PM2 instances inside the container.
- Your application does not attempt to bind to privileged ports (< 1024).`,
          tags: JSON.stringify(['nodejs', 'port', 'eaddrinuse', 'webapps', 'docker', 'healthcheck']),
        },
        {
          id: 'kb_art_cpanel_dns',
          slug: 'cpanel-spf-dkim-deliverability',
          title: 'cPanel Email Deliverability: Configuring SPF, DKIM & Reverse DNS',
          category: 'CPANEL',
          summary: 'Ensure your outgoing emails reach the inbox instead of spam by validating SPF, DKIM, and MX records.',
          content_markdown: `## Email Authentication on cPanel

### 1. SPF (Sender Policy Framework)
Add a TXT record at your domain root:
\`\`\`
v=spf1 include:_spf.fortless.net +ip4:185.190.140.0/24 ~all
\`\`\`

### 2. DKIM (DomainKeys Identified Mail)
In your cPanel dashboard under **Email Deliverability**, copy the generated 2048-bit public key. In the Fortless **Domains & DNS** portal, add a \`TXT\` record with name \`default._domainkey.yourdomain.com\` containing the public key value.`,
          tags: JSON.stringify(['cpanel', 'email', 'spf', 'dkim', 'deliverability', 'dns']),
        },
        {
          id: 'kb_art_dns_cname',
          slug: 'dns-cname-apex-collision-rfc1912',
          title: 'DNS Configuration: Resolving CNAME Collisions at Apex (RFC 1912 §2.4)',
          category: 'DOMAINS_DNS',
          summary: 'Why CNAME records cannot coexist with NS, MX, or SOA records at the apex root and how to configure ALIAS/ANAME.',
          content_markdown: `## RFC 1912 §2.4 CNAME Restrictions

According to RFC 1912: *A CNAME record is not allowed to coexist with any other data at the same node.*

Because the zone apex (e.g. \`example.com\`) must have \`SOA\` and \`NS\` records, creating a \`CNAME\` record for \`@\` is invalid and rejected by the Fortless DNS engine.

### Recommended Solutions:
1. Use an \`A\` record pointing to your server's public IPv4 address and an \`AAAA\` record pointing to IPv6.
2. If targeting an external CDN or SaaS provider, point the subdomain \`www.example.com\` via \`CNAME\`, and configure a root HTTP 301 redirect.`,
          tags: JSON.stringify(['dns', 'cname', 'rfc1912', 'apex', 'domains']),
        },
        {
          id: 'kb_art_vps_ssh',
          slug: 'cloud-vps-ssh-keys-hardening',
          title: 'Cloud VPS KVM: SSH Key Authentication & UFW Firewall Hardening',
          category: 'CLOUD_VPS',
          summary: 'Secure your KVM virtual private server using Ed25519/RSA public keys and default-deny firewall policies.',
          content_markdown: `## Hardening Cloud VPS Instances

### 1. SSH Public Key Authentication
Ensure your public key is added during provisioning or placed in \`~/.ssh/authorized_keys\` with permissions \`0600\`:
\`\`\`bash
ssh -i ~/.ssh/id_ed25519 root@<YOUR_VPS_IP>
\`\`\`

### 2. Firewall Protection (UFW)
Always enable a default-deny incoming policy:
\`\`\`bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw enable
\`\`\``,
          tags: JSON.stringify(['vps', 'kvm', 'ssh', 'firewall', 'security', 'proxmox']),
        },
        {
          id: 'kb_art_billing_vat',
          slug: 'billing-vat-invoicing-sepa',
          title: 'Invoicing & VAT: Reverse Charge, Fiscal Receipts, and Card Settlement',
          category: 'BILLING',
          summary: 'Understanding European VAT reverse charge compliance, immutable invoice receipts, and billing cycles.',
          content_markdown: `## Fortless Billing & European VAT Compliance

### 1. EU B2B Reverse Charge (Article 196)
If your business is established in an EU member state outside Romania with a validated VIES VAT number, VAT is zero-rated under the reverse charge mechanism.

### 2. Sequential Invoice Numbers
Fortless issues legally binding sequential invoices (\`INV-YYYY-XXXXX\`) on confirmed settlement direct from our payment provider webhook. Invoices cannot be modified post-issuance.`,
          tags: JSON.stringify(['billing', 'invoices', 'vat', 'reverse-charge', 'tax']),
        },
      ];

      const insertArt = db.prepare(`
        INSERT OR IGNORE INTO knowledge_articles (id, slug, title, category, summary, content_markdown, tags, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);

      for (const art of seedArticles) {
        insertArt.run(art.id, art.slug, art.title, art.category, art.summary, art.content_markdown, art.tags);
      }
    },
  },
  {
    version: 30,
    name: 'expand email_outbox template check constraint',
    up(db) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE IF NOT EXISTS email_outbox_new (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          template TEXT NOT NULL CHECK(template IN ('email_verification', 'password_reset', 'account_invitation', 'security_alert', 'payment_confirmed', 'service_provisioned', 'ticket_reply')),
          subject TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          lease_token TEXT,
          lease_expires_at TEXT,
          dead_lettered_at TEXT,
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        INSERT OR IGNORE INTO email_outbox_new SELECT * FROM email_outbox;
        DROP TABLE email_outbox;
        ALTER TABLE email_outbox_new RENAME TO email_outbox;
        CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_email_outbox_lease ON email_outbox(status, scheduled_at, lease_expires_at);
        PRAGMA foreign_keys = ON;
      `);
    },
  },
  {
    version: 31,
    name: 'fail closed for legacy demonstration catalog and capacity',
    up(db) {
      // These exact identifiers were historical bootstrap/demo records. They do
      // not represent provider-verified commercial inventory and must never be
      // exposed as orderable merely because a provider API key is configured.
      db.prepare(`
        UPDATE products
        SET is_published = 0
        WHERE id IN ('prod_minecraft', 'prod_palworld', 'prod_bot_node', 'prod_nodejs_app', 'prod_kvm_vps')
      `).run();
      db.prepare(`
        UPDATE nodes
        SET maintenance_mode = 1
        WHERE id IN ('node_fra_01', 'node_lon_01')
          AND provider_instance_id = 'pterodactyl_primary'
      `).run();
      db.prepare(`
        UPDATE regions
        SET is_active = 0
        WHERE id IN ('reg_fra_1', 'reg_lon_1')
      `).run();
    },
  },
  {
    version: 32,
    name: 'per-account provider panel users',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS panel_users (
          account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
          provider_type TEXT NOT NULL DEFAULT 'PTERODACTYL',
          panel_user_id INTEGER NOT NULL,
          panel_username TEXT NOT NULL,
          panel_email TEXT NOT NULL,
          correlation_tag TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_users_panel_id ON panel_users(provider_type, panel_user_id);
      `);
    },
  },
  {
    version: 33,
    name: 'oidc authorization codes and access tokens',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS oidc_authorization_codes (
          code_hash TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          redirect_uri TEXT NOT NULL,
          scope TEXT NOT NULL,
          nonce TEXT,
          code_challenge TEXT,
          auth_time INTEGER NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS oidc_access_tokens (
          token_hash TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL,
          client_id TEXT NOT NULL,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_oidc_tokens_code ON oidc_access_tokens(code_hash);
      `);
    },
  },
  {
    version: 34,
    name: 'per-account panel client api keys',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS panel_client_keys (
          account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
          encrypted_key TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
    },
  },
  {
    version: 35,
    name: 'service sharing: members and invitations',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS service_members (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          preset TEXT NOT NULL CHECK(preset IN ('viewer', 'operator', 'admin')),
          panel_subuser_uuid TEXT,
          invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          UNIQUE(service_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_service_members_user ON service_members(user_id);
        CREATE TABLE IF NOT EXISTS service_invitations (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          preset TEXT NOT NULL CHECK(preset IN ('viewer', 'operator', 'admin')),
          token_hash TEXT NOT NULL UNIQUE,
          invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          accepted_at TEXT,
          revoked_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_service_invitations_service ON service_invitations(service_id, email);
      `);
    },
  },
  {
    version: 36,
    name: 'allow service_invitation email template',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_outbox_new (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          template TEXT NOT NULL CHECK(template IN ('email_verification', 'password_reset', 'account_invitation', 'service_invitation', 'security_alert', 'payment_confirmed', 'service_provisioned', 'ticket_reply')),
          subject TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          lease_token TEXT,
          lease_expires_at TEXT,
          dead_lettered_at TEXT,
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        INSERT OR IGNORE INTO email_outbox_new SELECT * FROM email_outbox;
        DROP TABLE email_outbox;
        ALTER TABLE email_outbox_new RENAME TO email_outbox;
        CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_email_outbox_lease ON email_outbox(status, scheduled_at, lease_expires_at);
      `);
    },
  },
  {
    version: 37,
    name: 'game profiles',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS game_profiles (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          egg_names TEXT NOT NULL DEFAULT '[]',
          config_file TEXT,
          config_schema TEXT NOT NULL DEFAULT '[]',
          game_version_variable TEXT,
          java_rules TEXT NOT NULL DEFAULT '[]',
          install_sources TEXT NOT NULL DEFAULT '[]',
          icon_file TEXT,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
    },
  },
  {
    version: 38,
    name: 'canonical mail templates and user notification preferences',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          billing_email INTEGER NOT NULL DEFAULT 1 CHECK(billing_email IN (0, 1)),
          service_email INTEGER NOT NULL DEFAULT 1 CHECK(service_email IN (0, 1)),
          support_email INTEGER NOT NULL DEFAULT 1 CHECK(support_email IN (0, 1)),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE IF NOT EXISTS email_outbox_new (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          template TEXT NOT NULL CHECK(template IN (
            'email_verification', 'welcome', 'password_reset', 'password_changed',
            'account_invitation', 'service_invitation', 'security_alert', 'mfa_changed',
            'invoice_issued', 'payment_confirmed', 'payment_receipt', 'payment_failed',
            'renewal_reminder', 'service_provisioned', 'service_ready', 'ticket_reply',
            'cancellation_scheduled'
          )),
          subject TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER')),
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          lease_token TEXT,
          lease_expires_at TEXT,
          dead_lettered_at TEXT,
          scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        INSERT OR IGNORE INTO email_outbox_new SELECT * FROM email_outbox;
        DROP TABLE email_outbox;
        ALTER TABLE email_outbox_new RENAME TO email_outbox;
        CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_email_outbox_lease ON email_outbox(status, scheduled_at, lease_expires_at);
      `);
    },
  },
  {
    version: 39,
    name: 'persistent browser installation device id for session deduplication',
    up(db) {
      if (!hasColumn(db, 'sessions', 'device_id')) {
        db.exec('ALTER TABLE sessions ADD COLUMN device_id TEXT');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions(user_id, device_id)');
    },
  },
  {
    version: 40,
    name: 'audit delta security & billing schema alignments',
    up(db) {
      if (!hasColumn(db, 'mfa_factors', 'pending_secret_encrypted')) {
        db.exec('ALTER TABLE mfa_factors ADD COLUMN pending_secret_encrypted TEXT');
      }
      if (!hasColumn(db, 'mfa_attempts', 'user_id')) {
        db.exec('ALTER TABLE mfa_attempts ADD COLUMN user_id TEXT');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_mfa_attempts_user_id ON mfa_attempts(user_id, attempted_at)');
      if (!hasColumn(db, 'subscriptions', 'psp_subscription_id')) {
        db.exec('ALTER TABLE subscriptions ADD COLUMN psp_subscription_id TEXT');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_subscriptions_psp ON subscriptions(psp_subscription_id)');
    },
  },
  {
    version: 41,
    name: 'audit remediation: SEMI_ANNUAL subscriptions, invoice-to-subscription link, suspension reason',
    up(db) {
      // NEW-347: the subscriptions CHECK rejected SEMI_ANNUAL, so those plans could never be settled.
      const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subscriptions'").get() as { sql: string } | undefined)?.sql ?? '';
      if (tableSql && !tableSql.includes('SEMI_ANNUAL')) {
        const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'subscriptions' AND sql IS NOT NULL").all() as { sql: string }[];
        const columns = (db.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[]).map((c) => c.name);
        const rebuilt = tableSql
          .replace(/CREATE TABLE (IF NOT EXISTS )?"?subscriptions"?/i, 'CREATE TABLE subscriptions_rebuild')
          .replace(/billing_interval\s+TEXT\s+NOT NULL\s+CHECK\s*\(\s*billing_interval\s+IN\s*\([^)]*\)\s*\)/i,
            "billing_interval TEXT NOT NULL CHECK(billing_interval IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'))");
        db.exec(rebuilt);
        const list = columns.join(', ');
        db.exec(`INSERT INTO subscriptions_rebuild (${list}) SELECT ${list} FROM subscriptions`);
        db.exec('DROP TABLE subscriptions');
        db.exec('ALTER TABLE subscriptions_rebuild RENAME TO subscriptions');
        for (const idx of indexes) db.exec(idx.sql);
      }
      // NEW-330: settle exactly the invoice that belongs to the Stripe event.
      if (!hasColumn(db, 'invoices', 'subscription_id')) db.exec('ALTER TABLE invoices ADD COLUMN subscription_id TEXT');
      if (!hasColumn(db, 'invoices', 'psp_invoice_id')) db.exec('ALTER TABLE invoices ADD COLUMN psp_invoice_id TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id, status)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_psp_invoice ON invoices(psp_invoice_id) WHERE psp_invoice_id IS NOT NULL');
      // NEW-355: remember why a service was suspended so a payment only lifts billing suspensions.
      if (!hasColumn(db, 'services', 'suspension_reason')) db.exec('ALTER TABLE services ADD COLUMN suspension_reason TEXT');
    },
  },
  {
    version: 42,
    name: 'fortless auto fastdl tables: settings, manifests, sync jobs, configs',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS fastdl_settings (
          id TEXT PRIMARY KEY,
          public_domain TEXT NOT NULL DEFAULT '',
          storage_backend TEXT NOT NULL DEFAULT 'local' CHECK(storage_backend IN ('local', 's3', 'custom_cdn')),
          storage_path TEXT NOT NULL DEFAULT './data/fastdl',
          default_quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
          max_file_size_bytes INTEGER NOT NULL DEFAULT 524288000,
          auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS fastdl_configs (
          service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
          enabled INTEGER NOT NULL DEFAULT 1,
          auto_sync INTEGER NOT NULL DEFAULT 1,
          compression_mode TEXT NOT NULL DEFAULT 'bz2' CHECK(compression_mode IN ('bz2', 'raw', 'both')),
          quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
          custom_public_url TEXT,
          last_sync_at TEXT,
          cvar_configured_at TEXT,
          cvar_backup_path TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS fastdl_manifest (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          compressed_size INTEGER NOT NULL,
          file_hash TEXT NOT NULL,
          is_compressed INTEGER NOT NULL DEFAULT 1,
          storage_rel_path TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SYNCED' CHECK(status IN ('SYNCED', 'PENDING', 'FAILED', 'DELETED')),
          last_error TEXT,
          synced_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          UNIQUE(service_id, file_path)
        );
        CREATE INDEX IF NOT EXISTS idx_fastdl_manifest_svc ON fastdl_manifest(service_id, status);
        CREATE INDEX IF NOT EXISTS idx_fastdl_manifest_hash ON fastdl_manifest(file_hash);
        CREATE TABLE IF NOT EXISTS fastdl_sync_jobs (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
          account_id TEXT NOT NULL,
          trigger_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(trigger_type IN ('MANUAL', 'SCHEDULED', 'WEBHOOK', 'FILE_EVENT', 'RETRY')),
          status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
          total_files INTEGER NOT NULL DEFAULT 0,
          processed_files INTEGER NOT NULL DEFAULT 0,
          synced_files INTEGER NOT NULL DEFAULT 0,
          deleted_files INTEGER NOT NULL DEFAULT 0,
          failed_files INTEGER NOT NULL DEFAULT 0,
          total_bytes INTEGER NOT NULL DEFAULT 0,
          current_file TEXT,
          error_message TEXT,
          started_at TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_fastdl_sync_jobs_svc ON fastdl_sync_jobs(service_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_fastdl_sync_jobs_status ON fastdl_sync_jobs(status);
      `);
      db.prepare(`
        INSERT OR IGNORE INTO fastdl_settings (id, public_domain, storage_backend, storage_path, default_quota_bytes, max_file_size_bytes, auto_sync_enabled)
        VALUES ('default', '', 'local', './data/fastdl', 5368709120, 524288000, 1)
      `).run();
    },
  },
  {
    version: 43,
    name: 'admin account notes and support operations',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_departments (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS ticket_macros (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          body TEXT NOT NULL,
          status TEXT CHECK(status IN ('OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED')),
          department_id TEXT REFERENCES ticket_departments(id) ON DELETE SET NULL,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS admin_account_notes (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_admin_account_notes_account ON admin_account_notes(account_id, created_at DESC);
      `);
      if (!hasColumn(db, 'tickets', 'department_id')) db.exec('ALTER TABLE tickets ADD COLUMN department_id TEXT REFERENCES ticket_departments(id) ON DELETE SET NULL');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(department_id, status, updated_at DESC);
        INSERT OR IGNORE INTO ticket_departments (id, name, description) VALUES ('dep_general', 'General Support', 'Default customer support queue');
        UPDATE tickets SET department_id = 'dep_general' WHERE department_id IS NULL;
      `);
    },
  },
  {
    version: 44,
    name: 'commercial catalog editing and sales controls',
    up(db) {
      if (!hasColumn(db, 'products', 'description')) db.exec("ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT ''");
      db.exec(`
        CREATE TABLE IF NOT EXISTS product_sales_restrictions (
          product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
          allowed_countries TEXT NOT NULL DEFAULT '[]',
          max_services_per_account INTEGER,
          available_from TEXT,
          available_until TEXT,
          requires_verified_email INTEGER NOT NULL DEFAULT 1 CHECK(requires_verified_email IN (0, 1)),
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE TABLE IF NOT EXISTS plan_configurable_options (
          id TEXT PRIMARY KEY,
          plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
          option_key TEXT NOT NULL,
          label TEXT NOT NULL,
          input_type TEXT NOT NULL CHECK(input_type IN ('BOOLEAN', 'SELECT', 'INTEGER')),
          is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0, 1)),
          config_json TEXT NOT NULL DEFAULT '{}',
          price_delta_minor_units INTEGER NOT NULL DEFAULT 0 CHECK(price_delta_minor_units >= 0),
          sort_order INTEGER NOT NULL DEFAULT 0,
          UNIQUE(plan_version_id, option_key)
        );
      `);
    },
  },
  {
    version: 45,
    name: 'domain ownership proof, claims and lower-case DNS names',
    up(db) {
      if (!hasColumn(db, 'domain_zones', 'ownership_token')) db.exec('ALTER TABLE domain_zones ADD COLUMN ownership_token TEXT');
      if (!hasColumn(db, 'domain_zones', 'ownership_verified_at')) db.exec('ALTER TABLE domain_zones ADD COLUMN ownership_verified_at TEXT');
      if (!hasColumn(db, 'domain_zones', 'delegation_verified')) db.exec('ALTER TABLE domain_zones ADD COLUMN delegation_verified INTEGER NOT NULL DEFAULT 0');
      db.exec("UPDATE domain_zones SET ownership_token = lower(hex(randomblob(16))) WHERE ownership_token IS NULL");
      db.exec(`
        CREATE TABLE IF NOT EXISTS domain_claims (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          domain_name TEXT NOT NULL,
          token TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          UNIQUE(account_id, domain_name)
        )
      `);
      // NEW-383: names are compared case-insensitively from now on, so existing rows are normalised once.
      db.exec('UPDATE dns_records SET name = lower(name)');
    },
  },
  {
    version: 46,
    name: 'session-bound workspace selection',
    up(db) {
      if (!hasColumn(db, 'sessions', 'account_id')) db.exec('ALTER TABLE sessions ADD COLUMN account_id TEXT');
    },
  },
  {
    version: 47,
    name: 'TOTP replay protection and WebAuthn challenge index',
    up(db) {
      if (!hasColumn(db, 'mfa_factors', 'last_used_counter')) db.exec('ALTER TABLE mfa_factors ADD COLUMN last_used_counter INTEGER');
      db.exec(`
        CREATE TABLE IF NOT EXISTS sensitive_action_attempts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
        CREATE INDEX IF NOT EXISTS idx_sensitive_attempts_user ON sensitive_action_attempts(user_id, attempted_at);
      `);
      // NEW-398: one-time links already stored in delivered or dead-lettered emails are removed.
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_outbox'").get()) {
        db.exec("UPDATE email_outbox SET payload_json = json_remove(payload_json, '$.verifyUrl', '$.resetUrl', '$.inviteUrl') WHERE status IN ('SENT', 'DEAD_LETTER')");
      }
    },
  },
  {
    version: 48,
    name: 'managed transactional email template overrides',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_template_overrides (
          template TEXT PRIMARY KEY,
          subject_template TEXT NOT NULL,
          text_template TEXT NOT NULL,
          html_template TEXT NOT NULL,
          updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
        );
      `);
    },
  },
  {
    version: 60, // audit remediation block (60+) so concurrent work on other migration numbers cannot collide
    name: 'quote lines keep interval, region and setup fee',
    up(db) {
      if (!hasColumn(db, 'quote_lines', 'interval')) db.exec("ALTER TABLE quote_lines ADD COLUMN interval TEXT NOT NULL DEFAULT 'MONTHLY'");
      if (!hasColumn(db, 'quote_lines', 'region_id')) db.exec('ALTER TABLE quote_lines ADD COLUMN region_id TEXT');
      if (!hasColumn(db, 'quote_lines', 'setup_fee_minor_units')) db.exec('ALTER TABLE quote_lines ADD COLUMN setup_fee_minor_units INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 61,
    name: 'known devices for account-wide sign-in throttling',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS known_devices (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL,
          first_seen_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
          PRIMARY KEY (user_id, device_id)
        )
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
