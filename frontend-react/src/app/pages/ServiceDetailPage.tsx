import { useMemo } from 'react';
import { Button, EmptyState, Skeleton } from '@/design-system';
import { ServiceDetailView, createFortlessHttpPorts, type TabId } from '@/views/service-detail';
import { useApiQuery } from '../data/DataProvider';
import { useNavigate } from '../router';
import { ApiError } from '../data/api';
import type { ServiceRow } from '../domain/types';

const TABS = new Set(['overview', 'console', 'players', 'files', 'game', 'fastdl', 'databases', 'schedules', 'backups', 'network', 'startup', 'settings', 'users', 'allocation', 'activity']);

/** Service Detail inside the customer app. All data and operations go through Fortless; fixtures remain workbench/test-only. */
function Detail({ row, tab }: { row: ServiceRow; tab?: string }) {
  const nav = useNavigate();
  const ports = useMemo(() => createFortlessHttpPorts({
    baseUrl: import.meta.env.VITE_FORTLESS_API_ORIGIN ?? '',
    onSessionExpired: () => location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`),
  }), []);
  const active = (tab && TABS.has(tab) ? tab : 'overview') as TabId;
  return (
    <ServiceDetailView
      key={row.id}
      serviceId={row.id}
      ports={ports}
      tab={active}
      onTabChange={(t) => nav(`/app/services/${row.id}${t === 'overview' ? '' : `/${t}`}`)}
      onNavigateServices={() => nav('/app/services')}
    />
  );
}

export default function ServiceDetailPage({ id, tab }: { id: string; tab?: string }) {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.getService(id), [id]);
  if (res.status === 'loading') return <div className="grid gap-4" aria-busy="true"><Skeleton className="h-10 w-full max-w-80" /><Skeleton className="h-64 w-full" /></div>;
  if (res.status === 'error') {
    const cause = res.cause;
    const status = cause instanceof ApiError ? cause.status : (cause as { status?: number })?.status;

    if (status === 401) {
      return (
        <EmptyState
          icon="lock"
          title="Session expired"
          description="Your session has expired. Sign in again to view this service."
          action={<Button variant="primary" onClick={() => location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)}>Sign in</Button>}
        />
      );
    }
    if (status === 403) {
      return (
        <EmptyState
          icon="shield-01"
          title="Access denied"
          description="You do not have permission to view or manage this service."
          action={<Button variant="secondary" onClick={() => nav('/app/services')}>Back to services</Button>}
        />
      );
    }
    if (status === 404) {
      return (
        <EmptyState
          icon="server"
          title="Service not found"
          description="This service does not exist or may have been removed."
          action={<Button variant="secondary" onClick={() => nav('/app/services')}>Back to services</Button>}
        />
      );
    }
    if (status && status >= 500) {
      return (
        <EmptyState
          tone="error"
          icon="alert-01"
          title="Could not load service"
          description="The server encountered an error while retrieving service details. Try again in a moment."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={res.reload}>Retry</Button>
              <Button variant="ghost" onClick={() => nav('/app/services')}>Back to services</Button>
            </div>
          }
        />
      );
    }
    return (
      <EmptyState
        tone="error"
        icon="plug-01"
        title="Connection unavailable"
        description="Could not connect to Fortless. Check your network connection and try again."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={res.reload}>Retry</Button>
            <Button variant="ghost" onClick={() => nav('/app/services')}>Back to services</Button>
          </div>
        }
      />
    );
  }
  return <Detail row={res.data} tab={tab} />;
}
