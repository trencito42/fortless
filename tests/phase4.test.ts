import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { seedInitialCatalog } from '../src/modules/catalog/catalog.js';
import { registerUser } from '../src/modules/identity/auth.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateNextPeriod,
  processSubscriptionRenewals,
  settleSubscriptionPayment,
} from '../src/modules/billing/renewal-dunning.js';
import {
  getPublicSystemStatus,
  createIncident,
  updateIncident,
  updateComponentStatus,
} from '../src/modules/status/status.js';
import {
  listAdminOrders,
  listAdminInvoices,
  listAdminCreditNotes,
  getAdminCapacityPools,
} from '../src/modules/admin/read-model.js';
import {
  createDatabaseBackup,
  verifyAndRestoreBackup,
} from '../src/modules/backup/backup.js';

describe('Phase 4: Subscription Renewal, Dunning & System Status Management', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    seedInitialCatalog(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTestService(accountId: string, contractStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE'): string {
    const serviceId = `srv_${crypto.randomUUID()}`;
    const quoteId = `quo_${crypto.randomUUID()}`;
    const orderId = `ord_${crypto.randomUUID()}`;
    const orderItemId = `oi_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO quotes (id, account_id, currency, subtotal_minor_units, tax_minor_units, total_minor_units, tax_calculation_snapshot, valid_until, status)
      VALUES (?, ?, 'EUR', 1500, 0, 1500, '{}', datetime('now', '+1 hour'), 'CONVERTED')
    `).run(quoteId, accountId);

    db.prepare(`
      INSERT INTO orders (id, account_id, quote_id, currency, total_minor_units, status, idempotency_key)
      VALUES (?, ?, ?, 'EUR', 1500, 'PAID', ?)
    `).run(orderId, accountId, quoteId, `idem_${orderId}`);

    db.prepare(`
      INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status)
      VALUES (?, ?, 'plv_mc_4gb', 'reg_fra_1', '{}', 'FULFILLED')
    `).run(orderItemId, orderId);

    db.prepare(`
      INSERT INTO services (
        id, account_id, order_item_id, provider_type, provider_instance_id,
        contract_status, node_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'PTERODACTYL', 'mock_inst_1', ?, 'node_fra_01', datetime('now', 'utc'), datetime('now', 'utc'))
    `).run(serviceId, accountId, orderItemId, contractStatus);

    return serviceId;
  }

  describe('Category O: Subscription Renewal & Dunning Invariants', () => {
    it('DUN-01: calculates billing anchor dates accurately across intervals', () => {
      const anchor = '2026-01-15T00:00:00.000Z';
      const monthly = calculateNextPeriod(anchor, 'MONTHLY');
      expect(new Date(monthly.periodEnd).getUTCMonth()).toBe(1); // Feb

      const quarterly = calculateNextPeriod(anchor, 'QUARTERLY');
      expect(new Date(quarterly.periodEnd).getUTCMonth()).toBe(3); // April

      const annual = calculateNextPeriod(anchor, 'ANNUAL');
      expect(new Date(annual.periodEnd).getUTCFullYear()).toBe(2027);
    });

    it('DUN-02: due renewals enter PAST_DUE with 5-day grace period and open invoice', async () => {
      const reg = registerUser({
        email: 'dunning-user@example.com',
        password: 'Password123!',
        name: 'Dunning Test',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const serviceId = createTestService(reg.account.id, 'ACTIVE');
      const subId = `sub_${crypto.randomUUID()}`;

      // Insert subscription with renewal due yesterday
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      db.prepare(`
        INSERT INTO subscriptions (
          id, account_id, service_id, status, billing_interval, currency,
          renewal_price_minor_units, current_period_start, current_period_end,
          next_renewal_date, created_at, updated_at
        ) VALUES (?, ?, ?, 'ACTIVE', 'MONTHLY', 'EUR', 1500, ?, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
      `).run(subId, reg.account.id, serviceId, yesterday, yesterday, yesterday);

      const result = await processSubscriptionRenewals(db);
      expect(result.dunningStartedCount).toBe(1);

      // Verify subscription is now PAST_DUE with a 5-day grace period
      const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as any;
      expect(sub.status).toBe('PAST_DUE');
      expect(sub.grace_period_end).toBeDefined();
      expect(sub.dunning_attempts).toBe(1);

      // Verify open invoice was generated
      const invoices = db.prepare('SELECT * FROM invoices WHERE account_id = ?').all(reg.account.id) as any[];
      expect(invoices.length).toBe(1);
      expect(invoices[0].status).toBe('ISSUED');
      expect(invoices[0].total_minor_units).toBe(1500);

      // Verify email was queued in email_outbox
      const emails = db.prepare('SELECT * FROM email_outbox WHERE recipient = ?').all(reg.user.email) as any[];
      const alertEmail = emails.find((e: any) => e.template === 'payment_failed');
      expect(alertEmail).toBeDefined();
    });

    it('DUN-02b: upcoming renewal reminder is queued once per billing period', async () => {
      const reg = registerUser({
        email: 'renewal-reminder@example.com', password: 'Password123!', name: 'Reminder Test',
        ipAddress: '127.0.0.1', userAgent: 'vitest',
      }, db);
      const serviceId = createTestService(reg.account.id, 'ACTIVE');
      const subId = `sub_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO subscriptions (
          id, account_id, service_id, status, billing_interval, currency,
          renewal_price_minor_units, current_period_start, current_period_end,
          next_renewal_date, created_at, updated_at
        ) VALUES (?, ?, ?, 'ACTIVE', 'MONTHLY', 'EUR', 1500, datetime('now', '-24 days'),
          datetime('now', '+6 days'), datetime('now', '+6 days'), datetime('now', 'utc'), datetime('now', 'utc'))
      `).run(subId, reg.account.id, serviceId);

      const first = await processSubscriptionRenewals(db);
      const second = await processSubscriptionRenewals(db);
      expect(first.remindersSentCount).toBe(1);
      expect(second.remindersSentCount).toBe(0);
      const reminders = db.prepare("SELECT * FROM email_outbox WHERE recipient = ? AND template = 'renewal_reminder'").all(reg.user.email);
      expect(reminders).toHaveLength(1);
    });

    it('DUN-03: expired grace period triggers service suspension', async () => {
      const reg = registerUser({
        email: 'grace-expired@example.com',
        password: 'Password123!',
        name: 'Grace Expired',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const serviceId = createTestService(reg.account.id, 'ACTIVE');
      const subId = `sub_${crypto.randomUUID()}`;

      // Grace period expired 1 hour ago
      const expiredGrace = new Date(Date.now() - 3600000).toISOString();
      db.prepare(`
        INSERT INTO subscriptions (
          id, account_id, service_id, status, billing_interval, currency,
          renewal_price_minor_units, current_period_start, current_period_end,
          next_renewal_date, grace_period_end, dunning_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, 'PAST_DUE', 'MONTHLY', 'EUR', 2000, ?, ?, ?, ?, 1, datetime('now', 'utc'), datetime('now', 'utc'))
      `).run(subId, reg.account.id, serviceId, expiredGrace, expiredGrace, expiredGrace, expiredGrace);

      const result = await processSubscriptionRenewals(db);
      expect(result.suspendedCount).toBe(1);

      // Service must now be SUSPENDED
      const service = db.prepare('SELECT contract_status FROM services WHERE id = ?').get(serviceId) as any;
      expect(service.contract_status).toBe('SUSPENDED');
    });

    it('DUN-04: settleSubscriptionPayment restores subscription and unsuspends service', async () => {
      const reg = registerUser({
        email: 'settle@example.com',
        password: 'Password123!',
        name: 'Settle User',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const serviceId = createTestService(reg.account.id, 'SUSPENDED');
      const subId = `sub_${crypto.randomUUID()}`;

      const pastDue = new Date(Date.now() - 86400000).toISOString();
      db.prepare(`
        INSERT INTO subscriptions (
          id, account_id, service_id, status, billing_interval, currency,
          renewal_price_minor_units, current_period_start, current_period_end,
          next_renewal_date, grace_period_end, dunning_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, 'PAST_DUE', 'MONTHLY', 'EUR', 2000, ?, ?, ?, ?, 1, datetime('now', 'utc'), datetime('now', 'utc'))
      `).run(subId, reg.account.id, serviceId, pastDue, pastDue, pastDue, pastDue);

      await settleSubscriptionPayment(subId, db);

      // Subscription should be ACTIVE with cleared grace period and reset attempts
      const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as any;
      expect(sub.status).toBe('ACTIVE');
      expect(sub.grace_period_end).toBeNull();
      expect(sub.dunning_attempts).toBe(0);

      // Service should be unsuspended to ACTIVE
      const service = db.prepare('SELECT contract_status FROM services WHERE id = ?').get(serviceId) as any;
      expect(service.contract_status).toBe('ACTIVE');
    });

    it('DUN-05: CANCEL_SCHEDULED terminates service upon period end', async () => {
      const reg = registerUser({
        email: 'cancel-scheduled@example.com',
        password: 'Password123!',
        name: 'Cancel User',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const serviceId = createTestService(reg.account.id, 'ACTIVE');
      const subId = `sub_${crypto.randomUUID()}`;

      const pastEnd = new Date(Date.now() - 10000).toISOString();
      db.prepare(`
        INSERT INTO subscriptions (
          id, account_id, service_id, status, billing_interval, currency,
          renewal_price_minor_units, current_period_start, current_period_end,
          next_renewal_date, created_at, updated_at
        ) VALUES (?, ?, ?, 'CANCEL_SCHEDULED', 'MONTHLY', 'EUR', 2000, ?, ?, ?, datetime('now', 'utc'), datetime('now', 'utc'))
      `).run(subId, reg.account.id, serviceId, pastEnd, pastEnd, pastEnd);

      const result = await processSubscriptionRenewals(db);
      expect(result.canceledCount).toBe(1);

      const sub = db.prepare('SELECT status FROM subscriptions WHERE id = ?').get(subId) as any;
      expect(sub.status).toBe('CANCELED');

      const service = db.prepare('SELECT contract_status FROM services WHERE id = ?').get(serviceId) as any;
      expect(service.contract_status).toBe('TERMINATED');
    });
  });

  describe('Category P: System Status, Component Health & Incident Management', () => {
    it('STAT-01: seeded components are returned with OPERATIONAL indicator', () => {
      const status = getPublicSystemStatus(db);
      expect(status.components.length).toBe(6);
      expect(status.indicator).toBe('OPERATIONAL');
      expect(status.headline).toBe('All Systems Operational');
      expect(status.activeIncidents.length).toBe(0);
    });

    it('STAT-02: creating an incident updates affected component and headline indicator', () => {
      const staffUser = registerUser({
        email: 'staff-admin@example.com',
        password: 'Password123!',
        name: 'Staff Admin',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const apiComp = db.prepare("SELECT id FROM system_components WHERE slug = 'api'").get() as any;
      expect(apiComp).toBeDefined();

      const incident = createIncident(
        {
          title: 'API Latency Elevation in Frankfurt',
          impact: 'MAJOR',
          status: 'INVESTIGATING',
          message: 'We are investigating elevated response times in the EU-Central region.',
          affectedComponentIds: [apiComp.id],
          affectedComponentStatus: 'DEGRADED',
        },
        staffUser.user.id,
        db
      );

      expect(incident.id).toBeDefined();
      expect(incident.status).toBe('INVESTIGATING');

      // Check public system status calculation
      const status = getPublicSystemStatus(db);
      expect(status.indicator).toBe('DEGRADED');
      expect(status.headline).toBe('Degraded System Performance');
      expect(status.activeIncidents.length).toBe(1);
      expect(status.activeIncidents[0]?.updates.length).toBe(1);

      // Verify component status updated
      const updatedComp = status.components.find((c) => c.slug === 'api');
      expect(updatedComp?.status).toBe('DEGRADED');
    });

    it('STAT-03: resolving an incident updates past incidents and indicator returns to OPERATIONAL', () => {
      const staffUser = registerUser({
        email: 'staff-admin-2@example.com',
        password: 'Password123!',
        name: 'Staff Admin 2',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const apiComp = db.prepare("SELECT id FROM system_components WHERE slug = 'api'").get() as any;

      const incident = createIncident(
        {
          title: 'Database Failover Outage',
          impact: 'CRITICAL',
          status: 'IDENTIFIED',
          message: 'Primary DB replica switchover in progress.',
          affectedComponentIds: [apiComp.id],
          affectedComponentStatus: 'MAJOR_OUTAGE',
        },
        staffUser.user.id,
        db
      );

      let status = getPublicSystemStatus(db);
      expect(status.indicator).toBe('MAJOR_OUTAGE');

      // Update incident to RESOLVED
      updateIncident(
        incident.id,
        {
          status: 'RESOLVED',
          message: 'Failover complete and latency normalized.',
        },
        staffUser.user.id,
        db
      );

      // Restore component status
      updateComponentStatus(apiComp.id, 'OPERATIONAL', staffUser.user.id, db);

      status = getPublicSystemStatus(db);
      expect(status.indicator).toBe('OPERATIONAL');
      expect(status.activeIncidents.length).toBe(0);
      expect(status.pastIncidents.length).toBe(1);
      expect(status.pastIncidents[0]?.resolvedAt).not.toBeNull();
    });

    it('STAT-04: audit logs are emitted for component and incident mutations', () => {
      const staffUser = registerUser({
        email: 'staff-auditor@example.com',
        password: 'Password123!',
        name: 'Auditor Staff',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      }, db);

      const dashboardComp = db.prepare("SELECT id FROM system_components WHERE slug = 'dashboard'").get() as any;

      updateComponentStatus(dashboardComp.id, 'MAINTENANCE', staffUser.user.id, db);

      const audit = db.prepare(`
        SELECT * FROM audit_events
        WHERE resource_type = 'system_component' AND resource_id = ?
      `).get(dashboardComp.id) as any;

      expect(audit).toBeDefined();
      expect(audit.action).toBe('system_component.update');
      expect(audit.actor_user_id).toBe(staffUser.user.id);
      expect(JSON.parse(audit.metadata).newStatus).toBe('MAINTENANCE');
    });
  });

  describe('Category Q: Administrative Operations Read Model & API Slices', () => {
    it('ADM-09: listAdminOrders lists cross-tenant orders with filtering, items and pagination', () => {
      const userA = registerUser({ email: 'ord_a@example.com', password: 'Password123!', name: 'User A', ipAddress: '127.0.0.1', userAgent: 'vitest' }, db);
      const userB = registerUser({ email: 'ord_b@example.com', password: 'Password123!', name: 'User B', ipAddress: '127.0.0.1', userAgent: 'vitest' }, db);

      createTestService(userA.account.id);
      createTestService(userB.account.id);

      const allOrders = listAdminOrders(db);
      expect(allOrders.orders.length).toBe(2);
      expect(allOrders.orders[0]?.item_count).toBe(1);

      // Search by email
      const filtered = listAdminOrders(db, { query: 'ord_a@example.com' });
      expect(filtered.orders.length).toBe(1);
      expect(filtered.orders[0]?.customer_email).toBe('ord_a@example.com');
    });

    it('ADM-10: listAdminInvoices lists cross-tenant sequential invoices, amounts, and statuses', () => {
      const user = registerUser({ email: 'inv_staff@example.com', password: 'Password123!', name: 'Inv User', ipAddress: '127.0.0.1', userAgent: 'vitest' }, db);

      db.prepare(`
        INSERT INTO invoices (id, account_id, invoice_number, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date)
        VALUES ('inv_test_01', ?, 'INV-2026-00001', 'ISSUED', 'EUR', 2000, 380, 2380, datetime('now', '+14 days'))
      `).run(user.account.id);

      const res = listAdminInvoices(db);
      expect(res.invoices.length).toBeGreaterThan(0);
      const found = res.invoices.find((i: any) => i.id === 'inv_test_01');
      expect(found).toBeDefined();
      expect(found?.invoice_number).toBe('INV-2026-00001');
      expect(found?.total_minor_units).toBe(2380);
      expect(found?.customer_email).toBe('inv_staff@example.com');
    });

    it('ADM-11: listAdminCreditNotes lists refund notes linked to parent invoices', () => {
      const user = registerUser({ email: 'crn_staff@example.com', password: 'Password123!', name: 'Crn User', ipAddress: '127.0.0.1', userAgent: 'vitest' }, db);

      db.prepare(`
        INSERT INTO invoices (id, account_id, invoice_number, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date)
        VALUES ('inv_crn_parent', ?, 'INV-2026-00002', 'CREDITED', 'EUR', 1500, 0, 1500, datetime('now', '+14 days'))
      `).run(user.account.id);

      db.prepare(`
        INSERT INTO credit_notes (id, invoice_id, credit_note_number, amount_minor_units, reason)
        VALUES ('crn_test_01', 'inv_crn_parent', 'CRN-2026-00001', 1500, 'Customer requested SLA credit')
      `).run();

      const res = listAdminCreditNotes(db);
      expect(res.creditNotes.length).toBe(1);
      expect(res.creditNotes[0]?.credit_note_number).toBe('CRN-2026-00001');
      expect(res.creditNotes[0]?.amount_minor_units).toBe(1500);
      expect(res.creditNotes[0]?.invoice_number).toBe('INV-2026-00002');
      expect(res.creditNotes[0]?.reason).toBe('Customer requested SLA credit');
    });

    it('ADM-12: getAdminCapacityPools returns regions and nodes with resource metrics', () => {
      const pools = getAdminCapacityPools(db);
      expect(pools.regions.length).toBeGreaterThanOrEqual(2);
      expect(pools.nodes.length).toBeGreaterThanOrEqual(2);

      const fraNode = pools.nodes.find((n: any) => n.id === 'node_fra_01');
      expect(fraNode).toBeDefined();
      expect(fraNode?.max_memory_mb).toBe(131072);
      expect(fraNode?.region_code).toBe('fra-1');
    });
  });

  describe('Category R: Automated Backup, Authenticated Encryption & Disaster Recovery Verification (Gate 7)', () => {
    const testBackupDir = path.resolve(process.cwd(), 'data', 'test_backups');

    afterEach(() => {
      if (fs.existsSync(testBackupDir)) {
        fs.rmSync(testBackupDir, { recursive: true, force: true });
      }
    });

    it('BCK-01: Online atomic database snapshot captures consistent state and computes SHA-256', async () => {
      const meta = await createDatabaseBackup({
        sourceDb: db,
        targetDir: testBackupDir,
      });

      expect(meta.backupId).toBeDefined();
      expect(meta.sha256).toHaveLength(64);
      expect(meta.isEncrypted).toBe(false);
      expect(fs.existsSync(meta.backupFilePath)).toBe(true);
      expect(Object.keys(meta.tableCounts).length).toBeGreaterThan(10);
    });

    it('BCK-02: Checksum verification detects tampering and aborts restore', async () => {
      const meta = await createDatabaseBackup({
        sourceDb: db,
        targetDir: testBackupDir,
      });

      const restorePath = path.join(testBackupDir, 'restored.db');

      // Attempt restore with mismatched expected checksum
      await expect(
        verifyAndRestoreBackup({
          backupFilePath: meta.backupFilePath,
          targetDbPath: restorePath,
          expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        })
      ).rejects.toThrow(/Checksum mismatch/);
    });

    it('BCK-03: AES-256-GCM authenticated encryption and decryption', async () => {
      const key = 'secret-production-disaster-recovery-key-32b';
      const meta = await createDatabaseBackup({
        sourceDb: db,
        targetDir: testBackupDir,
        encryptionKey: key,
      });

      expect(meta.isEncrypted).toBe(true);
      expect(meta.algorithm).toBe('aes-256-gcm');
      expect(meta.backupFilePath.endsWith('.enc.db')).toBe(true);

      const restorePath = path.join(testBackupDir, 'restored_encrypted.db');

      // Fails with wrong key
      await expect(
        verifyAndRestoreBackup({
          backupFilePath: meta.backupFilePath,
          targetDbPath: restorePath,
          encryptionKey: 'wrong-key-completely-different',
        })
      ).rejects.toThrow();

      // Succeeds with correct key
      const report = await verifyAndRestoreBackup({
        backupFilePath: meta.backupFilePath,
        targetDbPath: restorePath,
        encryptionKey: key,
        expectedSha256: meta.sha256,
      });

      expect(report.success).toBe(true);
      expect(report.integrityCheck).toBe('ok');
      expect(report.foreignKeyViolations).toBe(0);
    });

    it('BCK-04: Isolated staging restore passes PRAGMA integrity_check and row count validation', async () => {
      // Seed a user before backup
      registerUser({ email: 'dr_restore_test@example.com', password: 'Password123!', name: 'DR User', ipAddress: '127.0.0.1', userAgent: 'vitest' }, db);

      const meta = await createDatabaseBackup({
        sourceDb: db,
        targetDir: testBackupDir,
      });

      const restoreTarget = path.join(testBackupDir, 'staging_restore.db');
      const report = await verifyAndRestoreBackup({
        backupFilePath: meta.backupFilePath,
        targetDbPath: restoreTarget,
        expectedSha256: meta.sha256,
      });

      expect(report.success).toBe(true);
      expect(report.integrityCheck).toBe('ok');
      expect(report.foreignKeyViolations).toBe(0);

      // Verify restored database directly
      const restoredDb = new Database(restoreTarget, { readonly: true });
      const user = restoredDb.prepare("SELECT email FROM users WHERE email = 'dr_restore_test@example.com'").get() as any;
      expect(user).toBeDefined();
      expect(user.email).toBe('dr_restore_test@example.com');
      restoredDb.close();
    });
  });
});
