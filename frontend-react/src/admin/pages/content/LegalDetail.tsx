import { useState } from 'react';
import { Badge, Button, DiffViewer, EmptyState, Notice, Select, Tabs, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col, nw } from '../../components/cols';
import { MarkdownArticle } from '../../../app/components/MarkdownArticle';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { iso, date } from '../../lib/format';
import type { LegalRevision } from '../../types';

const bump = (v: string, kind: string) => { const [maj = 1, min = 0] = v.split('.').map(Number); return kind === 'major' ? `${maj + 1}.0` : `${maj}.${min + 1}`; };

export default function LegalDetail({ id }: { id: string }) {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const { can, staffName } = useSession();
  const act = useActionDialog();
  const [tab, setTab] = useState('current');
  const [viewRev, setViewRev] = useState<LegalRevision | null>(null);
  const d = data.legalDocs.find((x) => x.id === id);
  const [draft, setDraft] = useState<string | null>(d?.draft ?? null);
  if (!d) return <AdminPage title="Document not found"><EmptyState title="No such document" action={<Button onClick={() => nav('/content/legal')}>Back to legal pages</Button>} /></AdminPage>;
  const m = can('content:manage');
  const current = d.revisions[0]!;
  const dirty = draft != null && draft !== (d.draft ?? current.body);
  const saveDraft = () => { patch('legalDocs', d.id, { draft: draft ?? current.body }); audit('content.legal_draft_saved', { type: 'legal_document', id: d.id, label: d.title }); };
  const publish = () => act.run({
    title: `Publish new version of ${d.title}`, description: 'A new version is shown to customers and kept in history. Existing acceptance records are unchanged.', confirmLabel: 'Publish version', permission: 'content:manage', stepUp: true, reasonRequired: true, reasonLabel: 'Change summary (shown in history)', initial: { kind: 'minor' },
    effects: ['Publish the draft as the current version', 'Keep the previous version in history', 'Customers may be asked to re-accept terms (not implemented in the backend yet)'],
    fields: ({ values, set }) => <Select label="Version bump" value={values['kind']} onValueChange={(v) => set('kind', v ?? 'minor')} options={[{ value: 'minor', label: `Minor → v${bump(d.currentVersion, 'minor')} (wording)` }, { value: 'major', label: `Major → v${bump(d.currentVersion, 'major')} (rights or obligations change)` }]} />,
    onConfirm: ({ values, reason }) => { const v = bump(d.currentVersion, values['kind']!); patch('legalDocs', d.id, (c) => ({ currentVersion: v, draft: null, revisions: [{ version: v, at: iso(0), author: staffName, summary: reason, body: draft ?? c.revisions[0]!.body }, ...c.revisions] })); audit('content.legal_published', { type: 'legal_document', id: d.id, label: d.title }, { reason, after: { version: v } }); setDraft(null); setTab('current'); return `Version ${v} published`; },
  });
  return (
    <AdminPage detail title={d.title} crumbLabel={d.title} parents={[{ label: 'Legal pages', to: '/content/legal' }]} status={<><Badge tone="good">Published v{d.currentVersion}</Badge>{d.draft ? <Badge tone="warn">Draft pending</Badge> : null}<Badge>{d.language.toUpperCase()}</Badge></>} description={`Last published ${date(current.at)} by ${current.author}: ${current.summary}`}
      actions={<Button variant="primary" disabled={!m || !(d.draft || dirty)} onClick={() => { if (dirty) saveDraft(); publish(); }} title={!d.draft && !dirty ? 'Write a draft first' : undefined}>Publish version…</Button>}>
      <Tabs label="Legal document sections" value={tab} onValueChange={setTab} items={[{ value: 'current', label: 'Published' }, { value: 'draft', label: 'Draft & compare' }, { value: 'history', label: 'History', badge: d.revisions.length }]} />
      {tab === 'current' ? <Section title={`Version ${d.currentVersion}`}><div className="rounded-lg bg-s2 p-5"><MarkdownArticle source={current.body} /></div></Section> : null}
      {tab === 'draft' ? (
        <div className="grid gap-5">
          {!m ? <Notice tone="warn" title="Read-only">Requires content:manage.</Notice> : null}
          <Section title="Draft" description="Edit the Markdown. Nothing changes for customers until a version is published." actions={<><Button size="sm" variant="secondary" disabled={!m || !dirty} onClick={() => { saveDraft(); }}>Save draft</Button><Button size="sm" variant="ghost" disabled={draft == null} onClick={() => setDraft(null)}>Discard</Button></>}>
            <Textarea label="Markdown" value={draft ?? current.body} onChange={(e) => setDraft(e.target.value)} rows={14} disabled={!m} />
          </Section>
          <Section title="Changes against the published version"><DiffViewer original={current.body} modified={draft ?? current.body} label="Legal draft changes" height={260} /></Section>
        </div>
      ) : null}
      {tab === 'history' ? (
        <Section title="Revisions" description="Every published version stays available.">
          <RelatedTable rows={d.revisions} getRowId={(r) => r.version} caption="Revision history" pageSize={10} columns={[col<LegalRevision>('v', 'Version', (r) => <b>v{r.version}{r.version === d.currentVersion ? <Badge tone="good" className="ml-2">current</Badge> : null}</b>, { primary: true, sort: (r) => r.version }), col<LegalRevision>('a', 'Published', (r) => nw(date(r.at)), { sort: (r) => r.at }), col<LegalRevision>('b', 'By', (r) => r.author), col<LegalRevision>('s', 'Summary', (r) => r.summary), col<LegalRevision>('x', 'Actions', (r) => <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setViewRev(r)}>View</Button><Button size="sm" variant="ghost" disabled={!m} onClick={() => { setDraft(r.body); setTab('draft'); }}>Restore as draft</Button></span>)]} />
          {viewRev ? <div className="mt-4 rounded-lg bg-s2 p-5"><div className="mb-2 flex items-center justify-between"><b>v{viewRev.version}</b><Button size="sm" variant="ghost" onClick={() => setViewRev(null)}>Close</Button></div><MarkdownArticle source={viewRev.body} /></div> : null}
        </Section>
      ) : null}
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
