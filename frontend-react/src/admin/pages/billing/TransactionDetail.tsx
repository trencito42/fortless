import { Badge, Button, DescriptionList, EmptyState, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Status, paymentStatus, webhookStatus } from '../../components/status';
import { CustomerLink, InvoiceLink, OrderLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime } from '../../lib/format';
import { useBillingOps } from './billingOps';

export default function TransactionDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const ops = useBillingOps();
  const p = data.payments.find((x) => x.id === id);
  if (!p) return <AdminPage title="Transaction not found"><EmptyState title="No such transaction" action={<Button onClick={() => nav('/billing/transactions')}>Back to transactions</Button>} /></AdminPage>;
  const ev = data.webhooks.find((w) => w.id === p.webhookEventId);
  const inv = data.invoices.find((i) => i.id === p.invoiceId);
  const refunds = data.refunds.filter((r) => r.paymentId === p.id);
  return (
    <AdminPage detail title={p.id} crumbLabel={p.id} parents={[{ label: 'Transactions', to: '/billing/transactions' }]} status={<><Status map={paymentStatus} value={p.status} /><Badge tone={p.reconciled ? 'good' : 'bad'}>{p.reconciled ? 'Reconciled' : 'Not reconciled'}</Badge></>} description={<>{dateTime(p.createdAt)} · <CustomerLink id={p.customerId} /></>}
      actions={!p.reconciled ? <Button variant="primary" leadingIcon="replay" disabled={!ops.can('accounts:manage')} onClick={() => ops.retryWebhook(p)}>Reprocess event…</Button> : undefined}>
      {!p.reconciled ? <Notice tone="bad" title="Money moved, Fortless does not know yet">Stripe reports this charge as {p.status}, but the matching webhook did not finish. The invoice is not marked paid and the order will not provision until this is reconciled.</Notice> : null}
      {p.status === 'disputed' ? <Notice tone="warn" title="Open card dispute">Do not refund manually. Evidence is submitted in the Stripe dashboard before the deadline.</Notice> : null}
      <Columns>
        <Section title="Payment"><DescriptionList items={[{ label: 'Amount', value: <MoneyText value={p.amount} /> }, { label: 'Status', value: <Status map={paymentStatus} value={p.status} /> }, { label: 'Method', value: `${p.method.brand} •••• ${p.method.last4}` }, { label: 'Stripe reference', value: p.providerRef, mono: true, copy: p.providerRef }, ...(p.failureCode ? [{ label: 'Failure code', value: p.failureCode.replace(/_/g, ' ') }] : [])]} /><p className="mt-3 text-[12.5px] font-semibold text-ink3">Only brand and last four digits are stored. Card numbers and CVVs never reach Fortless.</p></Section>
        <Section title="Related"><DescriptionList items={[{ label: 'Customer', value: <CustomerLink id={p.customerId} /> }, { label: 'Invoice', value: p.invoiceId ? <InvoiceLink id={p.invoiceId} /> : '—' }, { label: 'Order', value: p.orderId ? <OrderLink id={p.orderId} /> : 'Renewal' }, { label: 'Invoice status', value: inv?.status ?? '—' }, { label: 'Refunds', value: refunds.length ? refunds.map((r) => r.id).join(', ') : 'None' }]} /></Section>
        <Section title="Webhook evidence" description="The authoritative event for this payment.">{ev ? <DescriptionList items={[{ label: 'Event', value: ev.id, mono: true, copy: ev.id }, { label: 'Type', value: ev.type, mono: true }, { label: 'Status', value: <Status map={webhookStatus} value={ev.status} /> }, { label: 'Signature', value: ev.signatureVerified ? 'Verified (HMAC-SHA256)' : 'Not verified' }, { label: 'Attempts', value: ev.attempts }, { label: 'Received', value: dateTime(ev.receivedAt) }, ...(ev.error ? [{ label: 'Error', value: ev.error }] : [])]} /> : <p className="text-ink3">No webhook event is linked to this payment.</p>}</Section>
      </Columns>
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
