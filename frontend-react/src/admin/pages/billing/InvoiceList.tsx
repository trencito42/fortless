import { useMemo } from 'react';
import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, invoiceKey, invoiceStatus } from '../../components/status';
import { CustomerLink, InvoiceLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { balanceDue } from '../../lib/billing';
import { date } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import type { Invoice } from '../../types';
import { useBillingOps } from './billingOps';

export default function InvoiceList() {
  const { data } = useAdmin();
  const nav = useNav();
  const ops = useBillingOps();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const seg = (v: string, label: string, test: (i: Invoice) => boolean) => ({ value: v, label, test });
  const m = ops.can('accounts:manage');
  return (
    <AdminPage title="Invoices" description="Documents issued to customers. Total, paid and balance due are different numbers and are shown side by side.">
      <ResourceTable<Invoice>
        tableId="invoices" caption="Invoices" rows={data.invoices} getRowId={(i) => i.id} rowLabel={(i) => i.number}
        searchText={(i) => `${i.number} ${i.id} ${cust.get(i.customerId) ?? ''} ${i.orderId ?? ''} ${i.serviceId ?? ''}`} searchPlaceholder="Search invoice number, customer, order"
        segments={[seg('all', 'All', () => true), seg('OPEN', 'Open', (i) => invoiceKey(i) === 'OPEN'), seg('OVERDUE', 'Overdue', (i) => invoiceKey(i) === 'OVERDUE'), seg('PAID', 'Paid', (i) => i.status === 'PAID'), seg('DRAFT', 'Draft', (i) => i.status === 'DRAFT'), seg('VOID', 'Void', (i) => i.status === 'VOID'), seg('UNCOLLECTIBLE', 'Uncollectible', (i) => i.status === 'UNCOLLECTIBLE')]}
        filters={[
          { id: 'cur', label: 'Currency', options: ['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c })), test: (i, v) => i.currency === v },
          { id: 'ref', label: 'Refunds', options: [{ value: 'yes', label: 'Has refund or credit' }, { value: 'no', label: 'None' }], test: (i, v) => (v === 'yes') === (i.amountRefunded.amount > 0 || i.creditApplied.amount > 0) },
          { id: 'kind', label: 'Kind', options: [{ value: 'initial', label: 'Initial order' }, { value: 'renewal', label: 'Renewal' }], test: (i, v) => (v === 'initial') === !!i.orderId },
        ]}
        dateField={{ label: 'Issued', get: (i) => i.issuedAt }}
        advanced={{ fields: [{ id: 'total', label: 'Total (major units)', type: 'number' }, { id: 'balance', label: 'Balance due (major units)', type: 'number' }], getValue: (i, f) => (f === 'total' ? i.total.amount / 100 : balanceDue(i).amount / 100) }}
        onRowClick={(i) => nav(`/billing/invoices/${i.id}`)}
        columns={[
          col<Invoice>('n', 'Invoice', (i) => <InvoiceLink id={i.id} />, { sort: (i) => i.number, primary: true }),
          col<Invoice>('c', 'Customer', (i) => <span className="block md:min-w-[8rem]"><CustomerLink id={i.customerId} /></span>, { sort: (i) => cust.get(i.customerId) ?? '' }),
          col<Invoice>('s', 'Status', (i) => <Status map={invoiceStatus} value={invoiceKey(i)} />, { sort: (i) => invoiceKey(i) }),
          col<Invoice>('iss', 'Issued', (i) => nw(date(i.issuedAt)), { sort: (i) => i.issuedAt }),
          col<Invoice>('due', 'Due', (i) => nw(date(i.dueAt)), { sort: (i) => i.dueAt }),
          col<Invoice>('t', 'Total', (i) => <MoneyText value={i.total} />, { sort: (i) => i.total.amount, numeric: true }),
          col<Invoice>('p', 'Paid', (i) => <MoneyText value={i.amountPaid} />, { sort: (i) => i.amountPaid.amount, numeric: true, hideOnMobile: true }),
          col<Invoice>('b', 'Balance due', (i) => (balanceDue(i).amount ? <MoneyText value={balanceDue(i)} className="font-bold text-warn" /> : <span className="text-ink3">—</span>), { sort: (i) => balanceDue(i).amount, numeric: true }),
        ]}
        rowActions={(i) => [
          { id: 'open', label: 'Open invoice', icon: 'arrow-up-right-01', onSelect: () => nav(`/billing/invoices/${i.id}`) },
          { id: 'rem', label: 'Send reminder…', icon: 'send', disabled: !m || i.status !== 'OPEN', disabledReason: i.status !== 'OPEN' ? 'Only open invoices' : 'Requires accounts:manage', onSelect: () => ops.reminder(i) },
          { id: 'cust', label: 'Open customer', icon: 'user', onSelect: () => nav(`/customers/${i.customerId}`) },
        ]}
        bulkActions={(sel) => <>
          <Button size="sm" variant="secondary" disabled={!m || sel.some((i) => i.status !== 'OPEN')} onClick={() => ops.reminder(sel[0]!)}>Send reminders</Button>
          <Button size="sm" variant="secondary" onClick={() => downloadCsv('invoices-demo.csv', ['number', 'customer', 'status', 'currency', 'total_minor', 'paid_minor', 'due'], sel.map((i) => [i.number, cust.get(i.customerId), invoiceKey(i), i.currency, i.total.amount, i.amountPaid.amount, i.dueAt]))}>Export CSV</Button>
        </>}
        empty={{ title: 'No invoices' }}
      />
      {ops.node}
    </AdminPage>
  );
}
