import { useMemo } from 'react';
import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, fulfillmentState, orderStatus, paymentState } from '../../components/status';
import { CustomerLink, OrderLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { downloadCsv } from '../../lib/csv';
import { dateTime, relative } from '../../lib/format';
import type { Order } from '../../types';

const needsReview = (o: Order) => o.fraudReview === 'pending' || o.status === 'FULFILLMENT_FAILED' || o.status === 'PARTIALLY_FULFILLED';

export default function OrderList() {
  const { data } = useAdmin();
  const nav = useNav();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const seg = (v: string, label: string, test: (o: Order) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Orders" description="One order = one checked-out quote. Payment, fulfillment and provisioning are three separate states: a paid order is not a delivered service.">
      <ResourceTable<Order>
        tableId="orders" caption="Orders" rows={data.orders} getRowId={(o) => o.id} rowLabel={(o) => o.id}
        searchText={(o) => `${o.id} ${cust.get(o.customerId) ?? ''} ${o.quoteId} ${o.invoiceId ?? ''} ${o.lines.map((l) => l.description).join(' ')}`} searchPlaceholder="Search order id, customer, quote, plan"
        segments={[seg('all', 'All', () => true), seg('review', 'Requires review', needsReview), seg('DRAFT', 'Draft', (o) => o.status === 'DRAFT'), seg('AWAITING_PAYMENT', 'Awaiting payment', (o) => o.status === 'AWAITING_PAYMENT'), seg('PAID', 'Paid', (o) => o.status === 'PAID'), seg('FULFILLING', 'Fulfilling', (o) => o.status === 'FULFILLING'), seg('PARTIALLY_FULFILLED', 'Partially fulfilled', (o) => o.status === 'PARTIALLY_FULFILLED'), seg('FULFILLMENT_FAILED', 'Fulfillment failed', (o) => o.status === 'FULFILLMENT_FAILED'), seg('COMPLETED', 'Completed', (o) => o.status === 'COMPLETED'), seg('CANCELED', 'Canceled', (o) => o.status === 'CANCELED')]}
        filters={[
          { id: 'pay', label: 'Payment', options: (['none', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed'] as const).map((p) => ({ value: p, label: paymentState[p]!.label })), test: (o, v) => o.payment === v },
          { id: 'ful', label: 'Fulfillment', options: (['not_started', 'queued', 'in_progress', 'completed', 'partial', 'failed'] as const).map((p) => ({ value: p, label: fulfillmentState[p]!.label })), test: (o, v) => o.fulfillment === v },
          { id: 'cur', label: 'Currency', options: ['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c })), test: (o, v) => o.total.currency === v },
          { id: 'fraud', label: 'Fraud review', options: [{ value: 'pending', label: 'Pending' }, { value: 'cleared', label: 'Cleared' }, { value: 'rejected', label: 'Rejected' }], test: (o, v) => o.fraudReview === v },
        ]}
        dateField={{ label: 'Placed', get: (o) => o.createdAt }}
        advanced={{ fields: [{ id: 'total', label: 'Total (major units)', type: 'number' }, { id: 'plan', label: 'Line description', type: 'text' }], getValue: (o, f) => (f === 'total' ? o.total.amount / 100 : o.lines.map((l) => l.description).join(' ')) }}
        onRowClick={(o) => nav(`/orders/${o.id}`)}
        columns={[
          col<Order>('id', 'Order', (o) => <OrderLink id={o.id} />, { sort: (o) => o.id, primary: true }),
          col<Order>('cust', 'Customer', (o) => <span className="block md:min-w-[8rem]"><CustomerLink id={o.customerId} /></span>, { sort: (o) => cust.get(o.customerId) ?? '' }),
          col<Order>('items', 'Items', (o) => <span className="block md:min-w-[10rem] text-[13.5px]">{o.lines[0]?.description.split(' — ')[0]}{o.lines.length > 1 ? <Badge className="ml-1.5">+{o.lines.length - 1}</Badge> : null}</span>, { hideOnMobile: true }),
          col<Order>('status', 'Order', (o) => <Status map={orderStatus} value={o.status} />, { sort: (o) => o.status }),
          col<Order>('pay', 'Payment', (o) => <Status map={paymentState} value={o.payment} />, { sort: (o) => o.payment }),
          col<Order>('ful', 'Fulfillment', (o) => <Status map={fulfillmentState} value={o.fulfillment} />, { sort: (o) => o.fulfillment }),
          col<Order>('total', 'Total', (o) => <MoneyText value={o.total} />, { sort: (o) => o.total.amount, numeric: true }),
          col<Order>('flag', 'Flags', (o) => (o.fraudReview === 'pending' ? <Badge tone="warn">Fraud review</Badge> : o.couponCode ? <Badge tone="accent">{o.couponCode}</Badge> : <span className="text-ink3">—</span>), { hideOnMobile: true }),
          col<Order>('at', 'Placed', (o) => <span title={dateTime(o.createdAt)}>{nw(relative(o.createdAt))}</span>, { sort: (o) => o.createdAt }),
        ]}
        rowActions={(o) => [
          { id: 'open', label: 'Open order', icon: 'arrow-up-right-01', onSelect: () => nav(`/orders/${o.id}`) },
          { id: 'cust', label: 'Open customer', icon: 'user', onSelect: () => nav(`/customers/${o.customerId}`) },
          ...(o.invoiceId ? [{ id: 'inv', label: 'Open invoice', icon: 'invoice-01' as const, onSelect: () => nav(`/billing/invoices/${o.invoiceId}`) }] : []),
          ...(o.jobIds[0] ? [{ id: 'job', label: 'Open provisioning job', icon: 'layers-01' as const, onSelect: () => nav(`/provisioning/jobs/${o.jobIds[0]}`) }] : []),
        ]}
        bulkActions={(sel) => <Button size="sm" variant="secondary" onClick={() => downloadCsv('orders-demo.csv', ['id', 'customer', 'status', 'payment', 'fulfillment', 'total_minor', 'currency'], sel.map((o) => [o.id, cust.get(o.customerId), o.status, o.payment, o.fulfillment, o.total.amount, o.total.currency]))}>Export CSV</Button>}
        empty={{ title: 'No orders yet' }}
      />
    </AdminPage>
  );
}
