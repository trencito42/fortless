import type { Money as MoneyT } from '../types';
import { money, sumByCurrency } from '../lib/format';

export const MoneyText = ({ value, className }: { value: MoneyT; className?: string }) => <span className={`tabular-nums ${className ?? ''}`}>{money(value)}</span>;

/** Per-currency totals, one line each. Never adds EUR to USD or RON. */
export function MoneyByCurrency({ values, empty = '—' }: { values: MoneyT[]; empty?: string }) {
  const sums = sumByCurrency(values);
  if (sums.length === 0) return <span className="text-ink3">{empty}</span>;
  return <span className="grid gap-0.5">{sums.map((s) => <span key={s.currency} className="tabular-nums">{money(s)}</span>)}</span>;
}
