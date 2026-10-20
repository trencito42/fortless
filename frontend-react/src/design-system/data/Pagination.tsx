import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';

export interface PaginationProps {
  page: number; // 0-based
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total rows, shown as "Showing a–b of n" when pageSize is also provided. */
  total?: number;
  pageSize?: number;
}

function range(page: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const set = new Set([0, count - 1, page, page - 1, page + 1]);
  const pages = [...set].filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - (pages[i - 1] ?? 0) > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** Page controls. Numbered buttons from sm up; below that, previous/next with a "Page x of y" label. */
export function Pagination({ page, pageCount, onPageChange, total, pageSize }: PaginationProps) {
  if (pageCount <= 1 && total == null) return null;
  const from = total != null && pageSize ? page * pageSize + 1 : null;
  const to = total != null && pageSize ? Math.min(total, (page + 1) * pageSize) : null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13.5px] font-semibold text-ink3" aria-live="polite">
        {from != null && to != null ? `Showing ${from}–${to} of ${total}` : `Page ${page + 1} of ${pageCount}`}
      </p>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" icon="arrow-left-01" size="sm" variant="secondary" disabled={page <= 0} onClick={() => onPageChange(page - 1)} />
        <span className="px-2 text-[13.5px] font-bold sm:hidden">{page + 1} / {pageCount}</span>
        <ul className="hidden items-center gap-1 sm:flex">
          {range(page, pageCount).map((p, i) =>
            p === 'gap' ? (
              <li key={`g${i}`} aria-hidden="true" className="px-1 text-ink3">…</li>
            ) : (
              <li key={p}>
                <Button size="sm" variant={p === page ? 'primary' : 'ghost'} aria-label={`Page ${p + 1}`} aria-current={p === page ? 'page' : undefined} className="min-w-9 px-2" onClick={() => onPageChange(p)}>{p + 1}</Button>
              </li>
            ),
          )}
        </ul>
        <IconButton label="Next page" icon="arrow-right-01" size="sm" variant="secondary" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)} />
      </div>
    </nav>
  );
}
