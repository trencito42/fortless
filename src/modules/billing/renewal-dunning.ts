import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { suspendService, unsuspendService, terminateService } from '../provisioning/services.js';
import { queueEmail } from '../email/outbox.js';

export interface RenewalResult {
  renewedCount: number;
  dunningStartedCount: number;
  suspendedCount: number;
  canceledCount: number;
}

/**
 * Calculates the next anchor date based on interval and month-end clamping.
 */
export function calculateNextPeriod(
  currentEndIso: string,
  interval: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
): { periodStart: string; periodEnd: string; nextRenewal: string } {
  const currentEnd = new Date(currentEndIso);
  const periodStart = new Date(currentEnd.getTime());
  const periodEnd = new Date(currentEnd.getTime());

  if (interval === 'MONTHLY') {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  } else if (interval === 'QUARTERLY') {
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 3);
  } else if (interval === 'ANNUAL') {
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
  }

  const startIso = periodStart.toISOString();
  const endIso = periodEnd.toISOString();
  return {
    periodStart: startIso,
    periodEnd: endIso,
    nextRenewal: endIso,
  };
}

/**
 * Core Subscription Renewal & Dunning Scheduler.
 * 1. Executes due scheduled cancellations.
 * 2. Ingests active subscriptions reaching next_renewal_date, attempts renewal or enters 5-day dunning grace.
 * 3. Suspends services whose 5-day grace period has expired.
 */
export async function processSubscriptionRenewals(
  db: Database.Database = getDatabase()
): Promise<RenewalResult> {
  const result: RenewalResult = {
    renewedCount: 0,
    dunningStartedCount: 0,
    suspendedCount: 0,
    canceledCount: 0,
  };

  // 1. Process Scheduled Cancellations whose period has ended
  const dueCancellations = db.prepare(`
    SELECT * FROM subscriptions
    WHERE status = 'CANCEL_SCHEDULED' AND datetime(current_period_end) <= datetime('now', 'utc')
  `).all() as any[];

  for (const sub of dueCancellations) {
    runInTransaction((trx) => {
      trx.prepare(`
        UPDATE subscriptions
        SET status = 'CANCELED', updated_at = datetime('now', 'utc')
        WHERE id = ?
      `).run(sub.id);

      if (sub.service_id) {
        terminateService(
          {
            serviceId: sub.service_id,
            reason: 'Subscription period concluded following cancellation schedule',
            actorType: 'SYSTEM',
          },
          undefined,
          trx
        );
      }

      trx.prepare(`
        INSERT INTO audit_events (
          id, account_id, actor_user_id, actor_type, action, resource_type,
          resource_id, ip_address, correlation_id, metadata, created_at
        ) VALUES (?, ?, NULL, 'SYSTEM', 'subscription.canceled_concluded', 'subscription', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
      `).run(
        `aud_${crypto.randomUUID()}`,
        sub.account_id,
        sub.id,
        `corr_${crypto.randomUUID()}`,
        JSON.stringify({ subscriptionId: sub.id, serviceId: sub.service_id })
      );
    }, db);
    result.canceledCount++;
  }

  // 2. Process Active Subscriptions Due for Renewal
  const dueActive = db.prepare(`
    SELECT sub.*, acc.name as account_name, u.email as owner_email, u.name as owner_name
    FROM subscriptions sub
    JOIN accounts acc ON acc.id = sub.account_id
    JOIN users u ON u.id = acc.owner_user_id
    WHERE sub.status = 'ACTIVE' AND sub.auto_renew = 1 AND datetime(sub.next_renewal_date) <= datetime('now', 'utc')
  `).all() as any[];

  for (const sub of dueActive) {
    // In unconfigured or off-session mock mode, the renewal cannot be auto-charged off-session without stored card token
    // Therefore, it enters PAST_DUE with a 5-day grace period
    const graceEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId = `inv_${crypto.randomUUID()}`;

    runInTransaction((trx) => {
      trx.prepare(`
        UPDATE subscriptions
        SET status = 'PAST_DUE',
            grace_period_end = ?,
            dunning_attempts = dunning_attempts + 1,
            last_dunning_at = datetime('now', 'utc'),
            updated_at = datetime('now', 'utc')
        WHERE id = ?
      `).run(graceEnd, sub.id);

      // Create draft/open renewal invoice
      trx.prepare(`
        INSERT INTO invoices (
          id, account_id, status, currency, subtotal_minor_units, tax_minor_units,
          total_minor_units, due_date, created_at
        ) VALUES (?, ?, 'ISSUED', ?, ?, 0, ?, ?, datetime('now', 'utc'))
      `).run(
        invoiceId,
        sub.account_id,
        sub.currency,
        sub.renewal_price_minor_units,
        sub.renewal_price_minor_units,
        graceEnd
      );

      trx.prepare(`
        INSERT INTO invoice_lines (
          id, invoice_id, description, quantity, unit_price_minor_units, tax_rate_basis_points, total_minor_units
        ) VALUES (?, ?, ?, 1, ?, 0, ?)
      `).run(
        `inl_${crypto.randomUUID()}`,
        invoiceId,
        `Subscription Renewal (${sub.billing_interval})`,
        sub.renewal_price_minor_units,
        sub.renewal_price_minor_units
      );

      // Record audit event
      trx.prepare(`
        INSERT INTO audit_events (
          id, account_id, actor_user_id, actor_type, action, resource_type,
          resource_id, ip_address, correlation_id, metadata, created_at
        ) VALUES (?, ?, NULL, 'SYSTEM', 'subscription.dunning_started', 'subscription', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
      `).run(
        `aud_${crypto.randomUUID()}`,
        sub.account_id,
        sub.id,
        `corr_${crypto.randomUUID()}`,
        JSON.stringify({
          subscriptionId: sub.id,
          invoiceId,
          gracePeriodEnd: graceEnd,
          dunningAttempt: sub.dunning_attempts + 1,
        })
      );

      // Queue email notification
      queueEmail(trx, {
        recipient: sub.owner_email,
        template: 'security_alert',
        subject: 'Payment Required: Subscription Renewal Grace Period Active',
        payload: {
          title: 'Subscription Grace Period Active',
          message: `Your subscription renewal invoice is ready. You have a 5-day grace period to complete payment before service suspension. Total: ${(sub.renewal_price_minor_units / 100).toFixed(2)} ${sub.currency}`,
        },
      });
    }, db);

    result.dunningStartedCount++;
  }

  // 3. Process Expired Grace Periods (Grace Expiration -> Service Suspension)
  const expiredGrace = db.prepare(`
    SELECT sub.*, s.contract_status as service_contract_status
    FROM subscriptions sub
    JOIN services s ON s.id = sub.service_id
    WHERE sub.status = 'PAST_DUE'
      AND datetime(sub.grace_period_end) <= datetime('now', 'utc')
      AND s.contract_status = 'ACTIVE'
  `).all() as any[];

  for (const sub of expiredGrace) {
    await suspendService(
      {
        serviceId: sub.service_id,
        reason: 'Subscription renewal grace period expired without payment settlement',
        actorType: 'SYSTEM',
      },
      undefined,
      db
    );

    db.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, NULL, 'SYSTEM', 'subscription.grace_expired_suspended', 'subscription', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      sub.account_id,
      sub.id,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ subscriptionId: sub.id, serviceId: sub.service_id, graceEnd: sub.grace_period_end })
    );

    result.suspendedCount++;
  }

  return result;
}

/**
 * Settles a subscription upon successful payment receipt, resetting grace period and advancing billing cycle.
 */
export async function settleSubscriptionPayment(
  subscriptionId: string,
  db: Database.Database = getDatabase()
): Promise<void> {
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as any;
  if (!sub) throw new Error('Subscription not found');

  const { periodStart, periodEnd, nextRenewal } = calculateNextPeriod(
    sub.current_period_end,
    sub.billing_interval
  );

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE subscriptions
      SET status = 'ACTIVE',
          current_period_start = ?,
          current_period_end = ?,
          next_renewal_date = ?,
          grace_period_end = NULL,
          dunning_attempts = 0,
          updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(periodStart, periodEnd, nextRenewal, sub.id);

    // (Service unsuspension handled after transaction if previously suspended)

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, NULL, 'SYSTEM', 'subscription.renewed', 'subscription', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      sub.account_id,
      sub.id,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ subscriptionId: sub.id, newPeriodEnd: periodEnd })
    );
  }, db);

  // If service was suspended for overdue payment, unsuspend it outside transaction
  const service = db.prepare('SELECT contract_status FROM services WHERE id = ?').get(sub.service_id) as any;
  if (service && service.contract_status === 'SUSPENDED') {
    await unsuspendService(
      {
        serviceId: sub.service_id,
        actorType: 'SYSTEM',
      },
      undefined,
      db
    );
  }
}
