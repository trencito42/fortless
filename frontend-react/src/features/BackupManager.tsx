import { useState } from 'react';
import { ActionMenu, Button, Card, CardHeader, Dialog, DialogClose, EmptyState, LoadingButton, Notice, StatusBadge, Switch, TextField, Textarea } from '@/design-system';
import { useOp, type OpResult } from './ops';

export interface BackupItem { id: string; name: string; size?: string; created: string; locked: boolean; state: 'ready' | 'creating' | 'failed' }
export interface BackupPermissions { create: boolean; restore: boolean; delete: boolean; download: boolean }

export interface BackupManagerProps {
  backups: BackupItem[];
  /** Panel-enforced cap. Null/undefined when the provider does not report one. */
  limit?: number | null;
  permissions: BackupPermissions;
  onCreate: (o: { name?: string; ignored?: string; locked: boolean }) => Promise<OpResult>;
  /** `truncate` deletes every current file first. */
  onRestore: (b: BackupItem, o: { truncate: boolean }) => Promise<OpResult>;
  onDelete: (b: BackupItem) => Promise<OpResult>;
  onToggleLock: (b: BackupItem) => Promise<OpResult>;
  /** Opens the signed download URL. */
  onDownload: (b: BackupItem) => Promise<void>;
}

/** Backups with the options the panel really has: name, ignored files, lock, restore with or without wiping current files. */
export function BackupManager({ backups, limit, permissions, onCreate, onRestore, onDelete, onToggleLock, onDownload }: BackupManagerProps) {
  const op = useOp();
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'restore' | 'delete'; b: BackupItem } | null>(null);
  const [name, setName] = useState(''); const [ignored, setIgnored] = useState(''); const [lock, setLock] = useState(false); const [truncate, setTruncate] = useState(false);
  const full = limit != null && backups.length >= limit;
  const close = () => setDialog(null);
  const cancel = <DialogClose render={<Button variant="secondary">Cancel</Button>} />;
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Backups" description={limit != null ? `${backups.length} of ${limit} used` : `${backups.length} stored`}
        actions={permissions.create ? <Button variant="primary" leadingIcon="add-01" disabled={full || op.busy !== null} onClick={() => { setName(''); setIgnored(''); setLock(false); setDialog({ kind: 'create' }); }}>Create backup</Button> : undefined} />
      {full ? <Notice tone="warn">Backup limit reached. Delete an unlocked backup to create a new one.</Notice> : null}
      {op.feedback}
      {backups.length === 0 ? <EmptyState icon="archive-01" title="No backups yet" description={permissions.create ? 'Create one before risky changes.' : 'No backups have been created for this server.'} /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{backups.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3">
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{b.name}{b.locked ? <StatusBadge tone="neutral" dot={false} className="ml-2">Locked</StatusBadge> : null}</p><p className="text-[13px] text-ink3">{b.created}{b.size ? ` · ${b.size}` : ''}</p></div>
            <StatusBadge tone={b.state === 'ready' ? 'good' : b.state === 'creating' ? 'warn' : 'bad'} live={b.state === 'creating'}>{b.state === 'ready' ? 'Ready' : b.state === 'creating' ? 'Creating' : 'Failed'}</StatusBadge>
            {permissions.restore ? <Button size="sm" variant="secondary" disabled={b.state !== 'ready' || op.busy !== null} onClick={() => { setTruncate(false); setDialog({ kind: 'restore', b }); }}>Restore</Button> : null}
            <ActionMenu label={`Actions for ${b.name}`} entries={[
              ...(permissions.download ? [{ id: 'dl', label: 'Download', disabled: b.state !== 'ready', onSelect: () => void op.run('dl', () => onDownload(b).then(() => undefined)) }] : []),
              ...(permissions.delete ? [{ id: 'l', label: b.locked ? 'Unlock' : 'Lock', onSelect: () => void op.run('lock', () => onToggleLock(b), b.locked ? `${b.name} unlocked.` : `${b.name} locked.`) },
                { kind: 'separator' as const, id: 's' },
                { id: 'd', label: 'Delete', tone: 'danger' as const, disabled: b.locked, disabledReason: 'Unlock this backup first', onSelect: () => setDialog({ kind: 'delete', b }) }] : []),
              ...(!permissions.download && !permissions.delete ? [{ id: 'none', label: 'No actions available', disabled: true }] : []),
            ]} />
          </li>))}</ul>
      )}

      <Dialog open={dialog?.kind === 'create'} onOpenChange={(o) => !o && close()} title="Create backup" description="The panel archives the server files. Large servers take a few minutes."
        footer={<>{cancel}<LoadingButton variant="primary" onClick={async () => { const ok = await op.run('create', () => onCreate({ name: name.trim() || undefined, ignored: ignored.trim() || undefined, locked: lock }), 'Backup requested.'); if (ok) close(); }}>Create backup</LoadingButton></>}>
        <div className="grid gap-4">
          <TextField label="Name" description="Optional. The panel names it by date when empty." value={name} maxLength={191} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Ignored files" description="Optional. One path or pattern per line, like a .gitignore." value={ignored} maxLength={4096} onChange={(e) => setIgnored(e.target.value)} />
          <Switch label="Lock this backup" description="Locked backups cannot be deleted until unlocked." checked={lock} onCheckedChange={setLock} />
        </div>
      </Dialog>
      <Dialog open={dialog?.kind === 'restore'} onOpenChange={(o) => !o && close()} title={dialog?.kind === 'restore' ? `Restore ${dialog.b.name}?` : 'Restore'} description="The server must be offline. Files from the backup replace the current ones."
        footer={<>{cancel}<LoadingButton variant="primary" onClick={async () => { if (dialog?.kind !== 'restore') return; const b = dialog.b; const ok = await op.run('restore', () => onRestore(b, { truncate }), 'Restore started.'); if (ok) close(); }}>Restore backup</LoadingButton></>}>
        <Switch label="Delete current files first" description="Wipes the server files before restoring. Leave off to restore over the existing files." checked={truncate} onCheckedChange={setTruncate} />
        {truncate ? <Notice tone="warn" className="mt-3">Everything on the server that is not in this backup will be lost.</Notice> : null}
      </Dialog>
      <Dialog open={dialog?.kind === 'delete'} onOpenChange={(o) => !o && close()} title={dialog?.kind === 'delete' ? `Delete ${dialog.b.name}?` : 'Delete'} description="This permanently removes the backup. It cannot be recovered."
        footer={<>{cancel}<LoadingButton variant="danger" onClick={async () => { if (dialog?.kind !== 'delete') return; const b = dialog.b; const ok = await op.run('delete', () => onDelete(b), `${b.name} deleted.`); if (ok) close(); }}>Delete backup</LoadingButton></>}><span /></Dialog>
    </Card>
  );
}
