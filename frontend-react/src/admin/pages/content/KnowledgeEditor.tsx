import { useState } from 'react';
import { Badge, Button, EmptyState, Notice, Select, SegmentedControl, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, contentStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { MarkdownArticle } from '../../../app/components/MarkdownArticle';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { iso } from '../../lib/format';
import type { KbArticle } from '../../types';

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function KnowledgeEditor({ id }: { id: string }) {
  const { data, add, patch, audit, newId } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can, staffName } = useSession();
  const act = useActionDialog();
  const isNew = id === 'new';
  const a = data.kbArticles.find((x) => x.id === id);
  const [f, setF] = useState({ title: a?.title ?? '', slug: a?.slug ?? '', slugTouched: !!a, categoryId: a?.categoryId ?? data.kbCategories[0]!.id, body: a?.body ?? '# Title\n\nWrite in Markdown.\n', seoTitle: a?.seoTitle ?? '', seoDescription: a?.seoDescription ?? '' });
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  if (!isNew && !a) return <AdminPage title="Article not found"><EmptyState title="No such article" action={<Button onClick={() => nav('/content/knowledge')}>Back to articles</Button>} /></AdminPage>;
  const m = can('content:manage');
  const validate = () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e['title'] = 'Title must be at least 5 characters.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) e['slug'] = 'Use lowercase letters, numbers and single dashes.'; else if (data.kbArticles.some((x) => x.slug === f.slug && x.id !== id)) e['slug'] = 'Another article uses this slug.';
    if (f.body.trim().length < 40) e['body'] = 'Write at least 40 characters before saving.';
    if (f.seoDescription.length > 160) e['seoDescription'] = 'Keep the description at 160 characters or fewer.';
    if (/<script|javascript:/i.test(f.body)) e['body'] = 'Scripts are not allowed. Markdown only.';
    setErr(e); return Object.keys(e).length === 0;
  };
  const save = (status: KbArticle['status']) => {
    if (!validate()) { toast({ tone: 'bad', title: 'Fix the highlighted fields' }); return; }
    const rec: KbArticle = { id: a?.id ?? newId('kba'), title: f.title.trim(), slug: f.slug, categoryId: f.categoryId, status, body: f.body, seoTitle: f.seoTitle || `${f.title.trim()} | Fortless Help`, seoDescription: f.seoDescription, updatedAt: iso(0), author: a?.author ?? staffName, views30d: a?.views30d ?? null };
    const run = () => { if (isNew) add('kbArticles', rec); else patch('kbArticles', rec.id, rec); audit(status === 'published' ? 'content.kb_article_published' : 'content.kb_article_saved', { type: 'kb_article', id: rec.id, label: rec.title }); nav(`/content/knowledge/${rec.id}`); return status === 'published' ? 'Article published' : 'Draft saved'; };
    if (status === 'published') act.run({ title: 'Publish article', description: 'Makes the article public at the address below.', confirmLabel: 'Publish', permission: 'content:manage', stepUp: true, reasonRequired: false, effects: [`/help/${rec.slug}`], onConfirm: run });
    else { run(); toast({ tone: 'good', title: 'Draft saved (preview)' }); }
  };
  const wrap = (before: string, after = before) => setF((s) => ({ ...s, body: `${s.body}${before}text${after}` }));
  const serp = { title: (f.seoTitle || `${f.title} | Fortless Help`).slice(0, 60), desc: (f.seoDescription || f.body.replace(/[#>*`]/g, '').slice(0, 150)).slice(0, 160) };
  return (
    <AdminPage detail title={isNew ? 'New article' : a!.title} crumbLabel={isNew ? 'New article' : a!.title} parents={[{ label: 'Knowledge base', to: '/content/knowledge' }]} status={a ? <Status map={contentStatus} value={a.status} /> : <Badge>New</Badge>}
      actions={<><Button variant="ghost" onClick={() => nav('/content/knowledge')}>Back</Button><Button variant="secondary" disabled={!m} onClick={() => save('draft')}>Save draft</Button><Button variant="primary" disabled={!m} onClick={() => save('published')}>Publish…</Button></>}>
      {!m ? <Notice tone="warn" title="Read-only">Requires <code className="font-mono font-bold">content:manage</code>.</Notice> : null}
      <Split main={<>
        <Section title="Article">
          <div className="grid gap-4">
            <TextField label="Title" required value={f.title} onChange={(e) => { set('title', e.target.value); if (!f.slugTouched) set('slug', slugify(e.target.value)); }} error={err['title']} disabled={!m} />
            <div className="grid gap-4 sm:grid-cols-2"><TextField label="URL slug" value={f.slug} onChange={(e) => setF((s) => ({ ...s, slug: slugify(e.target.value), slugTouched: true }))} error={err['slug']} prefix="/help/" disabled={!m} /><Select label="Category" value={f.categoryId} onValueChange={(v) => set('categoryId', v ?? '')} options={data.kbCategories.map((c) => ({ value: c.id, label: c.name }))} disabled={!m} /></div>
          </div>
        </Section>
        <Section title="Content" actions={<SegmentedControl aria-label="Editor mode" size="sm" value={view} onValueChange={setView} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />}>
          {view === 'write' ? <div className="grid gap-2"><div className="flex flex-wrap gap-1" role="toolbar" aria-label="Markdown helpers"><Button size="sm" variant="ghost" onClick={() => wrap('**')} disabled={!m}>Bold</Button><Button size="sm" variant="ghost" onClick={() => wrap('`')} disabled={!m}>Code</Button><Button size="sm" variant="ghost" onClick={() => setF((s) => ({ ...s, body: `${s.body}\n## Heading\n` }))} disabled={!m}>Heading</Button><Button size="sm" variant="ghost" onClick={() => setF((s) => ({ ...s, body: `${s.body}\n1. First step\n2. Second step\n` }))} disabled={!m}>Steps</Button></div><Textarea label="Markdown" value={f.body} onChange={(e) => set('body', e.target.value)} rows={16} error={err['body']} disabled={!m} /></div> : <div className="rounded-lg bg-s2 p-5"><MarkdownArticle source={f.body} /></div>}
        </Section>
      </>} aside={<>
        <Section title="Search appearance" description="How the article may look in search results.">
          <div className="grid gap-3"><TextField label="SEO title" value={f.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} description={`${(f.seoTitle || '').length}/60`} disabled={!m} /><Textarea label="Meta description" value={f.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} rows={3} maxLength={200} counter error={err['seoDescription']} disabled={!m} />
            <div className="rounded-md bg-s2 p-3"><p className="text-[12px] text-ink3">fortless.net › help › {f.slug || 'slug'}</p><p className="font-bold text-accent-ink">{serp.title}</p><p className="text-[13.5px] text-ink2">{serp.desc}</p></div></div>
        </Section>
        {a ? <Section title="History"><p className="text-[13.5px] text-ink2">Last edited by {a.author}. Revision history for articles is not stored by the backend yet; legal pages keep full revisions.</p></Section> : null}
      </>} />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
