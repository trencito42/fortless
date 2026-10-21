import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Breadcrumbs } from '@/design-system';
import { navTrail, currentNavId } from '../nav';
import { useAdminRouter } from '../router';

export interface Crumb { label: string; to?: string }
interface CrumbCtx { crumbs: Crumb[] | null; setCrumbs: (c: Crumb[] | null) => void }
const Ctx = createContext<CrumbCtx>({ crumbs: null, setCrumbs: () => undefined });

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useCrumbState = () => useContext(Ctx);

/** Header breadcrumbs. Pages publish their trail through <AdminPage>; until then the nav-derived section trail is shown. */
export function HeaderCrumbs() {
  const { path, navigate } = useAdminRouter();
  const { crumbs } = useCrumbState();
  const list = crumbs ?? navTrail(currentNavId(path));
  const shown = list.length > 0 ? list : [{ label: 'Dashboard' }];
  return <Breadcrumbs crumbs={shown.map((c, i) => ({ id: c.to ?? String(i), label: c.label, current: i === shown.length - 1 }))} onNavigate={(id) => id.startsWith('/') && navigate(id)} />;
}

export interface AdminPageProps {
  title: string;
  description?: ReactNode;
  /** Primary and toolbar actions. Destructive actions belong in an overflow menu, not here. */
  actions?: ReactNode;
  /** Badges beside the title: lifecycle, runtime, environment. */
  status?: ReactNode;
  /** Extra breadcrumb levels between the section and this page. */
  parents?: Crumb[];
  /** Detail pages add their own title as the last crumb. */
  detail?: boolean;
  crumbLabel?: string;
  children?: ReactNode;
}

export function AdminPage({ title, description, actions, status, parents, detail, crumbLabel, children }: AdminPageProps) {
  const { path } = useAdminRouter();
  const { setCrumbs } = useCrumbState();
  const key = JSON.stringify([path, parents, detail, crumbLabel ?? title]);
  useEffect(() => {
    const trail = navTrail(currentNavId(path));
    const extra = (parents ?? []).filter((c) => !trail.some((t) => t.to && t.to === c.to));
    const list: Crumb[] = [...trail, ...extra, ...(detail ? [{ label: crumbLabel ?? title }] : [])];
    setCrumbs(list);
    document.title = `${title} · Fortless Admin (preview)`;
    return () => setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-1.5">
          {status ? <div className="flex flex-wrap items-center gap-2">{status}</div> : null}
          <h1 className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.045em] sm:text-[30px] [overflow-wrap:anywhere]">{title}</h1>
          {description ? <p className="max-w-[72ch] text-ink2">{description}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
