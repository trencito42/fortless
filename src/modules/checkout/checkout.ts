import crypto from 'node:crypto';
import Stripe from 'stripe';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { generateId } from '../identity/auth.js';
import { pickNodeForService } from '../provisioning/placement.js';
import { verifyQuote } from '../pricing/quote.js';
import { redeemCouponAtomic, cancelCouponRedemptionAtomic } from '../catalog/catalog.js';
import { createNotification } from '../notifications/notifications.js';
import { queueEmail } from '../email/outbox.js';

export interface CheckoutResult {
  orderId: string;
  invoiceId: string;
  paymentAttemptId: string;
  checkoutUrl: string | null;
  isIdempotentReplay?: boolean;
}

export type CheckoutIntentStatus =
  | { status: 'NOT_FOUND' | 'IN_PROGRESS' | 'FAILED' }
  | { status: 'COMPLETED'; result: CheckoutResult };

export function getCheckoutIntentStatus(accountId: string, idempotencyKey: string, db: Database.Database = getDatabase()): CheckoutIntentStatus {
  const row = db.prepare(`SELECT status, response_payload FROM idempotency_records
    WHERE account_id = ? AND scope = 'checkout' AND idempotency_key = ?`).get(accountId, idempotencyKey) as
    { status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; response_payload: string | null } | undefined;
  if (!row) return { status: 'NOT_FOUND' };
  if (row.status === 'COMPLETED' && row.response_payload) return { status: 'COMPLETED', result: JSON.parse(row.response_payload) as CheckoutResult };
  return { status: row.status === 'COMPLETED' ? 'FAILED' : row.status };
}

export function assertTrustedCheckoutUrl(raw: string): string {
  const parsed = new URL(raw, config.APP_ORIGIN);
  const allowed = new Set([new URL(config.APP_ORIGIN).origin, ...config.CHECKOUT_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)]);
  if (!['http:', 'https:'].includes(parsed.protocol) || !allowed.has(parsed.origin)) {
    throw new Error('Payment provider returned an untrusted checkout URL.');
  }
  return parsed.toString();
}

export async function processCheckout(
  data: {
    accountId: string;
    quoteId: string;
    idempotencyKey: string;
    regionId: string;
    customOptions?: Record<string, unknown>;
  },
  db: Database.Database = getDatabase()
): Promise<CheckoutResult> {
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({
    accountId: data.accountId,
    quoteId: data.quoteId,
    regionId: data.regionId,
    customOptions: data.customOptions || {},
  })).digest('hex');

  // 1. Check Idempotency Record
  const existingRecord = db.prepare(`
    SELECT status, response_payload, request_hash
    FROM idempotency_records
    WHERE account_id = ? AND scope = 'checkout' AND idempotency_key = ?
  `).get(data.accountId, data.idempotencyKey) as ({
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    response_payload: string | null;
    request_hash: string;
  }) | undefined;

  if (existingRecord) {
    if (existingRecord.request_hash !== requestHash) {
      throw new Error('Idempotency key was previously used with a different request payload.');
    }
    if (existingRecord.status === 'COMPLETED' && existingRecord.response_payload) {
      const parsed = JSON.parse(existingRecord.response_payload) as CheckoutResult;
      return { ...parsed, isIdempotentReplay: true };
    }
    if (existingRecord.status === 'IN_PROGRESS') {
      throw new Error('A checkout attempt with this idempotency key is already currently processing.');
    }
  }

  // Register in-progress idempotency
  db.prepare(`
    INSERT INTO idempotency_records (account_id, scope, idempotency_key, request_hash, status, expires_at)
    VALUES (?, 'checkout', ?, ?, 'IN_PROGRESS', datetime('now', '+24 hours'))
    ON CONFLICT(account_id, scope, idempotency_key) DO UPDATE SET status = 'IN_PROGRESS'
  `).run(data.accountId, data.idempotencyKey, requestHash);

  let txResult: {
    orderId: string;
    invoiceId: string;
    paymentAttemptId: string;
    totalMinorUnits: number;
    currency: string;
    planName: string;
    billingInterval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
    recurringUnitAmount: number;
    setupFeeTotal: number;
    discountMinorUnits: number;
    taxRateBasisPoints: number;
  } | null = null;
  let createdSessionId: string | null = null;

  try {
    txResult = runInTransaction((trx) => {
      // 2. Validate Quote
      const quote = verifyQuote(data.quoteId, data.accountId, trx);

      // NEW-345/NEW-338: Stripe Checkout is built from exactly one recurring line. Orders for several services share one
      // Stripe subscription that cannot be cancelled or priced per service, so they are refused instead of under-billed.
      if (quote.lines.length !== 1 || quote.lines[0]!.quantity !== 1) {
        throw new Error('UNSUPPORTED_ORDER_SHAPE: an order can contain exactly one service. Place a separate order for each service.');
      }

      // FTL-PROV-202: do not take payment for a region that has no node able to host the service.
      {
        const line = quote.lines[0]!;
        const specs = trx.prepare('SELECT resource_specs FROM plan_versions WHERE id = ?').get(line.planVersionId) as { resource_specs: string } | undefined;
        const desired = specs ? JSON.parse(specs.resource_specs) as { memoryMb: number; diskMb: number } : null;
        const region = line.regionId || data.regionId || 'fra-1';
        if (desired && !pickNodeForService(trx, region, desired.memoryMb, desired.diskMb)) {
          throw new Error(`NO_NODE_AVAILABLE: no node is available in region ${region} right now.`);
        }
      }

      // Verify compatible billing intervals across quote lines
      const intervals = new Set(quote.lines.map((l) => l.interval || 'MONTHLY'));
      if (intervals.size > 1) {
        throw new Error('Mixed billing intervals in a single order are not supported.');
      }
      const billingInterval = (quote.lines[0]?.interval || 'MONTHLY') as 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

      // 3. Mark Quote Converted
      trx.prepare("UPDATE quotes SET status = 'CONVERTED' WHERE id = ?").run(quote.id);

      // 4. Create Order
      const orderId = generateId('ord');
      trx.prepare(`
        INSERT INTO orders (id, account_id, quote_id, status, currency, total_minor_units, idempotency_key)
        VALUES (?, ?, ?, 'AWAITING_PAYMENT', ?, ?, ?)
      `).run(orderId, data.accountId, quote.id, quote.currency, quote.totalMinorUnits, data.idempotencyKey);

      // 5. Create Order Items (propagating line.regionId and line.interval - NEW-315)
      for (const line of quote.lines) {
        const itemRegion = line.regionId || data.regionId || 'fra-1';
        const itemInterval = line.interval || billingInterval;
        for (let i = 0; i < line.quantity; i++) {
          trx.prepare(`
            INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status)
            VALUES (?, ?, ?, ?, ?, 'PENDING')
          `).run(
            generateId('ori'),
            orderId,
            line.planVersionId,
            itemRegion,
            JSON.stringify({ ...(data.customOptions || {}), interval: itemInterval, regionId: itemRegion, recurringMinorUnits: line.unitPriceMinorUnits })
          );
        }
      }

      // 5.5. Consume Coupon if applicable (NEW-303)
      if (quote.couponCode) {
        const couponRow = trx.prepare('SELECT id FROM coupon_rules WHERE code = ?').get(quote.couponCode.trim().toUpperCase()) as { id: string } | undefined;
        if (couponRow) {
          redeemCouponAtomic(couponRow.id, data.accountId, orderId, trx);
        }
      }

      // 6. Create Pro-Forma Invoice (with proportional discount distribution - NEW-316)
      const invoiceId = generateId('inv');
      const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const discountTotal = quote.discountMinorUnits ?? 0;
      const netSubtotal = Math.max(0, quote.subtotalMinorUnits - discountTotal);

      trx.prepare(`
        INSERT INTO invoices (id, account_id, order_id, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date)
        VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
      `).run(
        invoiceId,
        data.accountId,
        orderId,
        quote.currency,
        netSubtotal,
        quote.taxMinorUnits,
        quote.totalMinorUnits,
        dueDate
      );

      // Distribute discount across invoice lines so sum(invoice_lines.total_minor_units) === netSubtotal
      let allocatedDiscount = 0;
      for (let idx = 0; idx < quote.lines.length; idx++) {
        const line = quote.lines[idx]!;
        let lineDiscount = 0;
        if (discountTotal > 0 && quote.subtotalMinorUnits > 0) {
          if (idx === quote.lines.length - 1) {
            lineDiscount = discountTotal - allocatedDiscount;
          } else {
            lineDiscount = Math.round((line.totalMinorUnits / quote.subtotalMinorUnits) * discountTotal);
            allocatedDiscount += lineDiscount;
          }
        }
        const lineNetTotal = Math.max(0, line.totalMinorUnits - lineDiscount);
        const unitNetPrice = line.quantity > 0 ? Math.floor(lineNetTotal / line.quantity) : lineNetTotal;

        trx.prepare(`
          INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_minor_units, tax_rate_basis_points, total_minor_units)
          VALUES (?, ?, 'Hosting Plan Entitlement', ?, ?, ?, ?)
        `).run(
          generateId('inl'),
          invoiceId,
          line.quantity,
          unitNetPrice,
          quote.taxEvidence.taxRateBasisPoints,
          lineNetTotal
        );
      }

      // 7. Create Payment Attempt Record
      const paymentAttemptId = generateId('pay');
      trx.prepare(`
        INSERT INTO payment_attempts (id, invoice_id, psp_name, psp_session_id, status, amount_minor_units, currency, idempotency_key)
        VALUES (?, ?, 'stripe', ?, 'REQUIRES_ACTION', ?, ?, ?)
      `).run(
        paymentAttemptId,
        invoiceId,
        paymentAttemptId,
        quote.totalMinorUnits,
        quote.currency,
        data.idempotencyKey
      );

      const recurringUnitAmount = quote.lines[0]?.unitPriceMinorUnits ?? quote.totalMinorUnits;
      const setupFeeTotal = quote.lines.reduce((acc, l) => acc + (l.setupFeeMinorUnits || 0), 0);

      return {
        orderId,
        invoiceId,
        paymentAttemptId,
        totalMinorUnits: quote.totalMinorUnits,
        currency: quote.currency,
        planName: quote.lines[0] ? 'Fortless Hosting Plan' : 'Hosting Plan',
        billingInterval,
        recurringUnitAmount,
        setupFeeTotal,
        discountMinorUnits: discountTotal,
        taxRateBasisPoints: quote.taxEvidence.taxRateBasisPoints,
      };
    }, db);

    let checkoutUrl: string;

    if (txResult.totalMinorUnits === 0) {
      // Free plan: fulfill immediately without Stripe
      checkoutUrl = await fulfillFreeOrder({
        orderId: txResult.orderId,
        invoiceId: txResult.invoiceId,
        paymentAttemptId: txResult.paymentAttemptId,
        accountId: data.accountId,
        regionId: data.regionId,
      }, db);
    } else {
      // Paid plan: create Stripe Checkout Session with accurate billing interval
      let recurringConfig: { interval: 'month' | 'year'; interval_count?: number };
      switch (txResult.billingInterval) {
        case 'QUARTERLY':
          recurringConfig = { interval: 'month', interval_count: 3 };
          break;
        case 'SEMI_ANNUAL':
          recurringConfig = { interval: 'month', interval_count: 6 };
          break;
        case 'ANNUAL':
          recurringConfig = { interval: 'year' };
          break;
        case 'MONTHLY':
        default:
          recurringConfig = { interval: 'month' };
          break;
      }

      const stripe = new Stripe(config.STRIPE_SECRET_KEY);

      // NEW-340/NEW-345: the amount Stripe collects must equal the signed quote. Tax and the one-time discount are
      // applied by Stripe through a tax rate and a "once" coupon, so renewals bill the plain recurring price plus tax.
      const taxRates: string[] = [];
      if (txResult.taxRateBasisPoints > 0) {
        const taxRate = await stripe.taxRates.create({
          display_name: 'VAT',
          percentage: txResult.taxRateBasisPoints / 100,
          inclusive: false,
        }, { idempotencyKey: `tr_${txResult.paymentAttemptId}` });
        taxRates.push(taxRate.id);
      }
      let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
      if (txResult.discountMinorUnits > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: txResult.discountMinorUnits,
          currency: txResult.currency.toLowerCase(),
          duration: 'once',
          name: 'Order discount',
        }, { idempotencyKey: `cp_${txResult.paymentAttemptId}` });
        discounts = [{ coupon: coupon.id }];
      }

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        {
          price_data: {
            currency: txResult.currency.toLowerCase(),
            product_data: { name: txResult.planName },
            recurring: recurringConfig,
            unit_amount: txResult.recurringUnitAmount,
          },
          quantity: 1,
          ...(taxRates.length ? { tax_rates: taxRates } : {}),
        },
      ];

      if (txResult.setupFeeTotal > 0) {
        lineItems.push({
          price_data: {
            currency: txResult.currency.toLowerCase(),
            product_data: { name: `${txResult.planName} (Setup Fee)` },
            unit_amount: txResult.setupFeeTotal,
          },
          quantity: 1,
          ...(taxRates.length ? { tax_rates: taxRates } : {}),
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: lineItems,
        ...(discounts ? { discounts } : {}),
        success_url: `${config.APP_ORIGIN}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.APP_ORIGIN}/app/deploy`,
        metadata: {
          paymentAttemptId: txResult.paymentAttemptId,
          orderId: txResult.orderId,
          accountId: data.accountId,
        },
        subscription_data: {
          metadata: {
            paymentAttemptId: txResult.paymentAttemptId,
            orderId: txResult.orderId,
            accountId: data.accountId,
          },
        },
      }, {
        idempotencyKey: `cs_${txResult.paymentAttemptId}_${data.idempotencyKey}`,
      });
      createdSessionId = session.id;

      if (!session.url) {
        throw new Error('Stripe did not return a checkout URL.');
      }

      // Bind real Stripe session ID and payment intent ID to payment attempt
      db.prepare('UPDATE payment_attempts SET psp_session_id = ? WHERE id = ?')
        .run(session.id, txResult.paymentAttemptId);

      checkoutUrl = assertTrustedCheckoutUrl(session.url);
    }

    const result: CheckoutResult = {
      orderId: txResult.orderId,
      invoiceId: txResult.invoiceId,
      paymentAttemptId: txResult.paymentAttemptId,
      checkoutUrl,
    };

    db.prepare(`
      UPDATE idempotency_records
      SET status = 'COMPLETED', response_payload = ?
      WHERE account_id = ? AND scope = 'checkout' AND idempotency_key = ?
    `).run(JSON.stringify(result), data.accountId, data.idempotencyKey);

    return result;
  } catch (err) {
    db.prepare(`
      UPDATE idempotency_records
      SET status = 'FAILED'
      WHERE account_id = ? AND scope = 'checkout' AND idempotency_key = ?
    `).run(data.accountId, data.idempotencyKey);
    // Reopen quote if external checkout provider failed so customer can retry
    db.prepare("UPDATE quotes SET status = 'OPEN' WHERE id = ? AND account_id = ? AND status = 'CONVERTED'")
      .run(data.quoteId, data.accountId);
    // Compensate local order, coupon redemption, invoice and any Stripe session already created (NEW-341, NEW-349,
    // FTL-BILL-206). Values must match the schema CHECK constraints, and a failure here is reported, never swallowed.
    if (createdSessionId && config.STRIPE_SECRET_KEY) {
      try {
        await new Stripe(config.STRIPE_SECRET_KEY).checkout.sessions.expire(createdSessionId);
      } catch (expireErr) {
        console.error('[Checkout] could not expire Stripe session after a failed checkout:', createdSessionId, (expireErr as Error).message);
      }
    }
    if (txResult) {
      const failed = txResult;
      try {
        runInTransaction((trx) => {
          cancelCouponRedemptionAtomic(failed.orderId, trx);
          // Free the unique idempotency keys so the customer can retry with the same key.
          trx.prepare("UPDATE orders SET status = 'CANCELED', idempotency_key = idempotency_key || '#failed_' || id, updated_at = datetime('now', 'utc') WHERE id = ?").run(failed.orderId);
          trx.prepare("UPDATE invoices SET status = 'VOIDED' WHERE id = ? AND status != 'PAID'").run(failed.invoiceId);
          trx.prepare("UPDATE payment_attempts SET status = 'FAILED', idempotency_key = idempotency_key || '#failed_' || id WHERE id = ?").run(failed.paymentAttemptId);
        }, db);
      } catch (compensationErr) {
        console.error('[Checkout] compensation failed, manual review required for order', failed.orderId, (compensationErr as Error).message);
        try {
          db.prepare(`
            INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
            VALUES (?, ?, 'SYSTEM', 'checkout.compensation_failed', 'order', ?, ?, ?)
          `).run(generateId('aud'), data.accountId, failed.orderId, generateId('cor'), JSON.stringify({ reason: (compensationErr as Error).message.slice(0, 200) }));
        } catch { /* audit table unavailable: console output above is the last resort */ }
      }
    }
    throw err;
  }
}

async function fulfillFreeOrder(
  args: {
    orderId: string;
    invoiceId: string;
    paymentAttemptId: string;
    accountId: string;
    regionId: string;
  },
  db: Database.Database = getDatabase()
): Promise<string> {
  runInTransaction((trx) => {
    trx.prepare("UPDATE payment_attempts SET status = 'SUCCEEDED' WHERE id = ?").run(args.paymentAttemptId);

    // Inline markInvoicePaid to avoid nested runInTransaction calls
    const yearSeries = `INV-${new Date().getUTCFullYear()}`;
    trx.prepare(`
      INSERT INTO invoice_sequences (series, current_number)
      VALUES (?, 1)
      ON CONFLICT(series) DO UPDATE SET current_number = current_number + 1
    `).run(yearSeries);
    const seqRow = trx.prepare('SELECT current_number FROM invoice_sequences WHERE series = ?').get(yearSeries) as { current_number: number };
    const invoiceNumber = `${yearSeries}-${String(seqRow.current_number).padStart(5, '0')}`;
    trx.prepare(`
      UPDATE invoices
      SET status = 'PAID', invoice_number = ?, amount_paid_minor_units = 0, paid_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(invoiceNumber, args.invoiceId);

    trx.prepare("UPDATE orders SET status = 'PAID', updated_at = datetime('now', 'utc') WHERE id = ?").run(args.orderId);

    const items = trx.prepare('SELECT * FROM order_items WHERE order_id = ?').all(args.orderId) as ({
      id: string;
      plan_version_id: string;
      region_id?: string;
      custom_options: string;
    })[];

    for (const item of items) {
      const planVersion = trx.prepare('SELECT resource_specs FROM plan_versions WHERE id = ?')
        .get(item.plan_version_id) as { resource_specs: string };
      const desired = JSON.parse(planVersion.resource_specs) as { cpuPct: number; memoryMb: number; diskMb: number };

      const itemRegion = item.region_id || args.regionId;
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
      `).run(serviceId, args.accountId, item.id, providerType, providerInstance, assignedNodeId);

      trx.prepare(`
        INSERT INTO service_desired_configs
          (service_id, plan_version_id, cpu_limit_pct, memory_limit_mb, disk_limit_mb, environment_variables)
        VALUES (?, ?, ?, ?, ?, '{}')
      `).run(serviceId, item.plan_version_id, desired.cpuPct, desired.memoryMb, desired.diskMb);

      trx.prepare('UPDATE order_items SET service_id = ? WHERE id = ?').run(serviceId, item.id);

      trx.prepare(`
        INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, ?, 'SYSTEM', 'service.created', 'service', ?, ?, '{}')
      `).run(generateId('aud'), args.accountId, serviceId, generateId('cor'));

      trx.prepare(`
        INSERT INTO service_observed_states (service_id, runtime_state)
        VALUES (?, 'INSTALLING')
      `).run(serviceId);

      trx.prepare(`
        INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
        VALUES (?, 'service.provision.v1', 'service', ?, ?, 'PENDING')
      `).run(
        generateId('obx'),
        serviceId,
        JSON.stringify({
          serviceId,
          accountId: args.accountId,
          orderItemId: item.id,
          planVersionId: item.plan_version_id,
          nodeId: assignedNodeId,
          customOptions: JSON.parse(item.custom_options),
        })
      );
    }

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id)
      VALUES (?, ?, 'SYSTEM', 'order.paid', 'order', ?, ?)
    `).run(generateId('aud'), args.accountId, args.orderId, generateId('cor'));

    createNotification({
      accountId: args.accountId,
      type: 'PAYMENT_SUCCESS',
      title: 'Order Confirmed',
      message: 'Your free plan is being provisioned.',
      linkUrl: '/app',
    }, trx);

    queueEmail(trx, {
      recipient: (trx.prepare('SELECT billing_email FROM accounts WHERE id = ?').get(args.accountId) as any)?.billing_email || '',
      template: 'payment_confirmed',
      payload: { invoiceNumber: 'FREE', amount: '€0.00', serviceName: 'Fortless Hosting Plan' },
    });
  }, db);

  return `${config.APP_ORIGIN}/app`;
}
