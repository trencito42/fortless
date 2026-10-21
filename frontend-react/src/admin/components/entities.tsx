import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Link } from '../router';
import { useIndex } from '../hooks/useIndex';

export function EntityLink({ to, children, mono, className }: { to: string; children: ReactNode; mono?: boolean; className?: string }) {
  return <Link to={to} className={cn('rounded-sm font-bold text-ink underline-offset-2 hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent', mono && 'font-mono text-[13px] font-semibold', className)} onClick={(e) => e.stopPropagation()}>{children}</Link>;
}
const Missing = ({ id }: { id: string }) => <span className="font-mono text-[13px] text-ink3" title="Not found in demo data">{id}</span>;

export function CustomerLink({ id, sub }: { id: string; sub?: boolean }) {
  const c = useIndex().customer.get(id);
  if (!c) return <Missing id={id} />;
  return <span className="inline-grid min-w-0 align-top"><EntityLink to={`/customers/${id}`} className="truncate">{c.name}</EntityLink>{sub ? <span className="truncate text-[12.5px] font-medium text-ink3">{c.email}</span> : null}</span>;
}
export function ServiceLink({ id, showName = true }: { id: string; showName?: boolean }) {
  const s = useIndex().service.get(id);
  if (!s) return <Missing id={id} />;
  return <EntityLink to={`/services/${id}`}>{showName ? s.name : id}</EntityLink>;
}
export const OrderLink = ({ id }: { id: string }) => <EntityLink to={`/orders/${id}`} mono>{id}</EntityLink>;
export function InvoiceLink({ id }: { id: string }) { const i = useIndex().invoice.get(id); return i ? <EntityLink to={`/billing/invoices/${id}`} mono>{i.number}</EntityLink> : <Missing id={id} />; }
export function NodeLink({ id }: { id: string }) { const n = useIndex().node.get(id); return n ? <EntityLink to={`/infrastructure/nodes/${id}`}>{n.name}</EntityLink> : <Missing id={id} />; }
export const TicketLink = ({ id }: { id: string }) => <EntityLink to={`/support/tickets/${id}`} mono>{id}</EntityLink>;
export const JobLink = ({ id }: { id: string }) => <EntityLink to={`/provisioning/jobs/${id}`} mono>{id}</EntityLink>;
export const PaymentLink = ({ id }: { id: string }) => <EntityLink to={`/billing/transactions/${id}`} mono>{id}</EntityLink>;
export function StaffName({ id }: { id: string | null }) { const s = useIndex().staff.get(id ?? ''); return <>{s ? s.name : <span className="text-ink3">Unassigned</span>}</>; }
