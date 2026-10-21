import { Button } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation } from './LiveMutation';

type Row = Record<string, unknown>;
const terminal = new Set(['TERMINATED', 'CANCELLED']);

export function LiveServiceActions({ payload, reload }: { payload: Row; reload: () => void }) {
  const { can } = useSession();
  const service = payload['service'];
  if (!service || typeof service !== 'object' || Array.isArray(service) || !can('services:manage')) return null;
  const row = service as Row;
  const id = String(row['id'] ?? '');
  const lifecycle = String(row['contract_status'] ?? 'UNKNOWN').toUpperCase();
  if (!id) return null;
  const action = (name: 'START' | 'STOP' | 'RESTART') => <LiveMutation key={name} spec={{ title: `${name[0]}${name.slice(1).toLowerCase()} service`, confirmLabel: name[0] + name.slice(1).toLowerCase(), endpoint: `/services/${encodeURIComponent(id)}/power`, reason: true, body: (reason) => ({ action: name, reason }) }} onDone={reload} trigger={<Button size="sm" variant="secondary">{name[0] + name.slice(1).toLowerCase()}</Button>} />;
  return <div className="flex flex-wrap gap-2">
    {!terminal.has(lifecycle) && lifecycle !== 'SUSPENDED' ? <>{action('START')}{action('STOP')}{action('RESTART')}</> : null}
    {lifecycle === 'ACTIVE' ? <LiveMutation spec={{ title: 'Suspend service', confirmLabel: 'Suspend', endpoint: `/services/${encodeURIComponent(id)}/suspend`, reason: true, tone: 'danger' }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Suspend</Button>} /> : null}
    {lifecycle === 'SUSPENDED' ? <LiveMutation spec={{ title: 'Unsuspend service', confirmLabel: 'Unsuspend', endpoint: `/services/${encodeURIComponent(id)}/unsuspend` }} onDone={reload} trigger={<Button size="sm" variant="primary">Unsuspend</Button>} /> : null}
    {!terminal.has(lifecycle) ? <LiveMutation spec={{ title: 'Terminate service', confirmLabel: 'Terminate', endpoint: `/services/${encodeURIComponent(id)}/terminate`, reason: true, tone: 'danger' }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Terminate</Button>} /> : null}
    <LiveMutation spec={{ title: 'Synchronize provider state', confirmLabel: 'Synchronize', endpoint: `/services/${encodeURIComponent(id)}/sync` }} onDone={reload} trigger={<Button size="sm" variant="secondary">Sync state</Button>} />
  </div>;
}
