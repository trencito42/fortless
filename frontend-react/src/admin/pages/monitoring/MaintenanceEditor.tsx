import { useState } from 'react';
import { Button, CheckboxGroup, DateField, EmptyState, Notice, Select, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, maintenanceStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { ADMIN_NOW, dateTime } from '../../lib/format';
import type { MaintenanceWindow } from '../../types';
import { publicLeak } from './IncidentEditor';

const split = (iso: string) => ({ d: iso.slice(0, 10), t: iso.slice(11, 16) });
const join = (d: string, t: string) => `${d}T${t}:00.000Z`;

export default function MaintenanceEditor({ id }: { id: string }) {
  const { data, add, patch, audit, newId } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const act = useActionDialog();
  const isNew = id === 'new';
  const w = data.maintenance.find((x) => x.id === id);
  const start = split(w?.startsAt ?? new Date(ADMIN_NOW + 3 * 86_400_000).toISOString().replace(/:\d\d\.\d+Z$/, ':00.000Z'));
  const end = split(w?.endsAt ?? new Date(ADMIN_NOW + 3 * 86_400_000 + 2 * 3_600_000).toISOString());
  const [f, setF] = useState({ title: w?.title ?? '', comps: w?.componentIds ?? [], sd: start.d, st: start.t, ed: end.d, et: end.t, msg: w?.publicMessage ?? '', node: w?.nodeId ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  if (!isNew && !w) return <AdminPage title="Maintenance not found"><EmptyState title="No such window" action={<Button onClick={() => nav('/monitoring/maintenance')}>Back</Button>} /></AdminPage>;
  const locked = w?.status === 'completed' || w?.status === 'cancelled';
  const m = can('services:manage');
  const submit = () => {
    const e: Record<string, string> = {};
    const s = Date.parse(join(f.sd, f.st)), en = Date.parse(join(f.ed, f.et));
    if (f.title.trim().length < 5) e['title'] = 'Title must be at least 5 characters.';
    if (!f.comps.length) e['comps'] = 'Choose the components that will be affected.';
    if (!(en > s)) e['ed'] = 'End must be after start.'; else if (en - s < 10 * 60_000) e['ed'] = 'A window must last at least 10 minutes.';
    if (isNew && s < ADMIN_NOW) e['sd'] = 'Start must be in the future.';
    if (f.msg.trim().length < 10) e['msg'] = 'Write a public message of at least 10 characters.'; else if (publicLeak(f.msg)) e['msg'] = `Public text contains an ${publicLeak(f.msg)}.`;
    setErr(e); if (Object.keys(e).length) return;
    act.run({ title: isNew ? 'Schedule maintenance' : 'Save maintenance', confirmLabel: isNew ? 'Schedule' : 'Save', permission: 'services:manage', stepUp: true, reasonRequired: false, effects: ['Publish the window on the public status page', 'Mark affected components as under maintenance during the window', 'Does not put any node in maintenance: do that under Infrastructure'],
      onConfirm: () => { const rec: MaintenanceWindow = { id: w?.id ?? newId('mnt'), title: f.title.trim(), componentIds: f.comps, startsAt: join(f.sd, f.st), endsAt: join(f.ed, f.et), status: 'scheduled', publicMessage: f.msg.trim(), nodeId: f.node || null }; if (isNew) add('maintenance', rec); else patch('maintenance', rec.id, rec); audit(isNew ? 'maintenance.scheduled' : 'maintenance.updated', { type: 'maintenance', id: rec.id, label: rec.title }); nav('/monitoring/maintenance'); return isNew ? 'Maintenance scheduled' : 'Maintenance saved'; } });
  };
  const cancel = () => act.run({ title: 'Cancel maintenance', confirmLabel: 'Cancel window', tone: 'danger', permission: 'services:manage', stepUp: true, reasonRequired: true, onConfirm: ({ reason }) => { patch('maintenance', w!.id, { status: 'cancelled' }); audit('maintenance.cancelled', { type: 'maintenance', id: w!.id, label: w!.title }, { reason }); nav('/monitoring/maintenance'); return 'Maintenance cancelled'; } });
  return (
    <AdminPage detail title={isNew ? 'Schedule maintenance' : w!.title} crumbLabel={isNew ? 'Schedule' : w!.title} parents={[{ label: 'Scheduled maintenance', to: '/monitoring/maintenance' }]} status={w ? <Status map={maintenanceStatus} value={w.status} /> : undefined}
      actions={<><Button variant="ghost" onClick={() => nav('/monitoring/maintenance')}>Back</Button>{w && !locked ? <Button variant="danger-subtle" disabled={!m} onClick={cancel}>Cancel window…</Button> : null}<Button variant="primary" disabled={!m || locked} onClick={submit}>{isNew ? 'Schedule…' : 'Save…'}</Button></>}>
      {locked ? <Notice tone="info" title="This window is closed">Completed and cancelled windows cannot be edited.</Notice> : null}
      {Object.keys(err).length ? <Notice tone="bad" title="Fix these first">{Object.values(err).join(' ')}</Notice> : null}
      <Split main={<>
        <Section title="When and what">
          <div className="grid gap-4">
            <TextField label="Title" required value={f.title} onChange={(e) => set('title', e.target.value)} error={err['title']} maxLength={100} disabled={!m || locked} />
            <div className="grid gap-4 sm:grid-cols-2"><DateField label="Start date (UTC)" value={f.sd} onChange={(e) => set('sd', e.target.value)} error={err['sd']} disabled={!m || locked} /><TextField label="Start time (UTC)" type="time" value={f.st} onChange={(e) => set('st', e.target.value)} disabled={!m || locked} /><DateField label="End date (UTC)" value={f.ed} onChange={(e) => set('ed', e.target.value)} error={err['ed']} disabled={!m || locked} /><TextField label="End time (UTC)" type="time" value={f.et} onChange={(e) => set('et', e.target.value)} disabled={!m || locked} /></div>
            <Select label="Related node (optional)" value={f.node || 'none'} onValueChange={(v) => set('node', v === 'none' ? '' : (v ?? ''))} options={[{ value: 'none', label: 'None' }, ...data.nodes.map((n) => ({ value: n.id, label: n.name }))]} description="Links the window to a node for operators; it is not shown publicly." disabled={!m || locked} />
            <CheckboxGroup legend="Affected components" value={f.comps} onValueChange={(v) => set('comps', v)} error={err['comps']} options={data.components.map((c) => ({ value: c.id, label: c.name, description: c.group }))} disabled={!m || locked} />
          </div>
        </Section>
        <Section title="Public message"><Textarea label="Message" value={f.msg} onChange={(e) => set('msg', e.target.value)} error={err['msg']} rows={4} maxLength={400} counter disabled={!m || locked} description="Tell customers what to expect, not how it is done." /></Section>
      </>} aside={<Section title="Customer preview"><div className="rounded-lg bg-s2 p-3.5"><p className="font-extrabold">{f.title || 'Title'}</p><p className="text-[13px] font-semibold text-ink3">{dateTime(join(f.sd, f.st))} → {dateTime(join(f.ed, f.et))}</p><p className="mt-2 text-[14px]">{f.msg || 'Your message appears here.'}</p></div></Section>} />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
