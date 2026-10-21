import { Button, Select, Textarea } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';
import { LiveTicketRoutingActions } from './LiveSupportActions';

type Row = Record<string, unknown>;
export function LiveTicketActions({ payload, reload }: { payload: Row; reload: () => void }) {
  const { can } = useSession();
  const ticket = payload['ticket'];
  if (!ticket || typeof ticket !== 'object' || Array.isArray(ticket) || !can('tickets:manage')) return null;
  const row = ticket as Row;
  const id = String(row['id'] ?? '');
  const current = String(row['status'] ?? 'OPEN');
  if (!id) return null;
  return <div className="flex flex-wrap gap-2">
    <LiveTicketRoutingActions ticket={row} reload={reload} />
    <LiveMutation spec={{ title: 'Reply to ticket', confirmLabel: 'Send reply', endpoint: `/tickets/${encodeURIComponent(id)}/reply`, initial: { body: '', kind: 'REPLY' }, fields: ({ values, set, errors }) => <div className="grid gap-3"><Select label="Message type" value={values['kind']} onValueChange={(value) => set('kind', value ?? 'REPLY')} options={[{ value: 'REPLY', label: 'Customer reply' }, { value: 'NOTE', label: 'Internal note' }]} /><Textarea label={values['kind'] === 'NOTE' ? 'Internal note' : 'Reply'} value={values['body']} onChange={(event) => set('body', event.target.value)} error={errors['body']} maxLength={10000} counter /></div>, validate: (values) => (values['body']?.trim().length ?? 0) >= 2 ? {} : { body: 'Enter at least 2 characters.' }, body: (_reason, values) => ({ body: values['body']?.trim(), isInternalNote: values['kind'] === 'NOTE' }) }} onDone={reload} trigger={<Button size="sm" variant="primary">Reply</Button>} />
    <LiveMutation spec={{ title: 'Change ticket status', confirmLabel: 'Update status', endpoint: `/tickets/${encodeURIComponent(id)}/status`, method: 'PATCH', initial: { status: current }, fields: ({ values, set, errors }) => <Select label="Ticket status" value={values['status']} onValueChange={(value) => set('status', value ?? current)} error={errors['status']} options={['OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'].map((value) => ({ value, label: value.replaceAll('_', ' ') }))} />, validate: (values) => values['status'] === current ? { status: 'Choose a different status.' } : {}, body: (_reason, values) => ({ status: values['status'] }) }} onDone={reload} trigger={<Button size="sm" variant="secondary">Change status</Button>} />
  </div>;
}
