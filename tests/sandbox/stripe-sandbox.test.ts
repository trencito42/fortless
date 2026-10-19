/**
 * [SANDBOX_VERIFIED] checks against the real Stripe TEST-mode API (NEW-333, NEW-334, NEW-340, NEW-345, FTL-BILL-206).
 * Run with: npm run test:sandbox. Reads STRIPE_SECRET_KEY from FORTLESS_ENV_FILE (default ./.env) inside the process and
 * refuses to run for anything but an sk_test_ key. Everything it creates in Stripe is test data and is cancelled/expired.
 */
import fs from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const envFile = process.env['FORTLESS_ENV_FILE'] || '.env';
const fileEnv: Record<string, string> = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) fileEnv[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}
const key = process.env['STRIPE_SECRET_KEY'] || fileEnv['STRIPE_SECRET_KEY'] || '';
const enabled = key.startsWith('sk_test_');

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_PATH'] = ':memory:';
process.env['SESSION_SECRET'] = 'sandbox-session-secret-0123456789abcdef0123456789';
process.env['EMAIL_MODE'] = 'sandbox';
process.env['STRIPE_SECRET_KEY'] = enabled ? key : '';
process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_sandbox_unused';
process.env['PAYMENTS_MODE'] = 'stripe_test';

describe.skipIf(!enabled)('Stripe TEST-mode verification', () => {
  let Stripe: any, stripe: any, Database: any, db: any;
  let mods: any;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    Stripe = (await import('stripe')).default;
    stripe = new Stripe(key);
    Database = (await import('better-sqlite3')).default;
    mods = {
      schema: await import('../../src/database/schema.js'),
      migrations: await import('../../src/database/migrations.js'),
      catalog: await import('../../src/modules/catalog/catalog.js'),
      auth: await import('../../src/modules/identity/auth.js'),
      quote: await import('../../src/modules/pricing/quote.js'),
      checkout: await import('../../src/modules/checkout/checkout.js'),
      webhooks: await import('../../src/modules/payments/webhooks.js'),
      worker: await import('../../src/modules/outbox/worker.js'),
      adapter: await import('../../src/modules/provisioning/adapter.js'),
      subs: await import('../../src/modules/billing/subscriptions.js'),
    };
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(mods.schema.SCHEMA_SQL);
    mods.migrations.runMigrations(db);
    mods.catalog.seedInitialCatalog(db);
  });
  afterAll(async () => { for (const fn of cleanup.reverse()) { try { await fn(); } catch { /* best effort */ } } });

  let seq = 0;
  const newUser = () => { seq++; return mods.auth.registerUser({ email: `sbx${seq}@example.com`, password: 'Password12345!', name: `Sbx ${seq}`, ipAddress: '127.0.0.1', userAgent: 'test' }, db); };

  it('NEW-340/NEW-345/FTL-BILL-206: a real checkout session bills recurring + setup lines, matches the quote, and a retry returns the same session', async () => {
    const u = newUser();
    db.prepare("INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units) VALUES ('prc_sbx', 'plv_mc_4gb', 'EUR', 'QUARTERLY', 3000, 500)").run();
    const quote = mods.quote.createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1, interval: 'QUARTERLY', regionId: 'reg_fra_1' }], 'DE', false, undefined, db);
    const first = await mods.checkout.processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: 'sbx_idem_1', regionId: 'reg_fra_1' }, db);
    const attempt = db.prepare('SELECT psp_session_id s, amount_minor_units a FROM payment_attempts WHERE id = ?').get(first.paymentAttemptId);
    expect(attempt.s).toMatch(/^cs_test_/);
    cleanup.push(() => stripe.checkout.sessions.expire(attempt.s));
    const session = await stripe.checkout.sessions.retrieve(attempt.s, { expand: ['line_items'] });
    expect(session.mode).toBe('subscription');
    expect(session.amount_total).toBe(quote.totalMinorUnits);
    const lines = session.line_items.data;
    expect(lines).toHaveLength(2);
    expect(lines.filter((l: any) => l.price.type === 'recurring')).toHaveLength(1);
    expect(lines.filter((l: any) => l.price.type === 'one_time')).toHaveLength(1);
    const recurring = lines.find((l: any) => l.price.type === 'recurring');
    expect(recurring.price.recurring).toMatchObject({ interval: 'month', interval_count: 3 });
    expect(recurring.price.unit_amount).toBe(3000);
    // retry with the same Fortless key: same order, same Stripe session
    const again = await mods.checkout.processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: 'sbx_idem_1', regionId: 'reg_fra_1' }, db);
    expect(again.orderId).toBe(first.orderId);
    expect((db.prepare('SELECT COUNT(*) c FROM payment_attempts WHERE invoice_id = ?').get(first.invoiceId) as any).c).toBe(1);
  });

  it('NEW-340/NEW-345: an introductory coupon is applied by Stripe and the session total matches the quote', async () => {
    const u = newUser();
    mods.catalog.createCoupon({ code: 'SBX10', discountType: 'PERCENTAGE', discountValue: 10, maxRedemptions: 5, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, db);
    const quote = mods.quote.createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, 'SBX10', db);
    const out = await mods.checkout.processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: 'sbx_idem_2', regionId: 'reg_fra_1' }, db);
    const sid = db.prepare('SELECT psp_session_id s FROM payment_attempts WHERE id = ?').get(out.paymentAttemptId).s;
    cleanup.push(() => stripe.checkout.sessions.expire(sid));
    const session = await stripe.checkout.sessions.retrieve(sid);
    expect(session.amount_total).toBe(quote.totalMinorUnits);
    expect(session.total_details.amount_discount).toBeGreaterThan(0);
  });

  async function realSubscription() {
    const customer = await stripe.customers.create({ email: 'sandbox@example.com', description: 'Fortless sandbox verification' });
    cleanup.push(() => stripe.customers.del(customer.id));
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const product = await stripe.products.create({ name: 'Fortless sandbox plan' });
    cleanup.push(() => stripe.products.update(product.id, { active: false }));
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price_data: { currency: 'eur', product: product.id, recurring: { interval: 'month' }, unit_amount: 1428 } }],
      expand: ['latest_invoice.payment_intent'],
    });
    expect(sub.status).toBe('active');
    cleanup.push(() => stripe.subscriptions.cancel(sub.id).catch(() => undefined));
    return sub;
  }

  async function localSubscription(pspSubId: string) {
    const u = newUser();
    const quote = mods.quote.createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, db);
    const checkout = await mods.checkout.processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: `sbx_sub_${seq}`, regionId: 'reg_fra_1' }, db);
    cleanup.push(() => stripe.checkout.sessions.expire((db.prepare('SELECT psp_session_id s FROM payment_attempts WHERE id = ?').get(checkout.paymentAttemptId) as any).s));
    const payload = { id: `evt_sbx_${seq}`, type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000),
      data: { object: { id: checkout.paymentAttemptId, amount: quote.totalMinorUnits, currency: 'eur', status: 'succeeded', metadata: { orderId: checkout.orderId } } } };
    mods.webhooks.ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(payload), payload, db);
    const adapter = new mods.adapter.MockPterodactylAdapter();
    await mods.worker.processOutboxQueue(adapter, db);
    const svc = db.prepare('SELECT id FROM services WHERE account_id = ?').get(u.account.id);
    db.prepare(`INSERT OR REPLACE INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'MONTHLY', '2026-10-01', '2026-11-01', '2026-11-01', 1428)`).run(`sub_sbx_${seq}`, u.account.id, svc.id, pspSubId);
    return { u, checkout, subId: `sub_sbx_${seq}`, adapter, svcId: svc.id as string };
  }

  it('NEW-333: cancel at period end and immediate cancel reach Stripe and the states converge', async () => {
    const a = await realSubscription();
    const l = await localSubscription(a.id);
    const eop = await mods.subs.cancelSubscription({ subscriptionId: l.subId, accountId: l.u.account.id, userId: l.u.user.id, immediate: false }, db);
    expect(eop.status).toBeDefined();
    await mods.worker.processOutboxQueue(l.adapter, db);
    const afterEop = await stripe.subscriptions.retrieve(a.id);
    expect(afterEop.cancel_at_period_end).toBe(true);
    expect(afterEop.status).toBe('active');

    const b = await realSubscription();
    const l2 = await localSubscription(b.id);
    await mods.subs.cancelSubscription({ subscriptionId: l2.subId, accountId: l2.u.account.id, userId: l2.u.user.id, immediate: true }, db);
    await mods.worker.processOutboxQueue(l2.adapter, db);
    await mods.worker.processOutboxQueue(l2.adapter, db);
    const afterNow = await stripe.subscriptions.retrieve(b.id);
    expect(afterNow.status).toBe('canceled');
    // cancelling something Stripe no longer has is the desired end state, not a failure
    await mods.subs.cancelSubscription({ subscriptionId: l2.subId, accountId: l2.u.account.id, userId: l2.u.user.id, immediate: true }, db).catch(() => undefined);
    expect((db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE status IN ('FAILED','DEAD_LETTER')").get() as any).c).toBe(0);
  });

  it('NEW-334: a staff refund creates one real Stripe refund for the exact amount and a replay does not double it', async () => {
    const a = await realSubscription();
    const pi = typeof a.latest_invoice.payment_intent === 'string' ? a.latest_invoice.payment_intent : a.latest_invoice.payment_intent.id;
    const l = await localSubscription(a.id);
    db.prepare('UPDATE payment_attempts SET psp_payment_intent_id = ? WHERE id = ?').run(pi, l.checkout.paymentAttemptId);
    const invoiceId = (db.prepare('SELECT invoice_id i FROM payment_attempts WHERE id = ?').get(l.checkout.paymentAttemptId) as any).i;
    const staff = newUser();
    const result = mods.webhooks.processStaffRefund({ invoiceId, amountMinorUnits: 500, reason: 'sandbox goodwill', staffUserId: staff.user.id, ipAddress: '127.0.0.1' }, db);
    expect(result.pspRefund).toBe('REQUESTED');
    await mods.worker.processOutboxQueue(l.adapter, db);
    await mods.worker.processOutboxQueue(l.adapter, db);
    const row = db.prepare('SELECT status, psp_refund_id FROM refunds WHERE id = ?').get(result.refundId);
    expect(row.status).toBe('SUCCEEDED');
    const refunds = await stripe.refunds.list({ payment_intent: pi });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0].amount).toBe(500);
    expect(refunds.data[0].id).toBe(row.psp_refund_id);
  });
});
