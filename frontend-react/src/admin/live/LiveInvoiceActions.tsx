import { Button, Notice, TextField } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;
export function LiveInvoiceActions({ payload, reload }: { payload: Row; reload: () => void }) {
  const { can } = useSession();
  const invoice = payload['invoice'];
  if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice) || !can('accounts:manage')) return null;
  const row = invoice as Row;
  const id = String(row['id'] ?? '');
  const currency = String(row['currency'] ?? 'EUR');
  const paid = Number(row['amount_paid_minor_units'] ?? 0);
  if (!id || paid <= 0) return null;
  return <LiveMutation spec={{ title: 'Refund invoice payment', confirmLabel: 'Issue refund', endpoint: `/invoices/${encodeURIComponent(id)}/refund`, reason: true, reasonMinLength: 5, tone: 'danger', initial: { amount: '' }, fields: ({ values, set, errors }) => <div className="grid gap-3"><Notice tone="warn" title="Provider-authoritative refund">Enter an integer amount in {currency} minor units. Fastify verifies the actual refundable balance and payment-provider result.</Notice><TextField label={`Amount (${currency} minor units)`} type="number" min={1} step={1} value={values['amount']} onChange={(event) => set('amount', event.target.value)} error={errors['amount']} /></div>, validate: (values) => Number.isInteger(Number(values['amount'])) && Number(values['amount']) > 0 ? {} : { amount: 'Enter a positive whole number of minor units.' }, body: (reason, values) => ({ amountMinorUnits: Number(values['amount']), reason }) }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Refund</Button>} />;
}
