import { Button, DataTable, StatusBadge, type ColumnDef } from '@/design-system';
import { useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { date, money } from '../../format';
import type { OrderRecord, OrderState } from '../../domain/types';

const STATE: Record<OrderState, { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: string; live?: boolean }> = { 'pending-payment': { tone: 'warn', label: 'Awaiting payment' }, provisioning: { tone: 'warn', label: 'Setting up', live: true }, active: { tone: 'good', label: 'Active' }, failed: { tone: 'bad', label: 'Failed' }, cancelled: { tone: 'neutral', label: 'Cancelled' } };

export default function Orders() {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.listOrders());
  const columns: ColumnDef<OrderRecord, unknown>[] = [
    { accessorKey: 'number', header: 'Order', meta: { primary: true }, cell: (c) => <span className="font-bold">{c.row.original.number}</span> },
    { accessorKey: 'state', header: 'Status', cell: (c) => { const o = c.row.original; const s = STATE[o.state]; return <div className="grid gap-1"><StatusBadge tone={s.tone} live={s.live}>{s.label}</StatusBadge>{o.failure ? <span className="max-w-[34ch] text-[13px] text-bad">{o.failure}</span> : null}</div>; } },
    { id: 'items', header: 'Items', enableSorting: false, cell: (c) => <ul className="grid gap-0.5">{c.row.original.items.map((i) => <li key={i.title}><span className="font-semibold">{i.title}</span> <span className="text-[13px] text-ink3">{i.detail}</span></li>)}</ul> },
    { id: 'placed', header: 'Placed', accessorFn: (o) => o.placedOn, cell: (c) => date(c.row.original.placedOn), meta: { hideOnMobile: true } },
    { id: 'total', header: 'Total', accessorFn: (o) => o.total.amount, meta: { numeric: true }, cell: (c) => <span className="font-semibold tabular-nums">{money(c.row.original.total)}</span> },
    { id: 'act', header: '', enableSorting: false, cell: (c) => (c.row.original.state === 'failed' ? <Button size="sm" variant="primary" onClick={() => nav('/app/billing/cart')}>Try again</Button> : c.row.original.invoiceId ? <Button size="sm" variant="secondary" onClick={() => nav(`/app/billing/invoices/${c.row.original.invoiceId}`)}>Invoice</Button> : null) },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader title="Orders" description="Everything you bought, and where each order is in setup." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Orders' }]} actions={<Button variant="primary" leadingIcon="add-01" onClick={() => nav('/app/deploy')}>New order</Button>} />
      <CapabilityNote area="billing" />
      <DataTable data={res.status === 'ready' ? res.data : []} columns={columns} getRowId={(o) => o.id} caption="Orders" loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} empty={{ title: 'No orders yet', description: 'Deploy a server to place your first order.', action: <Button variant="primary" onClick={() => nav('/app/deploy')}>Deploy a server</Button> }} />
    </div>
  );
}
