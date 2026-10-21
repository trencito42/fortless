import { Button, Select, TextField, Textarea } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;
const componentStates = ['OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE', 'MAINTENANCE'];

export function LiveIncidentCreate({ reload }: { reload: () => void }) {
  const { can } = useSession();
  if (!can('services:manage')) return null;
  return <LiveMutation spec={{ title: 'Declare incident', confirmLabel: 'Create incident', endpoint: '/incidents', tone: 'danger', initial: { title: '', impact: 'MINOR', status: 'INVESTIGATING', message: '' }, fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Public title" value={values['title']} onChange={(event) => set('title', event.target.value)} error={errors['title']} /><div className="grid gap-3 sm:grid-cols-2"><Select label="Impact" value={values['impact']} onValueChange={(value) => set('impact', value ?? 'MINOR')} options={['NONE', 'MINOR', 'MAJOR', 'CRITICAL'].map((value) => ({ value, label: value }))} /><Select label="Initial status" value={values['status']} onValueChange={(value) => set('status', value ?? 'INVESTIGATING')} options={['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'].map((value) => ({ value, label: value }))} /></div><Textarea label="Public update" value={values['message']} onChange={(event) => set('message', event.target.value)} error={errors['message']} maxLength={2000} counter /></div>, validate: (values) => ({ ...((values['title']?.trim().length ?? 0) < 3 ? { title: 'Enter at least 3 characters.' } : {}), ...((values['message']?.trim().length ?? 0) < 5 ? { message: 'Enter at least 5 characters.' } : {}) }), body: (_reason, values) => ({ title: values['title']?.trim(), impact: values['impact'], status: values['status'], message: values['message']?.trim(), affectedComponentIds: [] }) }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Declare incident</Button>} />;
}

export function LiveComponentAction({ row, reload }: { row: Row; reload: () => void }) {
  const { can } = useSession();
  const id = String(row['id'] ?? '');
  const current = String(row['status'] ?? 'OPERATIONAL');
  if (!can('services:manage') || !id) return null;
  return <LiveMutation spec={{ title: 'Change component status', confirmLabel: 'Update component', endpoint: `/components/${encodeURIComponent(id)}`, method: 'PATCH', tone: 'danger', initial: { status: current }, fields: ({ values, set, errors }) => <Select label="Component status" value={values['status']} onValueChange={(value) => set('status', value ?? current)} error={errors['status']} options={componentStates.map((value) => ({ value, label: value.replaceAll('_', ' ') }))} />, validate: (values) => values['status'] === current ? { status: 'Choose a different status.' } : {}, body: (_reason, values) => ({ status: values['status'] }) }} onDone={reload} trigger={<Button size="sm" variant="secondary">Set status</Button>} />;
}
