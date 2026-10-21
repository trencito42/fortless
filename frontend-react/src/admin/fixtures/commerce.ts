import type {
  BillingInterval, Currency, Customer, Invoice, InvoiceLine, InvoiceStatus, Job, JobLog, JobStatus, Money, Order, OrderLine, OrderStatus, Payment, Refund, RuntimeState, Service, ServiceLifecycle,
  Subscription, SubscriptionStatus, WebhookEvent, InfraNode, IpAllocation, FulfillmentState, PaymentState,
} from '../types';
import { ADMIN_NOW, DAY, HOUR, MIN, intervalMonths, iso } from '../lib/format';
import { plans, planById, productById, priceOf } from './catalog';
import { makeRng, pad } from './rng';

/** Mirrors VAT_RATES in src/modules/pricing/quote.ts (default 19% for unlisted countries; EU B2B with a valid VAT id outside DE is reverse-charged). */
const TAX: Record<string, number> = { DE: 19, FR: 20, ES: 21, IT: 22, NL: 21, BE: 21, AT: 20, GB: 20, US: 0 };
const addMonths = (t: number, n: number) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };

const NODE_DEFS: Array<{ id: string; name: string; region: string; target: number; health: InfraNode['health']; cores: number; cost: number | null; ip: string; over: number }> = [
  { id: 'node-fra-01', name: 'Frankfurt 01', region: 'fra', target: 0.78, health: 'healthy', cores: 32, cost: 21900, ip: '198.51.100.10', over: 20 },
  { id: 'node-fra-02', name: 'Frankfurt 02', region: 'fra', target: 0.93, health: 'degraded', cores: 32, cost: 21900, ip: '198.51.100.11', over: 20 },
  { id: 'node-ams-01', name: 'Amsterdam 01', region: 'ams', target: 0.62, health: 'healthy', cores: 24, cost: 18900, ip: '198.51.100.20', over: 20 },
  { id: 'node-buc-01', name: 'Bucharest 01', region: 'buc', target: 0.55, health: 'healthy', cores: 24, cost: null, ip: '198.51.100.30', over: 10 },
  { id: 'node-hel-01', name: 'Helsinki 01', region: 'hel', target: 0.48, health: 'healthy', cores: 16, cost: 12900, ip: '198.51.100.40', over: 10 },
  { id: 'node-ash-01', name: 'Ashburn 01', region: 'ash', target: 0.35, health: 'healthy', cores: 24, cost: 24900, ip: '198.51.100.50', over: 15 },
];
export const REGION_NAMES: Record<string, string> = { fra: 'Frankfurt, DE', ams: 'Amsterdam, NL', buc: 'Bucharest, RO', hel: 'Helsinki, FI', ash: 'Ashburn, US' };

const svcWords: Record<string, string[]> = {
  prd_minecraft: ['survival', 'skyblock', 'smp', 'creative', 'modded', 'factions', 'lobby', 'hardcore'], prd_cs2: ['pug', 'dm', 'retake', 'scrim', 'surf'], prd_cs16: ['classic', 'dust2', 'zombie', 'public'],
  prd_discord: ['modbot', 'musicbot', 'ticketbot', 'levelsbot'], prd_nodejs: ['api', 'landing', 'dashboard', 'webhook-relay'],
};

export interface Commerce { services: Service[]; nodes: InfraNode[]; ips: IpAllocation[]; orders: Order[]; invoices: Invoice[]; payments: Payment[]; refunds: Refund[]; subscriptions: Subscription[]; jobs: Job[]; webhooks: WebhookEvent[] }

export function buildCommerce(customers: Customer[]): Commerce {
  const r = makeRng(99);
  const services: Service[] = [];
  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const subscriptions: Subscription[] = [];
  const jobs: Job[] = [];
  const webhooks: WebhookEvent[] = [];
  let sN = 0, oN = 0, iN = 0, pN = 0, jN = 0, subN = 0, evN = 0;
  const m = (amount: number, currency: Currency): Money => ({ amount, currency });
  const zeroM = (c: Currency) => m(0, c);
  const custById = new Map(customers.map((c) => [c.id, c]));

  const event = (type: string, objectId: string, status: WebhookEvent['status'], at: string, customerId: string | null, error: string | null = null): WebhookEvent => {
    const e: WebhookEvent = { id: `evt_${r.hex(14)}`, provider: 'stripe', type, status, objectId, receivedAt: at, processedAt: status === 'processed' || status === 'duplicate' ? new Date(Date.parse(at) + r.int(300, 4000)).toISOString() : null, signatureVerified: true, attempts: status === 'failed' ? r.int(2, 5) : 1, error, customerId };
    evN++; webhooks.push(e); return e;
  };

  const mkLines = (planId: string, cur: Currency, interval: BillingInterval, name: string, serviceId: string | null): { order: OrderLine; net: Money } => {
    const net = m(priceOf(planId, cur, interval), cur);
    return { order: { id: `ol_${pad(oN, 5)}_${r.hex(3)}`, description: `${planById[planId]!.name} — ${name}`, planId, quantity: 1, unit: net, interval, serviceId }, net };
  };

  const money = (net: Money, c: Customer, couponPct: number) => {
    const rate = c.type === 'business' && c.billingProfile.vatId && c.country !== 'DE' ? 0 : c.billingProfile.taxExempt ? 0 : TAX[c.country] ?? 19;
    const discount = Math.round(net.amount * couponPct / 100);
    const taxable = net.amount - discount;
    const tax = Math.round(taxable * rate / 100);
    return { rate, subtotal: net, discount: m(discount, net.currency), tax: m(tax, net.currency), total: m(taxable + tax, net.currency) };
  };

  const newInvoice = (c: Customer, o: { orderId: string | null; serviceId: string | null; desc: string; net: Money; at: number; status: InvoiceStatus; couponPct?: number; paidFull?: boolean; dueDays?: number }): Invoice => {
    iN++;
    const t = money(o.net, c, o.couponPct ?? 0);
    const line: InvoiceLine = { id: `il_${pad(iN, 5)}`, description: o.desc, quantity: 1, unit: o.net, taxRatePct: t.rate };
    const inv: Invoice = {
      id: `inv_${pad(iN, 5)}`, number: `INV-${new Date(o.at).getUTCFullYear()}-${pad(1000 + iN, 5)}`, customerId: c.id, status: o.status, currency: o.net.currency, issuedAt: new Date(o.at).toISOString(), dueAt: new Date(o.at + (o.dueDays ?? 7) * DAY).toISOString(),
      lines: [line], subtotal: t.subtotal, tax: t.tax, discount: t.discount, total: t.total, amountPaid: o.status === 'PAID' ? t.total : zeroM(o.net.currency), amountRefunded: zeroM(o.net.currency), creditApplied: zeroM(o.net.currency),
      orderId: o.orderId, serviceId: o.serviceId, paymentIds: [], refundIds: [],
    };
    invoices.push(inv); return inv;
  };

  const brands = ['Visa', 'Mastercard', 'Visa', 'Amex', 'Visa', 'SEPA'];
  const newPayment = (inv: Invoice, at: number, status: Payment['status'], failureCode?: string, reconciled = true): Payment => {
    pN++;
    const brand = r.pick(brands);
    const p: Payment = {
      id: `pay_${pad(pN, 5)}`, customerId: inv.customerId, invoiceId: inv.id, orderId: inv.orderId, amount: inv.total, status, method: { brand, last4: String(r.int(1000, 9999)) },
      providerRef: `pi_${r.hex(16)}`, createdAt: new Date(at).toISOString(), reconciled, webhookEventId: null, ...(failureCode ? { failureCode } : {}),
    };
    payments.push(p); inv.paymentIds.push(p.id);
    const ev = event(status === 'succeeded' ? 'payment_intent.succeeded' : status === 'failed' ? 'payment_intent.payment_failed' : 'payment_intent.processing', p.providerRef, reconciled ? 'processed' : 'pending_review', p.createdAt, inv.customerId);
    p.webhookEventId = ev.id;
    return p;
  };

  const job = (o: Partial<Job> & { type: string; status: JobStatus; createdAt: string }): Job => {
    jN++;
    const j: Job = {
      id: `job_${pad(jN, 5)}`, attempts: o.status === 'pending' ? 0 : 1, maxAttempts: 5, correlationId: `cor_${r.hex(12)}`, idempotencyKey: `${o.type.toLowerCase()}:${o.orderId ?? o.serviceId ?? jN}`,
      orderId: null, serviceId: null, customerId: null, nodeId: null, error: null, unknownOutcome: false, startedAt: o.status === 'pending' ? null : o.createdAt, finishedAt: o.status === 'completed' ? new Date(Date.parse(o.createdAt) + r.int(40, 240) * 1000).toISOString() : null,
      nextRetryAt: null, workerId: o.status === 'pending' ? null : `wrk_${r.int(1, 3)}`, logs: [], ...o,
    };
    jobs.push(j); return j;
  };

  /* ---------- services + their orders, invoices, payments, subscriptions ---------- */
  const heroCounts: Record<string, number> = { acc_0001: 18, acc_0007: 9, acc_0004: 6, acc_0003: 2, acc_0008: 3, acc_0002: 3, acc_0005: 2, acc_0006: 0 };
  const planWeights: Array<[string, number]> = [['pln_mc_pebble', 14], ['pln_mc_stone', 18], ['pln_mc_iron', 12], ['pln_mc_diamond', 4], ['pln_cs2_casual', 9], ['pln_cs2_pro', 6], ['pln_cs16_classic', 7], ['pln_bot_nano', 12], ['pln_bot_plus', 7], ['pln_node_s', 6], ['pln_node_m', 3]];

  for (const c of customers) {
    if (c.status === 'PENDING_VERIFICATION') continue;
    const count = heroCounts[c.id] ?? (c.status === 'CLOSED' ? r.int(0, 1) : r.weighted([[0, 28], [1, 38], [2, 20], [3, 9], [4, 5]]));
    for (let k = 0; k < count; k++) {
      sN++;
      const planId = r.weighted(planWeights);
      const plan = planById[planId]!;
      const product = productById[plan.productId]!;
      const region = r.weighted<string>(plan.regions.map((x) => [x, { fra: 35, ams: 20, buc: 20, hel: 12, ash: 13 }[x] ?? 10] as const));
      const nodeCandidates = NODE_DEFS.filter((n) => n.region === region);
      const nodeDef = nodeCandidates.length > 1 ? (r.chance(0.6) ? nodeCandidates[0]! : nodeCandidates[1]!) : nodeCandidates[0]!;
      const createdMs = ADMIN_NOW - Math.round(Math.pow(r.next(), 1.4) * 600 * DAY) - r.int(1, 20) * HOUR;
      const interval = c.id === 'acc_0001' ? (r.chance(0.7) ? 'ANNUAL' : 'MONTHLY') : r.weighted<BillingInterval>([['MONTHLY', 70], ['QUARTERLY', 15], ['ANNUAL', 15]]);
      let lifecycle: ServiceLifecycle = 'ACTIVE';
      if (c.status === 'SUSPENDED') lifecycle = 'SUSPENDED';
      else if (c.status === 'CLOSED') lifecycle = 'TERMINATED';
      else if (c.id === 'acc_0004' && k < 2) lifecycle = 'PAST_DUE';
      else lifecycle = r.weighted<ServiceLifecycle>([['ACTIVE', 91], ['PAST_DUE', 2], ['SUSPENDED', 1], ['CANCELLED', 3], ['TERMINATED', 3]]);
      const alive = lifecycle === 'ACTIVE' || lifecycle === 'PAST_DUE' || lifecycle === 'SUSPENDED';
      let runtime: RuntimeState = alive && lifecycle === 'ACTIVE' ? r.weighted<RuntimeState>([['running', 72], ['offline', 19], ['starting', 1], ['error', 5], ['unknown', 3]]) : lifecycle === 'TERMINATED' ? 'unknown' : 'offline';
      if (ADMIN_NOW - createdMs < 2 * HOUR) runtime = 'installing';
      const mem = plan.resources.memoryMb, disk = plan.resources.diskMb;
      const usedFrac = runtime === 'running' ? 0.2 + r.next() * 0.65 : runtime === 'offline' ? 0.02 : 0.1;
      const sync = lifecycle === 'TERMINATED' ? 'missing_remote' : r.weighted<Service['provider']['sync']>([['in_sync', 93], ['drift', 4], ['missing_remote', 1], ['unlinked', 2]]);
      const id = `svc_${pad(sN)}`;
      const word = r.pick(svcWords[plan.productId] ?? ['server']);
      const price = m(priceOf(planId, c.currency, interval), c.currency);
      const months = intervalMonths[interval]!;
      let next = createdMs; while (next <= ADMIN_NOW) next = addMonths(next, months);
      const endedMs = lifecycle === 'CANCELLED' || lifecycle === 'TERMINATED' ? Math.min(ADMIN_NOW - 2 * DAY, createdMs + r.int(20, 300) * DAY) : null;
      const svc: Service = {
        id, name: `${word}-${r.hex(3)}`, customerId: c.id, orderId: '', productId: product.id, planId, productName: product.name, planName: plan.name, lifecycle, runtime, nodeId: nodeDef.id, region,
        ip: nodeDef.ip, port: r.int(25000, 29999),
        resources: { ...plan.resources }, usage: { memoryMb: Math.round(mem * usedFrac), cpuPct: Math.round(plan.resources.cpuPct * usedFrac * 0.8), diskMb: Math.round(disk * (0.05 + r.next() * 0.5)) },
        provider: { type: 'PTERODACTYL', serverUuid: `${r.hex(8)}-${r.hex(4)}-4${r.hex(3)}-a${r.hex(3)}-${r.hex(12)}`, identifier: r.hex(8), externalId: sync === 'unlinked' ? null : 1000 + sN, allocationId: sync === 'unlinked' ? null : 5000 + sN, sync, lastSyncAt: iso(-r.int(1, 55) * MIN), correlationTag: `fl:${id}` },
        billing: { interval, price, nextRenewal: alive ? new Date(lifecycle === 'PAST_DUE' ? ADMIN_NOW - r.int(3, 9) * DAY : next).toISOString() : null, autoRenew: lifecycle === 'ACTIVE' && r.chance(0.92), subscriptionId: `sub_${pad(sN)}` },
        createdAt: new Date(createdMs).toISOString(), members: [],
      };
      services.push(svc);

      /* order */
      oN++;
      const orderId = `ord_${pad(oN, 5)}`;
      svc.orderId = orderId;
      const { order: line, net } = mkLines(planId, c.currency, interval, svc.name, id);
      const couponPct = r.chance(0.12) ? 10 : 0;
      const t = money(net, c, couponPct);
      const inv0 = newInvoice(c, { orderId, serviceId: id, desc: `${plan.name} (${interval.toLowerCase()}) — ${svc.name}`, net, at: createdMs, status: 'PAID', couponPct });
      const pay0 = newPayment(inv0, createdMs + 2 * MIN, 'succeeded');
      const o: Order = {
        id: orderId, customerId: c.id, status: 'COMPLETED', payment: 'succeeded', fulfillment: 'completed', fraudReview: 'none', lines: [line], subtotal: t.subtotal, tax: t.tax, discount: t.discount, total: t.total,
        couponCode: couponPct ? 'WELCOME10' : null, invoiceId: inv0.id, paymentIds: [pay0.id], jobIds: [], createdAt: new Date(createdMs).toISOString(), updatedAt: new Date(createdMs + 5 * MIN).toISOString(), quoteId: `qte_${r.hex(10)}`,
      };
      orders.push(o);
      const pj = job({ type: 'PROVISION_SERVICE', status: 'completed', createdAt: new Date(createdMs + 3 * MIN).toISOString(), orderId, serviceId: id, customerId: c.id, nodeId: nodeDef.id, logs: [
        { at: new Date(createdMs + 3 * MIN).toISOString(), level: 'info', message: `Reserved capacity on ${nodeDef.id}` }, { at: new Date(createdMs + 3 * MIN + 12000).toISOString(), level: 'info', message: `Created server tagged ${svc.provider.correlationTag}` }, { at: new Date(createdMs + 3 * MIN + 61000).toISOString(), level: 'info', message: 'Install finished, service activated' }] });
      o.jobIds.push(pj.id);

      /* renewals */
      const ends = endedMs ?? ADMIN_NOW;
      let due = addMonths(createdMs, months);
      const dues: number[] = [];
      while (due <= ends) { dues.push(due); due = addMonths(due, months); }
      for (const [idx, d] of dues.slice(-4).entries()) {
        const isLast = idx === Math.min(dues.length, 4) - 1;
        const unpaid = isLast && lifecycle === 'PAST_DUE';
        const price2 = m(priceOf(planId, c.currency, interval), c.currency);
        const inv = newInvoice(c, { orderId: null, serviceId: id, desc: `Renewal: ${plan.name} (${interval.toLowerCase()}) — ${svc.name}`, net: price2, at: d - 5 * DAY, status: unpaid ? 'OPEN' : 'PAID' });
        inv.dueAt = new Date(d).toISOString();
        if (unpaid) { newPayment(inv, d + HOUR, 'failed', r.pick(['card_declined', 'insufficient_funds', 'expired_card'])); if (r.chance(0.5)) newPayment(inv, d + 2 * DAY, 'failed', 'card_declined'); }
        else newPayment(inv, d - 4 * DAY, 'succeeded');
      }

      /* subscription */
      subN++;
      let subStatus: SubscriptionStatus = 'ACTIVE';
      if (lifecycle === 'PAST_DUE') subStatus = 'PAST_DUE'; else if (lifecycle === 'CANCELLED' || lifecycle === 'TERMINATED') subStatus = 'CANCELED'; else if (lifecycle === 'SUSPENDED') subStatus = 'PAST_DUE'; else if (!svc.billing.autoRenew) subStatus = 'CANCEL_AT_PERIOD_END';
      subscriptions.push({
        id: svc.billing.subscriptionId, customerId: c.id, serviceId: id, planName: plan.name, interval, price, status: subStatus, autoRenew: svc.billing.autoRenew, currentPeriodEnd: svc.billing.nextRenewal ?? new Date(endedMs ?? ADMIN_NOW).toISOString(),
        failedAttempts: subStatus === 'PAST_DUE' ? r.int(1, 3) : 0, graceUntil: subStatus === 'PAST_DUE' ? iso(r.int(1, 5) * DAY) : null, lastRenewalAt: dues.length ? new Date(dues[dues.length - 1]!).toISOString() : null,
      });
    }
  }
  const firstOf = (cid: string) => services.find((s) => s.customerId === cid);
  const svc8 = firstOf('acc_0008');
  const cust8 = custById.get('acc_0008');
  if (svc8 && cust8) cust8.notes.forEach((n) => { n.body = n.body.replace('svc_0412', svc8.id); });
  // Hero service states used by cross-page stories (Customer 360 / Action Center / Monitoring).
  const northwind = services.filter((s) => s.customerId === 'acc_0001');
  northwind.slice(0, 2).forEach((s) => { s.runtime = 'running'; s.lifecycle = 'ACTIVE'; });

  /* ---------- nodes sized from what is actually sold on them ---------- */
  const nodes: InfraNode[] = NODE_DEFS.map((d) => {
    const on = services.filter((s) => s.nodeId === d.id && (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE'));
    const allocRam = on.reduce((a, s) => a + s.resources.memoryMb, 0);
    const allocDisk = on.reduce((a, s) => a + s.resources.diskMb, 0);
    const allocCpu = on.reduce((a, s) => a + s.resources.cpuPct, 0);
    const ramPhysical = Math.ceil(allocRam / (d.target * (1 + d.over / 100)) / 8192) * 8192;
    const diskPhysical = Math.ceil(allocDisk / (d.target * 0.8 * (1 + d.over / 100)) / 102400) * 102400;
    const usedRam = on.filter((s) => s.runtime === 'running').reduce((a, s) => a + s.usage.memoryMb, 0) + Math.round(ramPhysical * 0.06);
    const usedDisk = on.reduce((a, s) => a + s.usage.diskMb, 0) + Math.round(diskPhysical * 0.08);
    const maintenance = d.id === 'node-hel-01';
    return {
      id: d.id, name: d.name, region: d.region, fqdn: `${d.id}.nodes.fortless.example`, connectionId: 'conn_wings_' + (d.region === 'ash' ? 'us' : 'eu'), health: d.health,
      maintenance: { enabled: maintenance, drain: maintenance, reason: maintenance ? 'Kernel and Wings upgrade; no new allocations' : null, since: maintenance ? iso(-3 * HOUR) : null, until: maintenance ? iso(5 * HOUR) : null },
      hardware: { cores: d.cores, ramMb: ramPhysical, diskMb: diskPhysical, bandwidthMbps: 1000 }, overallocate: { ramPct: d.over, diskPct: 10 },
      usage: { cpuPct: d.id === 'node-fra-02' ? 78 : Math.round(18 + d.target * 40), ramMb: usedRam, diskMb: usedDisk },
      allocated: { ramMb: allocRam, diskMb: allocDisk, cpuPct: allocCpu }, monthlyCost: d.cost == null ? null : m(d.cost, 'EUR'), wingsVersion: d.id === 'node-hel-01' ? '1.11.13' : '1.12.0', lastHeartbeat: iso(-(d.health === 'degraded' ? 94 : 8) * 1000), publicIp: d.ip, ipPool: `${d.ip.split('.').slice(0, 3).join('.')}.0/24`, os: 'Debian 12',
    };
  });

  const ips: IpAllocation[] = services.filter((s) => s.lifecycle !== 'TERMINATED').map((s, i) => ({ id: `alloc_${pad(i + 1, 5)}`, ip: s.ip, port: s.port, nodeId: s.nodeId, serviceId: s.id, alias: null, kind: 'game' as const }));
  for (const n of nodes) {
    ips.push({ id: `alloc_${n.id}_primary`, ip: n.publicIp, port: 8080, nodeId: n.id, serviceId: null, alias: 'wings-api', kind: 'primary' });
    for (let p = 0; p < 6; p++) ips.push({ id: `alloc_${n.id}_free${p}`, ip: n.publicIp, port: 30000 + p, nodeId: n.id, serviceId: null, alias: null, kind: p === 0 ? 'reserved' : 'game' });
  }

  /* ---------- non-service orders ---------- */
  const active = customers.filter((c) => c.status === 'ACTIVE');
  const mkOrder = (status: OrderStatus, payment: PaymentState, fulfillment: FulfillmentState, ageH: number, extra: Partial<Order> = {}, custIdx?: number): Order => {
    oN++;
    const c = custIdx != null ? customers[custIdx]! : r.pick(active);
    const planId = r.pick(plans.filter((p) => p.status === 'ACTIVE')).id;
    const interval = r.pick(['MONTHLY', 'QUARTERLY'] as BillingInterval[]);
    const { order: line, net } = mkLines(planId, c.currency, interval, 'new', null);
    const t = money(net, c, 0);
    const at = ADMIN_NOW - ageH * HOUR;
    const o: Order = { id: `ord_${pad(oN, 5)}`, customerId: c.id, status, payment, fulfillment, fraudReview: 'none', lines: [line], subtotal: t.subtotal, tax: t.tax, discount: t.discount, total: t.total, couponCode: null, invoiceId: null, paymentIds: [], jobIds: [], createdAt: new Date(at).toISOString(), updatedAt: new Date(at + 4 * MIN).toISOString(), quoteId: `qte_${r.hex(10)}`, ...extra };
    orders.push(o);
    if (status !== 'DRAFT' && status !== 'CANCELED') {
      const inv = newInvoice(c, { orderId: o.id, serviceId: null, desc: line.description, net, at, status: payment === 'succeeded' || payment === 'disputed' ? 'PAID' : 'OPEN' });
      o.invoiceId = inv.id;
      if (payment === 'succeeded') { const p = newPayment(inv, at + 3 * MIN, 'succeeded'); o.paymentIds.push(p.id); }
      if (payment === 'processing') { const p = newPayment(inv, at + 3 * MIN, 'pending'); o.paymentIds.push(p.id); }
      if (payment === 'failed') { const p = newPayment(inv, at + 3 * MIN, 'failed', 'card_declined'); o.paymentIds.push(p.id); }
    }
    return o;
  };
  for (let i = 0; i < 8; i++) mkOrder('DRAFT', 'none', 'not_started', r.int(1, 70));
  for (let i = 0; i < 11; i++) mkOrder('AWAITING_PAYMENT', i < 2 ? 'processing' : i < 4 ? 'failed' : 'none', 'not_started', r.int(1, 30));
  for (let i = 0; i < 10; i++) mkOrder('CANCELED', 'none', 'not_started', r.int(30, 400));
  const paidQueued = [mkOrder('PAID', 'succeeded', 'queued', 0.2), mkOrder('PAID', 'succeeded', 'queued', 0.5), mkOrder('PAID', 'succeeded', 'queued', 1.4)];
  paidQueued.forEach((o) => { const j = job({ type: 'PROVISION_SERVICE', status: 'pending', createdAt: o.createdAt, orderId: o.id, customerId: o.customerId }); o.jobIds.push(j.id); });
  const fulfilling = [mkOrder('FULFILLING', 'succeeded', 'in_progress', 0.1), mkOrder('FULFILLING', 'succeeded', 'in_progress', 0.3)];
  fulfilling.forEach((o) => { const j = job({ type: 'PROVISION_SERVICE', status: 'running', createdAt: o.createdAt, orderId: o.id, customerId: o.customerId, logs: [{ at: o.createdAt, level: 'info', message: 'Reserved capacity' }, { at: o.updatedAt, level: 'info', message: 'Creating server on provider…' }] }); o.jobIds.push(j.id); });
  const failedOrders = [mkOrder('FULFILLMENT_FAILED', 'succeeded', 'failed', 5, { error: 'Provider returned 504 while creating the server; outcome unknown.' }), mkOrder('FULFILLMENT_FAILED', 'succeeded', 'failed', 19, { error: 'No node with enough free allocation in the requested region.' }), mkOrder('FULFILLMENT_FAILED', 'succeeded', 'failed', 52, { error: 'Egg 3 install script failed on node-fra-02.' }), mkOrder('FULFILLMENT_FAILED', 'succeeded', 'failed', 130, { error: 'Provider API rejected allocation 5xxx (already in use).' })];
  const failTemplates: Array<{ status: JobStatus; code: string; message: string; unknown: boolean }> = [
    { status: 'manual_review', code: 'PROVIDER_TIMEOUT', message: 'POST /api/application/servers timed out after 30s', unknown: true },
    { status: 'failed', code: 'NO_CAPACITY', message: 'Reservation expired: no free allocation in region', unknown: false },
    { status: 'dead_letter', code: 'INSTALL_FAILED', message: 'Provider install reported failure after 5 attempts', unknown: false },
    { status: 'failed', code: 'ALLOCATION_CONFLICT', message: 'Allocation already assigned to another server', unknown: false },
  ];
  failedOrders.forEach((o, i) => { const f = failTemplates[i]!; const j = job({ type: 'PROVISION_SERVICE', status: f.status, createdAt: o.createdAt, orderId: o.id, customerId: o.customerId, nodeId: i === 2 ? 'node-fra-02' : null, attempts: f.status === 'dead_letter' ? 5 : f.status === 'manual_review' ? 3 : 2, error: { code: f.code, message: f.message }, unknownOutcome: f.unknown, finishedAt: o.updatedAt, nextRetryAt: f.status === 'failed' ? iso(12 * MIN) : null, logs: ([{ at: o.createdAt, level: 'info', message: 'Reserved capacity' }, { at: o.updatedAt, level: 'error', message: `${f.code}: ${f.message}` }] as JobLog[]).concat(f.unknown ? [{ at: o.updatedAt, level: 'warn', message: 'Outcome unknown: query provider by tag before any retry' }] : []) }); o.jobIds.push(j.id); });
  const partial = mkOrder('PARTIALLY_FULFILLED', 'succeeded', 'partial', 8);
  partial.lines.push({ ...partial.lines[0]!, id: 'ol_partial_2', serviceId: null, description: partial.lines[0]!.description.replace(' — new', ' — second instance') });
  partial.error = '1 of 2 line items provisioned; second line failed with NO_CAPACITY.';
  const pj1 = job({ type: 'PROVISION_SERVICE', status: 'failed', createdAt: partial.createdAt, orderId: partial.id, customerId: partial.customerId, attempts: 3, error: { code: 'NO_CAPACITY', message: 'Second line item: no free allocation' }, logs: [{ at: partial.createdAt, level: 'error', message: 'NO_CAPACITY on second line item' }], nextRetryAt: iso(20 * MIN) });
  partial.jobIds.push(pj1.id);
  // Fraud review queue: paid order held for review, plus one awaiting payment from a high-risk account.
  const fraud = mkOrder('PAID', 'succeeded', 'not_started', 3, { fraudReview: 'pending' }, 2);
  const fraud2 = mkOrder('AWAITING_PAYMENT', 'processing', 'not_started', 2, { fraudReview: 'pending' }, 5);
  void fraud; void fraud2;

  /* ---------- refunds, credit notes, dispute ---------- */
  const refunds: Refund[] = [];
  const paidInvoices = invoices.filter((i) => i.status === 'PAID' && i.orderId == null && i.total.amount > 0);
  const refundSpecs: Array<[Refund['kind'], Refund['status'], number, string]> = [
    ['refund', 'processed', 0.5, 'Service outage compensation'], ['refund', 'processed', 1, 'Duplicate charge'], ['credit_note', 'processed', 0.25, 'Goodwill credit after downtime'], ['refund', 'pending_approval', 1, 'Customer cancelled within 14-day window'],
    ['refund', 'rejected', 1, 'Refund requested after 60 days'], ['credit_note', 'approved', 0.4, 'Plan downgrade proration'], ['refund', 'failed', 0.5, 'Card closed; refund bounced by issuer'], ['credit_note', 'processed', 0.1, 'Billing correction'],
  ];
  refundSpecs.forEach(([kind, status, frac, reason], i) => {
    const inv = paidInvoices[i * 17 + 5]; if (!inv) return;
    const amount = m(Math.round(inv.total.amount * frac), inv.currency);
    const p = payments.find((x) => x.id === inv.paymentIds[0]);
    const rf: Refund = { id: `rfd_${pad(i + 1, 4)}`, kind, customerId: inv.customerId, invoiceId: inv.id, paymentId: kind === 'refund' ? p?.id ?? null : null, amount, reason, status, requestedBy: i % 2 ? 'Ioana Marin' : 'Cătălin Rusu', approvedBy: status === 'processed' || status === 'approved' ? 'Daniel Voss' : null, createdAt: iso(-(i + 1) * 3 * DAY), approvalId: status === 'pending_approval' ? 'apr_0001' : null };
    refunds.push(rf);
    if (status === 'processed') { inv.refundIds.push(rf.id); inv.amountRefunded = amount; if (kind === 'refund' && p) { p.status = frac >= 1 ? 'refunded' : 'partially_refunded'; } if (kind === 'credit_note') inv.creditApplied = amount; }
    else inv.refundIds.push(rf.id);
  });
  // Dispute on Lena Hartmann's most recent paid invoice.
  const lenaInv = [...invoices].reverse().find((i) => i.customerId === 'acc_0003' && i.status === 'PAID');
  if (lenaInv) {
    const p = payments.find((x) => x.id === lenaInv.paymentIds[0]);
    if (p) { p.status = 'disputed'; const ev = event('charge.dispute.created', p.providerRef, 'pending_review', iso(-6 * DAY), 'acc_0003'); p.webhookEventId = ev.id; lenaInv.number = 'INV-2026-01177'; }
  }
  // Payments that were charged but whose webhook has not been reconciled: Stripe money exists, Fortless state does not yet say paid.
  const unrec = payments.filter((p) => p.status === 'succeeded' && p.createdAt > iso(-2 * DAY)).slice(0, 2);
  unrec.forEach((p) => { p.reconciled = false; const ev = webhooks.find((w) => w.id === p.webhookEventId); if (ev) { ev.status = 'failed'; ev.error = 'Handler timed out while marking invoice paid'; ev.processedAt = null; ev.attempts = 4; } });
  // Duplicate deliveries.
  for (const p of payments.filter((x) => x.status === 'succeeded').slice(-6)) event('payment_intent.succeeded', p.providerRef, 'duplicate', new Date(Date.parse(p.createdAt) + 90 * 1000).toISOString(), p.customerId);
  event('invoice.payment_action_required', 'in_' + r.hex(14), 'received', iso(-4 * MIN), null);
  event('customer.subscription.updated', 'sub_' + r.hex(14), 'received', iso(-9 * MIN), null);
  webhooks.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  /* ---------- background jobs that are not provisioning ---------- */
  for (let i = 0; i < 40; i++) { const s = r.pick(services); job({ type: 'SYNC_RUNTIME', status: 'completed', createdAt: iso(-(i + 1) * 6 * MIN), serviceId: s.id, customerId: s.customerId, nodeId: s.nodeId, logs: [{ at: iso(-(i + 1) * 6 * MIN), level: 'info', message: `Runtime state read for ${s.id}: ${s.runtime}` }] }); }
  const renewalDue = subscriptions.filter((s) => s.status === 'ACTIVE').slice(0, 20);
  renewalDue.forEach((s, i) => job({ type: 'PROCESS_RENEWAL', status: i < 14 ? 'completed' : i < 17 ? 'pending' : 'running', createdAt: iso(-(i + 1) * 30 * MIN), serviceId: s.serviceId, customerId: s.customerId }));
  const sync = services.find((s) => s.provider.sync === 'drift');
  job({ type: 'RECONCILE_PAYMENT', status: 'manual_review', createdAt: iso(-26 * HOUR), customerId: unrec[0]?.customerId ?? null, orderId: unrec[0]?.orderId ?? null, attempts: 4, error: { code: 'WEBHOOK_HANDLER_TIMEOUT', message: 'Stripe event processed twice with different outcomes; check invoice state' }, logs: [{ at: iso(-26 * HOUR), level: 'error', message: 'Invoice not marked paid; payment intent succeeded at provider' }] });
  job({ type: 'SEND_EMAIL', status: 'failed', createdAt: iso(-3 * HOUR), customerId: 'acc_0004', attempts: 3, error: { code: 'SMTP_421', message: 'Service temporarily unavailable (greylisted)' }, nextRetryAt: iso(8 * MIN), logs: [{ at: iso(-3 * HOUR), level: 'error', message: 'SMTP 421 from relay' }] });
  job({ type: 'SEND_EMAIL', status: 'dead_letter', createdAt: iso(-30 * HOUR), customerId: 'acc_0006', attempts: 5, error: { code: 'MAILBOX_UNAVAILABLE', message: '550 user unknown' }, logs: [{ at: iso(-30 * HOUR), level: 'error', message: '550 recipient rejected' }] });
  if (sync) job({ type: 'SYNC_RUNTIME', status: 'failed', createdAt: iso(-18 * MIN), serviceId: sync.id, customerId: sync.customerId, nodeId: sync.nodeId, attempts: 2, error: { code: 'STATE_DRIFT', message: 'Provider reports suspended=false but contract is SUSPENDED' }, nextRetryAt: iso(10 * MIN) });
  job({ type: 'NODE_HEALTH_CHECK', status: 'failed', createdAt: iso(-7 * MIN), nodeId: 'node-fra-02', attempts: 3, error: { code: 'HEARTBEAT_LATE', message: 'No heartbeat from Wings for 94s (threshold 60s)' }, nextRetryAt: iso(1 * MIN) });
  job({ type: 'BACKUP_RETENTION', status: 'running', createdAt: iso(-12 * MIN), nodeId: 'node-ams-01' });
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { services, nodes, ips, orders, invoices, payments, refunds, subscriptions, jobs, webhooks };
}
