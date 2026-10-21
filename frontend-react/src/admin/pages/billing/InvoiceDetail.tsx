import { ActionMenu, Badge, Button, DescriptionList, EmptyState, Notice, type MenuEntry } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section, Split } from '../../components/Cards';
import { Status, invoiceKey, invoiceStatus, paymentStatus, refundStatus } from '../../components/status';
import { CustomerLink, OrderLink, PaymentLink, ServiceLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col, nw } from '../../components/cols';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { balanceDue, netReceived, refundable } from '../../lib/billing';
import { date, dateTime, money } from '../../lib/format';
import type { InvoiceLine, Payment, Refund } from '../../types';
import { useBillingOps } from './billingOps';

export default function InvoiceDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const ops = useBillingOps();
  const inv = data.invoices.find((i) => i.id === id);
  if (!inv) return <AdminPage title="Invoice not found"><EmptyState title="No such invoice" action={<Button onClick={() => nav('/billing/invoices')}>Back to invoices</Button>} /></AdminPage>;
  const c = data.customers.find((x) => x.id === inv.customerId);
  const pays = data.payments.filter((p) => inv.paymentIds.includes(p.id));
  const refunds = data.refunds.filter((r) => r.invoiceId === inv.id);
  const m = ops.can('accounts:manage');
  const bal = balanceDue(inv), ref = refundable(inv), net = netReceived(inv);
  const menu: MenuEntry[] = [
    { id: 'rem', label: 'Send payment reminder…', icon: 'send', disabled: !m || inv.status !== 'OPEN', disabledReason: inv.status !== 'OPEN' ? 'Invoice is not open' : 'Requires accounts:manage', onSelect: () => ops.reminder(inv) },
    { id: 'credit', label: 'Issue credit note…', icon: 'file-add', disabled: !m || inv.status === 'VOID' || inv.status === 'DRAFT', onSelect: () => ops.refund(inv, 'credit_note') },
    { id: 'sep', kind: 'separator' },
    { id: 'unc', label: 'Mark uncollectible…', icon: 'alert-01', tone: 'danger', disabled: !m || inv.status !== 'OPEN', onSelect: () => ops.uncollectible(inv) },
    { id: 'void', label: 'Void invoice…', icon: 'cancel-01', tone: 'danger', disabled: !m || (inv.status !== 'OPEN' && inv.status !== 'DRAFT'), disabledReason: 'Only open or draft invoices can be voided', onSelect: () => ops.voidInvoice(inv) },
  ];
  return (
    <AdminPage detail title={inv.number} crumbLabel={inv.number} parents={[{ label: 'Invoices', to: '/billing/invoices' }]} status={<Status map={invoiceStatus} value={invoiceKey(inv)} />} description={<>Issued {date(inv.issuedAt)} · due {date(inv.dueAt)} · <CustomerLink id={inv.customerId} /></>}
      actions={<><Button variant="secondary" leadingIcon="file-01" onClick={() => window.print()}>Print</Button><Button variant="primary" leadingIcon="receipt" disabled={!m || ref.amount === 0} onClick={() => ops.refund(inv, 'refund')} title={ref.amount === 0 ? 'Nothing is refundable yet' : undefined}>Refund…</Button><ActionMenu label="More invoice actions" entries={menu} /></>}>
      {inv.status === 'OPEN' && Date.parse(inv.dueAt) < Date.parse('2026-10-21T09:30:00Z') ? <Notice tone="warn" title="Overdue">Balance due {money(bal)}. Services linked to this invoice may be past due.</Notice> : null}
      <Split main={<>
        <Section title="Lines">
          <RelatedTable rows={inv.lines} getRowId={(l) => l.id} caption="Invoice lines" pageSize={10} columns={[col<InvoiceLine>('d', 'Description', (l) => <span className="block min-w-[12rem] font-semibold">{l.description}</span>, { primary: true }), col<InvoiceLine>('q', 'Qty', (l) => l.quantity, { numeric: true }), col<InvoiceLine>('u', 'Unit (net)', (l) => <MoneyText value={l.unit} />, { numeric: true }), col<InvoiceLine>('t', 'Tax', (l) => `${l.taxRatePct}%`, { numeric: true })]} />
          <dl className="mt-4 ml-auto grid max-w-sm gap-1.5 text-[14px]">
            <div className="flex justify-between gap-4"><dt className="text-ink3">Subtotal (net)</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
            {inv.discount.amount ? <div className="flex justify-between gap-4"><dt className="text-ink3">Discount</dt><dd className="tabular-nums">−{money(inv.discount)}</dd></div> : null}
            <div className="flex justify-between gap-4"><dt className="text-ink3">Tax</dt><dd className="tabular-nums">{money(inv.tax)}</dd></div>
            <div className="flex justify-between gap-4 pt-1.5 text-[16px] font-extrabold"><dt>Invoice total</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
          </dl>
        </Section>
        <Section title="Payments, balance and refunds" description="Total is what was billed. Paid is what arrived. Balance is what is still owed. Refunds never reopen the invoice.">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">{([['Billed', inv.total], ['Paid', inv.amountPaid], ['Credit applied', inv.creditApplied], ['Refunded', inv.amountRefunded], ['Balance due', bal]] as const).map(([l, v]) => <div key={l} className="rounded-md bg-s2 p-3"><dt className="text-[12.5px] font-bold text-ink3">{l}</dt><dd className="text-[18px] font-extrabold tabular-nums">{money(v)}</dd></div>)}</dl>
          <p className="mt-2 text-[13px] font-semibold text-ink3">Net received {money(net)} · refundable now {money(ref)}</p>
          <div className="mt-4"><RelatedTable rows={pays} getRowId={(p) => p.id} caption="Payments on this invoice" pageSize={6} empty="No payment attempts." onRowClick={(p) => nav(`/billing/transactions/${p.id}`)} columns={[col<Payment>('id', 'Payment', (p) => <PaymentLink id={p.id} />, { primary: true }), col<Payment>('s', 'Status', (p) => <Status map={paymentStatus} value={p.status} />), col<Payment>('a', 'Amount', (p) => <MoneyText value={p.amount} />, { numeric: true }), col<Payment>('m', 'Method', (p) => `${p.method.brand} •••• ${p.method.last4}`), col<Payment>('t', 'When', (p) => nw(dateTime(p.createdAt)))]} /></div>
        </Section>
        {refunds.length ? <Section title="Refunds and credit notes"><RelatedTable rows={refunds} getRowId={(r) => r.id} caption="Refunds" pageSize={5} onRowClick={(r) => nav(`/billing/refunds/${r.id}`)} columns={[col<Refund>('id', 'Reference', (r) => <span className="font-mono text-[13px] font-semibold">{r.id}</span>, { primary: true }), col<Refund>('k', 'Kind', (r) => <Badge>{r.kind === 'refund' ? 'Refund' : 'Credit note'}</Badge>), col<Refund>('s', 'Status', (r) => <Status map={refundStatus} value={r.status} />), col<Refund>('a', 'Amount', (r) => <MoneyText value={r.amount} />, { numeric: true })]} /></Section> : null}
      </>} aside={<>
        <Section title="Bill to"><p className="font-bold">{c?.billingProfile.legalName}</p><p className="text-ink2">{c?.billingProfile.addressLine}<br />{c?.billingProfile.postalCode} {c?.billingProfile.city}<br />{c?.billingProfile.country}</p>{c?.billingProfile.vatId ? <p className="mt-1 font-mono text-[13px] font-semibold">VAT {c.billingProfile.vatId}</p> : null}</Section>
        <Section title="Linked records"><DescriptionList items={[{ label: 'Customer', value: <CustomerLink id={inv.customerId} /> }, { label: 'Order', value: inv.orderId ? <OrderLink id={inv.orderId} /> : 'Renewal: no order' }, { label: 'Service', value: inv.serviceId ? <ServiceLink id={inv.serviceId} /> : '—' }, { label: 'Currency', value: inv.currency }]} /></Section>
      </>} />
      <Columns><PreviewNote /></Columns>
      {ops.node}
    </AdminPage>
  );
}
