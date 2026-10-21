import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { CapacityBar } from '../../components/CapacityBar';
import { Status, nodeHealth, connectionHealth } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { REGION_NAMES } from '../../fixtures/commerce';
import { mb, relative } from '../../lib/format';
import { nodeCapacity } from '../../lib/metrics';

export default function InfraOverview() {
  const { data } = useAdmin();
  const nav = useNav();
  const nodes = data.nodes;
  const phys = nodes.reduce((a, n) => a + n.hardware.ramMb, 0), sold = nodes.reduce((a, n) => a + n.allocated.ramMb, 0), used = nodes.reduce((a, n) => a + n.usage.ramMb, 0);
  const dphys = nodes.reduce((a, n) => a + n.hardware.diskMb, 0), dsold = nodes.reduce((a, n) => a + n.allocated.diskMb, 0), dused = nodes.reduce((a, n) => a + n.usage.diskMb, 0);
  const regions = Object.entries(REGION_NAMES).map(([r, label]) => ({ r, label, nodes: nodes.filter((n) => n.region === r) }));
  return (
    <AdminPage title="Infrastructure" description="Nodes, capacity and provider health. Physical capacity, sold allocation and measured usage are three separate numbers." actions={<><Button variant="secondary" onClick={() => nav('/infrastructure/nodes')}>All nodes</Button><Button variant="secondary" onClick={() => nav('/infrastructure/maintenance')}>Maintenance</Button></>}>
      <KpiGrid cols={4} items={[
        { label: 'Nodes healthy', value: `${nodes.filter((n) => n.health === 'healthy' && !n.maintenance.enabled).length} of ${nodes.length}`, icon: 'cpu', hint: `${nodes.filter((n) => n.health === 'degraded').length} degraded · ${nodes.filter((n) => n.maintenance.enabled).length} in maintenance`, to: '/infrastructure/nodes' },
        { label: 'RAM sold / physical', value: `${Math.round((sold / phys) * 100)}%`, icon: 'database', hint: `${mb(sold)} sold of ${mb(phys)}`, to: '/infrastructure/capacity' },
        { label: 'RAM actually used', value: `${Math.round((used / phys) * 100)}%`, icon: 'activity-01', hint: `${mb(used)} measured by Wings` },
        { label: 'Provider connections', value: `${data.connections.filter((c) => c.health === 'connected').length} of ${data.connections.length}`, icon: 'plug-01', hint: `${data.connections.filter((c) => c.health === 'degraded' || c.health === 'error').length} degraded`, to: '/infrastructure/providers' },
      ]} />
      <Section title="Fleet capacity" description="All nodes together."><div className="grid gap-6 lg:grid-cols-2"><CapacityBar label="RAM" physical={phys} sold={sold} used={used} format={mb} /><CapacityBar label="Disk" physical={dphys} sold={dsold} used={dused} format={mb} /></div></Section>
      <Section title="By region" description="A paid order is never moved to another region, so capacity matters per region.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{regions.map(({ r, label, nodes: ns }) => { const p = ns.reduce((a, n) => a + n.hardware.ramMb, 0), s = ns.reduce((a, n) => a + n.allocated.ramMb, 0); return (
          <div key={r} className="grid gap-2 rounded-lg bg-s2 p-4"><div className="flex items-baseline justify-between"><b>{label}</b><span className="text-[13px] font-semibold text-ink3">{ns.length} node{ns.length === 1 ? '' : 's'}</span></div><CapacityBar label="RAM sold" physical={p} sold={s} used={ns.reduce((a, n) => a + n.usage.ramMb, 0)} format={mb} /><ul className="grid gap-1">{ns.map((n) => <li key={n.id} className="flex items-center justify-between gap-2"><EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink><Status map={nodeHealth} value={n.health} label={n.maintenance.enabled ? 'Maintenance' : undefined} /></li>)}</ul></div>); })}</div>
      </Section>
      <Columns>
        <Section title="Provider connections" actions={<Button size="sm" variant="ghost" onClick={() => nav('/infrastructure/providers')}>All</Button>}><ul className="grid gap-2">{data.connections.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span><b>{c.name}</b><span className="block text-[12.5px] text-ink3">{c.lastError ?? `Last sync ${relative(c.lastSyncAt)}`}</span></span><Status map={connectionHealth} value={c.health} /></li>)}</ul></Section>
        <Section title="Needs attention"><ul className="grid gap-2">{nodes.filter((n) => n.health !== 'healthy' || nodeCapacity(n).ramSoldPct > 90 || n.maintenance.enabled).map((n) => <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span><EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink><span className="block text-[12.5px] text-ink3">{n.maintenance.enabled ? 'In maintenance' : n.health !== 'healthy' ? `${n.health}; heartbeat ${relative(n.lastHeartbeat)}` : `${nodeCapacity(n).ramSoldPct}% of RAM sold`}</span></span><Button size="sm" variant="secondary" onClick={() => nav(`/infrastructure/nodes/${n.id}`)}>Open</Button></li>)}</ul></Section>
      </Columns>
    </AdminPage>
  );
}
