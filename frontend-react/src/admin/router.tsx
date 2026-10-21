import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * The admin preview has its own tiny History-API router mounted under /admin-preview. It never touches the customer router,
 * and nothing here is reachable from production routes: main.tsx only mounts AdminApp in development or when VITE_ADMIN_PREVIEW=1.
 */
export const ADMIN_BASE = '/admin-preview';
interface Ctx { path: string; search: URLSearchParams; navigate: (to: string, opts?: { replace?: boolean }) => void }
const RouterContext = createContext<Ctx | null>(null);

const read = () => ({
  path: (location.pathname.startsWith(ADMIN_BASE) ? location.pathname.slice(ADMIN_BASE.length) : location.pathname).replace(/\/+$/, '') || '/',
  search: new URLSearchParams(location.search),
});
export const hrefOf = (to: string) => `${ADMIN_BASE}${to === '/' ? '' : to}`;

export function AdminRouterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(read);
  useEffect(() => { const on = () => setState(read()); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = hrefOf(to);
    if (opts?.replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    setState(read());
    if (!opts?.replace) document.getElementById('admin-main')?.scrollTo?.({ top: 0 });
  }, []);
  const value = useMemo(() => ({ ...state, navigate }), [state, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useAdminRouter(): Ctx {
  const c = useContext(RouterContext);
  if (!c) throw new Error('AdminRouterProvider missing');
  return c;
}
export const useNav = () => useAdminRouter().navigate;

/** Match `/a/:b/:c?` against a path; trailing `*` captures the rest. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean); const parts = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]!;
    if (seg === '*') { params['*'] = parts.slice(i).join('/'); return params; }
    const opt = seg.endsWith('?'); const name = seg.replace(/\?$/, '');
    if (parts[i] === undefined) { if (opt) continue; return null; }
    if (name.startsWith(':')) params[name.slice(1)] = decodeURIComponent(parts[i]!);
    else if (name !== parts[i]) return null;
  }
  return parts.length > pp.length ? null : params;
}

export function Link({ to, onClick, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  const { navigate } = useAdminRouter();
  return (
    <a
      href={hrefOf(to)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
