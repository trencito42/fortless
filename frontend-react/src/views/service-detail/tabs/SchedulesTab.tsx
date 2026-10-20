import { ScheduleManager } from '@/features';
import { useService } from '../context';
import { mapSchedules } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { pend } from './shared';

export function SchedulesTab() {
  const { id, ports, can } = useService();
  const res = useResource((s) => ports.schedules.list(id, s), [id, ports]);
  const done = async <T extends { pending: boolean }>(p: Promise<T>) => { const r = await p; res.refresh(); return pend(r); };
  return (
    <ResourceView res={res} reload={res.reload} label="Loading schedules">
      {(l) => (
        <ScheduleManager schedules={mapSchedules(l)} permissions={{ create: can('schedule.create'), update: can('schedule.update'), delete: can('schedule.delete') }}
          onSave={(sid, input) => done(ports.schedules.save(id, sid, input))}
          onDelete={(s) => done(ports.schedules.remove(id, s.id))}
          onRun={(s) => done(ports.schedules.execute(id, s.id))}
          onSaveTask={(s, tid, t) => done(tid === null ? ports.schedules.addTask(id, s.id, t) : ports.schedules.updateTask(id, s.id, tid, t))}
          onDeleteTask={(s, t) => done(ports.schedules.removeTask(id, s.id, t.id))} />
      )}
    </ResourceView>
  );
}
