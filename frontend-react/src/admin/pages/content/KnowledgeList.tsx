import { useMemo } from 'react';
import { Button, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, contentStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { date, num } from '../../lib/format';
import type { KbArticle } from '../../types';

export default function KnowledgeList() {
  const { data, add, patch, remove, audit, newId } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('content:manage');
  const cat = useMemo(() => new Map(data.kbCategories.map((c) => [c.id, c.name])), [data.kbCategories]);
  const seg = (v: string, label: string, test: (a: KbArticle) => boolean) => ({ value: v, label, test });
  const manageCats = () => act.run({ title: 'Add category', confirmLabel: 'Add category', permission: 'content:manage', reasonRequired: false, initial: { name: '', description: '' }, validate: (v) => (v['name']!.trim().length < 3 ? { name: 'Name must be at least 3 characters.' } : data.kbCategories.some((c) => c.name.toLowerCase() === v['name']!.trim().toLowerCase()) ? { name: 'Category exists.' } : {}), fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} /><Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} rows={2} /></div>, onConfirm: ({ values }) => { const c = { id: newId('kbc'), name: values['name']!.trim(), slug: values['name']!.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: values['description']! }; add('kbCategories', c, 'end'); audit('content.kb_category_created', { type: 'kb_category', id: c.id, label: c.name }); return 'Category added'; } });
  const del = (a: KbArticle) => act.run({ title: `Delete “${a.title}”`, description: 'Deleting removes the article from the site. Archive it instead if you may need it again.', confirmLabel: 'Delete article', tone: 'danger', permission: 'content:manage', stepUp: true, reasonRequired: true, requireText: a.slug, onConfirm: ({ reason }) => { remove('kbArticles', a.id); audit('content.kb_article_deleted', { type: 'kb_article', id: a.id, label: a.title }, { reason }); return 'Article deleted'; } });
  return (
    <AdminPage title="Knowledge base" description="Help articles customers find on the site. Articles are Markdown; publishing needs step-up on the real endpoint." actions={<><Button variant="secondary" disabled={!m} onClick={manageCats}>Add category…</Button><Button variant="primary" leadingIcon="add-01" disabled={!m} onClick={() => nav('/content/knowledge/new')}>New article</Button></>}>
      <ResourceTable<KbArticle>
        tableId="kb" caption="Knowledge-base articles" rows={data.kbArticles} getRowId={(a) => a.id} rowLabel={(a) => a.title} searchText={(a) => `${a.title} ${a.slug} ${a.body}`} searchPlaceholder="Search title, slug, text"
        segments={[seg('all', 'All', () => true), seg('published', 'Published', (a) => a.status === 'published'), seg('draft', 'Drafts', (a) => a.status === 'draft'), seg('archived', 'Archived', (a) => a.status === 'archived')]}
        filters={[{ id: 'cat', label: 'Category', options: data.kbCategories.map((c) => ({ value: c.id, label: c.name })), test: (a, v) => a.categoryId === v }]}
        onRowClick={(a) => nav(`/content/knowledge/${a.id}`)}
        columns={[
          col<KbArticle>('t', 'Article', (a) => <span className="grid md:min-w-[14rem]"><EntityLink to={`/content/knowledge/${a.id}`}>{a.title}</EntityLink><span className="font-mono text-[12px] text-ink3">/{a.slug}</span></span>, { primary: true, sort: (a) => a.title }),
          col<KbArticle>('c', 'Category', (a) => cat.get(a.categoryId), { sort: (a) => cat.get(a.categoryId) ?? '' }),
          col<KbArticle>('s', 'Status', (a) => <Status map={contentStatus} value={a.status} />, { sort: (a) => a.status }),
          col<KbArticle>('v', 'Views (30 d)', (a) => (a.views30d == null ? '—' : num(a.views30d)), { numeric: true, sort: (a) => a.views30d ?? -1 }),
          col<KbArticle>('a', 'Author', (a) => a.author, { hideOnMobile: true }),
          col<KbArticle>('u', 'Updated', (a) => nw(date(a.updatedAt)), { sort: (a) => a.updatedAt }),
        ]}
        rowActions={(a) => [{ id: 'e', label: 'Edit', icon: 'edit-02', onSelect: () => nav(`/content/knowledge/${a.id}`) }, { id: 'ar', label: a.status === 'archived' ? 'Restore to draft' : 'Archive', icon: 'archive-01', disabled: !m, onSelect: () => { patch('kbArticles', a.id, { status: a.status === 'archived' ? 'draft' : 'archived' }); audit('content.kb_article_status', { type: 'kb_article', id: a.id, label: a.title }); } }, { id: 'd', label: 'Delete…', icon: 'delete-02', tone: 'danger', disabled: !m, onSelect: () => del(a) }]}
        empty={{ title: 'No articles yet', description: 'Write the first one.', action: <Button variant="primary" disabled={!m} onClick={() => nav('/content/knowledge/new')}>New article</Button> }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
