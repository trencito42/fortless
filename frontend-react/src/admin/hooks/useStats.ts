import { useMemo } from 'react';
import type { Money } from '../types';
import { ADMIN_NOW, sumByCurrency } from '../lib/format';
import { useAdmin } from '../store';

export interface CustomerStats { activeServices: number; totalServices: number; outstanding: Money[]; overdueCount: number; orders: number; openTickets: number; lifetime: Money[] }
/** Per-customer aggregates over the demo data. Outstanding = open invoices (total minus paid), per currency. */
export function useCustomerStats(): Map<string, CustomerStats> {
  const { data } = useAdmin();
  return useMemo(() => {
    const m = new Map<string, CustomerStats>();
    const get = (id: string) => { let s = m.get(id); if (!s) { s = { activeServices: 0, totalServices: 0, outstanding: [], overdueCount: 0, orders: 0, openTickets: 0, lifetime: [] }; m.set(id, s); } return s; };
    for (const s of data.services) { const x = get(s.customerId); x.totalServices++; if (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE') x.activeServices++; }
    const out = new Map<string, Money[]>(); const life = new Map<string, Money[]>();
    for (const i of data.invoices) {
      if (i.status === 'OPEN') { (out.get(i.customerId) ?? out.set(i.customerId, []).get(i.customerId)!).push({ currency: i.currency, amount: i.total.amount - i.amountPaid.amount }); if (Date.parse(i.dueAt) < ADMIN_NOW) get(i.customerId).overdueCount++; }
      if (i.status === 'PAID') (life.get(i.customerId) ?? life.set(i.customerId, []).get(i.customerId)!).push({ currency: i.currency, amount: i.amountPaid.amount - i.amountRefunded.amount });
    }
    for (const [k, v] of out) get(k).outstanding = sumByCurrency(v);
    for (const [k, v] of life) get(k).lifetime = sumByCurrency(v);
    for (const o of data.orders) get(o.customerId).orders++;
    for (const t of data.tickets) if (t.status !== 'closed' && t.status !== 'resolved') get(t.customerId).openTickets++;
    for (const c of data.customers) get(c.id);
    return m;
  }, [data.services, data.invoices, data.orders, data.tickets, data.customers]);
}
