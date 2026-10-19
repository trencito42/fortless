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
import { reactivateSubscription } from '../src/modules/billing/subscriptions.js';
import { processStaffRefund } from '../src/modules/payments/webhooks.js';
import { terminateService, capacityIsHeld } from '../src/modules/provisioning/services.js';

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

  it('NEW-351/NEW-352/NEW-353: reactivation never skips payment, never restores a terminated service and follows the billing interval', async () => {
    db.pragma('foreign_keys = OFF');
    const u = user();
    db.prepare("INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('n1', 'reg_fra_1', 'i', 'n', 'n.test', 100000, 100000)").run();
    const svc = (id: string, status: string) => db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id) VALUES (?, ?, ?, 'PTERODACTYL', 'p', ?, 'n1')").run(id, u.account.id, `oi_${id}`, status);
    const sub = (id: string, service: string, price: number, interval = 'MONTHLY') => db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units, auto_renew)
      VALUES (?, ?, ?, 'CANCELED', ?, '2026-01-01', '2026-02-01', '2026-02-01', ?, 0)`).run(id, u.account.id, service, interval, price);
    svc('svc_live', 'ACTIVE'); sub('sub_live', 'svc_live', 1500, 'SEMI_ANNUAL');
    svc('svc_dead', 'TERMINATED'); sub('sub_dead', 'svc_dead', 1500);
    svc('svc_free', 'ACTIVE'); sub('sub_free', 'svc_free', 0, 'ANNUAL');
    const args = (id: string) => ({ subscriptionId: id, accountId: u.account.id, userId: u.user.id });

    await expect(reactivateSubscription(args('sub_dead'), db)).rejects.toThrow(/REACTIVATION_NOT_POSSIBLE/);

    const saved = config.STRIPE_SECRET_KEY;
    (config as any).STRIPE_SECRET_KEY = '';
    try {
      await expect(reactivateSubscription(args('sub_live'), db)).rejects.toThrow(/PAYMENTS_NOT_CONFIGURED/);
      expect((db.prepare("SELECT status FROM subscriptions WHERE id = 'sub_live'").get() as any).status).toBe('CANCELED');
    } finally { (config as any).STRIPE_SECRET_KEY = saved; }

    const live = await reactivateSubscription(args('sub_live'), db);
    expect(live.status).toBe('PENDING_CHECKOUT');
    expect(calls('checkout.sessions.create')[0]!.args[0].line_items[0].price_data.recurring).toEqual({ interval: 'month', interval_count: 6 });

    const free = await reactivateSubscription(args('sub_free'), db);
    expect(free.status).toBe('ACTIVE');
    const end = (db.prepare("SELECT current_period_end e FROM subscriptions WHERE id = 'sub_free'").get() as any).e as string;
    expect(new Date(end).getUTCFullYear()).toBe(new Date().getUTCFullYear() + 1);
  });

  it('NEW-357: terminating a service that never reserved capacity releases nothing', async () => {
    db.pragma('foreign_keys = OFF');
    const u = user();
    db.prepare("INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb, allocated_memory_mb, allocated_disk_mb) VALUES ('n2', 'reg_fra_1', 'i', 'n', 'n.test', 100000, 100000, 4096, 10240)").run();
    const mk = (id: string, reserved: boolean) => {
      db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id) VALUES (?, ?, ?, 'PTERODACTYL', 'p', 'ACTIVE', 'n2')").run(id, u.account.id, `oi_${id}`);
      db.prepare("INSERT INTO service_desired_configs (service_id, plan_version_id, cpu_limit_pct, memory_limit_mb, disk_limit_mb) VALUES (?, 'plv_mc_4gb', 100, 4096, 10240)").run(id);
      if (reserved) db.prepare("INSERT INTO provision_operations (id, service_id, operation_type, status, idempotency_key, correlation_id) VALUES (?, ?, 'CREATE', 'SUCCEEDED', ?, ?)").run(`pop_${id}`, id, `idem_${id}`, `corr_${id}`);
    };
    mk('svc_never', false);
    expect(capacityIsHeld(db, 'svc_never')).toBe(false);
    await terminateService({ serviceId: 'svc_never', reason: 'test', actorType: 'STAFF' }, new MockPterodactylAdapter(), db);
    expect((db.prepare("SELECT allocated_memory_mb m FROM nodes WHERE id = 'n2'").get() as any).m).toBe(4096);
    mk('svc_held', true);
    await terminateService({ serviceId: 'svc_held', reason: 'test', actorType: 'STAFF' }, new MockPterodactylAdapter(), db);
    expect((db.prepare("SELECT allocated_memory_mb m FROM nodes WHERE id = 'n2'").get() as any).m).toBe(0);
  });

  it('NEW-334: a staff refund creates a Stripe refund through the outbox, once, and the echo webhook does not double-apply it', async () => {
    const { checkout } = await paidService();
    settle(checkout, 1428, 'evt_pay_refund');
    const invoiceId = (db.prepare('SELECT invoice_id i FROM payment_attempts WHERE id = ?').get(checkout.paymentAttemptId) as any).i as string;
    db.prepare("UPDATE payment_attempts SET psp_payment_intent_id = 'pi_real_1' WHERE id = ?").run(checkout.paymentAttemptId);
    const staff = user();
    const result = processStaffRefund({ invoiceId, amountMinorUnits: 500, reason: 'goodwill credit', staffUserId: staff.user.id, ipAddress: '127.0.0.1' }, db);
    expect(result.pspRefund).toBe('REQUESTED');
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    const refunds = calls('refunds.create');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.args[0]).toMatchObject({ payment_intent: 'pi_real_1', amount: 500 });
    expect(refunds[0]!.args[1]).toEqual({ idempotencyKey: `refund_${result.refundId}` });
    expect((db.prepare('SELECT status, psp_refund_id FROM refunds WHERE id = ?').get(result.refundId) as any).status).toBe('SUCCEEDED');

    const echo: StripeWebhookPayload = { id: 'evt_charge_refunded', type: 'charge.refunded', created: 1, data: { object: { id: 'ch_1', payment_intent: 'pi_real_1', amount: 1428, currency: 'eur', status: 'succeeded', amount_refunded: 500 } as any } };
    const before = (db.prepare("SELECT COUNT(*) c FROM credit_notes").get() as any).c;
    ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(echo), echo, db);
    expect((db.prepare("SELECT COUNT(*) c FROM credit_notes").get() as any).c).toBe(before);
  });

  it('NEW-334: a refund Stripe rejects permanently is marked FAILED and audited, not left looking refunded', async () => {
    const { checkout } = await paidService();
    settle(checkout, 1428, 'evt_pay_refund2');
    const invoiceId = (db.prepare('SELECT invoice_id i FROM payment_attempts WHERE id = ?').get(checkout.paymentAttemptId) as any).i as string;
    db.prepare("UPDATE payment_attempts SET psp_payment_intent_id = 'pi_real_2' WHERE id = ?").run(checkout.paymentAttemptId);
    const staff = user();
    g.__stripeFail['refunds.create'] = new Error('charge already refunded');
    const result = processStaffRefund({ invoiceId, amountMinorUnits: 300, reason: 'goodwill credit', staffUserId: staff.user.id, ipAddress: '127.0.0.1' }, db);
    db.prepare("UPDATE outbox_events SET retry_count = 4 WHERE aggregate_id = ?").run(result.refundId);
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    expect((db.prepare('SELECT status FROM refunds WHERE id = ?').get(result.refundId) as any).status).toBe('FAILED');
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'payment.refund_failed'").get() as any).c).toBe(1);
  });

  it('NEW-301/NEW-302: immediate cancellation waits for termination and a provider failure is reported as pending, not as success', async () => {
    const { u, checkout } = await paidService();
    settle(checkout, 1428, 'evt_cancel_pay');
    const adapter = new MockPterodactylAdapter();
    await processOutboxQueue(adapter, db);
    const svc = db.prepare('SELECT id FROM services WHERE account_id = ?').get(u.account.id) as { id: string };
    db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
      VALUES ('sub_c', ?, ?, 'psp_c', 'ACTIVE', 'MONTHLY', '2026-01-01', '2026-02-01', '2026-02-01', 1000)`).run(u.account.id, svc.id);
    const { setProviderAdapter, getProviderAdapter } = await import('../src/modules/outbox/worker.js');
    const { cancelSubscription } = await import('../src/modules/billing/subscriptions.js');
    const previous = getProviderAdapter();
    const failing = new MockPterodactylAdapter();
    (failing as any).terminate = async () => { throw Object.assign(new Error('panel timeout'), { statusCode: 504 }); };
    setProviderAdapter(failing);
    try {
      const pending = await cancelSubscription({ subscriptionId: 'sub_c', accountId: u.account.id, userId: u.user.id, immediate: true }, db);
      expect(pending.terminationPending).toBe(true);
      expect((db.prepare('SELECT contract_status s FROM services WHERE id = ?').get(svc.id) as any).s).not.toBe('TERMINATED');
      expect((db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE event_type = 'service.terminate.v1' AND aggregate_id = ? AND status = 'PENDING'").get(svc.id) as any).c).toBe(1);
      setProviderAdapter(previous);
      await processOutboxQueue(adapter, db);
      expect((db.prepare('SELECT contract_status s FROM services WHERE id = ?').get(svc.id) as any).s).toBe('TERMINATED');
    } finally { setProviderAdapter(previous); }
  });

  it('NEW-341/NEW-303: an expired Stripe checkout cancels the order, voids the invoice and returns the coupon', async () => {
    const u = user();
    const { createCoupon } = await import('../src/modules/catalog/catalog.js');
    const coupon = createCoupon({ code: 'ABANDON10', discountType: 'PERCENTAGE', discountValue: 10, maxRedemptions: 1, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, db);
    const q = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, 'ABANDON10', db);
    const checkout = await processCheckout({ accountId: u.account.id, quoteId: q.id, idempotencyKey: 'idem_abandon', regionId: 'reg_fra_1' }, db);
    expect((db.prepare('SELECT redemptions_count r FROM coupon_rules WHERE id = ?').get(coupon.id) as any).r).toBe(1);
    const sessionId = (db.prepare('SELECT psp_session_id s FROM payment_attempts WHERE id = ?').get(checkout.paymentAttemptId) as any).s;
    const expired: StripeWebhookPayload = { id: 'evt_expired', type: 'checkout.session.expired', created: 1, data: { object: { id: sessionId, amount: 0, currency: 'eur', status: 'expired', metadata: { paymentAttemptId: checkout.paymentAttemptId, orderId: checkout.orderId } } } };
    expect(ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(expired), expired, db).status).toBe('PROCESSED');
    expect((db.prepare('SELECT redemptions_count r FROM coupon_rules WHERE id = ?').get(coupon.id) as any).r).toBe(0);
    expect((db.prepare('SELECT status FROM orders WHERE id = ?').get(checkout.orderId) as any).status).toBe('CANCELED');
    expect((db.prepare('SELECT status FROM invoices WHERE id = ?').get(checkout.invoiceId) as any).status).toBe('VOIDED');
  });

  it('NEW-332: outside the test process cPanel and Proxmox services never get an in-memory adapter', async () => {
    const { getAdapterForService } = await import('../src/modules/outbox/worker.js');
    const before = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'development';
      expect(() => getAdapterForService('CPANEL')).toThrow(/not configured/);
      expect(() => getAdapterForService('PROXMOX')).toThrow(/not configured/);
      expect(() => getAdapterForService('VPS')).toThrow(/not configured/);
      process.env['NODE_ENV'] = 'test';
      expect(getAdapterForService('CPANEL')).toBeDefined();
    } finally { process.env['NODE_ENV'] = before; }
  });

  it('FTL-PROV-202: placement stays in the ordered region and is refused before payment when the region has no node', async () => {
    const u = user();
    db.prepare("INSERT INTO regions (id, name, code, country, is_active) VALUES ('reg_empty', 'Empty', 'EMP', 'DE', 1) ON CONFLICT DO NOTHING").run();
    const q = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1, regionId: 'reg_empty' }], 'DE', false, undefined, db);
    await expect(processCheckout({ accountId: u.account.id, quoteId: q.id, idempotencyKey: 'idem_empty_region', regionId: 'reg_empty' }, db)).rejects.toThrow(/NO_NODE_AVAILABLE/);
    expect(calls('checkout.sessions.create')).toHaveLength(0);

    const { pickNodeForService } = await import('../src/modules/provisioning/placement.js');
    db.prepare("UPDATE nodes SET allocated_memory_mb = max_memory_mb WHERE region_id = 'reg_fra_1'").run();
    const full = pickNodeForService(db, 'reg_fra_1', 4096, 10240);
    expect(full?.hasCapacity).toBe(false);
    expect((db.prepare('SELECT region_id r FROM nodes WHERE id = ?').get(full!.id) as any).r).toBe('reg_fra_1');
    expect(pickNodeForService(db, 'reg_empty', 1, 1)).toBeNull();
  });

  it('NEW-350: a held payment event can be retried by staff once its cause is fixed, and only held or failed events can', async () => {
    const { retryPspInboxEvent } = await import('../src/modules/payments/webhooks.js');
    const { checkout } = await paidService();
    const staffId = user().user.id;
        const payload: StripeWebhookPayload = { id: 'evt_held', type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000), data: { object: { id: 'pi_arrives_late', amount: 1428, currency: 'eur', status: 'succeeded', metadata: {} } } };
    expect(ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db).status).toBe('ANOMALY_HELD');
    const row = db.prepare("SELECT id, status FROM psp_inbox_events WHERE event_id = 'evt_held'").get() as { id: string; status: string };
    expect(row.status).toBe('ANOMALY');
    db.prepare('UPDATE payment_attempts SET psp_payment_intent_id = ? WHERE id = ?').run('pi_arrives_late', checkout.paymentAttemptId);
    const result = retryPspInboxEvent(db, row.id, { userId: staffId, ipAddress: '127.0.0.1' });
    expect(result.status).toBe('PROCESSED');
    expect((db.prepare('SELECT status FROM psp_inbox_events WHERE id = ?').get(row.id) as any).status).toBe('PROCESSED');
    expect(() => retryPspInboxEvent(db, row.id, { userId: staffId, ipAddress: '127.0.0.1' })).toThrow(/NOT_RETRYABLE/);
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'payment.inbox_retried'").get() as any).c).toBe(1);
  });
});
