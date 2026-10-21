import { Suspense, lazy, useMemo, type ComponentType } from 'react';
import { Button, Skeleton } from '@/design-system';
import { AdminRouterProvider, matchPath, useAdminRouter } from './router';
import { SessionProvider, useSession } from './session';
import { AdminStoreProvider } from './store';
import { ToastHost } from './toast';
import { AdminShell } from './shell/AdminShell';
import { CrumbProvider } from './components/Page';
import { NoAccess } from './components/PreviewNote';
import { routes, type AdminRoute } from './routes';

const cache = new Map<AdminRoute['load'], ComponentType<Record<string, string>>>();
const resolve = (r: AdminRoute) => { let C = cache.get(r.load); if (!C) { C = lazy(async () => ({ default: (await r.load()).default as ComponentType<Record<string, string>> })); cache.set(r.load, C); } return C; };

function NotFound() {
  const { navigate, path } = useAdminRouter();
  return <div className="grid justify-items-start gap-3 py-10"><h1 className="font-display text-[28px] font-extrabold tracking-tight">Page not found</h1><p className="text-ink2">There is no admin view at <code className="font-mono">{path}</code>.</p><Button variant="primary" onClick={() => navigate('/')}>Go to dashboard</Button></div>;
}

function Outlet() {
  const { path } = useAdminRouter();
  const { can } = useSession();
  const hit = useMemo(() => { for (const r of routes) { const p = matchPath(r.pattern, path); if (p) return { route: r, params: p }; } return null; }, [path]);
  if (!hit) return <NotFound />;
  if (hit.route.permission && !can(hit.route.permission)) return <NoAccess permission={hit.route.permission} />;
  const Page = resolve(hit.route);
  return (
    <Suspense fallback={<div className="grid gap-4" aria-busy="true" aria-label="Loading page"><Skeleton className="h-9 w-full max-w-72" /><Skeleton className="h-48 w-full" /></div>}>
      <Page key={path.split('/').slice(0, 3).join('/')} {...hit.params} />
    </Suspense>
  );
}

/** The isolated React admin application. Mounted only at /admin-preview (development, or builds with VITE_ADMIN_PREVIEW=1). */
export default function AdminApp() {
  return (
    <AdminRouterProvider>
      <SessionProvider>
        <AdminStoreProvider>
          <ToastHost>
            <CrumbProvider>
              <AdminShell><Outlet /></AdminShell>
            </CrumbProvider>
          </ToastHost>
        </AdminStoreProvider>
      </SessionProvider>
    </AdminRouterProvider>
  );
}
