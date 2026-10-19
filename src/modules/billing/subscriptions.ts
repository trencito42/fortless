import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { terminateService } from '../provisioning/services.js';
import { queueEmail } from '../email/outbox.js';

export interface SubscriptionDetail {
  id: string;
  accountId: string;
  serviceId: string;
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCEL_SCHEDULED' | 'CANCELED' | 'TERMINATED';
  billingInterval: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextRenewalDate: string;
  renewalPriceMinorUnits: number;
  currency: string;
  autoRenew: boolean;
  serviceName?: string;
  createdAt: string;
  updatedAt: string;
}

export function listSubscriptionsForAccount(
  accountId: string,
  db: Database.Database = getDatabase()
): SubscriptionDetail[] {
  const rows = db.prepare(`
    SELECT sub.*, pv.name as service_name
    FROM subscriptions sub
    LEFT JOIN services s ON s.id = sub.service_id
    LEFT JOIN order_items oi ON oi.id = s.order_item_id
    LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id
    WHERE sub.account_id = ?
    ORDER BY sub.created_at DESC
  `).all(accountId) as any[];

  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    serviceId: r.service_id,
    status: r.status,
    billingInterval: r.billing_interval,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    nextRenewalDate: r.next_renewal_date,
    renewalPriceMinorUnits: r.renewal_price_minor_units,
    currency: r.currency,
    autoRenew: r.auto_renew === 1,
    serviceName: r.service_name || 'Hosting subscription',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function cancelSubscription(
  params: {
    subscriptionId: string;
    accountId: string;
    userId: string;
    immediate?: boolean;
    reason?: string;
  },
  db: Database.Database = getDatabase()
): Promise<{ status: string }> {
  const sub = db.prepare(`
    SELECT * FROM subscriptions WHERE id = ? AND account_id = ?
  `).get(params.subscriptionId, params.accountId) as any;

  if (!sub) {
    throw new Error('Subscription not found');
  }

  if (sub.status === 'CANCELED' || sub.status === 'TERMINATED') {
    return { status: sub.status };
  }

  const targetStatus = params.immediate ? 'CANCELED' : 'CANCEL_SCHEDULED';

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE subscriptions
      SET status = ?, auto_renew = 0, updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(targetStatus, sub.id);

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, ?, 'USER', 'subscription.cancel', 'subscription', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      sub.account_id,
      params.userId,
      sub.id,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ status: targetStatus, immediate: Boolean(params.immediate), reason: params.reason })
    );

    if (sub.psp_subscription_id) {
      trx.prepare(`
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
        VALUES (?, 'stripe.subscription.cancel.v1', 'subscription', ?, ?, 'PENDING')
      `).run(
        `obx_${crypto.randomUUID()}`,
        sub.id,
        JSON.stringify({
          pspSubscriptionId: sub.psp_subscription_id,
          immediate: Boolean(params.immediate),
          subscriptionId: sub.id,
        })
      );
    }

    if (!params.immediate) {
      const recipient = trx.prepare('SELECT email FROM users WHERE id = ?').get(params.userId) as { email: string } | undefined;
      const service = trx.prepare(`
        SELECT pv.name
        FROM services s
        LEFT JOIN order_items oi ON oi.id = s.order_item_id
        LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id
        WHERE s.id = ?
      `).get(sub.service_id) as { name: string | null } | undefined;
      if (recipient) {
        queueEmail(trx, {
          recipient: recipient.email,
          template: 'cancellation_scheduled',
          payload: {
            serviceName: service?.name || 'Hosting subscription',
            endDate: sub.current_period_end,
          },
        });
      }
    }
  }, db);

  if (params.immediate && sub.service_id) {
    await terminateService({
      serviceId: sub.service_id,
      reason: params.reason || 'Immediate subscription cancellation',
      actorUserId: params.userId,
      actorType: 'USER',
    }, undefined, db);
  }

  return { status: targetStatus };
}
