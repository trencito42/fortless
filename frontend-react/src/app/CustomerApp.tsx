import { Suspense, lazy, useMemo, useState, type ComponentType } from 'react';
import { AppShell, Button, CommandPalette, IconButton, Skeleton, useCommandPaletteShortcut, useTheme, type PaletteCommand } from '@/design-system';
import { DataProvider, useApi } from './data/DataProvider';
import { useApiQuery } from './data/DataProvider';
import { createFortlessHttpApi } from './data/fortlessHttp';
import { MOBILE_TABS, NAV, currentNavId } from './nav';
import { RouterProvider, match, useRouter } from './router';
import { SystemScreen, type SystemKind } from './shell/SystemScreens';
import { routes, type AppRoute } from './routes';

const lazyCache = new Map<AppRoute['load'], ComponentType<Record<string, string>>>();
const resolve = (r: AppRoute) => { let C = lazyCache.get(r.load); if (!C) { C = lazy(async () => ({ default: (await r.load()).default as ComponentType<Record<string, string>> })); lazyCache.set(r.load, C); } return C; };

const SYSTEM_PATHS: Record<string, SystemKind> = { '/system/403': 'forbidden', '/system/404': 'not-found', '/system/500': 'error', '/system/maintenance': 'maintenance', '/system/unavailable': 'unavailable', '/system/session-expired': 'session-expired' };

function Frame() {
  const { path, navigate } = useRouter();
  const theme = useTheme();
  const api = useApi();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const identity = useApiQuery((api) => api.identity());
  useCommandPaletteShortcut(() => setPaletteOpen((o) => !o));
  const commands = useMemo<PaletteCommand[]>(() => {
    const out: PaletteCommand[] = [];
    for (const g of NAV) for (const i of g.items) { out.push({ id: i.id, label: i.label, section: g.label ?? 'Go to', icon: i.icon, keywords: i.keywords, run: () => navigate(i.id) }); for (const c of i.children ?? []) if (c.id !== i.id) out.push({ id: c.id, label: `${i.label}: ${c.label}`, section: g.label ?? 'Go to', icon: i.icon, keywords: c.keywords, run: () => navigate(c.id) }); }
    out.push({ id: 'a-deploy', label: 'Deploy a new server', section: 'Actions', icon: 'rocket-01', keywords: ['order', 'create', 'new'], run: () => navigate('/app/deploy') }, { id: 'a-ticket', label: 'Open a support ticket', section: 'Actions', icon: 'message-01', run: () => navigate('/app/support/new') });
    return out;
  }, [navigate]);

  let hit: { route: AppRoute; params: Record<string, string> } | null = null;
  for (const r of routes) { const p = match(r.pattern, path); if (p) { hit = { route: r, params: p }; break; } }
  const Page = hit ? resolve(hit.route) : null;

  return (
    <AppShell
      nav={NAV}
      currentId={currentNavId(path)}
      onNavigate={(id) => (id === 'more' ? undefined : navigate(id))}
      tabs={MOBILE_TABS}
      user={identity.status === 'ready'
        ? { name: identity.data.fullName, initials: identity.data.avatarInitials, role: identity.data.role }
        : { name: 'Fortless customer', initials: '—', role: identity.status === 'error' ? 'Session unavailable' : 'Loading account' }}
      onOpenSearch={() => setPaletteOpen(true)}
      actions={<IconButton label={theme.resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={theme.resolved === 'dark' ? 'sun-03' : 'moon-01'} variant="ghost" onClick={theme.toggle} />}
      userMenuEntries={[
        { id: 'profile', label: 'Profile', icon: 'user', onSelect: () => navigate('/app/account/profile') },
        { id: 'security', label: 'Security', icon: 'shield-01', onSelect: () => navigate('/app/account/security') },
        { id: 'separator', kind: 'separator' },
        { id: 'logout', label: 'Sign out', icon: 'logout-01', tone: 'danger', onSelect: () => { void api.logout().then(() => window.location.assign('/login')); } },
      ]}
    >
      <div className="mx-auto grid w-full min-w-0 max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-5">
        <p className="rounded-full bg-s3 px-4 py-2 text-[13px] font-semibold text-ink2">React migration preview. Data and enabled actions use your authenticated Fortless account; unavailable backend capabilities are labelled explicitly.</p>
        <Suspense fallback={<div className="grid gap-4" aria-busy="true" aria-label="Loading page"><Skeleton className="h-9 w-full max-w-72" /><Skeleton className="h-48 w-full" /></div>}>
          {Page && hit ? <Page {...hit.params} /> : <NotFoundInline />}
        </Suspense>
      </div>
      <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </AppShell>
  );
}

function NotFoundInline() { const { navigate } = useRouter(); return <div className="grid justify-items-start gap-3 py-10"><h1 className="font-display text-[28px] font-extrabold tracking-tight">Page not found</h1><p className="text-ink2">There is nothing at this address.</p><Button variant="primary" onClick={() => navigate('/app')}>Go to dashboard</Button></div>; }

const AuthPages = lazy(() => import('./auth/AuthPages'));

function Switcher() {
  const { path } = useRouter();
  if (SYSTEM_PATHS[path]) return <SystemScreen kind={SYSTEM_PATHS[path]!} />;
  if (path.startsWith('/auth')) return <Suspense fallback={null}><AuthPages /></Suspense>;
  return <Frame />;
}

export default function CustomerApp() {
  const api = useMemo(() => createFortlessHttpApi(import.meta.env.VITE_FORTLESS_API_ORIGIN ?? ''), []);
  return <RouterProvider><DataProvider api={api}><Switcher /></DataProvider></RouterProvider>;
}
