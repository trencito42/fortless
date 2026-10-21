import { useMemo } from 'react';
import { Badge } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, refundStatus } from '../../components/status';
import { CustomerLink, EntityLink, InvoiceLink } from '../../components/entities';
import { MoneyByCurrency, MoneyText } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { date } from '../../lib/format';
import type { Refund } from '../../types';

export default function RefundList() {
  const { data } = useAdmin();
  const nav = useNav();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const seg = (v: string, label: string, test: (r: Refund) => boolean) => ({ value: v, label, test });
  const pending = data.refunds.filter((r) => r.status === 'pending_approval');
  return (
    <AdminPage title="Refunds & credit notes" description="Money returned (refunds) and balance adjustments (credit notes). Large refunds need a second staff member.">
      <KpiGrid cols={3} items={[{ label: 'Awaiting approval', value: pending.length, hint: pending.length ? 'Needs a second staff member' : 'Nothing waiting', icon: 'shield-user' }, { label: 'Processed refunds', value: <MoneyByCurrency values={data.refunds.filter((r) => r.kind === 'refund' && r.status === 'processed').map((r) => r.amount)} empty="None" />, icon: 'receipt' }, { label: 'Credit notes issued', value: <MoneyByCurrency values={data.refunds.filter((r) => r.kind === 'credit_note' && r.status === 'processed').map((r) => r.amount)} empty="None" />, icon: 'file-01' }]} />
      <ResourceTable<Refund>
        tableId="refunds" caption="Refunds and credit notes" rows={data.refunds} getRowId={(r) => r.id} rowLabel={(r) => r.id}
        searchText={(r) => `${r.id} ${r.reason} ${cust.get(r.customerId) ?? ''} ${r.requestedBy}`} searchPlaceholder="Search reference, reason, customer"
        segments={[seg('all', 'All', () => true), seg('pending_approval', 'Awaiting approval', (r) => r.status === 'pending_approval'), seg('approved', 'Approved', (r) => r.status === 'approved'), seg('processed', 'Processed', (r) => r.status === 'processed'), seg('rejected', 'Rejected', (r) => r.status === 'rejected'), seg('failed', 'Failed', (r) => r.status === 'failed')]}
        filters={[{ id: 'kind', label: 'Kind', options: [{ value: 'refund', label: 'Refund' }, { value: 'credit_note', label: 'Credit note' }], test: (r, v) => r.kind === v }, { id: 'cur', label: 'Currency', options: ['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c })), test: (r, v) => r.amount.currency === v }]}
        dateField={{ label: 'Requested', get: (r) => r.createdAt }}
        onRowClick={(r) => nav(`/billing/refunds/${r.id}`)}
        columns={[
          col<Refund>('id', 'Reference', (r) => <EntityLink to={`/billing/refunds/${r.id}`} mono>{r.id}</EntityLink>, { sort: (r) => r.id, primary: true }),
          col<Refund>('k', 'Kind', (r) => <Badge tone={r.kind === 'refund' ? 'info' : 'violet'}>{r.kind === 'refund' ? 'Refund' : 'Credit note'}</Badge>, { sort: (r) => r.kind }),
          col<Refund>('s', 'Status', (r) => <Status map={refundStatus} value={r.status} />, { sort: (r) => r.status }),
          col<Refund>('c', 'Customer', (r) => <span className="block min-w-[8rem]"><CustomerLink id={r.customerId} /></span>, { sort: (r) => cust.get(r.customerId) ?? '' }),
          col<Refund>('i', 'Invoice', (r) => <InvoiceLink id={r.invoiceId} />, { hideOnMobile: true }),
          col<Refund>('a', 'Amount', (r) => <MoneyText value={r.amount} />, { sort: (r) => r.amount.amount, numeric: true }),
          col<Refund>('r', 'Reason', (r) => <span className="block max-w-[22rem] truncate" title={r.reason}>{r.reason}</span>, { hideOnMobile: true }),
          col<Refund>('by', 'Requested by', (r) => r.requestedBy, { sort: (r) => r.requestedBy, hideOnMobile: true }),
          col<Refund>('t', 'Requested', (r) => nw(date(r.createdAt)), { sort: (r) => r.createdAt }),
        ]}
        empty={{ title: 'No refunds or credit notes' }}
      />
    </AdminPage>
  );
}
