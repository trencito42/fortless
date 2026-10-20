import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { toast } from '../../../petal/index.js';

type Category = { id: string; slug: string; name: string; description: string; sortOrder: number };
type Article = { id: string; slug: string; title: string; category: string; summary: string; contentMarkdown: string; tags: string[]; isPublished: boolean };
type Announcement = { id: string; slug: string; title: string; category: string; kind: string; bodyMarkdown: string; isPublished: boolean; publishedAt?: string | null };
type ContentData = { knowledgeCategories: Category[]; announcementCategories: Category[]; articles: Article[]; announcements: Announcement[] };

let state: ContentData = { knowledgeCategories: [], announcementCategories: [], articles: [], announcements: [] };
let bound = false;
const byId = <T extends { id: string }>(rows: T[], id: string) => rows.find((row) => row.id === id);
const setForm = (id: string, values: Record<string, unknown>) => {
  const form = document.getElementById(id) as HTMLFormElement | null; if (!form) return;
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!field) continue;
    if (name === 'slug' && typeof value === 'string' && /^[A-Z0-9_]+$/.test(value)) field.removeAttribute('pattern');
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const row = (kind: string, item: Category | Article | Announcement, meta: string) => `<div class="li"><div class="tx"><b>${esc('title' in item ? item.title : item.name)}</b><small>${esc(meta)}</small></div><div class="row nw"><button class="btn xs" type="button" data-content-edit="${kind}" data-content-id="${esc(item.id)}" data-permission="content:manage">Edit</button><button class="btn xs" type="button" data-content-delete="${kind}" data-content-id="${esc(item.id)}" data-permission="content:manage">Delete</button></div></div>`;

function paint(): void {
  const set = (id: string, html: string) => { const host = document.getElementById(id); if (host) host.innerHTML = html || '<div class="empty"><b>Nothing here yet.</b></div>'; };
  set('knowledgeCategoryList', state.knowledgeCategories.map((x) => row('knowledge-category', x, x.slug)).join(''));
  set('announcementCategoryList', state.announcementCategories.map((x) => row('announcement-category', x, x.slug)).join(''));
  set('knowledgeArticleList', state.articles.map((x) => row('article', x, `${x.category} · ${x.isPublished ? 'Published' : 'Draft'}`)).join(''));
  set('announcementList', state.announcements.map((x) => row('announcement', x, `${x.kind} · ${x.isPublished ? 'Published' : 'Draft'}`)).join(''));
  const options = (rows: Category[]) => rows.map((x) => `<option value="${esc(x.slug)}">${esc(x.name)}</option>`).join('');
  const kb = document.getElementById('knowledgeArticleCategory'); if (kb) kb.innerHTML = options(state.knowledgeCategories);
  const announcements = document.getElementById('announcementCategory'); if (announcements) announcements.innerHTML = options(state.announcementCategories);
}

async function submit(form: HTMLFormElement): Promise<void> {
  const values = new FormData(form); const id = String(values.get('id') || '');
  let path = ''; let body: Record<string, unknown> = Object.fromEntries(values.entries());
  if (form.id.endsWith('CategoryForm')) {
    const kind = form.id.startsWith('knowledge') ? 'knowledge' : 'announcement';
    path = `/api/v1/admin/content/${kind}-categories${id ? `/${encodeURIComponent(id)}` : ''}`;
    body.sortOrder = Number(body.sortOrder || 0); delete body.id;
  } else if (form.id === 'knowledgeArticleForm') {
    path = `/api/v1/admin/content/articles${id ? `/${encodeURIComponent(id)}` : ''}`;
    body.tags = String(body.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    body.isPublished = (form.elements.namedItem('isPublished') as HTMLInputElement).checked; delete body.id;
  } else {
    path = `/api/v1/admin/content/announcements${id ? `/${encodeURIComponent(id)}` : ''}`;
    body.isPublished = (form.elements.namedItem('isPublished') as HTMLInputElement).checked; delete body.id;
  }
  await api(path, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  form.reset(); toast('Content saved.', 'good'); await renderContent();
}

function bind(): void {
  if (bound) return; bound = true;
  document.getElementById('contentReload')?.addEventListener('click', () => void renderContent());
  for (const id of ['knowledgeCategoryForm', 'announcementCategoryForm', 'knowledgeArticleForm', 'announcementForm']) {
    document.getElementById(id)?.addEventListener('submit', (event) => { event.preventDefault(); void submit(event.currentTarget as HTMLFormElement).catch((error: Error) => toast(error.message, 'bad')); });
  }
  document.getElementById('page-content')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const edit = target.closest<HTMLElement>('[data-content-edit]');
    if (edit) {
      const id = edit.dataset.contentId!;
      if (edit.dataset.contentEdit === 'knowledge-category') setForm('knowledgeCategoryForm', byId(state.knowledgeCategories, id) as unknown as Record<string, unknown>);
      if (edit.dataset.contentEdit === 'announcement-category') setForm('announcementCategoryForm', byId(state.announcementCategories, id) as unknown as Record<string, unknown>);
      if (edit.dataset.contentEdit === 'article') setForm('knowledgeArticleForm', byId(state.articles, id) as unknown as Record<string, unknown>);
      if (edit.dataset.contentEdit === 'announcement') setForm('announcementForm', byId(state.announcements, id) as unknown as Record<string, unknown>);
      return;
    }
    const del = target.closest<HTMLElement>('[data-content-delete]');
    if (!del || !window.confirm('Delete this content permanently?')) return;
    const segments: Record<string, string> = { 'knowledge-category': 'knowledge-categories', 'announcement-category': 'announcement-categories', article: 'articles', announcement: 'announcements' };
    void api(`/api/v1/admin/content/${segments[del.dataset.contentDelete!]}/${encodeURIComponent(del.dataset.contentId!)}`, { method: 'DELETE' })
      .then(() => { toast('Content deleted.', 'good'); return renderContent(); }).catch((error: Error) => toast(error.message, 'bad'));
  });
}

export async function renderContent(): Promise<void> {
  bind();
  const error = document.getElementById('contentError'); if (error) error.hidden = true;
  try { state = await api<ContentData>('/api/v1/admin/content'); paint(); }
  catch (cause: unknown) { if (error) { error.hidden = false; error.textContent = cause instanceof Error ? cause.message : 'Could not load content.'; } }
}
