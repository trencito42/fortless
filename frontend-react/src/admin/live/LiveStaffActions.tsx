import { Button, Select, TextField } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;
const roles = ['OWNER', 'ADMINISTRATOR', 'BILLING', 'SUPPORT', 'INFRASTRUCTURE', 'AUDITOR'];

export function LiveStaffActions({ payload, reload, targetId }: { payload: Row; reload: () => void; targetId?: string }) {
  const { can } = useSession();
  if (!can('staff:manage')) return null;
  const staff = Array.isArray(payload['staff']) ? (payload['staff'] as unknown[]).filter((item): item is Row => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
  const target = targetId ? staff.find((item) => item['id'] === targetId) : undefined;
  if (targetId && !target) return null;
  if (target) {
    const role = String(target['role'] ?? 'AUDITOR');
    const status = String(target['status'] ?? 'ACTIVE');
    return <LiveMutation spec={{ title: 'Change staff access', confirmLabel: 'Apply access change', endpoint: `/staff/${encodeURIComponent(targetId!)}`, method: 'PATCH', reason: true, reasonMinLength: 8, tone: 'danger', initial: { role, status }, fields: ({ values, set }) => <div className="grid gap-3 sm:grid-cols-2"><Select label="Role" value={values['role']} onValueChange={(value) => set('role', value ?? role)} options={roles.map((value) => ({ value, label: value.replaceAll('_', ' ') }))} /><Select label="Access" value={values['status']} onValueChange={(value) => set('status', value ?? status)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'REVOKED', label: 'Revoked' }]} /></div>, validate: (values) => values['role'] === role && values['status'] === status ? { role: 'Choose a different role or access state.' } : {}, body: (reason, values) => ({ role: values['role'], status: values['status'], reason }) }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Change access</Button>} />;
  }
  return <LiveMutation spec={{ title: 'Grant staff access', confirmLabel: 'Grant access', endpoint: '/staff', reason: true, reasonMinLength: 8, initial: { email: '', role: 'AUDITOR' }, fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Existing account email" type="email" value={values['email']} onChange={(event) => set('email', event.target.value)} error={errors['email']} /><Select label="Role" value={values['role']} onValueChange={(value) => set('role', value ?? 'AUDITOR')} options={roles.map((value) => ({ value, label: value.replaceAll('_', ' ') }))} /></div>, validate: (values) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values['email'] ?? '') ? {} : { email: 'Enter a valid existing account email.' }, body: (reason, values) => ({ email: values['email']?.trim().toLowerCase(), role: values['role'], status: 'ACTIVE', reason }) }} onDone={reload} trigger={<Button size="sm" variant="primary">Grant access</Button>} />;
}
