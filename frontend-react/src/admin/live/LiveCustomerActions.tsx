import { Button, Select, Textarea } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;
export function LiveCustomerActions({ payload, reload }: { payload: Row; reload: () => void }) {
  const { can } = useSession();
  const account = payload['account'];
  if (!account || typeof account !== 'object' || Array.isArray(account) || !can('accounts:manage')) return null;
  const row = account as Row;
  const id = String(row['id'] ?? '');
  const current = String(row['status'] ?? 'ACTIVE');
  if (!id) return null;
  return <div className="flex flex-wrap gap-2">
    <LiveMutation spec={{ title: 'Add internal note', confirmLabel: 'Add note', endpoint: `/accounts/${encodeURIComponent(id)}/notes`, initial: { note: '' }, fields: ({ values, set, errors }) => <Textarea label="Internal note" value={values['note']} onChange={(event) => set('note', event.target.value)} error={errors['note']} maxLength={4000} counter />, validate: (values) => (values['note']?.trim().length ?? 0) >= 2 ? {} : { note: 'Enter at least 2 characters.' }, body: (_reason, values) => ({ body: values['note']?.trim() }) }} onDone={reload} trigger={<Button size="sm" variant="secondary">Add note</Button>} />
    <LiveMutation spec={{ title: 'Change account status', confirmLabel: 'Change status', endpoint: `/accounts/${encodeURIComponent(id)}/status`, method: 'PATCH', reason: true, reasonMinLength: 5, tone: current === 'ACTIVE' ? 'danger' : 'default', initial: { status: current }, fields: ({ values, set, errors }) => <Select label="Account status" value={values['status']} onValueChange={(value) => set('status', value ?? current)} error={errors['status']} options={['ACTIVE', 'LOCKED', 'FLAGGED_FRAUD'].map((value) => ({ value, label: value.replaceAll('_', ' ') }))} />, validate: (values) => values['status'] === current ? { status: 'Choose a different status.' } : {}, body: (reason, values) => ({ status: values['status'], reason }) }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Change status</Button>} />
  </div>;
}
