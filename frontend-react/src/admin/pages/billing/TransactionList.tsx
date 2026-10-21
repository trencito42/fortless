import { useMemo } from 'react';
import { Badge } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, paymentStatus } from '../../components/status';
import { CustomerLink, InvoiceLink, PaymentLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { relative } from '../../lib/format';
import type { Payment } from '../../types';

export default function TransactionList() {
  const { data } = useAdmin();
  const nav = useNav();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const seg = (v: string, label: string, test: (p: Payment) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Transactions" description="Payment attempts as Stripe reported them. A payment counts only after its webhook is verified and reconciled with the invoice; a redirect to a success page proves nothing.">
      <ResourceTable<Payment>
        tableId="payments" caption="Payments" rows={data.payments} getRowId={(p) => p.id} rowLabel={(p) => p.id}
        searchText={(p) => `${p.id} ${p.providerRef} ${cust.get(p.customerId) ?? ''} ${p.invoiceId ?? ''} ${p.method.last4}`} searchPlaceholder="Search payment id, Stripe reference, customer, last 4"
        segments={[seg('all', 'All', () => true), seg('unrec', 'Unreconciled', (p) => !p.reconciled), seg('succeeded', 'Succeeded', (p) => p.status === 'succeeded'), seg('failed', 'Failed', (p) => p.status === 'failed'), seg('pending', 'Pending', (p) => p.status === 'pending'), seg('refunded', 'Refunded', (p) => p.status === 'refunded' || p.status === 'partially_refunded'), seg('disputed', 'Disputed', (p) => p.status === 'disputed')]}
        filters={[
          { id: 'cur', label: 'Currency', options: ['EUR', 'USD', 'RON'].map((c) => ({ value: c, label: c })), test: (p, v) => p.amount.currency === v },
          { id: 'brand', label: 'Method', options: ['Visa', 'Mastercard', 'Amex', 'SEPA'].map((c) => ({ value: c, label: c })), test: (p, v) => p.method.brand === v },
          { id: 'fail', label: 'Failure', options: ['card_declined', 'insufficient_funds', 'expired_card'].map((c) => ({ value: c, label: c.replace(/_/g, ' ') })), test: (p, v) => p.failureCode === v },
        ]}
        dateField={{ label: 'Created', get: (p) => p.createdAt }}
        onRowClick={(p) => nav(`/billing/transactions/${p.id}`)}
        columns={[
          col<Payment>('id', 'Payment', (p) => <PaymentLink id={p.id} />, { sort: (p) => p.id, primary: true }),
          col<Payment>('c', 'Customer', (p) => <span className="block md:min-w-[8rem]"><CustomerLink id={p.customerId} /></span>, { sort: (p) => cust.get(p.customerId) ?? '' }),
          col<Payment>('i', 'Invoice', (p) => (p.invoiceId ? <InvoiceLink id={p.invoiceId} /> : '—'), { hideOnMobile: true }),
          col<Payment>('s', 'Status', (p) => <Status map={paymentStatus} value={p.status} />, { sort: (p) => p.status }),
          col<Payment>('a', 'Amount', (p) => <MoneyText value={p.amount} />, { sort: (p) => p.amount.amount, numeric: true }),
          col<Payment>('m', 'Method', (p) => nw(`${p.method.brand} •••• ${p.method.last4}`), { sort: (p) => p.method.brand }),
          col<Payment>('r', 'Reconciled', (p) => <Badge tone={p.reconciled ? 'good' : 'bad'}>{p.reconciled ? 'Yes' : 'No'}</Badge>, { sort: (p) => String(p.reconciled) }),
          col<Payment>('ref', 'Stripe reference', (p) => <span className="font-mono text-[12.5px]">{p.providerRef}</span>, { hideOnMobile: true }),
          col<Payment>('t', 'Created', (p) => nw(relative(p.createdAt)), { sort: (p) => p.createdAt }),
        ]}
        rowActions={(p) => [{ id: 'open', label: 'Open transaction', icon: 'arrow-up-right-01', onSelect: () => nav(`/billing/transactions/${p.id}`) }, ...(p.invoiceId ? [{ id: 'inv', label: 'Open invoice', icon: 'invoice-01' as const, onSelect: () => nav(`/billing/invoices/${p.invoiceId}`) }] : [])]}
        empty={{ title: 'No transactions' }}
      />
    </AdminPage>
  );
}
