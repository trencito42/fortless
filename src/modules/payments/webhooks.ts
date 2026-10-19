import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { generateId } from '../identity/auth.js';
import { pickNodeForService } from '../provisioning/placement.js';
import { markInvoicePaid, getNextCreditNoteNumber } from '../invoicing/invoicing.js';
import { cancelCouponRedemptionAtomic } from '../catalog/catalog.js';
import { queueEmail } from '../email/outbox.js';
import { createNotification } from '../notifications/notifications.js';
import { calculateNextPeriod } from '../billing/renewal-dunning.js';

export interface StripeWebhookPayload {
  id: string;
  type: string;
  created: number;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: {
        orderId?: string;
        paymentAttemptId?: string;
        accountId?: string;
      };
    };
  };
}

/**
 * Verify Stripe webhook signature against the raw body buffer.
 * Header format: "t=1492774577,v1=5257a869e7ecebeda32affa62cd499e29a997d620583c271813cf7f79f4277c0"
 */
export function verifyStripeSignature(rawBody: string | Buffer, signatureHeader: string, secret: string = config.STRIPE_WEBHOOK_SECRET): boolean {
  if (!signatureHeader || !rawBody) return false;

  const items = signatureHeader.split(',');
  let timestamp = '';
  let signature = '';

  for (const item of items) {
    const [key, value] = item.trim().split('=');
    if (key === 't' && value) timestamp = value;
    if (key === 'v1' && value) signature = value;
  }

  if (!timestamp || !signature) return false;

  // Replay tolerance: 5 minutes (300 seconds)
  const nowSeconds = Math.floor(Date.now() / 1000);
  const eventSeconds = parseInt(timestamp, 10);
  if (isNaN(eventSeconds) || Math.abs(nowSeconds - eventSeconds) > 300) {
    return false;
  }

  const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
  const computedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computedSignature, 'hex'));
  } catch {
    return false;
  }
}

export function generateStripeSignature(rawBody: string, secret: string = config.STRIPE_WEBHOOK_SECRET, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = `${ts}.${rawBody}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${ts},v1=${sig}`;
}

export interface IngestResult {
  status: 'PROCESSED' | 'DEDUPLICATED' | 'ANOMALY_HELD' | 'IGNORED';
  eventId: string;
  orderId?: string;
}

export function ingestPSPWebhook(
  pspName: string,
  merchantAccount: string,
  rawBody: string,
  payload: StripeWebhookPayload,
  db: Database.Database = getDatabase()
): IngestResult {
  const eventId = payload.id;
  const eventType = payload.type;
  const payloadDigest = crypto.createHash('sha256').update(rawBody).digest('hex');

  // 1. Inbox Deduplication Gate (NEW-346): only events that reached a terminal state are deduplicated.
  //    An event that was received but never finished (processing threw or the process died) is processed again.
  const existing = db.prepare(`
    SELECT status, payload_digest FROM psp_inbox_events
    WHERE psp_name = ? AND merchant_account = ? AND event_id = ?
  `).get(pspName, merchantAccount, eventId) as ({ status: string; payload_digest: string }) | undefined;

  if (existing && existing.status !== 'RECEIVED' && existing.status !== 'FAILED') {
    return { status: 'DEDUPLICATED', eventId };
  }
  if (existing && existing.payload_digest !== payloadDigest) {
    // Same event id with a different body is never reprocessed.
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE psp_name = ? AND merchant_account = ? AND event_id = ?").run(pspName, merchantAccount, eventId);
    return { status: 'ANOMALY_HELD', eventId };
  }

  if (!existing) {
    db.prepare(`
      INSERT INTO psp_inbox_events (id, psp_name, merchant_account, event_id, event_type, payload_digest, payload, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIVED')
    `).run(generateId('inb'), pspName, merchantAccount, eventId, eventType, payloadDigest, rawBody);
  }

  try {
    return dispatchInboundEvent(eventId, eventType, payload, db);
  } catch (err) {
    db.prepare("UPDATE psp_inbox_events SET status = 'FAILED', processed_at = datetime('now', 'utc') WHERE psp_name = ? AND merchant_account = ? AND event_id = ?").run(pspName, merchantAccount, eventId);
    throw err;
  }
}

/**
 * NEW-350: a held (ANOMALY) or failed payment event is visible in the admin jobs workspace; staff can run it again
 * from the stored body once the cause is fixed. The retry goes through the same dispatcher, so every guard still applies.
 */
export function retryPspInboxEvent(
  db: Database.Database,
  inboxId: string,
  actor: { userId: string; ipAddress: string }
): IngestResult {
  const row = db.prepare('SELECT id, event_id, event_type, status, payload FROM psp_inbox_events WHERE id = ?').get(inboxId) as
    { id: string; event_id: string; event_type: string; status: string; payload: string } | undefined;
  if (!row) throw new Error('NOT_FOUND: webhook event not found.');
  if (row.status !== 'ANOMALY' && row.status !== 'FAILED') throw new Error(`NOT_RETRYABLE: the event is ${row.status}.`);
  const payload = JSON.parse(row.payload) as StripeWebhookPayload;
  db.prepare("UPDATE psp_inbox_events SET status = 'RECEIVED', processed_at = NULL WHERE id = ?").run(row.id);
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, NULL, ?, 'STAFF', 'payment.inbox_retried', 'psp_inbox_event', ?, ?, ?, ?)
  `).run(generateId('aud'), actor.userId, row.id, actor.ipAddress, generateId('cor'), JSON.stringify({ eventId: row.event_id, eventType: row.event_type, previousStatus: row.status }));
  try {
    return dispatchInboundEvent(row.event_id, row.event_type, payload, db);
  } catch (err) {
    db.prepare("UPDATE psp_inbox_events SET status = 'FAILED', processed_at = datetime('now', 'utc') WHERE id = ?").run(row.id);
    throw err;
  }
}

function dispatchInboundEvent(
  eventId: string,
  eventType: string,
  payload: StripeWebhookPayload,
  db: Database.Database
): IngestResult {
  // 2. Handle Charge Refunded
  if (eventType === 'charge.refunded') {
    const rawObj = payload.data.object as Record<string, any>;
    const chargeId = rawObj.id;
    const paymentIntentId = rawObj.payment_intent;
    const amountRefunded = rawObj.amount_refunded || rawObj.amount;

    const attempt = db.prepare(`
      SELECT pa.*, i.id as invoice_id, i.order_id, i.account_id, i.total_minor_units
      FROM payment_attempts pa
      JOIN invoices i ON i.id = pa.invoice_id
      WHERE pa.psp_payment_intent_id = ? OR pa.psp_session_id = ? OR pa.id = ?
    `).get(paymentIntentId || chargeId, paymentIntentId || chargeId, paymentIntentId || chargeId) as {
      id: string;
      invoice_id: string;
      order_id: string;
      account_id: string;
      total_minor_units: number;
    } | undefined;

    if (!attempt) {
      db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
      return { status: 'ANOMALY_HELD', eventId };
    }

    // NEW-334: staff refunds are recorded locally first and then sent to Stripe; the echo from Stripe must not apply them twice.
    const alreadyRecorded = (db.prepare("SELECT COALESCE(SUM(amount_minor_units), 0) AS total FROM refunds WHERE payment_attempt_id = ? AND status IN ('REQUESTED', 'SUCCEEDED')").get(attempt.id) as { total: number }).total;
    if (Number.isFinite(amountRefunded) && amountRefunded <= alreadyRecorded) {
      db.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
      return { status: 'PROCESSED', eventId, orderId: attempt.order_id };
    }

    runInTransaction((trx) => {
      const creditNoteNumber = getNextCreditNoteNumber(undefined, trx);
      const isFullRefund = amountRefunded >= attempt.total_minor_units;
      // Refund issued outside Fortless (for example in the Stripe dashboard): keep the refunds ledger complete.
      trx.prepare("INSERT INTO refunds (id, payment_attempt_id, amount_minor_units, reason, status) VALUES (?, ?, ?, 'Recorded from Stripe charge.refunded', 'SUCCEEDED')")
        .run(generateId('rfd'), attempt.id, Math.max(1, amountRefunded - alreadyRecorded));

      trx.prepare(`
        UPDATE invoices
        SET status = ?, amount_paid_minor_units = ?
        WHERE id = ?
      `).run(isFullRefund ? 'CREDITED' : 'PAID', Math.max(0, attempt.total_minor_units - amountRefunded), attempt.invoice_id);

      trx.prepare("UPDATE payment_attempts SET status = 'CANCELED' WHERE id = ?").run(attempt.id);

      if (isFullRefund) {
        trx.prepare("UPDATE orders SET status = 'CANCELED', updated_at = datetime('now', 'utc') WHERE id = ?").run(attempt.order_id);
        const affectedServices = trx.prepare(`
          SELECT id, external_id, provider_type FROM services
          WHERE account_id = ? AND order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)
        `).all(attempt.account_id, attempt.order_id) as Array<{ id: string; external_id: string | null; provider_type: string }>;

        for (const svc of affectedServices) {
          trx.prepare("UPDATE services SET contract_status = 'TERMINATED' WHERE id = ?").run(svc.id);
          trx.prepare("UPDATE service_observed_states SET runtime_state = 'STOPPED' WHERE service_id = ?").run(svc.id);
          trx.prepare(`
            INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
            VALUES (?, 'service.terminate.v1', 'service', ?, ?, 'PENDING')
          `).run(generateId('obx'), svc.id, JSON.stringify({ serviceId: svc.id, providerType: svc.provider_type, externalId: svc.external_id, reason: 'REFUND' }));
        }
      }

      trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);

      trx.prepare(`
        INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, ?, 'PSP_WEBHOOK', 'payment.refunded', 'invoice', ?, ?, ?)
      `).run(generateId('aud'), attempt.account_id, attempt.invoice_id, eventId, JSON.stringify({ amountRefunded, creditNoteNumber }));
    }, db);

    return { status: 'PROCESSED', eventId, orderId: attempt.order_id };
  }

  // 3. Handle Charge Dispute Created
  if (eventType === 'charge.dispute.created') {
    const rawObj = payload.data.object as Record<string, any>;
    const chargeId = rawObj.charge;
    const paymentIntentId = rawObj.payment_intent;

    const attempt = db.prepare(`
      SELECT pa.*, i.account_id, i.order_id
      FROM payment_attempts pa
      JOIN invoices i ON i.id = pa.invoice_id
      WHERE pa.psp_payment_intent_id = ? OR pa.psp_session_id = ? OR pa.id = ?
    `).get(paymentIntentId || chargeId, paymentIntentId || chargeId, paymentIntentId || chargeId) as {
      id: string;
      account_id: string;
      order_id: string;
    } | undefined;

    if (attempt) {
      runInTransaction((trx) => {
        trx.prepare("UPDATE accounts SET status = 'FLAGGED_FRAUD', updated_at = datetime('now', 'utc') WHERE id = ?").run(attempt.account_id);
        const affectedServices = trx.prepare(`
          SELECT id, external_id, provider_type FROM services
          WHERE account_id = ?
        `).all(attempt.account_id) as Array<{ id: string; external_id: string | null; provider_type: string }>;

        for (const svc of affectedServices) {
          trx.prepare("UPDATE services SET contract_status = 'SUSPENDED', suspension_reason = 'DISPUTE' WHERE id = ? AND contract_status != 'TERMINATED'").run(svc.id);
          trx.prepare(`
            INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
            VALUES (?, 'service.suspend.v1', 'service', ?, ?, 'PENDING')
          `).run(generateId('obx'), svc.id, JSON.stringify({ serviceId: svc.id, providerType: svc.provider_type, externalId: svc.external_id, reason: 'CHARGE_DISPUTE' }));
        }

        trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
        trx.prepare(`
          INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
          VALUES (?, ?, 'PSP_WEBHOOK', 'payment.disputed', 'account', ?, ?, ?)
        `).run(generateId('aud'), attempt.account_id, attempt.account_id, eventId, JSON.stringify({ disputeId: rawObj.id }));
      }, db);
    } else {
      db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    }
    return { status: 'PROCESSED', eventId };
  }

  // Handle Stripe Subscription auto-renewal lifecycle
  if (eventType === 'invoice.paid') {
    const rawInv = payload.data.object as Record<string, any>;
    const subId = rawInv.subscription as string | undefined;
    if (subId) {
      runInTransaction((trx) => {
        const periodStart = rawInv.lines?.data?.[0]?.period?.start
          ? new Date(rawInv.lines.data[0].period.start * 1000).toISOString()
          : new Date().toISOString();
        const periodEnd = rawInv.lines?.data?.[0]?.period?.end
          ? new Date(rawInv.lines.data[0].period.end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        trx.prepare(`
          UPDATE subscriptions
          SET status = 'ACTIVE',
              grace_period_end = NULL,
              dunning_attempts = 0,
              current_period_start = ?,
              current_period_end = ?,
              next_renewal_date = ?,
              updated_at = datetime('now', 'utc')
          WHERE psp_subscription_id = ?
        `).run(periodStart, periodEnd, periodEnd, subId);

        const sub = trx.prepare('SELECT account_id, service_id FROM subscriptions WHERE psp_subscription_id = ?').get(subId) as { account_id: string; service_id?: string } | undefined;
        if (sub) {
          // NEW-330: settle only an issued invoice that belongs to this subscription (and matches the amount paid).
          //          The first invoice of a subscription is settled by the checkout event, never here.
          const stripeInvoiceId = typeof rawInv.id === 'string' ? rawInv.id : null;
          const amountPaid = Number(rawInv.amount_paid);
          if (rawInv.billing_reason !== 'subscription_create') {
            const matchingInvoice = trx.prepare(`
              SELECT id, total_minor_units FROM invoices
              WHERE subscription_id = (SELECT id FROM subscriptions WHERE psp_subscription_id = ?) AND status = 'ISSUED'
              ORDER BY created_at ASC LIMIT 1
            `).get(subId) as { id: string; total_minor_units: number } | undefined;
            if (matchingInvoice && Number.isFinite(amountPaid) && amountPaid === matchingInvoice.total_minor_units) {
              trx.prepare("UPDATE invoices SET status = 'PAID', paid_at = datetime('now', 'utc'), amount_paid_minor_units = ?, psp_invoice_id = COALESCE(psp_invoice_id, ?) WHERE id = ?")
                .run(amountPaid, stripeInvoiceId, matchingInvoice.id);
            } else {
              trx.prepare(`
                INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
                VALUES (?, ?, 'PSP_WEBHOOK', 'billing.invoice_paid_unmatched', 'subscription', ?, ?, ?)
              `).run(generateId('aud'), sub.account_id, subId, eventId, JSON.stringify({ stripeInvoiceId, amountPaid: Number.isFinite(amountPaid) ? amountPaid : null }));
            }
          }

          // NEW-336: Unsuspend service if it was suspended due to billing dunning
          if (sub.service_id) {
            const svc = trx.prepare('SELECT id, contract_status, suspension_reason FROM services WHERE id = ?').get(sub.service_id) as { id: string; contract_status: string; suspension_reason: string | null } | undefined;
            if (svc && svc.contract_status === 'SUSPENDED' && svc.suspension_reason === 'BILLING') {
              trx.prepare("UPDATE services SET contract_status = 'ACTIVE', suspension_reason = NULL, updated_at = datetime('now', 'utc') WHERE id = ?").run(svc.id);
              trx.prepare("UPDATE service_observed_states SET runtime_state = 'STOPPED' WHERE service_id = ?").run(svc.id);
              trx.prepare(`
                INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
                VALUES (?, 'service.unsuspend.v1', 'service', ?, ?, 'PENDING')
              `).run(
                generateId('obx'),
                svc.id,
                JSON.stringify({
                  serviceId: svc.id,
                  reason: 'Renewal invoice settled successfully',
                  actorType: 'SYSTEM',
                })
              );
            }
          }
        }
        trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
      }, db);
      return { status: 'PROCESSED', eventId };
    }
  }

  if (eventType === 'invoice.payment_failed') {
    const rawInv = payload.data.object as Record<string, any>;
    const subId = rawInv.subscription as string | undefined;
    if (subId) {
      runInTransaction((trx) => {
        const graceEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        trx.prepare(`
          UPDATE subscriptions
          SET status = 'PAST_DUE',
              grace_period_end = CASE WHEN status = 'PAST_DUE' AND grace_period_end IS NOT NULL THEN grace_period_end ELSE ? END,
              dunning_attempts = dunning_attempts + 1,
              last_dunning_at = datetime('now', 'utc'),
              updated_at = datetime('now', 'utc')
          WHERE psp_subscription_id = ?
        `).run(graceEnd, subId);
        trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
      }, db);
      return { status: 'PROCESSED', eventId };
    }
  }

  if (eventType === 'customer.subscription.deleted') {
    const rawSub = payload.data.object as Record<string, any>;
    const subId = rawSub.id;
    if (subId) {
      runInTransaction((trx) => {
        const sub = trx.prepare('SELECT id, service_id, account_id FROM subscriptions WHERE psp_subscription_id = ?').get(subId) as { id: string; service_id: string; account_id: string } | undefined;
        if (sub) {
          trx.prepare("UPDATE subscriptions SET status = 'CANCELED', updated_at = datetime('now', 'utc') WHERE id = ?").run(sub.id);
          trx.prepare("UPDATE services SET contract_status = 'TERMINATED' WHERE id = ?").run(sub.service_id);
          trx.prepare("UPDATE service_observed_states SET runtime_state = 'STOPPED' WHERE service_id = ?").run(sub.service_id);
          trx.prepare(`
            INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
            VALUES (?, 'service.terminate.v1', 'service', ?, ?, 'PENDING')
          `).run(generateId('obx'), sub.service_id, JSON.stringify({ serviceId: sub.service_id, reason: 'STRIPE_SUBSCRIPTION_CANCELLED' }));
        }
        trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
      }, db);
      return { status: 'PROCESSED', eventId };
    }
  }

  // NEW-341: an abandoned checkout must not hold a coupon redemption, an order or an open invoice forever.
  if (eventType === 'checkout.session.expired') {
    const raw = payload.data.object as Record<string, any>;
    const attemptId = raw.metadata?.paymentAttemptId as string | undefined;
    const attempt = attemptId
      ? db.prepare(`
          SELECT pa.id, pa.invoice_id, i.order_id FROM payment_attempts pa JOIN invoices i ON i.id = pa.invoice_id
          WHERE (pa.id = ? OR pa.psp_session_id = ?) AND pa.status IN ('CREATED', 'REQUIRES_ACTION')
        `).get(attemptId, raw.id) as { id: string; invoice_id: string; order_id: string } | undefined
      : undefined;
    runInTransaction((trx) => {
      if (attempt) {
        cancelCouponRedemptionAtomic(attempt.order_id, trx);
        trx.prepare("UPDATE orders SET status = 'CANCELED', idempotency_key = idempotency_key || '#expired_' || id, updated_at = datetime('now', 'utc') WHERE id = ? AND status = 'AWAITING_PAYMENT'").run(attempt.order_id);
        trx.prepare("UPDATE invoices SET status = 'VOIDED' WHERE id = ? AND status IN ('DRAFT', 'ISSUED')").run(attempt.invoice_id);
        trx.prepare("UPDATE payment_attempts SET status = 'CANCELED', idempotency_key = idempotency_key || '#expired_' || id WHERE id = ?").run(attempt.id);
      }
      trx.prepare("UPDATE psp_inbox_events SET status = ?, processed_at = datetime('now', 'utc') WHERE event_id = ?").run(attempt ? 'PROCESSED' : 'IGNORED', eventId);
    }, db);
    return { status: attempt ? 'PROCESSED' : 'IGNORED', eventId };
  }

  // We are interested in payment intent successes and checkout completions
  if (eventType !== 'payment_intent.succeeded' && eventType !== 'checkout.session.completed' && eventType !== 'checkout.session.async_payment_succeeded') {
    db.prepare("UPDATE psp_inbox_events SET status = 'IGNORED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'IGNORED', eventId };
  }

  const paymentObj = payload.data.object;
  // If checkout.session.completed, ensure payment_status is 'paid'
  const rawSession = paymentObj as Record<string, unknown>;
  if (eventType === 'checkout.session.completed' && rawSession['payment_status'] && rawSession['payment_status'] !== 'paid') {
    db.prepare("UPDATE psp_inbox_events SET status = 'IGNORED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'IGNORED', eventId };
  }

  // Handle Stripe re-subscription checkout for reactivating a canceled subscription
  const meta = (paymentObj.metadata || {}) as Record<string, string | undefined>;
  if (eventType === 'checkout.session.completed' && meta.isReactivation === 'true' && meta.subscriptionId) {
    const subId = meta.subscriptionId;
    const pspSubId = (paymentObj as Record<string, any>)['subscription'] as string | undefined;
    runInTransaction((trx) => {
      // NEW-353: the new period follows the subscription's own billing interval, not a fixed 30 days.
      const now = new Date();
      const interval = (trx.prepare('SELECT billing_interval FROM subscriptions WHERE id = ?').get(subId) as { billing_interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' } | undefined)?.billing_interval ?? 'MONTHLY';
      const nextMonth = new Date(calculateNextPeriod(now.toISOString(), interval).periodEnd);
      trx.prepare(`
        UPDATE subscriptions
        SET status = 'ACTIVE',
            psp_subscription_id = COALESCE(?, psp_subscription_id),
            auto_renew = 1,
            grace_period_end = NULL,
            dunning_attempts = 0,
            current_period_start = ?,
            current_period_end = ?,
            next_renewal_date = ?,
            updated_at = datetime('now', 'utc')
        WHERE id = ?
      `).run(pspSubId || null, now.toISOString(), nextMonth.toISOString(), nextMonth.toISOString(), subId);

      const sub = trx.prepare('SELECT service_id, account_id FROM subscriptions WHERE id = ?').get(subId) as { service_id: string; account_id: string } | undefined;
      const targetStatus = sub?.service_id
        ? (trx.prepare('SELECT contract_status FROM services WHERE id = ?').get(sub.service_id) as { contract_status: string } | undefined)?.contract_status
        : undefined;
      if (sub?.service_id && targetStatus === 'TERMINATED') {
        // NEW-352: money arrived for a service that no longer exists; never pretend it was restored. Staff must refund.
        trx.prepare(`
          INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
          VALUES (?, ?, 'PSP_WEBHOOK', 'billing.reactivation_payment_for_terminated_service', 'subscription', ?, ?, ?)
        `).run(generateId('aud'), sub.account_id, subId, eventId, JSON.stringify({ serviceId: sub.service_id }));
      } else if (sub?.service_id) {
        trx.prepare("UPDATE services SET contract_status = 'ACTIVE', updated_at = datetime('now', 'utc') WHERE id = ?").run(sub.service_id);
        trx.prepare("UPDATE service_observed_states SET runtime_state = 'STOPPED' WHERE service_id = ?").run(sub.service_id);
        trx.prepare(`
          INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
          VALUES (?, 'service.unsuspend.v1', 'service', ?, ?, 'PENDING')
        `).run(
          generateId('obx'),
          sub.service_id,
          JSON.stringify({
            serviceId: sub.service_id,
            reason: 'Subscription reactivated via Stripe re-subscription',
            actorType: 'SYSTEM',
          })
        );
      }
      trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    }, db);
    return { status: 'PROCESSED', eventId };
  }

  const paymentAttemptId = paymentObj.metadata?.paymentAttemptId || paymentObj.id;
  const expectedOrderId = paymentObj.metadata?.orderId;

  // 4. Lookup Payment Attempt & Order
  const attemptRow = db.prepare(`
    SELECT pa.*, i.order_id, i.account_id, o.status as order_status, o.total_minor_units as order_total
    FROM payment_attempts pa
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN orders o ON o.id = i.order_id
    WHERE pa.id = ? OR pa.psp_session_id = ? OR pa.psp_payment_intent_id = ?
  `).get(paymentAttemptId, paymentAttemptId, paymentAttemptId) as ({
    id: string;
    invoice_id: string;
    amount_minor_units: number;
    currency: string;
    order_id: string;
    account_id: string;
    order_status: string;
    order_total: number;
    status: string;
  }) | undefined;

  if (!attemptRow) {
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'ANOMALY_HELD', eventId };
  }

  // Deduplication guard: if already settled and fulfilled, acknowledge cleanly without re-executing
  if (attemptRow.status === 'SUCCEEDED' || attemptRow.order_status === 'PAID' || attemptRow.order_status === 'COMPLETED') {
    db.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'PROCESSED', eventId, orderId: attemptRow.order_id };
  }

  // Verify order linkage if provided
  if (expectedOrderId && attemptRow.order_id !== expectedOrderId) {
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'ANOMALY_HELD', eventId, orderId: attemptRow.order_id };
  }

  // Amount & Currency Verification
  // checkout.session.completed uses amount_total; payment_intent.succeeded uses amount
  const effectiveAmount = (paymentObj as Record<string, any>)['amount_total'] ?? paymentObj.amount;
  const effectiveCurrency = ((paymentObj as Record<string, any>)['currency'] as string | undefined) ?? '';
  if (effectiveAmount !== attemptRow.amount_minor_units || effectiveCurrency.toUpperCase() !== attemptRow.currency.toUpperCase()) {
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'ANOMALY_HELD', eventId, orderId: attemptRow.order_id };
  }

  // 5. Atomic State Settlement
  runInTransaction((trx) => {
    // 5a. Update Payment Attempt and persist Stripe identifiers
    const pspPiId = (paymentObj as Record<string, any>)['payment_intent'] || (paymentObj.id.startsWith('pi_') ? paymentObj.id : null);
    if (pspPiId) {
      trx.prepare("UPDATE payment_attempts SET status = 'SUCCEEDED', psp_payment_intent_id = ? WHERE id = ?").run(pspPiId, attemptRow.id);
    } else {
      trx.prepare("UPDATE payment_attempts SET status = 'SUCCEEDED' WHERE id = ?").run(attemptRow.id);
    }

    // 5b. Mark Invoice PAID & Allocate Sequential Number
    markInvoicePaid(attemptRow.invoice_id, effectiveAmount, trx);

    // 5c. Update Order Status
    trx.prepare("UPDATE orders SET status = 'PAID', updated_at = datetime('now', 'utc') WHERE id = ?").run(attemptRow.order_id);

    // 5d. Find order items and create service records + outbox events
    const items = trx.prepare('SELECT * FROM order_items WHERE order_id = ?').all(attemptRow.order_id) as ({
      id: string;
      plan_version_id: string;
      region_id: string;
      custom_options: string;
    })[];

    const pspSubId = (paymentObj as Record<string, any>)['subscription'];

    for (const item of items) {
      const planVersion = trx.prepare(`
        SELECT resource_specs FROM plan_versions WHERE id = ?
      `).get(item.plan_version_id) as { resource_specs: string };
      const desired = JSON.parse(planVersion.resource_specs) as {
        cpuPct: number;
        memoryMb: number;
        diskMb: number;
      };

      const itemRegion = item.region_id || 'reg_fra_1';
      const node = pickNodeForService(trx, itemRegion, desired.memoryMb, desired.diskMb);

      if (!node) {
        throw new Error(`No available node found in region ${itemRegion}`);
      }
      const assignedNodeId = node.id;

      const serviceId = generateId('svc');

      const productRow = trx.prepare(`
        SELECT p.provider_type
        FROM plan_versions pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ?
      `).get(item.plan_version_id) as { provider_type: 'PTERODACTYL' | 'CPANEL' | 'REGISTRAR' | 'VPS' } | undefined;
      const providerType = productRow?.provider_type || 'PTERODACTYL';
      const providerInstance = providerType === 'CPANEL' ? 'cpanel_primary' : providerType === 'VPS' ? 'proxmox_primary' : 'pterodactyl_primary';

      trx.prepare(`
        INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id)
        VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(serviceId, attemptRow.account_id, item.id, providerType, providerInstance, assignedNodeId);

      trx.prepare(`
        INSERT INTO service_desired_configs
          (service_id, plan_version_id, cpu_limit_pct, memory_limit_mb, disk_limit_mb, environment_variables)
        VALUES (?, ?, ?, ?, ?, '{}')
      `).run(serviceId, item.plan_version_id, desired.cpuPct, desired.memoryMb, desired.diskMb);

      trx.prepare('UPDATE order_items SET service_id = ? WHERE id = ?').run(serviceId, item.id);

      // Create initial observed state
      trx.prepare(`
        INSERT INTO service_observed_states (service_id, runtime_state)
        VALUES (?, 'INSTALLING')
      `).run(serviceId);

      // Ingest Stripe subscription if present (NEW-338)
      if (pspSubId) {
        let itemInterval = 'MONTHLY';
        let recurringMinor: number | null = null;
        try {
          const parsed = JSON.parse(item.custom_options || '{}');
          if (parsed.interval) itemInterval = parsed.interval;
          if (Number.isInteger(parsed.recurringMinorUnits) && parsed.recurringMinorUnits >= 0) recurringMinor = parsed.recurringMinorUnits;
        } catch {
          // ignore
        }
        const billingInterval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' = itemInterval === 'ANNUAL' || itemInterval === 'ANNUALLY' ? 'ANNUAL' : itemInterval === 'QUARTERLY' ? 'QUARTERLY' : itemInterval === 'SEMI_ANNUAL' ? 'SEMI_ANNUAL' : 'MONTHLY';
        const subId = generateId('sub');
        const now = new Date();
        const nextPeriod = new Date(calculateNextPeriod(now.toISOString(), billingInterval).periodEnd);
        // NEW-338: each service is renewed at its own recurring price, never at the order total (which includes setup fee, discount and tax).
        const renewalPrice = recurringMinor ?? (items.length === 1 ? attemptRow.amount_minor_units : Math.round(attemptRow.amount_minor_units / items.length));

        trx.prepare(`
          INSERT INTO subscriptions (
            id, account_id, service_id, psp_subscription_id, status, billing_interval,
            current_period_start, current_period_end, next_renewal_date,
            renewal_price_minor_units, currency, auto_renew
          ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(service_id) DO UPDATE SET psp_subscription_id = excluded.psp_subscription_id, status = 'ACTIVE'
        `).run(
          subId,
          attemptRow.account_id,
          serviceId,
          pspSubId,
          billingInterval,
          now.toISOString(),
          nextPeriod.toISOString(),
          nextPeriod.toISOString(),
          renewalPrice,
          attemptRow.currency
        );
      }

      // Enqueue Provisioning Saga in Outbox
      const outboxId = generateId('obx');
      const payloadData = {
        serviceId,
        accountId: attemptRow.account_id,
        orderItemId: item.id,
        planVersionId: item.plan_version_id,
        nodeId: assignedNodeId,
        providerType,
        customOptions: JSON.parse(item.custom_options),
      };

      trx.prepare(`
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
        VALUES (?, 'service.provision.v1', 'service', ?, ?, 'PENDING')
      `).run(outboxId, serviceId, JSON.stringify(payloadData));
    }

    // 5e. Mark Inbox Event Processed
    trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);

    // 5f. Record Audit
    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id)
      VALUES (?, ?, 'PSP_WEBHOOK', 'order.paid', 'order', ?, ?)
    `).run(generateId('aud'), attemptRow.account_id, attemptRow.order_id, eventId);

    // 5g. Send Payment Confirmation Email & In-App Notification
    const account = trx.prepare('SELECT billing_email FROM accounts WHERE id = ?').get(attemptRow.account_id) as { billing_email: string } | undefined;
    const invoice = trx.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(attemptRow.invoice_id) as { invoice_number: string } | undefined;
    const invNumber = invoice?.invoice_number || 'INV-PAID';
    const effectiveAmountMinor = effectiveAmount ?? attemptRow.amount_minor_units;
    const effectiveCurrency = (paymentObj.currency || attemptRow.currency || 'EUR').toUpperCase();
    const formattedAmount = `${(effectiveAmountMinor / 100).toFixed(2)} ${effectiveCurrency}`;

    if (account?.billing_email) {
      queueEmail(trx, {
        recipient: account.billing_email,
        template: 'payment_confirmed',
        payload: {
          invoiceNumber: invNumber,
          amount: formattedAmount,
          serviceName: 'Fortless Cloud Hosting',
        },
      });
    }

    createNotification({
      accountId: attemptRow.account_id,
      type: 'PAYMENT_SUCCESS',
      title: 'Payment Confirmed',
      message: `Invoice #${invNumber} for ${formattedAmount} was settled successfully.`,
      linkUrl: '/app/billing',
    }, trx);
  }, db);

  return { status: 'PROCESSED', eventId, orderId: attemptRow.order_id };
}

export function processStaffRefund(
  data: {
    invoiceId: string;
    amountMinorUnits: number;
    reason: string;
    staffUserId: string;
    ipAddress: string;
  },
  db: Database.Database = getDatabase()
): { creditNoteNumber: string; refundedAmount: number; pspRefund: 'REQUESTED' | 'NOT_REQUIRED'; refundId: string | null } {
  return runInTransaction((trx) => {
    const invoice = trx.prepare('SELECT id, account_id, order_id, total_minor_units, amount_paid_minor_units, status FROM invoices WHERE id = ?').get(data.invoiceId) as {
      id: string;
      account_id: string;
      order_id: string | null;
      total_minor_units: number;
      amount_paid_minor_units: number;
      status: string;
    } | undefined;

    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status !== 'PAID') throw new Error('Only paid invoices can be refunded.');
    if (data.amountMinorUnits <= 0) throw new Error('Refund amount must be positive.');
    if (data.amountMinorUnits > invoice.amount_paid_minor_units) throw new Error('Refund amount exceeds amount paid.');

    const creditNoteNumber = getNextCreditNoteNumber(undefined, trx);
    const newPaidAmount = invoice.amount_paid_minor_units - data.amountMinorUnits;
    const isFullRefund = newPaidAmount === 0;

    trx.prepare(`
      UPDATE invoices
      SET status = ?, amount_paid_minor_units = ?
      WHERE id = ?
    `).run(isFullRefund ? 'CREDITED' : 'PAID', newPaidAmount, data.invoiceId);

    if (invoice.order_id && isFullRefund) {
      trx.prepare("UPDATE orders SET status = 'CANCELED', updated_at = datetime('now', 'utc') WHERE id = ?").run(invoice.order_id);
      trx.prepare("UPDATE services SET contract_status = 'TERMINATED' WHERE account_id = ? AND order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)")
        .run(invoice.account_id, invoice.order_id);

      // NEW-334: Enqueue service.terminate.v1 outbox events to decommission remote resources
      const affectedServices = trx.prepare(`
        SELECT id FROM services WHERE account_id = ? AND order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)
      `).all(invoice.account_id, invoice.order_id) as { id: string }[];

      for (const s of affectedServices) {
        trx.prepare(`
          INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
          VALUES (?, 'service.terminate.v1', 'service', ?, ?, 'PENDING')
        `).run(
          generateId('obx'),
          s.id,
          JSON.stringify({
            serviceId: s.id,
            reason: `Full staff refund issued for invoice ${data.invoiceId}`,
            actorType: 'STAFF',
            actorUserId: data.staffUserId,
          })
        );
      }
    }

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'payment.staff_refund', 'invoice', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      invoice.account_id,
      data.staffUserId,
      data.invoiceId,
      data.ipAddress,
      generateId('cor'),
      JSON.stringify({ amount: data.amountMinorUnits, reason: data.reason, creditNoteNumber })
    );

    // NEW-334: the money has to go back through the PSP. The refund request is committed with the ledger entry
    // and executed by the outbox worker with an idempotency key, so a crash or retry never refunds twice.
    const attempt = trx.prepare(`
      SELECT id, psp_name FROM payment_attempts
      WHERE invoice_id = ? AND status = 'SUCCEEDED' AND amount_minor_units > 0
      ORDER BY created_at DESC LIMIT 1
    `).get(data.invoiceId) as { id: string; psp_name: string } | undefined;
    let refundId: string | null = null;
    if (attempt && attempt.psp_name === 'stripe') {
      refundId = generateId('rfd');
      trx.prepare("INSERT INTO refunds (id, payment_attempt_id, amount_minor_units, reason, status) VALUES (?, ?, ?, ?, 'REQUESTED')")
        .run(refundId, attempt.id, data.amountMinorUnits, data.reason);
      trx.prepare(`
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
        VALUES (?, 'stripe.refund.create.v1', 'refund', ?, ?, 'PENDING')
      `).run(generateId('obx'), refundId, JSON.stringify({ refundId, paymentAttemptId: attempt.id, invoiceId: data.invoiceId, amountMinorUnits: data.amountMinorUnits }));
    }

    return { creditNoteNumber, refundedAmount: data.amountMinorUnits, pspRefund: refundId ? 'REQUESTED' : 'NOT_REQUIRED', refundId };
  }, db);
}
