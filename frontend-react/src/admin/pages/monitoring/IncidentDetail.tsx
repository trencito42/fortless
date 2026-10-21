import { Badge, Button, EmptyState, Timeline, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section, Split } from '../../components/Cards';
import { Status, componentHealth, incidentStatus, severity } from '../../components/status';
import { NotesPanel } from '../../components/NotesPanel';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { dateTime, relative } from '../../lib/format';

export default function IncidentDetail({ id }: { id: string }) {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const { can, staffName } = useSession();
  const i = data.incidents.find((x) => x.id === id);
  if (!i) return <AdminPage title="Incident not found"><EmptyState title="No such incident" action={<Button onClick={() => nav('/monitoring/incidents')}>Back to incidents</Button>} /></AdminPage>;
  const comps = i.componentIds.map((cid) => data.components.find((c) => c.id === cid)).filter(Boolean);
  const events: TimelineEvent[] = i.updates.map((u) => ({ id: u.id, title: <span className="inline-flex flex-wrap items-center gap-2"><Status map={incidentStatus} value={u.status} /></span>, description: <>{u.message}<span className="block text-[12.5px] font-semibold text-ink3">{u.author}</span></>, time: relative(u.at), iso: u.at, icon: u.status === 'resolved' ? 'checkmark-circle-02' : 'alert-01', tone: u.status === 'resolved' ? 'good' : u.status === 'monitoring' ? 'accent' : 'warn' }));
  const m = can('services:manage');
  return (
    <AdminPage detail title={i.title} crumbLabel={i.id} parents={[{ label: 'Incidents', to: '/monitoring/incidents' }]} status={<><Status map={incidentStatus} value={i.status} /><Status map={severity} value={i.severity} />{i.published ? <Badge tone="good">Public</Badge> : <Badge tone="warn">Not public</Badge>}</>} description={`Started ${dateTime(i.startedAt)}${i.resolvedAt ? ` · resolved ${dateTime(i.resolvedAt)}` : ''}`}
      actions={<Button variant="primary" leadingIcon="edit-02" disabled={!m} onClick={() => nav(`/monitoring/incidents/${i.id}/edit`)}>{i.status === 'resolved' ? 'Edit' : 'Post update…'}</Button>}>
      <Split main={<>
        <Section title="Public timeline" description={i.published ? 'Visible on the public status page.' : 'This incident is internal only.'}><Timeline events={events} label="Incident updates" /></Section>
        <Section title="Internal notes" description="Never shown publicly."><NotesPanel notes={i.internalNotes} permission="services:manage" label="Internal note" onAdd={(body) => { patch('incidents', i.id, (c) => ({ internalNotes: [{ id: `in_${Date.now()}`, author: staffName, at: new Date().toISOString(), body }, ...c.internalNotes] })); audit('incident.note_added', { type: 'incident', id: i.id, label: i.title }); }} /></Section>
      </>} aside={<Columns>
        <Section title="Affected components" description="Current health, which is set independently."><ul className="grid gap-1.5">{comps.map((c) => <li key={c!.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span className="font-semibold">{c!.name}</span><Status map={componentHealth} value={c!.health} /></li>)}</ul><div className="mt-3"><Button size="sm" variant="secondary" onClick={() => nav('/monitoring/components')}>Set component health</Button></div></Section>
      </Columns>} />
      <PreviewNote />
    </AdminPage>
  );
}
