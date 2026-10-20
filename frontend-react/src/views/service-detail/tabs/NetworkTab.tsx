import { NetworkAllocations } from '@/features';
import { useService } from '../context';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { pend } from './shared';

export function NetworkTab() {
  const { id, ports, can } = useService();
  const res = useResource((s) => ports.network.list(id, s), [id, ports]);
  const done = async <T extends { pending: boolean }>(p: Promise<T>) => { const r = await p; res.refresh(); return pend(r); };
  return (
    <ResourceView res={res} reload={res.reload} label="Loading network">
      {(n) => (
        <NetworkAllocations allocations={n.allocations} permissions={{ create: can('allocation.create'), update: can('allocation.update'), delete: can('allocation.delete') }}
          onAssign={() => done(ports.network.assign(id))} onSaveNotes={(a, notes) => done(ports.network.setNotes(id, a.id, notes))}
          onSetPrimary={(a) => done(ports.network.setPrimary(id, a.id))} onRemove={(a) => done(ports.network.remove(id, a.id))} />
      )}
    </ResourceView>
  );
}
