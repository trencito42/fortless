import { useMemo, useState } from 'react';
import { Button, DataTable, SegmentedControl, StatusBadge, type ColumnDef } from '@/design-system';
import { invoiceStatus } from '@/features';
import { useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, money } from '../../format';
import type { InvoiceRecord } from '../../domain/types';

type Filter = 'all' | 'due' | 'paid';

export default function Invoices() {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.listInvoices());
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => (res.status === 'ready' ? res.data.filter((i) => filter === 'all' || (filter === 'paid' ? i.state === 'paid' : i.state === 'open' || i.state === 'overdue')) : []), [res, filter]);
  const columns: ColumnDef<InvoiceRecord, unknown>[] = [
    { accessorKey: 'number', header: 'Invoice', meta: { primary: true }, cell: (c) => <button type="button" className="font-bold hover:text-accent-ink" onClick={() => nav(`/app/billing/invoices/${c.row.original.id}`)}>{c.row.original.number}</button> },
    { accessorKey: 'state', header: 'Status', cell: (c) => <StatusBadge tone={invoiceStatus[c.row.original.state].tone}>{invoiceStatus[c.row.original.state].label}</StatusBadge> },
    { id: 'issued', header: 'Issued', accessorFn: (i) => i.issuedOn, cell: (c) => date(c.row.original.issuedOn) },
    { id: 'due', header: 'Due', accessorFn: (i) => i.dueOn ?? '', cell: (c) => (c.row.original.dueOn ? date(c.row.original.dueOn) : '—'), meta: { hideOnMobile: true } },
    { id: 'total', header: 'Total', accessorFn: (i) => i.total.amount, meta: { numeric: true }, cell: (c) => <span className="font-semibold tabular-nums">{money(c.row.original.total)}</span> },
    { id: 'act', header: 'Actions', enableSorting: false, cell: (c) => <Button size="sm" variant="secondary" onClick={() => nav(`/app/billing/invoices/${c.row.original.id}`)}>View</Button> },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Invoices" description="Every invoice for this account. Paying uses your default card." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Invoices' }]} />
      <CapabilityNote area="billing" />
      <DataTable
        data={rows} columns={columns} getRowId={(i) => i.id} caption="Invoices" loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} pageSize={10}
        toolbar={<SegmentedControl<Filter> aria-label="Invoice filter" value={filter} onValueChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Due' }, { value: 'paid', label: 'Paid' }]} />}
        empty={{ title: filter === 'all' ? 'No invoices yet' : 'No invoices match', description: 'Invoices appear here after an order or renewal.' }}
      />
    </div>
  );
}
