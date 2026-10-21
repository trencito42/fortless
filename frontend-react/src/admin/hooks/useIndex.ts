import { useMemo } from 'react';
import { useAdmin } from '../store';

const by = <T extends { id: string }>(a: T[]) => new Map(a.map((x) => [x.id, x]));
/** Id → record maps over the live demo data, rebuilt only when the data changes. Used by cross-resource links. */
export function useIndex() {
  const { data } = useAdmin();
  return useMemo(() => ({
    customer: by(data.customers), service: by(data.services), order: by(data.orders), invoice: by(data.invoices), payment: by(data.payments), node: by(data.nodes), ticket: by(data.tickets), job: by(data.jobs),
    plan: by(data.plans), product: by(data.products), staff: by(data.staff), subscription: by(data.subscriptions), refund: by(data.refunds), incident: by(data.incidents), component: by(data.components), webhook: by(data.webhooks),
    department: by(data.departments),
  }), [data]);
}
