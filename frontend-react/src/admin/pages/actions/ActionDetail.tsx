import { Badge, Button, DescriptionList, EmptyState, Timeline, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, actionStatus, priority } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { NotesPanel } from '../../components/NotesPanel';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime, relative, title } from '../../lib/format';
import { useActionOps } from './actionOps';

export default function ActionDetail({ id }: { id: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const ops = useActionOps();
  const a = data.actions.find((x) => x.id === id);
  if (!a) return <AdminPage title="Action not found"><EmptyState title="No such action item" description="It may have been removed from the demo data." action={<Button onClick={() => nav('/actions')}>Back to Action Center</Button>} /></AdminPage>;
  const events: TimelineEvent[] = [...a.history].reverse().map((h) => ({ id: h.id, title: h.text, description: h.actor, time: relative(h.at), iso: h.at, icon: h.actor === 'System' ? 'activity-01' : 'user', tone: h.text.startsWith('Resolved') ? 'good' : 'neutral' }));
  return (
    <AdminPage detail title={a.title} crumbLabel={a.id} parents={[{ label: 'Action Center', to: '/actions' }]} status={<><Status map={priority} value={a.priority} /><Status map={actionStatus} value={a.status} /><Badge>{title(a.category)}</Badge></>} description={a.detail}
      actions={<>
        <Button variant="primary" leadingIcon="link-01" onClick={() => nav(a.resource.to)}>Open resource</Button>
        {a.status === 'open' ? <Button variant="secondary" leadingIcon="tick-02" onClick={() => ops.acknowledge([a])}>Acknowledge</Button> : null}
        <Button variant="secondary" leadingIcon="user-add-01" onClick={() => ops.assign(a)}>Assign…</Button>
        {a.status === 'resolved' ? <Button variant="secondary" onClick={() => ops.reopen(a)}>Reopen</Button> : <Button variant="secondary" leadingIcon="checkmark-circle-02" onClick={() => ops.resolve([a])}>Resolve…</Button>}</>}>
      <Split main={<>
        <Section title="History" description="Everything that happened to this item, newest first."><Timeline events={events} label="Action history" /></Section>
        <Section title="Notes"><NotesPanel notes={a.notes} onAdd={(b) => ops.addNote(a, b)} permission="admin:access" label="Working note" /></Section>
      </>} aside={<>
        <Section title="Details"><DescriptionList items={[{ label: 'Raised', value: dateTime(a.createdAt) }, { label: 'Age', value: relative(a.createdAt) }, { label: 'Assignee', value: a.assignee ?? 'Unassigned' }, { label: 'Category', value: title(a.category) }, { label: 'Priority', value: title(a.priority) }]} /></Section>
        <Section title="Resource"><EntityLink to={a.resource.to}>{a.resource.label}</EntityLink><p className="text-[12.5px] text-ink3">{a.resource.type}</p></Section>
        <Section title="Related">{a.related.length ? <ul className="grid gap-1.5">{a.related.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><EntityLink to={r.to}>{r.label}</EntityLink><Badge>{r.type}</Badge></li>)}</ul> : <p className="text-ink3">No related records.</p>}</Section>
      </>} />
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
