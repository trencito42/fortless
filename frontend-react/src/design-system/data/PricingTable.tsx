import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';

export interface PricingPlan {
  id: string;
  name: string;
  /** Already formatted, for example "€9.00". The component never calculates money. */
  price: string;
  /** Unit after the price, for example "/ month". */
  period: string;
  description?: string;
  features: string[];
  highlight?: boolean;
  /** Plan the customer is on now. */
  current?: boolean;
  /** Why this plan cannot be chosen (sold out, incompatible). Shown instead of the button. */
  unavailable?: string;
  /** Short note under the price, for example "€90.00 billed yearly". */
  note?: string;
}

export interface PricingTableProps {
  plans: PricingPlan[];
  onSelect: (plan: PricingPlan) => void;
  selectLabel?: (plan: PricingPlan) => string;
  /** Shown above the grid, usually the billing-cycle switch. */
  header?: ReactNode;
  className?: string;
}

/** Plan cards for choosing a plan. One card is highlighted, the current plan is marked, and unavailable plans say why instead of hiding. */
export function PricingTable({ plans, onSelect, selectLabel = (p) => (p.current ? 'Current plan' : `Choose ${p.name}`), header, className }: PricingTableProps) {
  return (
    <div className={cn('grid gap-4', className)}>
      {header}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
        {plans.map((p) => (
          <li key={p.id} className={cn('grid content-start gap-4 rounded-xl p-5', p.highlight ? 'bg-accent-soft ring-2 ring-accent' : 'bg-s1')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[18px] font-extrabold tracking-[-0.03em]">{p.name}</h3>
              {p.highlight ? <StatusBadge tone="accent" dot={false}>Most popular</StatusBadge> : null}
              {p.current ? <StatusBadge tone="good" dot={false}>Current</StatusBadge> : null}
            </div>
            <p className="flex items-baseline gap-1.5"><span className="text-[32px] leading-none font-extrabold tracking-[-0.05em] tabular-nums">{p.price}</span><span className="text-[14px] font-semibold text-ink3">{p.period}</span></p>
            {p.note ? <p className="-mt-2 text-[13px] font-semibold text-ink3">{p.note}</p> : null}
            {p.description ? <p className="text-ink2">{p.description}</p> : null}
            <ul className="grid gap-2 text-[14px]">{p.features.map((f) => <li key={f} className="flex items-start gap-2"><Icon name="checkmark-circle-02" size={18} className="mt-0.5 shrink-0 text-good" /><span>{f}</span></li>)}</ul>
            {p.unavailable ? <p className="rounded-md bg-s3 px-3 py-2 text-[13.5px] font-semibold text-ink2">{p.unavailable}</p> : <Button variant={p.highlight ? 'primary' : 'secondary'} disabled={p.current} onClick={() => onSelect(p)}>{selectLabel(p)}</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ComparisonRow { label: string; values: Record<string, string | boolean> }

/** Side-by-side plan table. A real table so screen readers get row and column headers; scrolls inside its own container on phones. */
export function PlanComparison({ plans, rows, caption = 'Plan comparison' }: { plans: { id: string; name: string }[]; rows: ComparisonRow[]; caption?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-lg bg-s1" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[34rem] text-left text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><td className="p-3" />{plans.map((p) => <th key={p.id} scope="col" className="p-3 text-[14px] font-extrabold">{p.name}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-ink/10">
              <th scope="row" className="p-3 font-semibold text-ink2">{r.label}</th>
              {plans.map((p) => { const v = r.values[p.id]; return <td key={p.id} className="p-3 font-semibold tabular-nums">{v === true ? <><Icon name="checkmark-circle-02" size={18} className="text-good" /><span className="sr-only">Included</span></> : v === false || v === undefined ? <><span aria-hidden="true" className="text-ink3">–</span><span className="sr-only">Not included</span></> : v}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
