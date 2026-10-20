import type { ReactNode } from 'react';
import { Breadcrumbs, type IconName } from '@/design-system';
import { useNavigate } from '../router';

export interface Crumb { label: string; to?: string }

/** Standard page head: breadcrumbs, title, one-line description and the page's primary actions. */
export function PageHeader({ title, description, actions, crumbs, status }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; status?: ReactNode; icon?: IconName }) {
  const nav = useNavigate();
  return (
    <header className="grid gap-3">
      {crumbs && crumbs.length > 2 ? <Breadcrumbs crumbs={crumbs.map((c, i) => ({ id: c.to ?? String(i), label: c.label, current: i === crumbs.length - 1 }))} onNavigate={(id) => id.startsWith('/') && nav(id)} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 grid gap-1.5">
          {status ? <div>{status}</div> : null}
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.045em] sm:text-[30px] [overflow-wrap:anywhere]">{title}</h1>
          {description ? <p className="max-w-[68ch] text-ink2">{description}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
