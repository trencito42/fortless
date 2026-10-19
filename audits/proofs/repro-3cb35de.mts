/**
 * Isolated reproductions for the independent audit at 3cb35de. Uses only an in-memory database built from
 * src/database/schema.ts plus migrations. Does not touch production data or any provider.
 * Run from the repository root: npx tsx audits/proofs/repro-3cb35de.mts
 */
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../../src/database/schema.js';
import { runMigrations } from '../../src/database/migrations.js';

const db = new Database(':memory:');
db.exec(SCHEMA_SQL);
runMigrations(db);

const attempt = (label: string, fn: () => void) => {
  try { fn(); console.log(`ACCEPTED  ${label}`); } catch (e: any) { console.log(`REJECTED  ${label} -> ${e.code}`); }
};

// NEW-347: SEMI_ANNUAL plans are sellable (plan_prices) but cannot be stored as subscriptions.
db.pragma('foreign_keys = OFF');
for (const interval of ['MONTHLY', 'ANNUAL', 'SEMI_ANNUAL']) {
  attempt(`NEW-347 subscriptions.billing_interval = ${interval}`, () => db.prepare(
    `INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units, currency, auto_renew)
     VALUES (?, 'a', ?, 'sub_x', 'ACTIVE', ?, 'x', 'x', 'x', 100, 'EUR', 1)`).run(`s_${interval}`, `svc_${interval}`, interval));
}

// NEW-349: checkout failure compensation (checkout.ts:322-323) writes values the schema does not allow.
db.prepare("INSERT INTO orders (id, account_id, quote_id, status, currency, total_minor_units, idempotency_key) VALUES ('o1','a','q','AWAITING_PAYMENT','EUR',100,'k')").run();
db.prepare("INSERT INTO invoices (id, account_id, order_id, status, currency, subtotal_minor_units, tax_minor_units, total_minor_units, due_date) VALUES ('i1','a','o1','DRAFT','EUR',100,0,100,'2026-01-01')").run();
attempt("NEW-349 orders.status = 'CANCELLED'", () => db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = 'o1'").run());
attempt("NEW-349 invoices.status = 'VOID'", () => db.prepare("UPDATE invoices SET status = 'VOID' WHERE id = 'i1'").run());

// NEW-354: worker.ts:254-259 writes account_id = 'SYSTEM' with foreign keys enabled (as in production).
db.pragma('foreign_keys = ON');
attempt("NEW-354 audit_events.account_id = 'SYSTEM'", () => db.prepare(
  `INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
   VALUES ('aud_1', 'SYSTEM', 'SYSTEM', 'billing.stripe_outbox_failed', 'subscription', 'sub_1', 'corr_1', '{}')`).run());
