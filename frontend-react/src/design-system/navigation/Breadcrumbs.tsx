import { Icon } from '../icons/Icon';
import type { Crumb } from './nav-utils';

export function Breadcrumbs({ crumbs, onNavigate }: { crumbs: Crumb[]; onNavigate: (id: string) => void }) {
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 font-semibold text-ink3">
        {crumbs.map((c, i) => (
          <li key={`${i}-${c.id}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <Icon name="arrow-right-01" size={14} /> : null}
            {c.current ? (
              <span aria-current="page" className="truncate font-bold text-ink">{c.label}</span>
            ) : (
              <button type="button" className="rounded-sm hover:text-ink" onClick={() => onNavigate(c.id)}>{c.label}</button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
