import { Button } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;

export function LiveJobAction({ row, reload }: { row: Row; reload: () => void }) {
  const { can } = useSession();
  const status = String(row['status'] ?? '').toUpperCase();
  const type = String(row['job_type'] ?? '');
  const id = String(row['id'] ?? '');
  if (!can('services:manage') || !id || !['FAILED', 'DEAD_LETTER', 'NEEDS_MANUAL_REVIEW'].includes(status) || !['PROVISIONING', 'OUTBOX', 'EMAIL', 'WEBHOOK'].includes(type)) return null;
  return <LiveMutation spec={{ title: 'Retry durable job', confirmLabel: 'Retry job', endpoint: `/jobs/${type}/${encodeURIComponent(id)}/retry`, reason: true, reasonMinLength: 5, tone: 'danger' }} onDone={reload} trigger={<Button size="sm" variant="secondary">Retry</Button>} />;
}

export function LiveNodeAction({ row, reload }: { row: Row; reload: () => void }) {
  const { can } = useSession();
  const id = String(row['id'] ?? '');
  const enabled = Boolean(row['maintenance_mode']);
  if (!can('services:manage') || !id) return null;
  return <LiveMutation spec={{ title: enabled ? 'Disable node maintenance' : 'Enable node maintenance', confirmLabel: enabled ? 'Return node to service' : 'Enable maintenance', endpoint: `/infrastructure/nodes/${encodeURIComponent(id)}/maintenance`, method: 'PATCH', reason: true, reasonMinLength: 5, tone: enabled ? 'default' : 'danger', body: (reason) => ({ enabled: !enabled, reason }) }} onDone={reload} trigger={<Button size="sm" variant={enabled ? 'primary' : 'danger-subtle'}>{enabled ? 'End maintenance' : 'Maintenance'}</Button>} />;
}

export function LiveReconcileAction({ reload }: { reload: () => void }) {
  const { can } = useSession();
  if (!can('services:manage')) return null;
  return <LiveMutation spec={{ title: 'Reconcile provider inventory', confirmLabel: 'Run reconciliation', endpoint: '/infrastructure/reconcile', reason: true, reasonMinLength: 5, tone: 'danger' }} onDone={reload} trigger={<Button size="sm" variant="secondary">Reconcile provider</Button>} />;
}
