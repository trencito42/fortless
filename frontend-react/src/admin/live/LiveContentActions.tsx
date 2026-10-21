import { Button, Select, TextField, Textarea } from '@/design-system';
import { useSession } from '../session';
import { LiveMutation, type MutationSpec } from './LiveMutation';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
const slugValid = (value = '') => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function LiveContentActions({ payload, reload, articleId, compact }: { payload: Row; reload: () => void; articleId?: string; compact?: boolean }) {
  const { can } = useSession();
  if (!can('content:manage')) return null;
  const knowledgeCategories = rows(payload['knowledgeCategories']);
  const announcementCategories = rows(payload['announcementCategories']);
  const article = articleId && articleId !== 'new' ? rows(payload['articles']).find((item) => item['id'] === articleId) : undefined;

  const articleSpec: MutationSpec = {
    title: article ? 'Edit knowledge article' : 'New knowledge article', confirmLabel: article ? 'Save article' : 'Create article', endpoint: article ? `/content/articles/${encodeURIComponent(articleId!)}` : '/content/articles', method: article ? 'PUT' : 'POST',
    initial: { slug: String(article?.['slug'] ?? ''), title: String(article?.['title'] ?? ''), category: String(article?.['category'] ?? knowledgeCategories[0]?.['slug'] ?? ''), summary: String(article?.['summary'] ?? ''), content: String(article?.['contentMarkdown'] ?? ''), tags: Array.isArray(article?.['tags']) ? (article!['tags'] as unknown[]).join(', ') : '', publication: article?.['isPublished'] ? 'PUBLISHED' : 'DRAFT' },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Title" value={values['title']} onChange={(event) => set('title', event.target.value)} error={errors['title']} /><TextField label="Slug" value={values['slug']} onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} error={errors['slug']} /><Select label="Category" value={values['category']} onValueChange={(value) => set('category', value ?? '')} error={errors['category']} options={knowledgeCategories.map((item) => ({ value: String(item['slug']), label: String(item['name']) }))} /><Textarea label="Summary" value={values['summary']} onChange={(event) => set('summary', event.target.value)} error={errors['summary']} maxLength={1000} counter /><Textarea label="Markdown content" value={values['content']} onChange={(event) => set('content', event.target.value)} error={errors['content']} rows={10} maxLength={100000} counter /><TextField label="Tags (comma separated)" value={values['tags']} onChange={(event) => set('tags', event.target.value)} /><Select label="Publication" value={values['publication']} onValueChange={(value) => set('publication', value ?? 'DRAFT')} options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} /></div>,
    validate: (values) => ({ ...(!values['title']?.trim() ? { title: 'Title is required.' } : {}), ...(!slugValid(values['slug']) ? { slug: 'Use lowercase letters, numbers and hyphens.' } : {}), ...(!values['category'] ? { category: 'Choose a category.' } : {}), ...(!values['summary']?.trim() ? { summary: 'Summary is required.' } : {}), ...(!values['content']?.trim() ? { content: 'Markdown content is required.' } : {}) }),
    body: (_reason, values) => ({ slug: values['slug'], title: values['title']?.trim(), category: values['category'], summary: values['summary']?.trim(), contentMarkdown: values['content']?.trim(), tags: (values['tags'] ?? '').split(',').map((tag) => tag.trim()).filter(Boolean), isPublished: values['publication'] === 'PUBLISHED' }),
  };

  const announcementSpec: MutationSpec = {
    title: 'New announcement', confirmLabel: 'Create announcement', endpoint: '/content/announcements', initial: { slug: '', title: '', category: String(announcementCategories[0]?.['slug'] ?? ''), kind: 'NEWS', body: '', publication: 'DRAFT' },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Title" value={values['title']} onChange={(event) => set('title', event.target.value)} error={errors['title']} /><TextField label="Slug" value={values['slug']} onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} error={errors['slug']} /><Select label="Category" value={values['category']} onValueChange={(value) => set('category', value ?? '')} error={errors['category']} options={announcementCategories.map((item) => ({ value: String(item['slug']), label: String(item['name']) }))} /><Select label="Kind" value={values['kind']} onValueChange={(value) => set('kind', value ?? 'NEWS')} options={['NEWS', 'MAINTENANCE', 'INCIDENT'].map((value) => ({ value, label: value }))} /><Textarea label="Markdown body" value={values['body']} onChange={(event) => set('body', event.target.value)} error={errors['body']} rows={8} maxLength={100000} counter /><Select label="Publication" value={values['publication']} onValueChange={(value) => set('publication', value ?? 'DRAFT')} options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published now' }]} /></div>,
    validate: (values) => ({ ...(!values['title']?.trim() ? { title: 'Title is required.' } : {}), ...(!slugValid(values['slug']) ? { slug: 'Use lowercase letters, numbers and hyphens.' } : {}), ...(!values['category'] ? { category: 'Choose a category.' } : {}), ...(!values['body']?.trim() ? { body: 'Markdown body is required.' } : {}) }),
    body: (_reason, values) => ({ slug: values['slug'], title: values['title']?.trim(), category: values['category'], kind: values['kind'], bodyMarkdown: values['body']?.trim(), isPublished: values['publication'] === 'PUBLISHED' }),
  };

  const categorySpec: MutationSpec = {
    title: 'New content category', confirmLabel: 'Create category', endpoint: (values) => `/content/${values['type']}-categories`, initial: { type: 'knowledge', slug: '', name: '', description: '', sortOrder: '0' },
    fields: ({ values, set, errors }) => <div className="grid gap-3"><Select label="Content type" value={values['type']} onValueChange={(value) => set('type', value ?? 'knowledge')} options={[{ value: 'knowledge', label: 'Knowledge base' }, { value: 'announcement', label: 'Announcements' }]} /><TextField label="Name" value={values['name']} onChange={(event) => set('name', event.target.value)} error={errors['name']} /><TextField label="Slug" value={values['slug']} onChange={(event) => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))} error={errors['slug']} /><Textarea label="Description" value={values['description']} onChange={(event) => set('description', event.target.value)} maxLength={500} counter /><TextField label="Sort order" type="number" value={values['sortOrder']} onChange={(event) => set('sortOrder', event.target.value)} /></div>,
    validate: (values) => ({ ...(!values['name']?.trim() ? { name: 'Name is required.' } : {}), ...(!/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(values['slug'] ?? '') ? { slug: 'Use letters, numbers, hyphens or underscores.' } : {}) }),
    body: (_reason, values) => ({ slug: values['slug'], name: values['name']?.trim(), description: values['description']?.trim() ?? '', sortOrder: Number(values['sortOrder'] ?? 0) }),
  };

  return <div className="flex flex-wrap gap-2">
    <LiveMutation spec={articleSpec} onDone={reload} trigger={<Button size="sm" variant={compact ? 'secondary' : 'primary'}>{article ? (compact ? 'Edit' : 'Edit article') : 'New article'}</Button>} />
    {!articleId ? <LiveMutation spec={announcementSpec} onDone={reload} trigger={<Button size="sm" variant="secondary">New announcement</Button>} /> : null}
    {!articleId ? <LiveMutation spec={categorySpec} onDone={reload} trigger={<Button size="sm" variant="secondary">New category</Button>} /> : null}
  </div>;
}
