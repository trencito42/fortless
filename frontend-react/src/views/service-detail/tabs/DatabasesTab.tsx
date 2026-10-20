import { DatabaseManager } from '@/features';
import { useService } from '../context';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { pend } from './shared';

export function DatabasesTab() {
  const { id, ports, can } = useService();
  const res = useResource((s) => ports.databases.list(id, s), [id, ports]);
  return (
    <ResourceView res={res} reload={res.reload} label="Loading databases">
      {(d) => (
        <DatabaseManager databases={d.databases} permissions={{ create: can('database.create'), rotate: can('database.update'), delete: can('database.delete'), viewPassword: can('database.view_password') }}
          onCreate={async (o) => { const r = await ports.databases.create(id, o); res.refresh(); return pend(r); }}
          onRotate={async (db) => { const r = await ports.databases.rotate(id, db.id); res.refresh(); return r.password; }}
          onDelete={async (db) => { const r = await ports.databases.remove(id, db.id); res.refresh(); return pend(r); }} />
      )}
    </ResourceView>
  );
}
