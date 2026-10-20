import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';

const parseTags = (value: string): string[] => {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []; }
  catch { return []; }
};

const category = (row: any) => ({ id: row.id, slug: row.slug, name: row.name, description: row.description, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at });
const article = (row: any) => ({ id: row.id, slug: row.slug, title: row.title, category: row.category, summary: row.summary, contentMarkdown: row.content_markdown, tags: parseTags(row.tags), isPublished: Boolean(row.is_published), createdAt: row.created_at, updatedAt: row.updated_at });
const announcement = (row: any) => ({ id: row.id, slug: row.slug, category: row.category, categoryName: row.category_name, kind: row.kind, title: row.title, bodyMarkdown: row.body_markdown, isPublished: Boolean(row.is_published), publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at, readAt: row.read_at ?? null });

export function listManagedContent(db: Database.Database) {
  return {
    knowledgeCategories: (db.prepare('SELECT * FROM knowledge_categories ORDER BY sort_order, name').all() as any[]).map(category),
    articles: (db.prepare('SELECT * FROM knowledge_articles ORDER BY updated_at DESC').all() as any[]).map(article),
    announcementCategories: (db.prepare('SELECT * FROM announcement_categories ORDER BY sort_order, name').all() as any[]).map(category),
    announcements: (db.prepare(`SELECT a.*, c.name AS category_name FROM announcements a JOIN announcement_categories c ON c.slug = a.category ORDER BY coalesce(a.published_at, a.created_at) DESC`).all() as any[]).map(announcement),
  };
}

export function listPublishedAnnouncements(userId: string, db: Database.Database) {
  return (db.prepare(`
    SELECT a.*, c.name AS category_name, ar.read_at
    FROM announcements a
    JOIN announcement_categories c ON c.slug = a.category
    LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
    WHERE a.is_published = 1 AND a.published_at IS NOT NULL AND datetime(a.published_at) <= datetime('now', 'utc')
    ORDER BY a.published_at DESC
  `).all(userId) as any[]).map(announcement);
}

export function markAnnouncementRead(id: string, userId: string, db: Database.Database): void {
  const exists = db.prepare('SELECT 1 FROM announcements WHERE id = ? AND is_published = 1').get(id);
  if (!exists) throw new Error('Announcement not found.');
  db.prepare('INSERT OR REPLACE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, datetime(\'now\', \'utc\'))').run(id, userId);
}

export function markAllAnnouncementsRead(userId: string, db: Database.Database): void {
  db.prepare(`INSERT OR REPLACE INTO announcement_reads (announcement_id, user_id, read_at)
    SELECT id, ?, datetime('now', 'utc') FROM announcements WHERE is_published = 1`).run(userId);
}

export type CategoryInput = { slug: string; name: string; description: string; sortOrder: number };
export function saveCategory(kind: 'knowledge' | 'announcement', id: string | null, input: CategoryInput, db: Database.Database) {
  const table = kind === 'knowledge' ? 'knowledge_categories' : 'announcement_categories';
  const nextId = id ?? generateId(kind === 'knowledge' ? 'kbc' : 'anc');
  if (id) {
    const current = db.prepare(`SELECT slug FROM ${table} WHERE id = ?`).get(id) as { slug: string } | undefined;
    if (!current) throw new Error('Category not found.');
    if (current.slug !== input.slug) {
      const used = kind === 'knowledge'
        ? db.prepare('SELECT 1 FROM knowledge_articles WHERE category = ? LIMIT 1').get(current.slug)
        : db.prepare('SELECT 1 FROM announcements WHERE category = ? LIMIT 1').get(current.slug);
      if (used) throw new Error('The slug cannot change while content uses this category.');
    }
    db.prepare(`UPDATE ${table} SET slug = ?, name = ?, description = ?, sort_order = ?, updated_at = datetime('now', 'utc') WHERE id = ?`)
      .run(input.slug, input.name, input.description, input.sortOrder, id);
  } else {
    db.prepare(`INSERT INTO ${table} (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)`)
      .run(nextId, input.slug, input.name, input.description, input.sortOrder);
  }
  return category(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(nextId));
}

export function deleteCategory(kind: 'knowledge' | 'announcement', id: string, db: Database.Database): void {
  const table = kind === 'knowledge' ? 'knowledge_categories' : 'announcement_categories';
  const row = db.prepare(`SELECT slug FROM ${table} WHERE id = ?`).get(id) as { slug: string } | undefined;
  if (!row) throw new Error('Category not found.');
  const used = kind === 'knowledge'
    ? db.prepare('SELECT 1 FROM knowledge_articles WHERE category = ? LIMIT 1').get(row.slug)
    : db.prepare('SELECT 1 FROM announcements WHERE category = ? LIMIT 1').get(row.slug);
  if (used) throw new Error('Move or delete the content in this category first.');
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

export type ArticleInput = { slug: string; title: string; category: string; summary: string; contentMarkdown: string; tags: string[]; isPublished: boolean };
export function saveArticle(id: string | null, input: ArticleInput, db: Database.Database) {
  if (!db.prepare('SELECT 1 FROM knowledge_categories WHERE slug = ?').get(input.category)) throw new Error('Knowledge category not found.');
  const nextId = id ?? generateId('kba');
  if (id) {
    const result = db.prepare(`UPDATE knowledge_articles SET slug = ?, title = ?, category = ?, summary = ?, content_markdown = ?, tags = ?, is_published = ?, updated_at = datetime('now', 'utc') WHERE id = ?`)
      .run(input.slug, input.title, input.category, input.summary, input.contentMarkdown, JSON.stringify(input.tags), Number(input.isPublished), id);
    if (!result.changes) throw new Error('Article not found.');
  } else {
    db.prepare(`INSERT INTO knowledge_articles (id, slug, title, category, summary, content_markdown, tags, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(nextId, input.slug, input.title, input.category, input.summary, input.contentMarkdown, JSON.stringify(input.tags), Number(input.isPublished));
  }
  return article(db.prepare('SELECT * FROM knowledge_articles WHERE id = ?').get(nextId));
}

export function deleteArticle(id: string, db: Database.Database): void {
  if (!db.prepare('DELETE FROM knowledge_articles WHERE id = ?').run(id).changes) throw new Error('Article not found.');
}

export type AnnouncementInput = { slug: string; category: string; kind: 'NEWS' | 'MAINTENANCE' | 'INCIDENT'; title: string; bodyMarkdown: string; isPublished: boolean; publishedAt?: string | null };
export function saveAnnouncement(id: string | null, input: AnnouncementInput, userId: string, db: Database.Database) {
  if (!db.prepare('SELECT 1 FROM announcement_categories WHERE slug = ?').get(input.category)) throw new Error('Announcement category not found.');
  const nextId = id ?? generateId('ann');
  const publishedAt = input.isPublished ? (input.publishedAt ?? new Date().toISOString()) : null;
  if (id) {
    const result = db.prepare(`UPDATE announcements SET slug = ?, category = ?, kind = ?, title = ?, body_markdown = ?, is_published = ?, published_at = ?, updated_at = datetime('now', 'utc') WHERE id = ?`)
      .run(input.slug, input.category, input.kind, input.title, input.bodyMarkdown, Number(input.isPublished), publishedAt, id);
    if (!result.changes) throw new Error('Announcement not found.');
  } else {
    db.prepare(`INSERT INTO announcements (id, slug, category, kind, title, body_markdown, is_published, published_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(nextId, input.slug, input.category, input.kind, input.title, input.bodyMarkdown, Number(input.isPublished), publishedAt, userId);
  }
  return announcement(db.prepare(`SELECT a.*, c.name AS category_name FROM announcements a JOIN announcement_categories c ON c.slug = a.category WHERE a.id = ?`).get(nextId));
}

export function deleteAnnouncement(id: string, db: Database.Database): void {
  if (!db.prepare('DELETE FROM announcements WHERE id = ?').run(id).changes) throw new Error('Announcement not found.');
}
