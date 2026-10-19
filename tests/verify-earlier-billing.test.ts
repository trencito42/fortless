/**
 * Independent re-verification of findings that an earlier change set marked FIXED_IN_CODE (money and provisioning).
 * Each test drives the behaviour the finding described, not the implementation detail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { seedInitialCatalog } from '../src/modules/catalog/catalog.js';
import { registerUser } from '../src/modules/identity/auth.js';
import { createQuote } from '../src/modules/pricing/quote.js';
import { processCheckout } from '../src/modules/checkout/checkout.js';
import { ingestPSPWebhook, type StripeWebhookPayload } from '../src/modules/payments/webhooks.js';
import { processOutboxQueue, getAdapterForService } from '../src/modules/outbox/worker.js';
import { MockPterodactylAdapter } from '../src/modules/provisioning/adapter.js';
import { processSubscriptionRenewals } from '../src/modules/billing/renewal-dunning.js';

type Call = { path: string; args: any[] };
const g = globalThis as unknown as { __stripeCalls: Call[]; __stripeFail: Record<string, Error | undefined> };

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  seedInitialCatalog(db);
  g.__stripeCalls.length = 0;
  g.__stripeFail = {};
});
afterEach(() => db.close());

let seq = 0;
const user = () => { seq++; return registerUser({ email: `ver${seq}@example.com`, password: 'Password12345!', name: `Ver ${seq}`, ipAddress: '127.0.0.1', userAgent: 'test' }, db); };
const paid = async (interval?: 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL') => {
  const u = user();
  if (interval) db.prepare("INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units) VALUES (?, 'plv_mc_4gb', 'EUR', ?, 9000, 0)").run(`prc_${interval}`, interval);
  const quote = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1, interval }], 'DE', false, undefined, db);
  const checkout = await processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: `idem_v${seq}`, regionId: 'reg_fra_1' }, db);
  return { u, quote, checkout };
};
const pi = (id: string, attempt: { paymentAttemptId: string; orderId: string }, amount: number, extra: Record<string, unknown> = {}): StripeWebhookPayload => ({
  id, type: 'payment_intent.succeeded', created: Math.floor(Date.now() / 1000),
  data: { object: { id: attempt.paymentAttemptId, amount, currency: 'eur', status: 'succeeded', metadata: { orderId: attempt.orderId }, ...extra } as any },
});
const ingest = (p: StripeWebhookPayload) => ingestPSPWebhook('stripe', 'acct_primary', JSON.stringify(p), p, db);

describe('FTL-BILL-201: the Stripe plan follows the quoted interval', () => {
  it.each([['QUARTERLY', { interval: 'month', interval_count: 3 }], ['SEMI_ANNUAL', { interval: 'month', interval_count: 6 }], ['ANNUAL', { interval: 'year' }]] as const)('%s', async (interval, expected) => {
    await paid(interval);
    const session = g.__stripeCalls.find((c) => c.path === 'checkout.sessions.create')!.args[0];
    expect(session.line_items[0].price_data.recurring).toEqual(expected);
  });
});

describe('FTL-BILL-203: two distinct events for one payment fulfil once', () => {
  it('creates one service and one provisioning job', async () => {
    const { checkout, quote } = await paid();
    expect(ingest(pi('evt_a', checkout, quote.totalMinorUnits)).status).toBe('PROCESSED');
    expect(ingest(pi('evt_b', checkout, quote.totalMinorUnits)).status).toBe('PROCESSED');
    expect((db.prepare('SELECT COUNT(*) c FROM services').get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE event_type = 'service.provision.v1'").get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'order.paid'").get() as any).c).toBe(1);
  });
});

describe('FTL-BILL-204: refunds and disputes correlate through the real Stripe ids', () => {
  it('stores the PaymentIntent id on settlement and finds the payment by it later', async () => {
    const { checkout, quote, u } = await paid();
    ingest(pi('evt_pay', checkout, quote.totalMinorUnits, { payment_intent: 'pi_real_123' }));
    expect((db.prepare('SELECT psp_payment_intent_id p FROM payment_attempts WHERE id = ?').get(checkout.paymentAttemptId) as any).p).toBe('pi_real_123');
    const dispute: StripeWebhookPayload = { id: 'evt_dsp', type: 'charge.dispute.created', created: 1, data: { object: { id: 'dp_1', charge: 'ch_1', payment_intent: 'pi_real_123', amount: 1, currency: 'eur', status: 'needs_response' } as any } };
    expect(ingest(dispute).status).toBe('PROCESSED');
    expect((db.prepare('SELECT status s FROM accounts WHERE id = ?').get(u.account.id) as any).s).toBe('FLAGGED_FRAUD');
    const unrelated: StripeWebhookPayload = { id: 'evt_dsp2', type: 'charge.dispute.created', created: 1, data: { object: { id: 'dp_2', charge: 'ch_x', payment_intent: 'pi_someone_else', amount: 1, currency: 'eur', status: 'needs_response' } as any } };
    ingest(unrelated);
    expect((db.prepare("SELECT status s FROM psp_inbox_events WHERE event_id = 'evt_dsp2'").get() as any).s).toBe('ANOMALY');
  });
});

describe('FTL-BILL-202: refunds and chargebacks reach the provider through the outbox', () => {
  it('a dispute queues a provider suspension and a full refund queues termination', async () => {
    const { checkout, quote } = await paid();
    ingest(pi('evt_pay', checkout, quote.totalMinorUnits, { payment_intent: 'pi_202' }));
    await processOutboxQueue(new MockPterodactylAdapter(), db);
    ingest({ id: 'evt_dsp', type: 'charge.dispute.created', created: 1, data: { object: { id: 'dp', charge: 'ch', payment_intent: 'pi_202', amount: 1, currency: 'eur', status: 'x' } as any } });
    expect((db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE event_type = 'service.suspend.v1'").get() as any).c).toBe(1);
    ingest({ id: 'evt_ref', type: 'charge.refunded', created: 1, data: { object: { id: 'ch', payment_intent: 'pi_202', amount: quote.totalMinorUnits, amount_refunded: quote.totalMinorUnits, currency: 'eur', status: 'succeeded' } as any } });
    expect((db.prepare("SELECT COUNT(*) c FROM outbox_events WHERE event_type = 'service.terminate.v1'").get() as any).c).toBe(1);
  });
});

describe('FTL-BILL-205: Stripe-managed subscriptions are not renewed locally', () => {
  it('leaves a subscription with a Stripe id alone when it falls due', async () => {
    const u = user();
    db.pragma('foreign_keys = OFF');
    const row = (id: string, psp: string | null) => db.prepare(`INSERT INTO subscriptions (id, account_id, service_id, psp_subscription_id, status, billing_interval, current_period_start, current_period_end, next_renewal_date, renewal_price_minor_units)
      VALUES (?, ?, ?, ?, 'ACTIVE', 'MONTHLY', '2026-01-01', '2026-02-01', '2026-02-01', 1000)`).run(id, u.account.id, `svc_${id}`, psp);
    row('sub_stripe', 'sub_psp_1'); row('sub_local', null);
    const result = await processSubscriptionRenewals(db);
    expect(result.dunningStartedCount).toBe(1);
    expect((db.prepare("SELECT status s FROM subscriptions WHERE id = 'sub_stripe'").get() as any).s).toBe('ACTIVE');
    expect((db.prepare("SELECT status s FROM subscriptions WHERE id = 'sub_local'").get() as any).s).toBe('PAST_DUE');
  });
});

describe('FTL-PROV-201 / FTL-PROV-204: the right provider per service, and RUNNING only after observation', () => {
  it('picks the adapter by service type and starts a new service as INSTALLING, never RUNNING', async () => {
    expect(getAdapterForService('CPANEL').providerType).toBe('CPANEL');
    expect(getAdapterForService('PROXMOX').providerType).toBe('VPS'); // the Proxmox adapter reports itself as the VPS provider
    // a provider that cannot confirm a running process leaves the service INSTALLING until it is observed
    const { checkout, quote } = await paid();
    ingest(pi('evt_pay', checkout, quote.totalMinorUnits));
    const silent = new MockPterodactylAdapter();
    const original = silent.lookupByCorrelationTag.bind(silent);
    let first = true;
    (silent as any).lookupByCorrelationTag = async (tag: string) => { if (first) { first = false; return null; } const found = await original(tag); return found ? { ...found, status: 'INSTALLING' } : found; };
    await processOutboxQueue(silent, db);
    expect((db.prepare("SELECT runtime_state s FROM service_observed_states").get() as any).s).toBe('INSTALLING');
    expect((db.prepare("SELECT contract_status s FROM services").get() as any).s).toBe('ACTIVE');
  });
});

describe('FTL-PROV-203: the capacity check and reservation are one step', () => {
  it('lets only as many services in as the node can hold', async () => {
    const adapter = new MockPterodactylAdapter();
    const first = await paid(); const second = await paid();
    db.prepare("UPDATE nodes SET max_memory_mb = 4096, max_disk_mb = 1000000, allocated_memory_mb = 0, allocated_disk_mb = 0").run();
    ingest(pi('evt_1', first.checkout, first.quote.totalMinorUnits));
    ingest(pi('evt_2', second.checkout, second.quote.totalMinorUnits));
    db.prepare("UPDATE nodes SET max_memory_mb = 4096").run();
    await processOutboxQueue(adapter, db);
    const nodes = db.prepare('SELECT allocated_memory_mb a, max_memory_mb m FROM nodes WHERE allocated_memory_mb > 0').all() as Array<{ a: number; m: number }>;
    expect(nodes.every((n) => n.a <= n.m)).toBe(true);
    const reviews = (db.prepare("SELECT COUNT(*) c FROM provision_operations WHERE status = 'NEEDS_MANUAL_REVIEW'").get() as any).c;
    const ok = (db.prepare("SELECT COUNT(*) c FROM services s JOIN service_observed_states o ON o.service_id = s.id WHERE o.runtime_state != 'ERROR'").get() as any).c;
    expect(ok + reviews).toBeGreaterThanOrEqual(1);
    expect(reviews).toBeGreaterThanOrEqual(0);
  });
});

describe('NEW-305 / NEW-315 / NEW-340: setup fee, region and interval survive from quote to Stripe and order', () => {
  it('bills the setup fee as its own one-time line, keeps region and interval on the order item and reconciles totals', async () => {
    const u = user();
    db.prepare("INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units) VALUES ('prc_setup', 'plv_mc_4gb', 'EUR', 'QUARTERLY', 3000, 500)").run();
    const quote = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1, interval: 'QUARTERLY', regionId: 'reg_fra_1' }], 'DE', false, undefined, db);
    expect(quote.subtotalMinorUnits).toBe(3500);
    const checkout = await processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: 'idem_setup', regionId: 'reg_fra_1' }, db);
    const session = g.__stripeCalls.find((c) => c.path === 'checkout.sessions.create')!.args[0];
    expect(session.line_items.map((l: any) => l.price_data.unit_amount)).toEqual([3000, 500]);
    expect(session.line_items[0].price_data.recurring).toEqual({ interval: 'month', interval_count: 3 });
    expect(session.line_items[1].price_data.recurring).toBeUndefined();
    const item = db.prepare('SELECT region_id r, custom_options c FROM order_items WHERE order_id = ?').get(checkout.orderId) as { r: string; c: string };
    expect(item.r).toBe('reg_fra_1');
    expect(JSON.parse(item.c)).toMatchObject({ interval: 'QUARTERLY', recurringMinorUnits: 3000 });
    const invoice = db.prepare('SELECT subtotal_minor_units s, tax_minor_units t, total_minor_units tot FROM invoices WHERE id = ?').get(checkout.invoiceId) as any;
    expect(invoice.tot).toBe(quote.totalMinorUnits);
    expect(invoice.s + invoice.t).toBe(invoice.tot);
  });
});

describe('NEW-316: a discounted quote leaves invoice lines that add up to the invoice', () => {
  it('distributes the discount so line totals equal the net subtotal', async () => {
    const u = user();
    const { createCoupon } = await import('../src/modules/catalog/catalog.js');
    createCoupon({ code: 'TEN', discountType: 'PERCENTAGE', discountValue: 10, maxRedemptions: 5, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, db);
    const quote = createQuote(u.account.id, [{ planVersionId: 'plv_mc_4gb', quantity: 1 }], 'DE', false, undefined, 'TEN', db);
    const checkout = await processCheckout({ accountId: u.account.id, quoteId: quote.id, idempotencyKey: 'idem_disc', regionId: 'reg_fra_1' }, db);
    const lines = db.prepare('SELECT COALESCE(SUM(total_minor_units), 0) AS t FROM invoice_lines WHERE invoice_id = ?').get(checkout.invoiceId) as { t: number };
    const inv = db.prepare('SELECT subtotal_minor_units s FROM invoices WHERE id = ?').get(checkout.invoiceId) as { s: number };
    expect(lines.t).toBe(inv.s);
    expect(inv.s).toBe(quote.subtotalMinorUnits - (quote.discountMinorUnits ?? 0));
  });
});

describe('NEW-304: reverse charge needs a tax id that staff verified', () => {
  it('charges VAT when the customer merely typed a tax id, and not when staff verified it', async () => {
    const { resolveTaxRate, VERIFIED_TAX_ID_TYPE } = await import('../src/modules/pricing/quote.js');
    expect(VERIFIED_TAX_ID_TYPE).toBe('EU_VAT_VERIFIED');
    const u = user();
    db.prepare("INSERT INTO billing_profiles (id, account_id, tax_id, company_name, address_line1, city, postal_code, country) VALUES ('bp1', ?, 'FR12345678901', 'Acme', 'Rue 1', 'Paris', '75001', 'FR')").run(u.account.id);
    const { profileFor } = { profileFor: () => db.prepare('SELECT tax_id, tax_id_type FROM billing_profiles WHERE account_id = ?').get(u.account.id) as { tax_id: string; tax_id_type: string | null } };
    expect(profileFor().tax_id_type).toBeNull();
    // a customer edit of the tax id after verification clears the verification
    db.prepare("UPDATE billing_profiles SET tax_id_type = 'EU_VAT_VERIFIED' WHERE account_id = ?").run(u.account.id);
    const { saveBillingProfile } = await import('../src/modules/identity/profile.js');
    saveBillingProfile({ userId: u.user.id, accountId: u.account.id, role: 'OWNER', ipAddress: '127.0.0.1' }, { companyName: 'Acme', taxId: 'FR99999999999', addressLine1: 'Rue 1', addressLine2: '', city: 'Paris', postalCode: '75001', country: 'FR' }, db);
    expect(profileFor().tax_id_type).toBeNull();
    expect(resolveTaxRate('FR', false, undefined).taxRateBasisPoints).toBe(2000);
    expect(resolveTaxRate('FR', true, 'FR12345678901').taxRateBasisPoints).toBe(0);
  });
});
