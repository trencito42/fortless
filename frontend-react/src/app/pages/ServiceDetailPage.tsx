import { useMemo } from 'react';
import { Button, EmptyState, Skeleton } from '@/design-system';
import { ServiceDetailView, createFortlessHttpPorts, type TabId } from '@/views/service-detail';
import { useApiQuery } from '../data/DataProvider';
import { useNavigate } from '../router';
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
  if (res.status === 'error') return <EmptyState icon="server" title="Service not found" description="It may have been removed, or you may not have access to it." action={<Button variant="secondary" onClick={() => nav('/app/services')}>Back to services</Button>} />;
  return <Detail row={res.data} tab={tab} />;
}
