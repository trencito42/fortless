import { useState } from 'react';
import { Button, Card, CardHeader, CopyField, Dialog, DialogClose, EmptyState, LoadingButton, Notice, SecretField, TextField, ActionMenu } from '@/design-system';
import { useOp, type OpResult } from './ops';

export interface ManagedDb { id: string; name: string; username: string; host: string; connectionsFrom: string; password: string | null }
export interface DatabasePermissions { create: boolean; rotate: boolean; delete: boolean; viewPassword: boolean }

export interface DatabaseManagerProps {
  databases: ManagedDb[];
  limit?: number | null;
  permissions: DatabasePermissions;
  onCreate: (o: { name: string; remote?: string }) => Promise<OpResult>;
  /** Returns the new password, shown once and then dropped. */
  onRotate: (d: ManagedDb) => Promise<string | null>;
  onDelete: (d: ManagedDb) => Promise<OpResult>;
}

const NAME = /^[A-Za-z0-9_]{1,48}$/;
const REMOTE = /^[0-9A-Za-z%._-]{1,191}$/;

/** MySQL databases of one server. Passwords appear only when the viewer may see them, masked until revealed; a rotated password is shown once. */
export function DatabaseManager({ databases, limit, permissions, onCreate, onRotate, onDelete }: DatabaseManagerProps) {
  const op = useOp();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState(''); const [remote, setRemote] = useState('%'); const [err, setErr] = useState<{ name?: string; remote?: string }>({});
  const [del, setDel] = useState<ManagedDb | null>(null);
  const [fresh, setFresh] = useState<{ id: string; name: string; password: string } | null>(null);
  const full = limit != null && databases.length >= limit;
  const submit = async () => {
    const e: typeof err = {};
    if (!NAME.test(name)) e.name = 'Use letters, numbers and underscores, up to 48 characters.';
    if (remote && !REMOTE.test(remote)) e.remote = 'Enter a host, an IP, or % for any.';
    setErr(e); if (e.name || e.remote) return;
    if (await op.run('create', () => onCreate({ name, remote: remote || undefined }), `${name} created.`)) { setCreate(false); setName(''); setRemote('%'); }
  };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Databases" description={limit != null ? `${databases.length} of ${limit} used` : `${databases.length} created`}
        actions={permissions.create ? <Button variant="primary" leadingIcon="add-01" disabled={full || op.busy !== null} onClick={() => { setErr({}); setCreate(true); }}>New database</Button> : undefined} />
      {full ? <Notice tone="warn">Database limit reached. Delete one to create another.</Notice> : null}
      {op.feedback}
      {fresh ? <Notice tone="good" title={`New password for ${fresh.name}`} action={<Button size="sm" variant="secondary" onClick={() => setFresh(null)}>Dismiss</Button>}><div className="mt-2 w-full"><CopyField label="Password" value={fresh.password} description="Shown once. Update anything that connects to this database." /></div></Notice> : null}
      {databases.length === 0 ? <EmptyState icon="database" title="No databases" description={permissions.create ? 'Create one for plugins or your own app.' : 'No databases exist for this server.'} /> : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">{databases.map((d) => (
          <li key={d.id} className="grid gap-3 rounded-md bg-s2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-bold">{d.name}</p><p className="text-[13px] text-ink3">Connections from {d.connectionsFrom}</p></div>
              {permissions.rotate || permissions.delete ? <ActionMenu label={`Actions for ${d.name}`} entries={[
                ...(permissions.rotate ? [{ id: 'r', label: 'Rotate password', onSelect: () => void op.run('rotate', async () => { const p = await onRotate(d); setFresh(p ? { id: d.id, name: d.name, password: p } : null); if (!p) return 'pending'; }, `Password rotated for ${d.name}.`) }] : []),
                ...(permissions.delete ? [{ id: 'd', label: 'Delete', tone: 'danger' as const, onSelect: () => setDel(d) }] : []),
              ]} /> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <CopyField label="Host" value={d.host} />
              <CopyField label="Username" value={d.username} />
              {permissions.viewPassword
                ? <div className="md:col-span-2">{d.password != null ? <SecretField label="Password" value={d.password} /> : <p className="text-[13.5px] text-ink3">The panel did not return a password for this database. Rotate it to set a new one.</p>}</div>
                : <p className="text-[13.5px] text-ink3 md:col-span-2">Your access level cannot view database passwords.</p>}
            </div>
          </li>))}</ul>
      )}
      <Dialog open={create} onOpenChange={setCreate} title="New database" description="The panel adds your server prefix to the name."
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="primary" onClick={submit}>Create database</LoadingButton></>}>
        <div className="grid gap-4">
          <TextField label="Database name" value={name} error={err.name} maxLength={48} onChange={(e) => setName(e.target.value)} />
          <TextField label="Connections from" description="% allows any host. Use an IP to restrict access." value={remote} error={err.remote} onChange={(e) => setRemote(e.target.value)} />
        </div>
      </Dialog>
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={del ? `Delete ${del.name}?` : 'Delete'} description="All tables and data in this database are removed. This cannot be undone."
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant="danger" onClick={async () => { const d = del; if (!d) return; if (await op.run('delete', () => onDelete(d), `${d.name} deleted.`)) setDel(null); }}>Delete database</LoadingButton></>}><span /></Dialog>
    </Card>
  );
}
