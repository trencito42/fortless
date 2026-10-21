import { Select, TextField } from '@/design-system';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { APPROVAL_THRESHOLD_MINOR, refundable } from '../../lib/billing';
import { iso, money } from '../../lib/format';
import type { Invoice, Payment, Refund } from '../../types';

/** Billing operations as ActionDialogs. Refunds above the threshold create an approval request instead of executing. Nothing reaches Stripe. */
export function useBillingOps() {
  const { data, patch, add, audit, newId } = useAdmin();
  const { staffName, can } = useSession();
  const dlg = useActionDialog();
  const ent = (i: Invoice) => ({ type: 'invoice', id: i.id, label: i.number });

  const applyRefund = (r: Refund) => {
    const inv = data.invoices.find((i) => i.id === r.invoiceId)!;
    if (r.kind === 'refund') {
      patch('invoices', inv.id, { amountRefunded: { currency: inv.currency, amount: inv.amountRefunded.amount + r.amount.amount } });
      if (r.paymentId) patch('payments', r.paymentId, { status: inv.amountRefunded.amount + r.amount.amount >= inv.amountPaid.amount ? 'refunded' : 'partially_refunded' });
    } else patch('invoices', inv.id, { creditApplied: { currency: inv.currency, amount: inv.creditApplied.amount + r.amount.amount } });
  };

  const refund = (inv: Invoice, kind: 'refund' | 'credit_note') => {
    const max = kind === 'refund' ? refundable(inv) : { currency: inv.currency, amount: inv.total.amount - inv.creditApplied.amount };
    dlg.run({
      title: kind === 'refund' ? 'Refund payment' : 'Issue credit note', confirmLabel: kind === 'refund' ? 'Submit refund' : 'Issue credit note', permission: 'accounts:manage', stepUp: true, tone: 'danger',
      description: kind === 'refund' ? `Returns money to the original payment method. Refundable now: ${money(max)}.` : `Reduces what the customer owes or adds account credit. Available: ${money(max)}.`,
      effects: kind === 'refund' ? ['Create the refund at Stripe with an idempotency key', `Amounts of ${money({ currency: inv.currency, amount: APPROVAL_THRESHOLD_MINOR })} or more wait for a second staff member’s approval`, 'Update invoice and payment status when the webhook confirms'] : ['Create a credit note document linked to the invoice', 'Apply it to the account balance'],
      initial: { amount: (max.amount / 100).toFixed(2), reasonKind: 'service_issue' },
      validate: (v) => { const n = Math.round(Number(v['amount']!.replace(',', '.')) * 100); return !/^\d+([.,]\d{1,2})?$/.test(v['amount']!.trim()) || n <= 0 ? { amount: 'Enter a positive amount with at most 2 decimals.' } : n > max.amount ? { amount: `Cannot exceed ${money(max)}.` } : {}; },
      fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2"><TextField label={`Amount (${inv.currency})`} inputMode="decimal" value={values['amount']} onChange={(e) => set('amount', e.target.value)} error={errors['amount']} /><Select label="Category" value={values['reasonKind']} onValueChange={(v) => set('reasonKind', v ?? '')} options={[{ value: 'service_issue', label: 'Service issue / outage' }, { value: 'duplicate', label: 'Duplicate charge' }, { value: 'cancel_window', label: 'Cancelled within refund window' }, { value: 'goodwill', label: 'Goodwill' }, { value: 'correction', label: 'Billing correction' }]} /></div>,
      onConfirm: ({ values, reason }) => {
        const amount = { currency: inv.currency, amount: Math.round(Number(values['amount']!.replace(',', '.')) * 100) };
        const large = amount.amount >= APPROVAL_THRESHOLD_MINOR && kind === 'refund';
        const approvalId = large ? newId('apr') : null;
        const r: Refund = { id: newId('rfd'), kind, customerId: inv.customerId, invoiceId: inv.id, paymentId: inv.paymentIds[0] ?? null, amount, reason: `${values['reasonKind']!.replace('_', ' ')}: ${reason}`, status: large ? 'pending_approval' : 'processed', requestedBy: staffName, approvedBy: null, createdAt: iso(0), approvalId };
        add('refunds', r); patch('invoices', inv.id, (c) => ({ refundIds: [...c.refundIds, r.id] }));
        if (large) add('approvals', { id: approvalId!, kind: 'large_refund', summary: `Refund ${money(amount)} on ${inv.number}`, requestedBy: staffName, requestedAt: iso(0), status: 'pending', resource: { type: 'refund', id: r.id, label: r.id, to: `/billing/refunds/${r.id}` }, decidedBy: null, decidedAt: null, reason: null, amount });
        else applyRefund(r);
        audit(`invoice.${kind === 'refund' ? 'refund' : 'credit_note'}_${large ? 'requested' : 'issued'}`, ent(inv), { accountId: inv.customerId, reason, after: { amount: money(amount) } });
        return large ? 'Refund needs approval: request created' : kind === 'refund' ? 'Refund processed' : 'Credit note issued';
      },
    });
  };
  const voidInvoice = (inv: Invoice) => dlg.run({ title: 'Void invoice', description: 'A void invoice cannot be paid. Voiding does not refund anything already paid.', confirmLabel: 'Void invoice', permission: 'accounts:manage', stepUp: true, tone: 'danger', requireText: inv.number, onConfirm: ({ reason }) => { patch('invoices', inv.id, { status: 'VOID' }); audit('invoice.voided', ent(inv), { accountId: inv.customerId, reason }); return `${inv.number} voided`; } });
  const uncollectible = (inv: Invoice) => dlg.run({ title: 'Mark uncollectible', description: 'Writes the balance off as bad debt. Services stay in their current lifecycle state.', confirmLabel: 'Mark uncollectible', permission: 'accounts:manage', stepUp: true, tone: 'danger', onConfirm: ({ reason }) => { patch('invoices', inv.id, { status: 'UNCOLLECTIBLE' }); audit('invoice.uncollectible', ent(inv), { accountId: inv.customerId, reason }); return 'Marked uncollectible'; } });
  const reminder = (inv: Invoice) => dlg.run({ title: 'Send payment reminder', confirmLabel: 'Send reminder', permission: 'accounts:manage', reasonRequired: false, description: `Emails the account owner a link to pay ${inv.number}.`, effects: ['Queue one email through the configured SMTP relay'], onConfirm: () => { audit('invoice.reminder_sent', ent(inv), { accountId: inv.customerId }); return 'Reminder queued'; } });
  const retryWebhook = (p: Payment) => dlg.run({ title: 'Reprocess payment event', description: 'Replays the stored Stripe event through the idempotent handler. It cannot double-apply: the handler keys on the event id.', confirmLabel: 'Reprocess event', permission: 'accounts:manage', stepUp: true, reasonRequired: true, effects: ['Verify the stored event again', 'Mark the invoice paid if the intent succeeded', 'Mark the payment reconciled'],
    onConfirm: ({ reason }) => { patch('payments', p.id, { reconciled: true }); if (p.webhookEventId) patch('webhooks', p.webhookEventId, { status: 'processed', error: null, processedAt: iso(0) }); audit('payment.event_reprocessed', { type: 'payment', id: p.id }, { accountId: p.customerId, reason }); return 'Event reprocessed and payment reconciled'; } });
  const decide = (r: Refund, decision: 'approved' | 'rejected') => dlg.run({ title: decision === 'approved' ? 'Approve refund' : 'Reject refund', confirmLabel: decision === 'approved' ? 'Approve and process' : 'Reject', permission: 'accounts:manage', stepUp: true, tone: decision === 'rejected' ? 'danger' : 'default', reasonRequired: true, description: `${r.kind === 'refund' ? 'Refund' : 'Credit note'} ${money(r.amount)} requested by ${r.requestedBy}. Approvers cannot approve their own request.`,
    onConfirm: ({ reason }) => { patch('refunds', r.id, { status: decision === 'approved' ? 'processed' : 'rejected', approvedBy: staffName }); if (decision === 'approved') applyRefund(r); if (r.approvalId) patch('approvals', r.approvalId, { status: decision, decidedBy: staffName, decidedAt: iso(0), reason }); audit(`refund.${decision}`, { type: 'refund', id: r.id }, { accountId: r.customerId, reason }); return decision === 'approved' ? 'Refund approved and processed' : 'Refund rejected'; } });
  return { node: dlg.node, refund, voidInvoice, uncollectible, reminder, retryWebhook, decide, can };
}
