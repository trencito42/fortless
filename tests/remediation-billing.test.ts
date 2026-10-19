import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { seedInitialCatalog } from '../src/modules/catalog/catalog.js';
import { registerUser } from '../src/modules/identity/auth.js';
import { createQuote } from '../src/modules/pricing/quote.js';
import { processCheckout } from '../src/modules/checkout/checkout.js';
import { ingestPSPWebhook, type StripeWebhookPayload } from '../src/modules/payments/webhooks.js';
import { processOutboxQueue } from '../src/modules/outbox/worker.js';
import { MockPterodactylAdapter } from '../src/modules/provisioning/adapter.js';
import { calculateNextPeriod } from '../src/modules/billing/renewal-dunning.js';
import { config } from '../src/config/index.js';

type Call = { path: string; args: any[] };
const g = globalThis as unknown as { __stripeCalls: Call[]; __stripeFail: Record<string, Error | undefined> };

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  seedInitialCatalog(db);
  g.__stripeCalls.length = 0;
  g.__stripeFail = {};
});
afterEach(() => db.close());

let seq = 0;
function user() {
  seq++;
  return registerUser({ email: `rem${seq}@example.com`, password: 'Password12345!', name: `Rem ${seq}`, ipAddress: '127.0.0.1', userAgent: 'test' }, db);
}
const calls = (path: string) => g.__stripeCalls.filter((c) => c.path === path);

function paidService() {
  const u = user();
  const quote = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
  return processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: `idem_${seq}`, regionId: 'reg_fra_1' }, db).then((checkout) => ({ u, quote, checkout }));
}

function settle(checkout: { paymentAttemptId: string; orderId: string }, amount: number, evt: string) {
  const payload: StripeWebhookPayload = {
    id: evt, type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000),
    data: { object: { id: checkout.paymentAttemptId, amount, currency: 'eur', status: 'succeeded', metadata: { orderId: checkout.orderId } } },
  };
  return ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db);
}

describe('P0 billing remediation', () => {
  it('NEW-345/NEW-340: checkout refuses multi-service orders and bills tax and discount through Stripe', async () => {
    const u = user();
    const many = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 2 }], 'DE', false, undefined, db);
    await expect(processCheckout({ accountId: u.account.id, quoteId: many.id, idempotencyKey: 'idem_many', regionId: 'reg_fra_1' }, db)).rejects.toThrow(/UNSUPPORTED_ORDER_SHAPE/);
    expect(calls('checkout.sessions.create')).toHaveLength(0);

    const one = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
    await processCheckout({ accountId: u.account.id, quoteId: one.id, idempotencyKey: 'idem_one', regionId: 'reg_fra_1' }, db);
    const session = calls('checkout.sessions.create')[0]!.args[0];
    expect(calls('taxRates.create')[0]!.args[0].percentage).toBe(one.taxEvidence.taxRateBasisPoints / 100);
    expect(session.line_items.every((l: any) => Array.isArray(l.tax_rates) && l.tax_rates.length === 1)).toBe(true);
    expect(session.line_items[0].price_data.unit_amount).toBe(one.lines[0]!.unitPriceMinorUnits);
  });

  it('NEW-349/FTL-BILL-206: a failed Stripe call voids local state with valid statuses and the same key can retry', async () => {
    const u = user();
    const q1 = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
    g.__stripeFail['checkout.sessions.create'] = new Error('stripe down');
    await expect(processCheckout({ accountId: u.account.id, quoteId: q1.id, idempotencyKey: 'idem_retry', regionId: 'reg_fra_1' }, db)).rejects.toThrow('stripe down');
    const order = db.prepare('SELECT status, idempotency_key FROM orders').get() as any;
    expect(order.status).toBe('CANCELED');
    expect(order.idempotency_key).not.toBe('idem_retry');
    expect((db.prepare('SELECT status FROM invoices').get() as any).status).toBe('VOIDED');
    expect((db.prepare('SELECT status FROM payment_attempts').get() as any).status).toBe('FAILED');

    g.__stripeFail = {};
    const result = await processCheckout({ accountId: u.account.id, quoteId: q1.id, idempotencyKey: 'idem_retry', regionId: 'reg_fra_1' }, db);
    expect(result.checkoutUrl).toContain('checkout.stripe.test');
  });

  it('FTL-BILL-206: a database failure after the Stripe session exists expires that session', async () => {
    const u = user();
    const q = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
    db.exec("CREATE TRIGGER fail_bind BEFORE UPDATE OF psp_session_id ON payment_attempts BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    await expect(processCheckout({ accountId: u.account.id, quoteId: q.id, idempotencyKey: 'idem_bind', regionId: 'reg_fra_1' }, db)).rejects.toThrow('disk full');
    expect(calls('checkout.sessions.expire')).toHaveLength(1);
  });

  it('NEW-346: an event whose processing threw is processed again on redelivery, not deduplicated', async () => {
    const { checkout } = await paidService();
    db.exec("CREATE TRIGGER fail_paid BEFORE UPDATE OF status ON orders WHEN NEW.status = 'PAID' BEGIN SELECT RAISE(ABORT, 'transient'); END");
    expect(() => settle(checkout, 1428, 'evt_retry')).toThrow('transient');
    expect((db.prepare("SELECT status FROM psp_inbox_events WHERE event_id = 'evt_retry'").get() as any).status).toBe('FAILED');
    db.exec('DROP TRIGGER fail_paid');
    const again = settle(checkout, 1428, 'evt_retry');
    expect(again.status).toBe('PROCESSED');
    expect((db.prepare('SELECT status FROM orders').get() as any).status).toBe('PAID');
    expect(settle(checkout, 1428, 'evt_retry').status).toBe('DEDUPLICATED');
  });

  it('NEW-344/NEW-333: scheduled cancellation reaches Stripe as cancel_at_period_end, immediate cancellation as cancel', async () => {
    const insert = (id: string, payload: object) => db.prepare("INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status) VALUES (?, 'stripe.subscription.cancel.v1', 'subscription', 'sub_x', ?, 'PENDING')").run(id, JSON.stringify(payload));
    insert('obx_eop', { pspSubscriptionId: 'sub_psp1', immediate: false });
    insert('obx_now', { pspSubscriptionId: 'sub_psp2', immediate: true });
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    expect(calls('subscriptions.cancel').map((c) => c.args[0])).toEqual(['sub_psp2']);
    expect(calls('subscriptions.update')[0]!.args[0]).toBe('sub_psp1');
    expect(calls('subscriptions.update')[0]!.args[1]).toEqual({ cancel_at_period_end: true });
  });

  it('NEW-333: without a Stripe key the cancellation is not silently completed', async () => {
    const saved = config.STRIPE_SECRET_KEY;
    (config as any).STRIPE_SECRET_KEY = '';
    try {
      db.prepare("INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status) VALUES ('obx_nokey', 'stripe.subscription.cancel.v1', 'subscription', 'sub_x', ?, 'PENDING')").run(JSON.stringify({ pspSubscriptionId: 'sub_psp3', immediate: true }));
      await processOutboxQueue(new MockPterodactylAdapter(), db);
      const row = db.prepare("SELECT status, last_error FROM outbox_events WHERE id = 'obx_nokey'").get() as any;
      expect(row.status).toBe('PENDING');
      expect(row.last_error).toMatch(/Stripe is not configured/);
    } finally {
      (config as any).STRIPE_SECRET_KEY = saved;
    }
  });

  it('NEW-354: a dead-lettered Stripe event writes its audit row under foreign keys', async () => {
    const u = user();
    db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
      VALUES ('sub_dl', ?, 'svc_dl', 'sub_psp9', 'ACTIVE', 'MONTHLY', '2026-01-01', '2026-02-01', '2026-02-01', 1000)`).run(u.account.id);
    g.__stripeFail['subscriptions.cancel'] = new Error('permanent');
    db.prepare("INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, retry_count) VALUES ('obx_dl', 'stripe.subscription.cancel.v1', 'subscription', 'sub_dl', ?, 'PENDING', 4)").run(JSON.stringify({ pspSubscriptionId: 'sub_psp9', immediate: true }));
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    expect((db.prepare("SELECT status FROM outbox_events WHERE id = 'obx_dl'").get() as any).status).toBe('DEAD_LETTER');
    const audit = db.prepare("SELECT account_id FROM audit_events WHERE action = 'billing.stripe_outbox_failed'").get() as any;
    expect(audit.account_id).toBe(u.account.id);
  });

  it('NEW-347/NEW-348: SEMI_ANNUAL subscriptions are accepted by an upgraded database and periods use calendar months', () => {
    const old = new Database(':memory:');
    old.exec(SCHEMA_SQL.replace("billing_interval IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')", "billing_interval IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')"));
    old.prepare("INSERT INTO users (id, email, password_hash, name) VALUES ('u1', 'a@example.com', 'x', 'A')").run();
    old.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES ('a1', 'A', 'u1', 'a@example.com')").run();
    const ins = "INSERT INTO subscriptions (id, account_id, service_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units) VALUES (?, 'a1', ?, 'ACTIVE', ?, '2026-01-01', '2026-02-01', '2026-02-01', 500)";
    old.prepare(ins).run('s1', 'svc1', 'ANNUAL');
    expect(() => old.prepare(ins).run('s2', 'svc2', 'SEMI_ANNUAL')).toThrow(/CHECK/);
    runMigrations(old);
    expect(() => old.prepare(ins).run('s2', 'svc2', 'SEMI_ANNUAL')).not.toThrow();
    expect(old.prepare('SELECT COUNT(*) c FROM subscriptions').get()).toEqual({ c: 2 });
    old.close();

    expect(calculateNextPeriod('2026-01-31T00:00:00.000Z', 'SEMI_ANNUAL').periodEnd.slice(0, 7)).toBe('2026-07');
    expect(calculateNextPeriod('2026-03-01T00:00:00.000Z', 'ANNUAL').periodEnd.slice(0, 10)).toBe('2027-03-01');
  });

  it('NEW-330: invoice.paid settles only the invoice that belongs to the subscription', async () => {
    const u = user();
    const other = user();
    db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
      VALUES ('sub_a', ?, 'svc_a', 'sub_psp_a', 'ACTIVE', 'MONTHLY', '2026-01-01', '2026-02-01', '2026-02-01', 1000)`).run(u.account.id);
    const inv = (id: string, acc: string, sub: string | null) => db.prepare("INSERT INTO invoices (id, account_id, status, subtotal_minor_units, tax_minor_units, total_minor_units, due_date, subscription_id) VALUES (?, ?, 'ISSUED', 1000, 190, 1190, '2026-03-01', ?)").run(id, acc, sub);
    inv('inv_unrelated_same_account', u.account.id, null);
    inv('inv_other_account', other.account.id, null);
    inv('inv_renewal', u.account.id, 'sub_a');
    const evt = (id: string, amount: number): StripeWebhookPayload => ({ id, type: 'invoice.paid', created: 1, data: { object: { id: `in_${id}`, amount, currency: 'eur', status: 'paid', subscription: 'sub_psp_a', amount_paid: amount, billing_reason: 'subscription_cycle', lines: { data: [{ period: { start: 1772323200, end: 1774828800 } }] } } as any } });
    const wrong = evt('evt_wrong', 999);
    ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(wrong), wrong, db);
    expect((db.prepare("SELECT COUNT(*) c FROM invoices WHERE status = 'PAID'").get() as any).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'billing.invoice_paid_unmatched'").get() as any).c).toBe(1);
    const right = evt('evt_right', 1190);
    ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(right), right, db);
    const paid = db.prepare("SELECT id FROM invoices WHERE status = 'PAID'").all() as any[];
    expect(paid.map((p) => p.id)).toEqual(['inv_renewal']);
  });

  it('NEW-355/NEW-356: a payment lifts only billing suspensions, and repeated failures keep the first grace end', () => {
    const u = user();
    db.pragma('foreign_keys = OFF'); // rows below only need the columns under test, not a full order graph
    const mkSvc = (id: string, reason: string | null, sub: string, psp: string) => {
      db.prepare("INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES (?, 'reg_fra_1', 'i', 'n', 'n.test', 100000, 100000) ON CONFLICT DO NOTHING").run(`node_${id}`);
      db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id, suspension_reason) VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'SUSPENDED', ?, ?)").run(id, u.account.id, `oi_${id}`, `node_${id}`, reason);
      db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
        VALUES (?, ?, ?, ?, 'PAST_DUE', 'MONTHLY', '2026-01-01', '2026-02-01', '2026-02-01', 1000)`).run(sub, u.account.id, id, psp);
    };
    mkSvc('svc_dispute', 'DISPUTE', 'sub_d', 'psp_d');
    mkSvc('svc_billing', 'BILLING', 'sub_b', 'psp_b');
    for (const psp of ['psp_d', 'psp_b']) {
      const e: StripeWebhookPayload = { id: `evt_${psp}`, type: 'invoice.paid', created: 1, data: { object: { id: `in_${psp}`, amount: 1, currency: 'eur', status: 'paid', subscription: psp, amount_paid: 1, billing_reason: 'subscription_cycle' } as any } };
      ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(e), e, db);
    }
    expect((db.prepare("SELECT contract_status FROM services WHERE id = 'svc_dispute'").get() as any).contract_status).toBe('SUSPENDED');
    expect((db.prepare("SELECT contract_status FROM services WHERE id = 'svc_billing'").get() as any).contract_status).toBe('ACTIVE');

    db.prepare("UPDATE subscriptions SET status = 'ACTIVE', grace_period_end = NULL WHERE id = 'sub_b'").run();
    const fail = (n: number): StripeWebhookPayload => ({ id: `evt_fail_${n}`, type: 'invoice.payment_failed', created: 1, data: { object: { id: `in_f${n}`, amount: 1, currency: 'eur', status: 'open', subscription: 'psp_b' } as any } });
    ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(fail(1)), fail(1), db);
    const first = (db.prepare("SELECT grace_period_end FROM subscriptions WHERE id = 'sub_b'").get() as any).grace_period_end;
    db.prepare("UPDATE subscriptions SET grace_period_end = datetime(grace_period_end, '-1 day') WHERE id = 'sub_b'").run();
    const shifted = (db.prepare("SELECT grace_period_end FROM subscriptions WHERE id = 'sub_b'").get() as any).grace_period_end;
    ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(fail(2)), fail(2), db);
    expect((db.prepare("SELECT grace_period_end FROM subscriptions WHERE id = 'sub_b'").get() as any).grace_period_end).toBe(shifted);
    expect(shifted).not.toBe(first);
  });
});
