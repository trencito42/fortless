import type { AdminData } from '../fixtures';
import type { Currency, Money } from '../types';
import { ADMIN_NOW, DAY, mrrOf, sumByCurrency } from './format';

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'RON'];
const inWindow = (iso: string, days: number, offset = 0) => { const t = Date.parse(iso); return t > ADMIN_NOW - (days + offset) * DAY && t <= ADMIN_NOW - offset * DAY; };

/** Cash actually collected (succeeded or partly refunded payments), per currency. Not revenue recognition. */
export function collected(d: AdminData, days: number, offset = 0): Money[] {
  return sumByCurrency(d.payments.filter((p) => (p.status === 'succeeded' || p.status === 'partially_refunded') && inWindow(p.createdAt, days, offset)).map((p) => p.amount));
}
export function mrr(d: AdminData): Money[] {
  return sumByCurrency(d.subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'CANCEL_AT_PERIOD_END' || s.status === 'PAST_DUE').map((s) => mrrOf(s.price, s.interval)));
}
export function overdue(d: AdminData) {
  const rows = d.invoices.filter((i) => i.status === 'OPEN' && Date.parse(i.dueAt) < ADMIN_NOW);
  return { rows, totals: sumByCurrency(rows.map((i) => ({ currency: i.currency, amount: i.total.amount - i.amountPaid.amount }))) };
}
/** Daily collected amount for one currency over the last `days`. */
export function dailySeries(d: AdminData, currency: Currency, days: number) {
  const buckets = new Map<string, number>();
  for (let k = days - 1; k >= 0; k--) buckets.set(new Date(ADMIN_NOW - k * DAY).toISOString().slice(0, 10), 0);
  for (const p of d.payments) {
    if (p.amount.currency !== currency || !(p.status === 'succeeded' || p.status === 'partially_refunded')) continue;
    const key = p.createdAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + p.amount.amount);
  }
  return [...buckets].map(([day, amount]) => ({ day, amount }));
}
export function nodeCapacity(n: AdminData['nodes'][number]) {
  const ramLimit = Math.round(n.hardware.ramMb * (1 + n.overallocate.ramPct / 100));
  const diskLimit = Math.round(n.hardware.diskMb * (1 + n.overallocate.diskPct / 100));
  return { ramLimit, diskLimit, ramSoldPct: Math.round((n.allocated.ramMb / n.hardware.ramMb) * 100), ramUsedPct: Math.round((n.usage.ramMb / n.hardware.ramMb) * 100), diskSoldPct: Math.round((n.allocated.diskMb / n.hardware.diskMb) * 100), diskUsedPct: Math.round((n.usage.diskMb / n.hardware.diskMb) * 100), ramFreeSellable: Math.max(0, ramLimit - n.allocated.ramMb), diskFreeSellable: Math.max(0, diskLimit - n.allocated.diskMb) };
}
export const supportOpen = (d: AdminData) => d.tickets.filter((t) => t.status === 'open' || t.status === 'waiting_staff');
