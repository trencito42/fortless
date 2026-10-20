import { useState } from 'react';
import { Button, Card, CardHeader, CopyField, DataTable, LoadingButton, Notice, TextField, type ColumnDef } from '@/design-system';
import { AlertDialog } from '@/design-system';
import { useOp } from '@/features';
import type { PanelActivityDto, SettingsDto } from '../contracts';
import { useService } from '../context';
import { isoDate } from '../mappers';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';
import { AdministrationForm } from './AdministrationForm';

function Details({ s, onSaved }: { s: SettingsDto; onSaved: () => void }) {
  const { id, ports, can, refresh } = useService();
  const op = useOp();
  const [name, setName] = useState(s.name); const [description, setDescription] = useState(s.description); const [err, setErr] = useState<string>();
  const dirty = name !== s.name || description !== s.description;
  const canRename = can('settings.rename');
  const save = async () => {
    if (name.trim().length < 1) { setErr('Enter a name.'); return; }
    setErr(undefined);
    await op.run('rename', async () => { const r = await ports.settings.rename(id, name.trim(), description.trim()); onSaved(); refresh(); return r.pending ? 'pending' : undefined; }, 'Saved.');
  };
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Server details" description="How this server is named in the panel." actions={<LoadingButton variant="primary" size="sm" disabled={!dirty || !canRename} onClick={save}>Save changes</LoadingButton>} />
      {op.feedback}
      {!canRename ? <Notice tone="info">Your access level cannot rename this server.</Notice> : null}
      <TextField label="Name" value={name} maxLength={191} readOnly={!canRename} error={err} onChange={(e) => setName(e.target.value)} />
      <TextField label="Description" value={description} maxLength={191} readOnly={!canRename} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid gap-4 md:grid-cols-2"><CopyField label="Server UUID" value={s.uuid} /><CopyField label="Panel node" value={s.node} /></div>
    </Card>
  );
}

function PanelActivity() {
  const { id, ports } = useService();
  const [page, setPage] = useState(1);
  const res = useResource((sg) => ports.settings.panelActivity(id, page, sg), [id, ports, page]);
  const cols: ColumnDef<PanelActivityDto['events'][number], unknown>[] = [
    { accessorKey: 'timestamp', header: 'When', meta: { primary: true }, cell: (c) => isoDate(c.row.original.timestamp) },
    { accessorKey: 'event', header: 'Event', cell: (c) => <code className="font-mono text-[13px]">{c.row.original.event}</code> },
    { id: 'who', header: 'Who', cell: (c) => c.row.original.actor ?? (c.row.original.api ? 'API key' : '—') },
  ];
  return (
    <Card pad="lg" className="grid gap-3">
      <CardHeader title="Panel activity" description="Events recorded by the game panel itself: SFTP, panel UI and API." />
      <DataTable data={res.status === 'ready' ? res.data.events : []} columns={cols} getRowId={(e) => `${e.timestamp}-${e.event}`} caption="Panel activity" loading={res.status === 'loading'} error={res.status === 'error' ? res.error : undefined} onRetry={res.reload} empty={{ title: 'No panel activity yet' }} pageSize={10} />
      {res.status === 'ready' && res.data.pages > 1 ? <div className="flex justify-between"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span role="status" className="text-[13px] text-ink3">Page {res.data.page} of {res.data.pages}</span><Button size="sm" variant="secondary" disabled={page >= res.data.pages} onClick={() => setPage(page + 1)}>Next</Button></div> : null}
    </Card>
  );
}

export function SettingsTab() {
  const { id, ports, can, detail, summary, refresh } = useService();
  const res = useResource((s) => ports.settings.get(id, s), [id, ports]);
  const showAdmin = (detail.providerCapabilities?.game ?? detail.providerType === 'PTERODACTYL') && can('player.read');
  return (
    <ResourceView res={res} reload={res.reload} label="Loading settings">
      {(s) => (
        <div className="grid gap-4">
          <Details s={s} onSaved={res.refresh} />
          <Card pad="lg" className="grid gap-4">
            <CardHeader title="SFTP" description="Connect with any SFTP client." />
            <div className="grid gap-4 md:grid-cols-3">
              <CopyField label="Host" value={s.sftp.host} emptyText="Not assigned" />
              <CopyField label="Port" value={s.sftp.port ? String(s.sftp.port) : ''} emptyText="Not assigned" />
              <CopyField label="Username" value={s.sftp.username ?? ''} emptyText="Pending panel account" />
            </div>
            <p className="text-[13.5px] text-ink3">Sign in with your panel account password. Fortless never sees or shows it.</p>
          </Card>
          {showAdmin ? <AdministrationForm /> : null}
          <PanelActivity />
          {can('settings.reinstall') ? (
            <Card pad="lg" className="grid gap-3">
              <CardHeader title="Reinstall" description="Runs the install script again. Files may be overwritten." />
              <div><AlertDialog trigger={<Button variant="danger-subtle" leadingIcon="refresh">Reinstall server</Button>} title={`Reinstall ${summary.name}?`} tone="danger" confirmLabel="Reinstall" requireText="reinstall"
                description="The server is stopped and the install script runs again. Existing files may be overwritten. Type reinstall to confirm."
                onConfirm={async () => { await ports.settings.reinstall(id); refresh(); }} /></div>
            </Card>
          ) : null}
        </div>
      )}
    </ResourceView>
  );
}
