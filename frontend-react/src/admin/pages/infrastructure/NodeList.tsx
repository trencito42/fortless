import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, nodeHealth } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { REGION_NAMES } from '../../fixtures/commerce';
import { relative } from '../../lib/format';
import { nodeCapacity } from '../../lib/metrics';
import type { InfraNode } from '../../types';
import { useNodeOps } from './nodeOps';

export default function NodeList() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const ops = useNodeOps();
  const m = can('services:manage');
  const seg = (v: string, label: string, test: (n: InfraNode) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Nodes" description="Hosts that run customer servers. Usage is what Wings measures; sold is the sum of plan limits placed on the node.">
      <ResourceTable<InfraNode>
        tableId="nodes" caption="Nodes" rows={data.nodes} getRowId={(n) => n.id} rowLabel={(n) => n.name} searchText={(n) => `${n.name} ${n.id} ${n.fqdn} ${n.publicIp} ${REGION_NAMES[n.region] ?? ''}`}
        segments={[seg('all', 'All', () => true), seg('healthy', 'Healthy', (n) => n.health === 'healthy' && !n.maintenance.enabled), seg('degraded', 'Degraded', (n) => n.health === 'degraded'), seg('maintenance', 'Maintenance', (n) => n.maintenance.enabled), seg('offline', 'Offline', (n) => n.health === 'offline')]}
        filters={[{ id: 'region', label: 'Region', options: Object.entries(REGION_NAMES).map(([k, l]) => ({ value: k, label: l })), test: (n, v) => n.region === v }]}
        onRowClick={(n) => nav(`/infrastructure/nodes/${n.id}`)}
        columns={[
          col<InfraNode>('n', 'Node', (n) => <span className="grid min-w-[9rem]"><EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink><span className="font-mono text-[12px] text-ink3">{n.id}</span></span>, { primary: true, sort: (n) => n.name }),
          col<InfraNode>('r', 'Region', (n) => REGION_NAMES[n.region], { sort: (n) => n.region }),
          col<InfraNode>('h', 'Health', (n) => <span className="flex flex-wrap gap-1"><Status map={nodeHealth} value={n.health} />{n.maintenance.enabled ? <Status map={{ m: { tone: 'info', label: n.maintenance.drain ? 'Draining' : 'Maintenance' } }} value="m" /> : null}</span>, { sort: (n) => n.health }),
          col<InfraNode>('svc', 'Services', (n) => ops.hosted(n).length, { sort: (n) => ops.hosted(n).length, numeric: true }),
          col<InfraNode>('ramsold', 'RAM sold', (n) => `${nodeCapacity(n).ramSoldPct}%`, { sort: (n) => nodeCapacity(n).ramSoldPct, numeric: true }),
          col<InfraNode>('ramused', 'RAM used', (n) => `${nodeCapacity(n).ramUsedPct}%`, { sort: (n) => nodeCapacity(n).ramUsedPct, numeric: true }),
          col<InfraNode>('disk', 'Disk sold', (n) => `${nodeCapacity(n).diskSoldPct}%`, { sort: (n) => nodeCapacity(n).diskSoldPct, numeric: true, hideOnMobile: true }),
          col<InfraNode>('cpu', 'CPU', (n) => `${n.usage.cpuPct}%`, { sort: (n) => n.usage.cpuPct, numeric: true, hideOnMobile: true }),
          col<InfraNode>('hb', 'Heartbeat', (n) => nw(relative(n.lastHeartbeat)), { sort: (n) => n.lastHeartbeat, hideOnMobile: true }),
          col<InfraNode>('w', 'Wings', (n) => <span className="font-mono text-[12.5px]">{n.wingsVersion}</span>, { hideOnMobile: true }),
        ]}
        rowActions={(n) => [
          { id: 'open', label: 'Open node', icon: 'arrow-up-right-01', onSelect: () => nav(`/infrastructure/nodes/${n.id}`) },
          n.maintenance.enabled ? { id: 'exit', label: 'End maintenance…', icon: 'play', disabled: !m, onSelect: () => ops.exit(n) } : { id: 'enter', label: 'Enter maintenance…', icon: 'wrench-01', disabled: !m, disabledReason: 'Requires services:manage', onSelect: () => ops.enter(n) },
          { id: 'rec', label: 'Reconcile with provider…', icon: 'arrow-reload-horizontal', disabled: !m, onSelect: () => ops.reconcile(n) },
        ]}
        toolbar={<Button size="sm" variant="secondary" onClick={() => nav('/infrastructure/capacity')}>Capacity view</Button>}
        empty={{ title: 'No nodes' }}
      />
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
