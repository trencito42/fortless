import { Badge, Button, DescriptionList, EmptyState, Notice, Timeline, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Status, refundStatus } from '../../components/status';
import { CustomerLink, InvoiceLink, PaymentLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { dateTime } from '../../lib/format';
import { useBillingOps } from './billingOps';

export default function RefundDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const { staffName } = useSession();
  const ops = useBillingOps();
  const r = data.refunds.find((x) => x.id === id);
  if (!r) return <AdminPage title="Refund not found"><EmptyState title="No such refund" action={<Button onClick={() => nav('/billing/refunds')}>Back to refunds</Button>} /></AdminPage>;
  const own = r.requestedBy === staffName;
  const approval = data.approvals.find((a) => a.id === r.approvalId);
  const pending = r.status === 'pending_approval';
  const events: TimelineEvent[] = [
    { id: 'req', title: `${r.kind === 'refund' ? 'Refund' : 'Credit note'} requested`, description: `${r.requestedBy}: ${r.reason}`, time: dateTime(r.createdAt), iso: r.createdAt, icon: 'receipt', tone: 'neutral' },
    ...(approval && approval.decidedAt ? [{ id: 'dec', title: approval.status === 'approved' ? 'Approved' : 'Rejected', description: `${approval.decidedBy}${approval.reason ? `: ${approval.reason}` : ''}`, time: dateTime(approval.decidedAt), icon: approval.status === 'approved' ? 'tick-02' as const : 'cancel-01' as const, tone: approval.status === 'approved' ? 'good' as const : 'bad' as const }] : []),
    ...(r.status === 'processed' ? [{ id: 'proc', title: 'Processed', description: r.kind === 'refund' ? 'Stripe confirmed the refund by webhook' : 'Credit applied to the invoice', time: dateTime(r.createdAt), icon: 'checkmark-circle-02' as const, tone: 'good' as const }] : []),
    ...(r.status === 'failed' ? [{ id: 'fail', title: 'Failed at the payment provider', description: 'Issuer rejected the refund. Use a credit note or a manual transfer.', time: dateTime(r.createdAt), icon: 'alert-circle' as const, tone: 'bad' as const }] : []),
  ];
  return (
    <AdminPage detail title={r.id} crumbLabel={r.id} parents={[{ label: 'Refunds & credit notes', to: '/billing/refunds' }]} status={<><Status map={refundStatus} value={r.status} /><Badge>{r.kind === 'refund' ? 'Refund' : 'Credit note'}</Badge></>} description={<>{dateTime(r.createdAt)} · <CustomerLink id={r.customerId} /></>}
      actions={pending ? <><Button variant="primary" onClick={() => ops.decide(r, 'approved')} disabled={!ops.can('accounts:manage') || own} title={own ? 'You cannot approve your own request' : undefined}>Approve…</Button><Button variant="danger-subtle" onClick={() => ops.decide(r, 'rejected')} disabled={!ops.can('accounts:manage') || own}>Reject…</Button></> : undefined}>
      {pending && own ? <Notice tone="warn" title="Four-eyes rule">You requested this refund, so a different staff member must approve it. Switch preview role or ask a colleague.</Notice> : null}
      <Columns>
        <Section title="Details"><DescriptionList items={[{ label: 'Amount', value: <MoneyText value={r.amount} className="font-extrabold" /> }, { label: 'Reason', value: r.reason }, { label: 'Invoice', value: <InvoiceLink id={r.invoiceId} /> }, { label: 'Payment', value: r.paymentId ? <PaymentLink id={r.paymentId} /> : 'Credit notes are not tied to a payment' }, { label: 'Requested by', value: r.requestedBy }, { label: 'Approved by', value: r.approvedBy ?? '—' }]} /></Section>
        <Section title="History"><Timeline events={events} label="Refund history" /></Section>
      </Columns>
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
