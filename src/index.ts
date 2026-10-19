import path from 'node:path';
import { syncRuntimeStates, reconcileWithPanel } from './modules/provisioning/runtime-sync.js';
import { config } from './config/index.js';
import { getDatabase } from './database/index.js';
import { SCHEMA_SQL } from './database/schema.js';
import { runMigrations } from './database/migrations.js';
import { seedInitialCatalog } from './modules/catalog/catalog.js';
import { processEmailOutbox } from './modules/email/outbox.js';
import { processOutboxQueue, setProviderAdapter } from './modules/outbox/worker.js';
import { PterodactylHttpAdapter } from './modules/provisioning/adapter.js';
import { buildServer } from './server.js';
import { runScheduledBackup, cleanStrayBackupFiles } from './modules/backup/scheduler.js';
import { runMaintenance } from './modules/maintenance/maintenance.js';

async function bootstrap() {
  console.log('⚡ Initializing FORTLESS Platform Core...');

  // NEW-361: say loudly when a publicly served deployment runs with development defaults.
  if (config.NODE_ENV !== 'production' && config.APP_ORIGIN.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(config.APP_ORIGIN)) {
    console.error(`⚠️  NODE_ENV is "${config.NODE_ENV}" while serving ${config.APP_ORIGIN}. Development defaults are active: SESSION_SECRET may come from a local file and file watching is on. Set NODE_ENV=production and an explicit SESSION_SECRET.`);
  }

  // 1. Initialize SQLite Database & Schema
  const db = getDatabase();
  db.exec(SCHEMA_SQL);
  const applied = runMigrations(db);
  console.log(`📦 Database initialized & WAL mode active at: ${config.DATABASE_PATH} (${applied} migration(s) applied)`);

  // 2. Seed initial catalog if empty
  seedInitialCatalog(db, { publishDemonstrationCatalog: false });
  console.log('🌱 Initial catalog & regions checked.');

  // 3. Build HTTP Server
  const server = buildServer();

  // 4. Start HTTP Server on port 3021
  try {
    const address = await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 FORTLESS API listening at: ${address} (Bound to port ${config.PORT})`);
  } catch (err) {
    console.error('Failed to bind server:', err);
    process.exit(1);
  }

  // 4a. Routine clean-up of expired sessions, WebAuthn challenges and delivered one-time links (NEW-377, NEW-360, NEW-398)
  const maintain = () => { try { runMaintenance(db); } catch (err) { console.error('[Maintenance] failed:', (err as Error).message); } };
  setInterval(maintain, 3_600_000);
  maintain();

  // 4b. Scheduled encrypted backups (NEW-374). Without a key nothing is written, and that is recorded as loudly as a failure.
  if (config.BACKUP_INTERVAL_HOURS > 0) {
    cleanStrayBackupFiles(path.resolve(process.cwd(), 'data', 'backups'));
    if (config.FORTLESS_BACKUP_KEY.length >= 32) {
      const runBackup = () => runScheduledBackup({ db, encryptionKey: config.FORTLESS_BACKUP_KEY, retentionCount: config.BACKUP_RETENTION_COUNT, copyDir: config.BACKUP_COPY_DIR })
        .then((r) => console.log(`💾 Backup ${r.backupId} created${r.copied ? ' and copied' : ''}, ${r.pruned} old file set(s) pruned`))
        .catch((err) => console.error('[Backup] scheduled backup failed:', (err as Error).message));
      setInterval(runBackup, config.BACKUP_INTERVAL_HOURS * 3_600_000);
      setTimeout(runBackup, 60_000);
      console.log(`💾 Scheduled backups every ${config.BACKUP_INTERVAL_HOURS} h, keeping ${config.BACKUP_RETENTION_COUNT}${config.BACKUP_COPY_DIR ? ', with a second copy' : ' (no second copy configured)'}`);
    } else {
      console.error('⚠️  Scheduled backups are DISABLED: set FORTLESS_BACKUP_KEY (32+ characters). No backups are being made.');
      db.prepare(`INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, NULL, 'SYSTEM', 'backup.skipped_no_key', 'backup', 'scheduled', ?, '{}')`).run(`aud_${Date.now()}`, `corr_${Date.now()}`);
    }
  }

  // 5. Start Background Email Outbox Worker Loop
  if (config.EMAIL_MODE !== 'disabled') {
    console.log(`📧 Email outbox worker active (${config.EMAIL_MODE} mode via ${config.SMTP_HOST}:${config.SMTP_PORT})`);
    setInterval(() => {
      processEmailOutbox().catch((err) => {
        console.error('[EmailWorker] Outbox processing error:', err);
      });
    }, 15000);
    processEmailOutbox().catch(() => {});
  }
  // 6. Start Provisioning Worker Loop if configured
  if (
    config.PROVIDER_MODE === 'pterodactyl_1'
    && config.PTERODACTYL_PANEL_URL
    && config.PTERODACTYL_API_KEY
    && (config.PROVIDER_VERIFICATION_TIER === 'SANDBOX_VERIFIED' || config.PROVIDER_VERIFICATION_TIER === 'PRODUCTION_VERIFIED')
  ) {
    const pterodactylAdapter = new PterodactylHttpAdapter({
      panelUrl: config.PTERODACTYL_PANEL_URL,
      apiKey: config.PTERODACTYL_API_KEY,
      clientApiKey: config.PTERODACTYL_CLIENT_API_KEY || undefined,
    });
    setProviderAdapter(pterodactylAdapter);
    console.log(`🎮 Pterodactyl provisioning worker active (${config.PTERODACTYL_PANEL_URL})`);
    setInterval(() => {
      processOutboxQueue(pterodactylAdapter, db).catch((err) => {
        console.error('[ProvisioningWorker] Outbox processing error:', err);
      });
    }, 10000);
    processOutboxQueue(pterodactylAdapter, db).catch(() => {});
    if (config.PTERODACTYL_KEYMINT_SECRET) {
      let syncing = false;
      const runSync = () => {
        if (syncing) return;
        syncing = true;
        syncRuntimeStates(pterodactylAdapter, db, config.PTERODACTYL_KEYMINT_SECRET)
          .catch((err) => console.error('[RuntimeSync] failed:', err))
          .finally(() => { syncing = false; });
      };
      setInterval(runSync, 30000);
      runSync();
      let reconciling = false;
      const runReconcile = () => {
        if (reconciling) return;
        reconciling = true;
        reconcileWithPanel(pterodactylAdapter, db, config.PTERODACTYL_KEYMINT_SECRET)
          .catch((err) => console.error('[Reconcile] failed:', err))
          .finally(() => { reconciling = false; });
      };
      setInterval(runReconcile, 300000);
      setTimeout(runReconcile, 20000);
    }
  } else {
    console.log(`⏸ Provisioning worker disabled: provider verification tier is ${config.PROVIDER_VERIFICATION_TIER}.`);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
