import type { Currency, Money } from '../types';

/** The demo universe is frozen at this instant so ages, due dates and trends stay coherent across pages and screenshots. */
export const ADMIN_NOW = Date.parse('2026-10-21T09:30:00Z');
export const iso = (offsetMs: number) => new Date(ADMIN_NOW + offsetMs).toISOString();
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

const nf: Partial<Record<Currency, Intl.NumberFormat>> = {};
export const money = (m: Money): string => (nf[m.currency] ??= new Intl.NumberFormat('en-IE', { style: 'currency', currency: m.currency })).format(m.amount / 100);
export const eur = (amount: number): Money => ({ amount, currency: 'EUR' });
export const zero = (currency: Currency): Money => ({ amount: 0, currency });
export const add = (a: Money, b: Money): Money => { if (a.currency !== b.currency) throw new Error('Currency mismatch'); return { amount: a.amount + b.amount, currency: a.currency }; };
export const sub = (a: Money, b: Money): Money => { if (a.currency !== b.currency) throw new Error('Currency mismatch'); return { amount: a.amount - b.amount, currency: a.currency }; };

/** Totals per currency. Different currencies are never merged into one number. */
export function sumByCurrency(items: Money[]): Money[] {
  const m = new Map<Currency, number>();
  for (const i of items) m.set(i.currency, (m.get(i.currency) ?? 0) + i.amount);
  return [...m].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency));
}

const dtf = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dtt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export const date = (v: string | null | undefined) => (v ? dtf.format(new Date(v)) : '—');
export const dateTime = (v: string | null | undefined) => (v ? `${dtt.format(new Date(v))} UTC` : '—');
export function relative(v: string | null | undefined, now = ADMIN_NOW): string {
  if (!v) return '—';
  const s = Math.round((now - Date.parse(v)) / 1000); const a = Math.abs(s);
  const u = a < 60 ? `${a}s` : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return s >= 0 ? `${u} ago` : `in ${u}`;
}
export const ageMinutes = (v: string) => Math.max(0, Math.round((ADMIN_NOW - Date.parse(v)) / MIN));
export const mb = (v: number) => (v >= 1024 * 1024 ? `${(v / 1048576).toFixed(1)} TB` : v >= 1024 ? `${(v / 1024).toFixed(v >= 10240 ? 0 : 1)} GB` : `${Math.round(v)} MB`);
export const pct = (used: number, limit: number) => (limit > 0 ? Math.round((used / limit) * 100) : 0);
export const num = (n: number) => new Intl.NumberFormat('en-IE').format(n);
export const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', SEMI_ANNUAL: 'Every 6 months', ANNUAL: 'Annual' };
export const intervalMonths: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12 };
/** Monthly-recurring equivalent in minor units (rounded). */
export const mrrOf = (m: Money, interval: string): Money => ({ currency: m.currency, amount: Math.round(m.amount / (intervalMonths[interval] ?? 1)) });
export const title = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
/** Whole days from the demo "now" to an ISO date (negative when in the past). */
export const daysBetween = (v: string) => Math.ceil((Date.parse(v) - ADMIN_NOW) / DAY);
