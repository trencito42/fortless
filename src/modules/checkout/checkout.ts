import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { generateId } from '../identity/auth.js';
import { verifyQuote } from '../pricing/quote.js';

export interface CheckoutResult {
  orderId: string;
  invoiceId: string;
  paymentAttemptId: string;
  checkoutUrl: string | null;
  isIdempotentReplay?: boolean;
}

export function processCheckout(
  data: {
    accountId: string;
    quoteId: string;
    idempotencyKey: string;
    regionId: string;
    customOptions?: Record<string, unknown>;
  },
  db: Database.Database = getDatabase()
): CheckoutResult {
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

  try {
    const result = runInTransaction((trx) => {
      // 2. Validate Quote
      const quote = verifyQuote(data.quoteId, data.accountId, trx);

      // 3. Mark Quote Converted
      trx.prepare("UPDATE quotes SET status = 'CONVERTED' WHERE id = ?").run(quote.id);

      // 4. Create Order
      const orderId = generateId('ord');
      trx.prepare(`
        INSERT INTO orders (id, account_id, quote_id, status, currency, total_minor_units, idempotency_key)
        VALUES (?, ?, ?, 'AWAITING_PAYMENT', ?, ?, ?)
      `).run(orderId, data.accountId, quote.id, quote.currency, quote.totalMinorUnits, data.idempotencyKey);

      // 5. Create Order Items
      for (const line of quote.lines) {
        for (let i = 0; i < line.quantity; i++) {
          trx.prepare(`
            INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status)
            VALUES (?, ?, ?, ?, ?, 'PENDING')
          `).run(
            generateId('ori'),
            orderId,
            line.planVersionId,
            data.regionId,
            JSON.stringify(data.customOptions || {})
          );
        }
      }

      // 6. Create Pro-Forma Invoice
      const invoiceId = generateId('inv');
      const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3-day payment window
      trx.prepare(`
        INSERT INTO invoices (id, account_id, order_id, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date)
        VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
      `).run(
        invoiceId,
        data.accountId,
        orderId,
        quote.currency,
        quote.subtotalMinorUnits,
        quote.taxMinorUnits,
        quote.totalMinorUnits,
        dueDate
      );

      for (const line of quote.lines) {
        trx.prepare(`
          INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_minor_units, tax_rate_basis_points, total_minor_units)
          VALUES (?, ?, 'Hosting Plan Entitlement', ?, ?, ?, ?)
        `).run(
          generateId('inl'),
          invoiceId,
          line.quantity,
          line.unitPriceMinorUnits,
          quote.taxEvidence.taxRateBasisPoints,
          line.totalMinorUnits
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

      return {
        orderId,
        invoiceId,
        paymentAttemptId,
        // A hosted PSP session is attached by the future sandbox-verified
        // payment gateway. Never fabricate a customer-facing payment URL.
        checkoutUrl: null,
      };
    }, db);

    // Update idempotency to COMPLETED
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
    throw err;
  }
}
