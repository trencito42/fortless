/**
 * Consistency checks for the synthetic admin data (src/admin/fixtures). Run: npx tsx scripts/check-admin-fixtures.ts
 * Every cross-reference must resolve, money must be integer minor units in one currency per record, and capacity numbers must add up,
 * otherwise pages would show contradictory facts about the same customer, service or node.
 */
import { buildAdminData } from '../src/admin/fixtures';

const d = buildAdminData();
const errs: string[] = [];
const ids = (xs: Array<{ id: string }>) => new Set(xs.map((x) => x.id));
const cust = ids(d.customers), svc = ids(d.services), ord = ids(d.orders), inv = ids(d.invoices), pay = ids(d.payments), node = ids(d.nodes), job = ids(d.jobs), tkt = ids(d.tickets), plan = ids(d.plans), stf = ids(d.staff), wh = ids(d.webhooks);
const must = (ok: boolean, msg: string) => { if (!ok) errs.push(msg); };
const int = (n: number) => Number.isInteger(n);

for (const s of d.services) {
  must(cust.has(s.customerId), `service ${s.id}: unknown customer ${s.customerId}`); must(ord.has(s.orderId), `service ${s.id}: unknown order ${s.orderId}`); must(node.has(s.nodeId), `service ${s.id}: unknown node`); must(plan.has(s.planId), `service ${s.id}: unknown plan`);
  must(int(s.billing.price.amount), `service ${s.id}: price not integer`);
  must(!(s.lifecycle === 'TERMINATED' && s.runtime === 'running'), `service ${s.id}: terminated but running`);
  must(!(s.lifecycle !== 'ACTIVE' && s.runtime === 'running'), `service ${s.id}: ${s.lifecycle} but running`);
}
for (const o of d.orders) {
  must(cust.has(o.customerId), `order ${o.id}: unknown customer`); must(!o.invoiceId || inv.has(o.invoiceId), `order ${o.id}: unknown invoice`);
  o.jobIds.forEach((j) => must(job.has(j), `order ${o.id}: unknown job ${j}`)); o.paymentIds.forEach((p) => must(pay.has(p), `order ${o.id}: unknown payment ${p}`));
  must(o.total.amount === o.subtotal.amount - o.discount.amount + o.tax.amount, `order ${o.id}: total mismatch`);
  must(!(o.status === 'COMPLETED' && o.fulfillment !== 'completed'), `order ${o.id}: completed without delivery`);
  must(!(o.status === 'FULFILLMENT_FAILED' && o.payment !== 'succeeded'), `order ${o.id}: failed fulfillment but unpaid`);
}
for (const i of d.invoices) {
  must(cust.has(i.customerId), `invoice ${i.id}: unknown customer`); must(!i.orderId || ord.has(i.orderId), `invoice ${i.id}: unknown order`); must(!i.serviceId || svc.has(i.serviceId), `invoice ${i.id}: unknown service`);
  must(i.total.amount === i.subtotal.amount - i.discount.amount + i.tax.amount, `invoice ${i.id}: total mismatch`);
  for (const m of [i.subtotal, i.tax, i.discount, i.total, i.amountPaid, i.amountRefunded, i.creditApplied]) { must(m.currency === i.currency, `invoice ${i.id}: mixed currency`); must(int(m.amount), `invoice ${i.id}: non-integer money`); }
  must(i.amountRefunded.amount <= i.amountPaid.amount, `invoice ${i.id}: refunded more than paid`);
  must(i.status !== 'PAID' || i.amountPaid.amount === i.total.amount, `invoice ${i.id}: PAID but amountPaid != total`);
}
for (const p of d.payments) {
  must(cust.has(p.customerId), `payment ${p.id}: unknown customer`); must(!p.invoiceId || inv.has(p.invoiceId), `payment ${p.id}: unknown invoice`); must(!p.webhookEventId || wh.has(p.webhookEventId), `payment ${p.id}: unknown webhook`);
  must(int(p.amount.amount), `payment ${p.id}: non-integer`); must(/^[0-9]{4}$/.test(p.method.last4), `payment ${p.id}: bad last4 (only brand and last four digits may exist)`);
}
for (const j of d.jobs) { must(!j.orderId || ord.has(j.orderId), `job ${j.id}: unknown order`); must(!j.serviceId || svc.has(j.serviceId), `job ${j.id}: unknown service`); must(!j.nodeId || node.has(j.nodeId), `job ${j.id}: unknown node`); }
for (const t of d.tickets) {
  must(cust.has(t.customerId), `ticket ${t.id}: unknown customer`); must(!t.assigneeId || stf.has(t.assigneeId), `ticket ${t.id}: unknown assignee`);
  for (const s of t.serviceIds) { must(svc.has(s), `ticket ${t.id}: unknown service`); must(d.services.find((x) => x.id === s)?.customerId === t.customerId, `ticket ${t.id}: service belongs to another customer`); }
}
for (const r of d.refunds) { must(inv.has(r.invoiceId), `refund ${r.id}: unknown invoice`); must(r.amount.currency === d.invoices.find((i) => i.id === r.invoiceId)?.currency, `refund ${r.id}: currency differs from invoice`); }
for (const s of d.subscriptions) must(svc.has(s.serviceId), `subscription ${s.id}: unknown service`);
for (const n of d.nodes) {
  const on = d.services.filter((s) => s.nodeId === n.id && (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE'));
  must(n.allocated.ramMb === on.reduce((a, s) => a + s.resources.memoryMb, 0), `node ${n.id}: allocated RAM != sum of hosted services`);
  must(n.usage.ramMb <= n.hardware.ramMb, `node ${n.id}: used RAM above physical`);
}
const seen = new Set<string>();
for (const ip of d.ips) { const k = `${ip.nodeId}|${ip.ip}|${ip.port}`; must(!seen.has(k), `allocation ${k} duplicated`); seen.add(k); must(!ip.serviceId || svc.has(ip.serviceId), `allocation ${ip.id}: unknown service`); }
for (const a of d.actions) {
  const sets: Record<string, Set<string>> = { order: ord, job: job, payment: pay, ticket: tkt, node, customer: cust, staff: stf };
  const set = sets[a.resource.type];
  if (set) must(set.has(a.resource.id), `action ${a.id}: unknown ${a.resource.type} ${a.resource.id}`);
}
for (const a of d.audit) if (a.accountId) must(cust.has(a.accountId), `audit ${a.id}: unknown account`);
// Currencies are never merged: each invoice is in exactly one currency, and it is the customer's own billing currency.
for (const i of d.invoices) must(i.currency === d.customers.find((c) => c.id === i.customerId)?.currency, `invoice ${i.id}: currency differs from customer billing currency`);

const counts = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (v as unknown[]).length]));
console.log(JSON.stringify(counts));
if (errs.length) { console.error(`${errs.length} fixture problems:\n${errs.slice(0, 30).join('\n')}`); process.exit(1); }
console.log('admin fixtures: all consistency checks passed');
