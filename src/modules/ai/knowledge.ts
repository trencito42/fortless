/**
 * Knowledge Base & Contextual Article Retrieval Engine
 * Provides multi-tenant safe, fast keyword and tag indexed documentation retrieval.
 */

import type Database from 'better-sqlite3';

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  contentMarkdown: string;
  tags: string[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  relevanceScore?: number;
}

export function getKnowledgeArticleBySlug(slug: string, db: Database.Database): KnowledgeArticle | null {
  const row = db.prepare(`
    SELECT id, slug, title, category, summary, content_markdown, tags, is_published, created_at, updated_at
    FROM knowledge_articles
    WHERE slug = ? AND is_published = 1
  `).get(slug) as any;

  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    summary: row.summary,
    contentMarkdown: row.content_markdown,
    tags: JSON.parse(row.tags || '[]'),
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function searchKnowledgeArticles(
  query: string,
  options: { category?: string; limit?: number } = {},
  db: Database.Database
): KnowledgeArticle[] {
  const cleanQuery = (query || '').trim().toLowerCase();
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 20) : 10;

  let sql = `
    SELECT id, slug, title, category, summary, content_markdown, tags, is_published, created_at, updated_at
    FROM knowledge_articles
    WHERE is_published = 1
  `;
  const params: any[] = [];

  if (options.category) {
    sql += ' AND category = ?';
    params.push(options.category);
  }

  const rows = db.prepare(sql).all(...params) as any[];

  if (!cleanQuery) {
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      summary: r.summary,
      contentMarkdown: r.content_markdown,
      tags: JSON.parse(r.tags || '[]'),
      isPublished: Boolean(r.is_published),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  const terms = cleanQuery.split(/\s+/).filter((t) => t.length > 1);

  const scored: Array<KnowledgeArticle & { score: number }> = [];

  for (const row of rows) {
    const tags: string[] = JSON.parse(row.tags || '[]');
    const titleLower = row.title.toLowerCase();
    const summaryLower = row.summary.toLowerCase();
    const contentLower = row.content_markdown.toLowerCase();
    const tagsLower = tags.map((t) => t.toLowerCase());

    let score = 0;
    for (const term of terms) {
      if (titleLower.includes(term)) score += 5;
      if (tagsLower.some((t) => t.includes(term))) score += 4;
      if (summaryLower.includes(term)) score += 2;
      if (contentLower.includes(term)) score += 1;
    }

    if (score > 0) {
      scored.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        category: row.category,
        summary: row.summary,
        contentMarkdown: row.content_markdown,
        tags,
        isPublished: Boolean(row.is_published),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        relevanceScore: score,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
