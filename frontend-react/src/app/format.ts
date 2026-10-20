import type { Money } from './domain/types';

const nf: Record<string, Intl.NumberFormat> = {};
export const money = (m: Money): string => (nf[m.currency] ??= new Intl.NumberFormat('en-IE', { style: 'currency', currency: m.currency })).format(m.amount / 100);
/** Tests can pin the clock; the customer application always uses the real current time. */
export const NOW_MS = import.meta.env.MODE === 'test' ? Date.parse('2026-10-20T09:30:00Z') : Date.now();
const dtf = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dtt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export const date = (iso: string): string => dtf.format(new Date(iso));
export const dateTime = (iso: string): string => `${dtt.format(new Date(iso))} UTC`;
export function relative(iso: string, now = NOW_MS): string {
  const s = Math.round((now - Date.parse(iso)) / 1000); const a = Math.abs(s);
  const u = a < 60 ? `${a}s` : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return s >= 0 ? `${u} ago` : `in ${u}`;
}
export const daysUntil = (iso: string, now = NOW_MS): number => Math.ceil((Date.parse(iso) - now) / 86400000);
export const mb = (v: number): string => (v >= 1024 ? `${(v / 1024).toFixed(v >= 10240 ? 0 : 1)} GB` : `${Math.round(v)} MB`);
export const pct = (used: number, limit: number): number => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);
export const fileSize = (b: number): string => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
