import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { generateId } from '../identity/auth.js';
import { markInvoicePaid } from '../invoicing/invoicing.js';

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

  // We are interested in payment intent successes
  if (eventType !== 'payment_intent.succeeded' && eventType !== 'checkout.session.completed') {
    db.prepare("UPDATE psp_inbox_events SET status = 'IGNORED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'IGNORED', eventId };
  }

  const paymentObj = payload.data.object;
  const paymentAttemptId = paymentObj.metadata?.paymentAttemptId || paymentObj.id;
  const expectedOrderId = paymentObj.metadata?.orderId;

  // 2. Lookup Payment Attempt & Order
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
  if (paymentObj.amount !== attemptRow.amount_minor_units || paymentObj.currency.toUpperCase() !== attemptRow.currency.toUpperCase()) {
    db.prepare("UPDATE psp_inbox_events SET status = 'ANOMALY', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);
    return { status: 'ANOMALY_HELD', eventId, orderId: attemptRow.order_id };
  }

  // 3. Atomic State Settlement
  runInTransaction((trx) => {
    // 3a. Update Payment Attempt
    trx.prepare("UPDATE payment_attempts SET status = 'SUCCEEDED' WHERE id = ?").run(attemptRow.id);

    // 3b. Mark Invoice PAID & Allocate Sequential Number
    markInvoicePaid(attemptRow.invoice_id, paymentObj.amount, trx);

    // 3c. Update Order Status
    trx.prepare("UPDATE orders SET status = 'PAID', updated_at = datetime('now', 'utc') WHERE id = ?").run(attemptRow.order_id);

    // 3d. Find order items and create service records + outbox events
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

    // 3e. Mark Inbox Event Processed
    trx.prepare("UPDATE psp_inbox_events SET status = 'PROCESSED', processed_at = datetime('now', 'utc') WHERE event_id = ?").run(eventId);

    // 3f. Record Audit
    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id)
      VALUES (?, ?, 'PSP_WEBHOOK', 'order.paid', 'order', ?, ?)
    `).run(generateId('aud'), attemptRow.account_id, attemptRow.order_id, eventId);
  }, db);

  return { status: 'PROCESSED', eventId, orderId: attemptRow.order_id };
}
