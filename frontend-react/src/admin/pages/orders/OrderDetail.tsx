import { useMemo } from 'react';
import { ActionMenu, Badge, Button, DescriptionList, EmptyState, Notice, Select, Timeline, type MenuEntry, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Fact, FactGrid, Section, Split } from '../../components/Cards';
import { Status, fulfillmentState, jobStatus, lifecycle, orderStatus, paymentState, paymentStatus, runtime } from '../../components/status';
import { CustomerLink, InvoiceLink, JobLink, PaymentLink, ServiceLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col, nw } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { dateTime, iso, intervalLabel, money, relative } from '../../lib/format';
import type { Job, OrderLine, Payment } from '../../types';

export default function OrderDetail({ id }: { id: string }) {
  const { data, patch, add, audit, newId } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const act = useActionDialog();
  const o = data.orders.find((x) => x.id === id);
  const jobs = useMemo(() => data.jobs.filter((j) => o?.jobIds.includes(j.id)), [data.jobs, o]);
  const pays = useMemo(() => data.payments.filter((p) => o?.paymentIds.includes(p.id) || (o?.invoiceId && p.invoiceId === o.invoiceId)), [data.payments, o]);
  const services = useMemo(() => data.services.filter((s) => s.orderId === id || o?.lines.some((l) => l.serviceId === s.id)), [data.services, id, o]);
  if (!o) return <AdminPage title="Order not found"><EmptyState title="No such order" description={`There is no order ${id}.`} action={<Button onClick={() => nav('/orders')}>Back to orders</Button>} /></AdminPage>;
  const customer = data.customers.find((c) => c.id === o.customerId);
  const invoice = data.invoices.find((i) => i.id === o.invoiceId);
  const unknown = jobs.find((j) => j.unknownOutcome && (j.status === 'manual_review' || j.status === 'failed'));
  const ent = { type: 'order', id: o.id, label: o.id };
  const manage = can('accounts:manage');
  const paid = o.payment === 'succeeded' || o.payment === 'partially_refunded' || o.payment === 'disputed';
  const failed = o.status === 'FULFILLMENT_FAILED' || o.status === 'PARTIALLY_FULFILLED';

  const events: TimelineEvent[] = [
    { id: 'q', title: 'Quote locked at checkout', description: `Quote ${o.quoteId} · total ${money(o.total)}`, time: dateTime(o.createdAt), iso: o.createdAt, icon: 'receipt', tone: 'neutral' },
    ...pays.map((p): TimelineEvent => ({ id: p.id, title: `Payment ${p.status}`, description: <PaymentLink id={p.id} />, time: dateTime(p.createdAt), iso: p.createdAt, icon: 'credit-card', tone: p.status === 'succeeded' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral' })),
    ...(o.invoiceId && paid ? [{ id: 'inv', title: 'Invoice marked paid by webhook', description: invoice ? invoice.number : o.invoiceId, time: dateTime(pays[0]?.createdAt), icon: 'invoice-01' as const, tone: 'good' as const }] : []),
    ...jobs.map((j): TimelineEvent => ({ id: j.id, title: `Provisioning job ${j.status.replace('_', ' ')}`, description: <span className="inline-flex flex-wrap items-center gap-2"><JobLink id={j.id} />{j.error ? <span className="text-bad">{j.error.code}</span> : null}</span>, time: dateTime(j.createdAt), iso: j.createdAt, icon: 'layers-01', tone: j.status === 'completed' ? 'good' : j.status === 'running' || j.status === 'pending' ? 'accent' : 'bad' })),
    ...services.map((s): TimelineEvent => ({ id: s.id, title: 'Service activated', description: <ServiceLink id={s.id} />, time: dateTime(s.createdAt), iso: s.createdAt, icon: 'server', tone: 'good' })),
  ];

  const reconcile = () => act.run({ title: 'Reconcile provisioning', description: 'Looks up provider servers by the deterministic correlation tag before anything else. It will never create a second server.', confirmLabel: 'Reconcile', permission: 'services:manage', stepUp: true, reasonRequired: true,
    effects: ['Query provider for servers tagged with this order', 'If exactly one exists: link it and finish fulfillment', 'If none exists: mark the outcome as “no server” so a retry becomes safe', 'If several: stop and require manual review'],
    onConfirm: ({ reason }) => { const j = unknown ?? jobs[0]; if (j) patch('jobs', j.id, { unknownOutcome: false, status: 'failed', error: { code: 'NO_PROVIDER_SERVER', message: 'Reconciliation found no server for this tag; retry is safe.' } }); audit('order.reconciled', ent, { accountId: o.customerId, reason }); return 'Reconciliation done: no provider server found, retry is now safe'; } });
  const retry = () => act.run({ title: 'Retry fulfillment', description: 'Queues a new provisioning attempt with the same idempotency key.', confirmLabel: 'Retry fulfillment', permission: 'services:manage', stepUp: true, reasonRequired: true, effects: ['Re-run reservation and server creation as a new job attempt', 'Uses the same idempotency key, so a duplicate server cannot be created'],
    onConfirm: ({ reason }) => { const j: Job = { id: newId('job'), type: 'PROVISION_SERVICE', status: 'pending', attempts: 0, maxAttempts: 5, correlationId: newId('cor'), idempotencyKey: `provision_service:${o.id}`, orderId: o.id, serviceId: null, customerId: o.customerId, nodeId: null, error: null, unknownOutcome: false, createdAt: iso(0), startedAt: null, finishedAt: null, nextRetryAt: null, workerId: null, logs: [] }; add('jobs', j); patch('orders', o.id, (c) => ({ status: 'FULFILLING' as const, fulfillment: 'queued' as const, jobIds: [...c.jobIds, j.id], error: undefined })); audit('order.fulfillment_retried', ent, { accountId: o.customerId, reason }); return 'New provisioning job queued'; } });
  const fraud = (decision: 'cleared' | 'rejected') => act.run({ title: decision === 'cleared' ? 'Clear fraud review' : 'Reject order as fraud', description: decision === 'cleared' ? 'Releases the order to fulfillment.' : 'Cancels fulfillment. A rejected paid order must be refunded through billing.', confirmLabel: decision === 'cleared' ? 'Clear review' : 'Reject order', permission: 'accounts:manage', stepUp: true, tone: decision === 'rejected' ? 'danger' : 'default', reasonRequired: true,
    onConfirm: ({ reason }) => { patch('orders', o.id, decision === 'cleared' ? { fraudReview: 'cleared' } : { fraudReview: 'rejected', status: 'CANCELED', fulfillment: 'not_started' }); audit(`order.fraud_${decision}`, ent, { accountId: o.customerId, reason }); return decision === 'cleared' ? 'Review cleared' : 'Order rejected'; } });
  const cancel = () => act.run({ title: 'Cancel order', description: paid ? 'This order is paid. Cancelling does not refund it; open a refund from the invoice.' : 'Cancels an unpaid order and releases reserved capacity.', confirmLabel: 'Cancel order', permission: 'accounts:manage', tone: 'danger', reasonRequired: true, onConfirm: ({ reason }) => { patch('orders', o.id, { status: 'CANCELED', fulfillment: 'not_started' }); audit('order.canceled', ent, { accountId: o.customerId, reason }); return 'Order canceled'; } });
  const markReview = () => act.run({ title: 'Escalate for review', confirmLabel: 'Escalate', permission: 'accounts:manage', initial: { to: 'dep_billing' }, fields: ({ values, set }) => <Select label="Route to" value={values['to']} onValueChange={(v) => set('to', v ?? '')} options={data.departments.filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))} />, reasonRequired: true, onConfirm: ({ reason }) => { audit('order.escalated', ent, { accountId: o.customerId, reason }); return 'Escalated'; } });

  const menu: MenuEntry[] = [
    { id: 'rec', label: 'Reconcile provisioning…', icon: 'arrow-reload-horizontal', disabled: !can('services:manage') || !failed, disabledReason: !failed ? 'Only failed or partial fulfillment can be reconciled' : 'Requires services:manage', onSelect: reconcile },
    { id: 'esc', label: 'Escalate for review…', icon: 'send', disabled: !manage, onSelect: markReview },
    { id: 'sep', kind: 'separator' },
    { id: 'cancel', label: 'Cancel order…', icon: 'cancel-01', tone: 'danger', disabled: !manage || o.status === 'CANCELED' || o.status === 'COMPLETED', disabledReason: 'Completed or canceled orders cannot be canceled', onSelect: cancel },
  ];

  return (
    <AdminPage detail title={o.id} crumbLabel={o.id} parents={[{ label: 'Orders', to: '/orders' }]} status={<><Status map={orderStatus} value={o.status} />{o.fraudReview === 'pending' ? <Badge tone="warn">Fraud review pending</Badge> : null}</>}
      description={<>Placed {relative(o.createdAt)} by <CustomerLink id={o.customerId} /> · quote <span className="font-mono">{o.quoteId}</span></>}
      actions={<>
        {o.fraudReview === 'pending' ? <><Button variant="primary" onClick={() => fraud('cleared')} disabled={!manage}>Clear review…</Button><Button variant="danger-subtle" onClick={() => fraud('rejected')} disabled={!manage}>Reject…</Button></> : null}
        {failed ? <Button variant="primary" leadingIcon="replay" onClick={retry} disabled={!can('services:manage') || !!unknown} title={unknown ? 'Outcome unknown: reconcile before retrying' : undefined}>Retry fulfillment…</Button> : null}
        {o.invoiceId ? <Button variant="secondary" leadingIcon="invoice-01" onClick={() => nav(`/billing/invoices/${o.invoiceId}`)}>Invoice</Button> : null}
        <ActionMenu label="More order actions" entries={menu} /></>}>
      {unknown ? <Notice tone="warn" title="Provider outcome unknown" action={<Button size="sm" variant="secondary" onClick={reconcile} disabled={!can('services:manage')}>Reconcile…</Button>}>Job <JobLink id={unknown.id} /> timed out talking to the provider. The server may or may not exist. Retry is blocked until a reconciliation finds out, to avoid a duplicate server.</Notice> : null}
      {o.error ? <Notice tone="bad" title="Fulfillment error">{o.error}</Notice> : null}
      {paid && failed ? <Notice tone="info" title="Customer has paid, service not delivered">Payment and provisioning are independent. Do not refund automatically: first reconcile or retry. Refunds are issued from the invoice.</Notice> : null}

      <Columns cols={3}>
        <Section title="Payment" description="Money. Confirmed only by a verified Stripe webhook."><FactGrid cols={2}><Fact label="State"><Status map={paymentState} value={o.payment} /></Fact><Fact label="Payments">{pays.length}</Fact><Fact label="Total"><MoneyText value={o.total} /></Fact><Fact label="Invoice">{o.invoiceId ? <InvoiceLink id={o.invoiceId} /> : '—'}</Fact></FactGrid></Section>
        <Section title="Fulfillment" description="Delivery state of the order."><FactGrid cols={2}><Fact label="State"><Status map={fulfillmentState} value={o.fulfillment} /></Fact><Fact label="Line items">{o.lines.length}</Fact><Fact label="Delivered">{o.lines.filter((l) => l.serviceId).length} of {o.lines.length}</Fact></FactGrid></Section>
        <Section title="Provisioning" description="Jobs talking to the provider."><FactGrid cols={2}><Fact label="Jobs">{jobs.length}</Fact><Fact label="Latest">{jobs[0] ? <Status map={jobStatus} value={jobs[0].status} /> : '—'}</Fact><Fact label="Services">{services.length}</Fact><Fact label="Unknown outcome" tone={unknown ? 'warn' : undefined}>{unknown ? 'Yes' : 'No'}</Fact></FactGrid></Section>
      </Columns>

      <Split main={<>
        <Section title="Line items"><RelatedTable rows={o.lines} getRowId={(l) => l.id} caption="Order line items" pageSize={10} columns={[
          col<OrderLine>('d', 'Item', (l) => <span className="block min-w-[10rem] font-semibold">{l.description}</span>, { primary: true }), col<OrderLine>('c', 'Cycle', (l) => intervalLabel[l.interval]), col<OrderLine>('q', 'Qty', (l) => l.quantity, { numeric: true }), col<OrderLine>('u', 'Unit', (l) => <MoneyText value={l.unit} />, { numeric: true }), col<OrderLine>('s', 'Service', (l) => (l.serviceId ? <ServiceLink id={l.serviceId} /> : <span className="text-ink3">not delivered</span>)),
        ]} />
          <dl className="mt-4 ml-auto grid max-w-xs gap-1.5 text-[14px]"><div className="flex justify-between gap-4"><dt className="text-ink3">Subtotal</dt><dd className="tabular-nums">{money(o.subtotal)}</dd></div>{o.discount.amount ? <div className="flex justify-between gap-4"><dt className="text-ink3">Discount {o.couponCode ? `(${o.couponCode})` : ''}</dt><dd className="tabular-nums">−{money(o.discount)}</dd></div> : null}<div className="flex justify-between gap-4"><dt className="text-ink3">Tax</dt><dd className="tabular-nums">{money(o.tax)}</dd></div><div className="flex justify-between gap-4 pt-1.5 text-[16px] font-extrabold"><dt>Total</dt><dd className="tabular-nums">{money(o.total)}</dd></div></dl>
        </Section>
        <Section title="Payments"><RelatedTable rows={pays} getRowId={(p) => p.id} caption="Order payments" empty="No payment attempts." onRowClick={(p) => nav(`/billing/transactions/${p.id}`)} columns={[
          col<Payment>('id', 'Payment', (p) => <PaymentLink id={p.id} />, { primary: true }), col<Payment>('s', 'Status', (p) => <Status map={paymentStatus} value={p.status} />), col<Payment>('a', 'Amount', (p) => <MoneyText value={p.amount} />, { numeric: true }), col<Payment>('m', 'Method', (p) => `${p.method.brand} •••• ${p.method.last4}`), col<Payment>('w', 'Reconciled', (p) => <Badge tone={p.reconciled ? 'good' : 'bad'}>{p.reconciled ? 'Yes' : 'No'}</Badge>), col<Payment>('t', 'When', (p) => nw(relative(p.createdAt))),
        ]} /></Section>
        <Section title="Jobs"><RelatedTable rows={jobs} getRowId={(j) => j.id} caption="Order jobs" empty="No provisioning job yet." onRowClick={(j) => nav(`/provisioning/jobs/${j.id}`)} columns={[
          col<Job>('id', 'Job', (j) => <JobLink id={j.id} />, { primary: true }), col<Job>('s', 'Status', (j) => <Status map={jobStatus} value={j.status} />), col<Job>('a', 'Attempts', (j) => `${j.attempts}/${j.maxAttempts}`), col<Job>('e', 'Error', (j) => (j.error ? <span className="text-bad">{j.error.code}</span> : '—')), col<Job>('t', 'Created', (j) => nw(relative(j.createdAt))),
        ]} /></Section>
      </>} aside={<>
        <Section title="Customer"><DescriptionList items={[{ label: 'Account', value: <CustomerLink id={o.customerId} /> }, { label: 'Status', value: customer?.status ?? '—' }, { label: 'Risk', value: customer?.risk ?? '—' }, { label: 'Country', value: customer?.country ?? '—' }]} /></Section>
        <Section title="Services created">{services.length ? <ul className="grid gap-2">{services.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><ServiceLink id={s.id} /><span className="flex gap-1.5"><Status map={lifecycle} value={s.lifecycle} /><Status map={runtime} value={s.runtime} /></span></li>)}</ul> : <p className="text-ink3">No service has been created for this order yet.</p>}</Section>
        <Section title="Timeline"><Timeline events={events} label="Order timeline" /></Section>
      </>} />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
