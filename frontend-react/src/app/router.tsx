import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * Minimal History-API router for the prototype. Routes are plain patterns (`/app/services/:id/:tab?`); the production app can replace this
 * file with its own router without touching pages, because pages only use `useRoute`, `navigate` and `<Link>`.
 */
export interface RouteState { path: string; search: URLSearchParams }
interface RouterCtx extends RouteState { navigate: (to: string, opts?: { replace?: boolean }) => void }
const Ctx = createContext<RouterCtx | null>(null);

const read = (): RouteState => ({ path: location.pathname.replace(/\/+$/, '') || '/', search: new URLSearchParams(location.search) });

/** The customer app, the sign-in pages and the public site are separate entries chosen at page load, so moving between them is a full page load. */
const envOf = (p: string) => (/^\/(app|auth|system)(\/|$)/.test(p) ? 'app'
  : /^\/(login|register|forgot-password|reset-password|verify-email|complete-registration|mfa)(\/|$)/.test(p) ? 'auth'
  : /^\/(legal|oidc|api)(\/|$)/.test(p) ? 'server' : 'site');
const crossesEnv = (to: string) => { const target = envOf(to.split(/[?#]/)[0]!); return target === 'server' || target !== envOf(location.pathname); };

export function RouterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RouteState>(read);
  useEffect(() => { const on = () => setState(read()); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (crossesEnv(to)) { location.assign(to); return; }
    if (opts?.replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
    setState(read());
    window.scrollTo?.({ top: 0 });
  }, []);
  const value = useMemo(() => ({ ...state, navigate }), [state, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('RouterProvider missing');
  return c;
}
export const useNavigate = () => useRouter().navigate;

/** Match `/a/:b/:c?` against a path. Returns params or null. A trailing `*` captures the rest. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean); const parts = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]!;
    if (seg === '*') { params['*'] = parts.slice(i).join('/'); return params; }
    const opt = seg.endsWith('?');
    const name = seg.replace(/\?$/, '');
    if (parts[i] === undefined) { if (opt) continue; return null; }
    if (name.startsWith(':')) params[name.slice(1)] = decodeURIComponent(parts[i]!);
    else if (name !== parts[i]) return null;
  }
  return parts.length > pp.length ? null : params;
}

export function Link({ to, onClick, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank' || crossesEnv(to)) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
