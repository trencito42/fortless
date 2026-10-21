import { Button, Select, TextField, Textarea } from '@/design-system';
import { useSession } from '../session';
import { LiveContentActions } from './LiveContentActions';
import { LiveMutation, type MutationSpec } from './LiveMutation';
import { rowsOf, text, type Row } from './helpers';
import { announcementEditBody, categoryBody } from './bodies';

const slugValid = (v = '') => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);

/** Delete is irreversible and always asks for a reason plus step-up (the endpoint is behind requireRecentStepUp). */
const del = (title: string, endpoint: string): MutationSpec => ({ title, confirmLabel: 'Delete', endpoint, method: 'DELETE', tone: 'danger', reason: true, reasonMinLength: 5, description: 'Permanent. Prefer unpublishing when you may need the content again. Requires recent step-up.', body: () => ({}) });

export function ArticleRowActions({ row, payload, reload }: { row: Row; payload: Row; reload: () => void }) {
  const { can } = useSession();
  if (!can('content:manage')) return null;
  const id = text(row['id']);
  return <div className="flex flex-wrap gap-1.5">
    <LiveContentActions payload={payload} reload={reload} articleId={id} compact />
    <LiveMutation spec={del('Delete article', `/content/articles/${encodeURIComponent(id)}`)} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Delete</Button>} />
  </div>;
}

export function AnnouncementRowActions({ row, payload, reload }: { row: Row; payload: Row; reload: () => void }) {
  const { can } = useSession();
  if (!can('content:manage')) return null;
  const id = text(row['id']);
  const cats = rowsOf(payload['announcementCategories']);
  const edit: MutationSpec = {
    title: 'Edit announcement', confirmLabel: 'Save announcement', endpoint: `/content/announcements/${encodeURIComponent(id)}`, method: 'PUT',
    initial: { slug: text(row['slug']), title: text(row['title']), category: text(row['category']), kind: text(row['kind'], 'NEWS'), body: text(row['bodyMarkdown']), publication: row['isPublished'] ? 'PUBLISHED' : 'DRAFT' },
    fields: ({ values, set, errors }) => <div className="grid gap-3">
      <TextField label="Title" value={values['title']} onChange={(e) => set('title', e.target.value)} error={errors['title']} maxLength={200} />
      <TextField label="Slug" value={values['slug']} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} error={errors['slug']} maxLength={120} />
      <div className="grid gap-3 sm:grid-cols-3"><Select label="Category" value={values['category']} onValueChange={(v) => set('category', v ?? '')} options={cats.map((c) => ({ value: text(c['slug']), label: text(c['name']) }))} /><Select label="Kind" value={values['kind']} onValueChange={(v) => set('kind', v ?? 'NEWS')} options={['NEWS', 'MAINTENANCE', 'INCIDENT'].map((k) => ({ value: k, label: k }))} /><Select label="State" value={values['publication']} onValueChange={(v) => set('publication', v ?? 'DRAFT')} options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} /></div>
      <Textarea label="Markdown body" value={values['body']} onChange={(e) => set('body', e.target.value)} rows={8} error={errors['body']} />
    </div>,
    validate: (v) => ({ ...(!v['title']?.trim() ? { title: 'Title is required.' } : {}), ...(!slugValid(v['slug']) ? { slug: 'Use lowercase letters, numbers and hyphens.' } : {}), ...(!v['body']?.trim() ? { body: 'Body is required.' } : {}) }),
    body: (_r, v) => announcementEditBody(v),
  };
  return <div className="flex flex-wrap gap-1.5">
    <LiveMutation spec={edit} onDone={reload} trigger={<Button size="sm" variant="secondary">Edit</Button>} />
    <LiveMutation spec={del('Delete announcement', `/content/announcements/${encodeURIComponent(id)}`)} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Delete</Button>} />
  </div>;
}

export function CategoryRowActions({ row, kind, reload }: { row: Row; kind: 'knowledge' | 'announcement'; reload: () => void }) {
  const { can } = useSession();
  if (!can('content:manage')) return null;
  const id = text(row['id']);
  const base = `/content/${kind}-categories/${encodeURIComponent(id)}`;
  const edit: MutationSpec = {
    title: 'Edit category', confirmLabel: 'Save category', endpoint: base, method: 'PUT',
    initial: { slug: text(row['slug']), name: text(row['name']), description: text(row['description']), sortOrder: text(row['sortOrder'], '0') },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} /><TextField label="Slug" value={values['slug']} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))} error={errors['slug']} description="Changing a slug changes URLs." /><Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} /><TextField label="Sort order" inputMode="numeric" value={values['sortOrder']} onChange={(e) => set('sortOrder', e.target.value.replace(/[^\d-]/g, ''))} error={errors['sortOrder']} /></div>,
    validate: (v) => ({ ...(!v['name']?.trim() ? { name: 'Name is required.' } : {}), ...(!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(v['slug'] ?? '') ? { slug: 'Use letters, numbers, hyphens or underscores.' } : {}), ...(!/^-?\d+$/.test(v['sortOrder'] ?? '') ? { sortOrder: 'Enter a whole number.' } : {}) }),
    body: (_r, v) => categoryBody(v),
  };
  return <div className="flex flex-wrap gap-1.5">
    <LiveMutation spec={edit} onDone={reload} trigger={<Button size="sm" variant="secondary">Edit</Button>} />
    <LiveMutation spec={{ ...del('Delete category', base), description: 'The backend refuses to delete a category that still has content. Requires recent step-up.' }} onDone={reload} trigger={<Button size="sm" variant="danger-subtle">Delete</Button>} />
  </div>;
}
