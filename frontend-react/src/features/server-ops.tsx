import { useState } from 'react';
import { ActionMenu, AlertDialog, Button, Card, CardHeader, DataTable, Dialog, DialogClose, EmptyState, LoadingButton, StatusBadge, TextField, Switch, NumberField, type ColumnDef } from '@/design-system';

export interface Backup { id: string; name: string; size?: string; created: string; locked: boolean; state: 'ready' | 'creating' | 'failed' }
export function BackupList({ backups, limit, onCreate, onRestore, onDelete, onToggleLock }: { backups: Backup[]; limit?: number; onCreate: () => Promise<void>; onRestore: (b: Backup) => Promise<void>; onDelete: (b: Backup) => Promise<void>; onToggleLock: (b: Backup) => Promise<void> }) {
  const full = limit != null && backups.length >= limit;
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Backups" description={limit != null ? `${backups.length} of ${limit} used` : undefined} actions={<LoadingButton variant="primary" leadingIcon="add-01" disabled={full} onClick={onCreate}>Create backup</LoadingButton>} />
      {full ? <p className="text-[13px] font-semibold text-ink3">Backup limit reached. Delete an unlocked backup to create a new one.</p> : null}
      {backups.length === 0 ? <EmptyState icon="archive-01" title="No backups yet" description="Create one before risky changes." /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{backups.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-md bg-s2 p-3">
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{b.name}{b.locked ? <StatusBadge tone="neutral" dot={false} className="ml-2">Locked</StatusBadge> : null}</p><p className="text-[13px] text-ink3">{b.created}{b.size ? ` · ${b.size}` : ''}</p></div>
            <StatusBadge tone={b.state === 'ready' ? 'good' : b.state === 'creating' ? 'warn' : 'bad'} live={b.state === 'creating'}>{b.state === 'ready' ? 'Ready' : b.state === 'creating' ? 'Creating' : 'Failed'}</StatusBadge>
            <AlertDialog trigger={<Button size="sm" variant="secondary" disabled={b.state !== 'ready'}>Restore</Button>} title={`Restore ${b.name}?`} description="Current files are replaced by this backup. Stop the server first." confirmLabel="Restore" tone="danger" onConfirm={() => onRestore(b)} />
            <ActionMenu label={`Actions for ${b.name}`} entries={[{ id: 'l', label: b.locked ? 'Unlock' : 'Lock', onSelect: () => void onToggleLock(b) }, { id: 'd', label: 'Delete', tone: 'danger', disabled: b.locked, disabledReason: 'Unlock before deleting', onSelect: () => void onDelete(b) }]} />
          </li>))}</ul>
      )}
    </Card>
  );
}

export interface Schedule { id: string; name: string; cron: string; active: boolean; nextRun?: string; lastRun?: string }
const CRON = /^(\S+\s+){4}\S+$/;
export function ScheduleEditor({ schedules, onSave, onDelete, onToggle }: { schedules: Schedule[]; onSave: (s: Omit<Schedule, 'id' | 'nextRun' | 'lastRun'> & { id?: string }) => Promise<void>; onDelete: (s: Schedule) => Promise<void>; onToggle: (s: Schedule) => Promise<void> }) {
  const [edit, setEdit] = useState<Schedule | 'new' | null>(null);
  const [f, setF] = useState({ name: '', cron: '0 4 * * *', active: true });
  const [e, setE] = useState<{ name?: string; cron?: string }>({});
  const open = (s: Schedule | 'new') => { setEdit(s); setE({}); setF(s === 'new' ? { name: '', cron: '0 4 * * *', active: true } : { name: s.name, cron: s.cron, active: s.active }); };
  const columns: ColumnDef<Schedule, unknown>[] = [
    { accessorKey: 'name', header: 'Name', meta: { primary: true } },
    { accessorKey: 'cron', header: 'Cron', cell: (c) => <code className="font-mono">{c.row.original.cron}</code> },
    { accessorKey: 'nextRun', header: 'Next run', cell: (c) => c.row.original.nextRun ?? '—' },
    { id: 'on', header: 'Status', enableSorting: false, cell: (c) => <StatusBadge tone={c.row.original.active ? 'good' : 'neutral'}>{c.row.original.active ? 'Active' : 'Paused'}</StatusBadge> },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => <ActionMenu label={`Actions for ${c.row.original.name}`} entries={[{ id: 'e', label: 'Edit', onSelect: () => open(c.row.original) }, { id: 't', label: c.row.original.active ? 'Pause' : 'Resume', onSelect: () => void onToggle(c.row.original) }, { id: 'd', label: 'Delete', tone: 'danger', onSelect: () => void onDelete(c.row.original) }]} /> },
  ];
  return (
    <div className="grid gap-3">
      <div className="flex justify-end"><Button variant="primary" leadingIcon="add-01" onClick={() => open('new')}>New schedule</Button></div>
      <DataTable data={schedules} columns={columns} getRowId={(s) => s.id} caption="Schedules" empty={{ title: 'No schedules', description: 'Run restarts, backups or commands on a timer.' }} />
      {edit ? (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)} title={edit === 'new' ? 'New schedule' : 'Edit schedule'} footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={async () => { const er = { name: f.name.trim() ? undefined : 'Enter a name.', cron: CRON.test(f.cron.trim()) ? undefined : 'Use 5 fields: minute hour day month weekday.' }; setE(er); if (er.name || er.cron) return; await onSave({ ...f, id: edit === 'new' ? undefined : edit.id }); setEdit(null); }}>Save schedule</LoadingButton></>}>
          <div className="grid gap-4"><TextField label="Name" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} error={e.name} /><TextField label="Cron expression" description="Example: 0 4 * * * runs daily at 04:00 (server time)." value={f.cron} onChange={(x) => setF({ ...f, cron: x.target.value })} error={e.cron} /><Switch label="Active" checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /></div>
        </Dialog>
      ) : null}
    </div>
  );
}

export interface Db { id: string; name: string; host: string; username: string }
export function DatabaseList({ databases, limit, onCreate, onRotatePassword, onDelete }: { databases: Db[]; limit?: number; onCreate: () => Promise<void>; onRotatePassword: (d: Db) => Promise<void>; onDelete: (d: Db) => Promise<void> }) {
  void NumberField;
  const columns: ColumnDef<Db, unknown>[] = [
    { accessorKey: 'name', header: 'Database', meta: { primary: true } },
    { accessorKey: 'host', header: 'Host', cell: (c) => <code className="font-mono text-[13px]">{c.row.original.host}</code> },
    { accessorKey: 'username', header: 'User' },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => <ActionMenu label={`Actions for ${c.row.original.name}`} entries={[{ id: 'r', label: 'Rotate password', onSelect: () => void onRotatePassword(c.row.original) }, { id: 'd', label: 'Delete', tone: 'danger', onSelect: () => void onDelete(c.row.original) }]} /> },
  ];
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3"><p className="text-ink3">{limit != null ? `${databases.length} of ${limit} used` : ''}</p><LoadingButton variant="primary" leadingIcon="add-01" disabled={limit != null && databases.length >= limit} onClick={onCreate}>New database</LoadingButton></div>
      <DataTable data={databases} columns={columns} getRowId={(d) => d.id} caption="Databases" empty={{ title: 'No databases', description: 'Create one for plugins or your app.' }} />
    </div>
  );
}
