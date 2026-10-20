import { useMemo } from 'react';
import { Button, EmptyState, Skeleton } from '@/design-system';
import { ServiceDetailView, createDemoPorts, type TabId } from '@/views/service-detail';
import { useApiQuery } from '../data/DataProvider';
import { useNavigate } from '../router';
import type { ServiceRow } from '../domain/types';

const TABS = new Set(['overview', 'console', 'players', 'files', 'game', 'fastdl', 'databases', 'schedules', 'backups', 'network', 'startup', 'settings', 'users', 'allocation', 'activity']);

/** Service Detail inside the customer app. The row comes from the data adapter; the detail ports are the demo adapter derived from it. Production swaps in createFortlessHttpPorts. */
function Detail({ row, tab }: { row: ServiceRow; tab?: string }) {
  const nav = useNavigate();
  const ports = useMemo(() => createDemoPorts({
    workload: row.workload, latency: 150,
    runtime: row.state === 'running' ? 'RUNNING' : 'OFFLINE',
    contract: row.state === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
    plan: { name: row.name, memoryMb: row.resources.ramLimitMb, cpuPct: 200, diskMb: row.resources.diskLimitMb },
  }), [row]);
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
