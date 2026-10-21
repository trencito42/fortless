import { useState } from 'react';
import { Button, CheckboxGroup, EmptyState, Notice, Select, Switch, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, incidentStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { iso, relative } from '../../lib/format';
import type { Incident, IncidentStatus } from '../../types';

/** Public text must not leak internal identifiers or addresses. */
export const publicLeak = (t: string) => (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(t) ? 'IP address' : /\b(node-[a-z]{3}-\d+|svc_\d+|job_\d+|acc_\d+|ord_\d+|inv_\d+)\b/.test(t) ? 'internal identifier' : /(password|token|secret|api[_ -]?key)/i.test(t) ? 'credential wording' : null);

export default function IncidentEditor({ id = 'new' }: { id?: string }) {
  const { data, add, patch, audit, newId } = useAdmin();
  const nav = useNav();
  const { can, staffName } = useSession();
  const act = useActionDialog();
  const isNew = id === 'new';
  const existing = data.incidents.find((x) => x.id === id);
  const [f, setF] = useState({ title: existing?.title ?? '', severity: existing?.severity ?? 'minor', components: existing?.componentIds ?? [], status: (existing?.status ?? 'investigating') as IncidentStatus, message: '', note: '', published: existing?.published ?? true });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  if (!isNew && !existing) return <AdminPage title="Incident not found"><EmptyState title="No such incident" action={<Button onClick={() => nav('/monitoring/incidents')}>Back</Button>} /></AdminPage>;
  const m = can('services:manage');
  const validate = () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e['title'] = 'Title must be at least 5 characters.';
    if (!f.components.length) e['components'] = 'Choose at least one affected component.';
    if (f.message.trim().length < 10) e['message'] = 'Write a public message of at least 10 characters.';
    const leak = f.published ? publicLeak(f.message + ' ' + f.title) : null;
    if (leak) e['message'] = `The public text contains an ${leak}. Public messages must not expose internal details.`;
    setErr(e); return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    act.run({ title: isNew ? 'Declare incident' : f.status === 'resolved' ? 'Resolve incident' : 'Post incident update', confirmLabel: isNew ? 'Declare' : f.status === 'resolved' ? 'Resolve' : 'Post update', permission: 'services:manage', stepUp: true, reasonRequired: false,
      description: f.published ? 'This message appears on the public status page immediately.' : 'This incident stays internal.', effects: ['Append a timestamped update with the public message', 'Does not change component health: set it separately', f.published ? 'Notify status-page subscribers (not implemented in backend yet)' : 'No public notification'],
      onConfirm: () => {
        const upd = { id: newId('iu'), at: iso(0), status: f.status, message: f.message.trim(), author: staffName };
        const notes = f.note.trim() ? [{ id: newId('in'), author: staffName, at: iso(0), note: 1, body: f.note.trim() }] : [];
        if (isNew) { const inc: Incident = { id: newId('inc'), title: f.title.trim(), severity: f.severity, status: f.status, componentIds: f.components, startedAt: iso(0), resolvedAt: f.status === 'resolved' ? iso(0) : null, updates: [upd], internalNotes: notes.map(({ id: i, author, at, body }) => ({ id: i, author, at, body })), published: f.published }; add('incidents', inc); audit('incident.declared', { type: 'incident', id: inc.id, label: inc.title }, { after: { severity: f.severity, public: String(f.published) } }); nav(`/monitoring/incidents/${inc.id}`); }
        else { patch('incidents', id, (c) => ({ title: f.title.trim(), severity: f.severity, status: f.status, componentIds: f.components, published: f.published, resolvedAt: f.status === 'resolved' ? iso(0) : null, updates: [upd, ...c.updates], internalNotes: [...notes.map(({ id: i, author, at, body }) => ({ id: i, author, at, body })), ...c.internalNotes] })); audit(f.status === 'resolved' ? 'incident.resolved' : 'incident.updated', { type: 'incident', id, label: f.title }); nav(`/monitoring/incidents/${id}`); }
        return isNew ? 'Incident declared' : f.status === 'resolved' ? 'Incident resolved' : 'Update posted';
      } });
  };
  return (
    <AdminPage detail title={isNew ? 'Declare incident' : `Update: ${existing!.title}`} crumbLabel={isNew ? 'Declare' : 'Update'} parents={[{ label: 'Incidents', to: '/monitoring/incidents' }, ...(existing ? [{ label: existing.id, to: `/monitoring/incidents/${existing.id}` }] : [])]}
      actions={<><Button variant="ghost" onClick={() => nav(existing ? `/monitoring/incidents/${existing.id}` : '/monitoring/incidents')}>Cancel</Button><Button variant="primary" disabled={!m} onClick={submit}>{isNew ? 'Declare…' : f.status === 'resolved' ? 'Resolve…' : 'Post update…'}</Button></>}>
      {!m ? <Notice tone="warn" title="Read-only">Declaring incidents requires <code className="font-mono font-bold">services:manage</code> and step-up.</Notice> : null}
      {Object.keys(err).length ? <Notice tone="bad" title="Cannot publish yet">{Object.values(err).join(' ')}</Notice> : null}
      <Split main={<>
        <Section title="Incident">
          <div className="grid gap-4">
            <TextField label="Title" required value={f.title} onChange={(e) => set('title', e.target.value)} error={err['title']} maxLength={100} description="Short and factual. Customers read this first." disabled={!m} />
            <div className="grid gap-4 sm:grid-cols-2"><Select label="Severity" value={f.severity} onValueChange={(v) => set('severity', (v ?? 'minor') as Incident['severity'])} options={[{ value: 'minor', label: 'Minor: degraded for some' }, { value: 'major', label: 'Major: partial outage' }, { value: 'critical', label: 'Critical: wide outage' }]} disabled={!m} /><Select label="Incident status" value={f.status} onValueChange={(v) => set('status', (v ?? 'investigating') as IncidentStatus)} options={Object.keys(incidentStatus).map((s) => ({ value: s, label: incidentStatus[s]!.label }))} disabled={!m} /></div>
            <CheckboxGroup legend="Affected components" value={f.components} onValueChange={(v) => set('components', v)} error={err['components']} options={data.components.map((c) => ({ value: c.id, label: c.name, description: c.group }))} disabled={!m} />
          </div>
        </Section>
        <Section title="Message" description="The public message becomes a timestamped update.">
          <div className="grid gap-4"><Textarea label="Public message" required value={f.message} onChange={(e) => set('message', e.target.value)} error={err['message']} rows={4} maxLength={500} counter disabled={!m} description="No IP addresses, node or customer ids, no credentials." /><Switch label="Show on the public status page" checked={f.published} onCheckedChange={(v) => set('published', v)} disabled={!m} /><Textarea label="Internal note (optional)" value={f.note} onChange={(e) => set('note', e.target.value)} rows={3} maxLength={500} counter disabled={!m} description="Staff only. Safe place for node names and ETAs." /></div>
        </Section>
      </>} aside={<>
        <Section title="Preview of the public update"><div className="rounded-lg bg-s2 p-3.5"><p className="font-extrabold">{f.title || 'Title'}</p><p className="mt-1 flex items-center gap-2"><Status map={incidentStatus} value={f.status} /></p><p className="mt-2 whitespace-pre-wrap text-[14px]">{f.message || 'Your message appears here.'}</p><p className="mt-2 text-[12.5px] font-semibold text-ink3">{f.components.map((c) => data.components.find((x) => x.id === c)?.name).join(', ') || 'No components'}</p></div></Section>
        {existing ? <Section title="Earlier updates"><ul className="grid gap-2">{existing.updates.map((u) => <li key={u.id} className="rounded-md bg-s2 p-3 text-[13.5px]"><span className="flex items-center gap-2"><Status map={incidentStatus} value={u.status} /><span className="text-ink3">{relative(u.at)}</span></span><span className="mt-1 block">{u.message}</span></li>)}</ul></Section> : null}
      </>} />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
