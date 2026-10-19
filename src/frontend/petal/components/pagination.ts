/**
 * Petal Design System — Canonical Pagination Component
 * Corresponds to blueprint design specifications (panel.html / parts z5).
 */

import { hero } from './icons.js';

export interface PaginationState<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  info: string;
}

/**
 * Calculates page slicing and summary info for an array of items.
 */
export function paginateItems<T>(items: T[], page: number, pageSize: number): PaginationState<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.max(1, Math.min(page, pages));
  const start = (currentPage - 1) * pageSize;
  const sliced = items.slice(start, start + pageSize);
  const info = total === 0 ? '0 items' : `Showing ${start + 1}–${start + sliced.length} of ${total}`;

  return {
    items: sliced,
    total,
    page: currentPage,
    pages,
    pageSize,
    info,
  };
}

/**
 * Renders the Petal `.pager` HTML button sequence.
 */
export function renderPager(page: number, pages: number): string {
  if (pages <= 1) return '';

  const nums = new Set<number>([1, pages, page - 1, page, page + 1]);
  const seq = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = (label: string, p: number, extra = '') => `<button type="button" data-pg="${p}" ${extra}>${label}</button>`;

  let html = btn(hero('arrow-left-01', 's'), page - 1, page === 1 ? 'disabled aria-label="Previous page"' : 'aria-label="Previous page"');
  let prev = 0;
  for (const n of seq) {
    if (n - prev > 1) html += '<button type="button" disabled aria-hidden="true">…</button>';
    html += btn(String(n), n, n === page ? 'aria-current="true" aria-label="Page ' + n + '"' : 'aria-label="Page ' + n + '"');
    prev = n;
  }
  html += btn(hero('arrow-right-01', 's'), page + 1, page === pages ? 'disabled aria-label="Next page"' : 'aria-label="Next page"');

  return html;
}

/**
 * Renders a full pagination footer containing the item count and `.pager` controls.
 */
export function renderPaginationFooter(
  page: number,
  pages: number,
  total: number,
  pageSize: number,
  ids: { infoId?: string; pagerId?: string } = {}
): string {
  const start = (page - 1) * pageSize;
  const countThisPage = Math.min(pageSize, Math.max(0, total - start));
  const infoText = total === 0 ? '0 items' : `Showing ${start + 1}–${start + countThisPage} of ${total}`;

  return `<div class="row wrap" style="justify-content:space-between;align-items:center;padding:12px 14px 14px">
    <span class="muted" ${ids.infoId ? `id="${ids.infoId}"` : ''} style="font-size:12.5px">${infoText}</span>
    <div class="pager" ${ids.pagerId ? `id="${ids.pagerId}"` : ''} data-c="Pagination">${renderPager(page, pages)}</div>
  </div>`;
}
