import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { generateId } from '../identity/auth.js';
import { markInvoicePaid, getNextCreditNoteNumber } from '../invoicing/invoicing.js';
import { queueEmail } from '../email/outbox.js';
import { createNotification } from '../notifications/notifications.js';

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

  // 1. Inbox Deduplication Gate
  const existing = db.prepare(`
    SELECT status, payload_digest FROM psp_inbox_events
    WHERE psp_name = ? AND merchant_account = ? AND event_id = ?
  `).get(pspName, merchantAccount, eventId) as ({ status: string; payload_digest: string }) | undefined;

  if (existing) {
    return { status: 'DEDUPLICATED', eventId };
  }

  // Persist raw event to Inbox
  db.prepare(`
    INSERT INTO psp_inbox_events (id, psp_name, merchant_account, event_id, event_type, payload_digest, payload, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEIVED')
  `).run(generateId('inb'), pspName, merchantAccount, eventId, eventType, payloadDigest, rawBody);

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
      WHERE pa.psp_session_id = ? OR pa.id = ?
    `).get(paymentIntentId || chargeId, paymentIntentId || chargeId) as {
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

    runInTransaction((trx) => {
      const creditNoteNumber = getNextCreditNoteNumber(undefined, trx);
      const isFullRefund = amountRefunded >= attempt.total_minor_units;

      trx.prepare(`
        UPDATE invoices
        SET status = ?, amount_paid_minor_units = max(0, amount_paid_minor_units - ?)
        WHERE id = ?
      `).run(isFullRefund ? 'CREDITED' : 'PAID', amountRefunded, attempt.invoice_id);

      trx.prepare("UPDATE payment_attempts SET status = 'CANCELED' WHERE id = ?").run(attempt.id);

      if (isFullRefund) {
        trx.prepare("UPDATE orders SET status = 'CANCELED', updated_at = datetime('now', 'utc') WHERE id = ?").run(attempt.order_id);
        trx.prepare("UPDATE services SET contract_status = 'TERMINATED' WHERE account_id = ? AND order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)")
          .run(attempt.account_id, attempt.order_id);
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
      WHERE pa.psp_session_id = ? OR pa.id = ?
    `).get(paymentIntentId || chargeId, paymentIntentId || chargeId) as {
      id: string;
      account_id: string;
      order_id: string;
    } | undefined;

    if (attempt) {
      runInTransaction((trx) => {
        trx.prepare("UPDATE accounts SET status = 'FLAGGED_FRAUD', updated_at = datetime('now', 'utc') WHERE id = ?").run(attempt.account_id);
        trx.prepare("UPDATE services SET contract_status = 'SUSPENDED' WHERE account_id = ?").run(attempt.account_id);
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

  const paymentAttemptId = paymentObj.metadata?.paymentAttemptId || paymentObj.id;
  const expectedOrderId = paymentObj.metadata?.orderId;

  // 4. Lookup Payment Attempt & Order
  const attemptRow = db.prepare(`
    SELECT pa.*, i.order_id, i.account_id, o.status as order_status, o.total_minor_units as order_total
    FROM payment_attempts pa
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN orders o ON o.id = i.order_id
    WHERE pa.id = ? OR pa.psp_session_id = ?
  `).get(paymentAttemptId, paymentAttemptId) as ({
    id: string;
    invoice_id: string;
    amount_minor_units: number;
    currency: string;
    order_id: string;
    account_id: string;
    order_status: string;
    order_total: number;
  }) | undefined;

  if (!attemptRow) {
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'ANOMALY_HELD', eventId };
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
    // 5a. Update Payment Attempt
    trx.prepare("UPDATE payment_attempts SET status = 'SUCCEEDED' WHERE id = ?").run(attemptRow.id);

    // 5b. Mark Invoice PAID & Allocate Sequential Number
    markInvoicePaid(attemptRow.invoice_id, paymentObj.amount, trx);

    // 5c. Update Order Status
    trx.prepare("UPDATE orders SET status = 'PAID', updated_at = datetime('now', 'utc') WHERE id = ?").run(attemptRow.order_id);

    // 5d. Find order items and create service records + outbox events
    const items = trx.prepare('SELECT * FROM order_items WHERE order_id = ?').all(attemptRow.order_id) as ({
      id: string;
      plan_version_id: string;
      region_id: string;
      custom_options: string;
    })[];

    // Select suitable node in region
    const node = trx.prepare(`
      SELECT id FROM nodes
      WHERE region_id = ? AND maintenance_mode = 0
      ORDER BY allocated_memory_mb ASC
      LIMIT 1
    `).get(items[0]?.region_id || 'reg_fra_1') as { id: string } | undefined;

    const assignedNodeId = node ? node.id : 'node_fra_01';

    for (const item of items) {
      const serviceId = generateId('svc');

      trx.prepare(`
        INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id)
        VALUES (?, ?, ?, 'PTERODACTYL', 'pterodactyl_primary', 'ACTIVE', ?)
      `).run(serviceId, attemptRow.account_id, item.id, assignedNodeId);

      const planVersion = trx.prepare(`
        SELECT resource_specs FROM plan_versions WHERE id = ?
      `).get(item.plan_version_id) as { resource_specs: string };
      const desired = JSON.parse(planVersion.resource_specs) as {
        cpuPct: number;
        memoryMb: number;
        diskMb: number;
      };

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

      // Enqueue Provisioning Saga in Outbox
      const outboxId = generateId('obx');
      const payloadData = {
        serviceId,
        accountId: attemptRow.account_id,
        orderItemId: item.id,
        planVersionId: item.plan_version_id,
        nodeId: assignedNodeId,
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
    const formattedAmount = `${(paymentObj.amount / 100).toFixed(2)} ${paymentObj.currency.toUpperCase()}`;

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
): { creditNoteNumber: string; refundedAmount: number } {
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

    return { creditNoteNumber, refundedAmount: data.amountMinorUnits };
  }, db);
}
