import { BackupManager } from '@/features';
import { useService } from '../context';
import { mapBackups } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { pend } from './shared';

export function BackupsTab() {
  const { id, ports, can } = useService();
  const res = useResource((s) => ports.backups.list(id, s), [id, ports]);
  const done = async <T extends { pending: boolean }>(p: Promise<T>) => { const r = await p; res.refresh(); return pend(r); };
  return (
    <ResourceView res={res} reload={res.reload} label="Loading backups">
      {(l) => (
        <BackupManager backups={mapBackups(l)} limit={l.limit} permissions={{ create: can('backup.create'), restore: can('backup.restore'), delete: can('backup.delete'), download: can('backup.download') }}
          onCreate={(o) => done(ports.backups.create(id, { name: o.name, ignored: o.ignored, locked: o.locked || undefined }))}
          onRestore={(b, o) => done(ports.backups.restore(id, b.id, o.truncate))}
          onDelete={(b) => done(ports.backups.remove(id, b.id))}
          onToggleLock={(b) => done(ports.backups.lock(id, b.id))}
          onDownload={async (b) => { const url = await ports.backups.downloadUrl(id, b.id); window.open(url, '_blank', 'noopener,noreferrer'); }} />
      )}
    </ResourceView>
  );
}
