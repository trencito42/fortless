import { useMemo } from 'react';
import { ActionMenu, Badge, Button, DescriptionList, EmptyState, Notice, Timeline, type MenuEntry, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { DetailTabs } from '../../components/DetailTabs';
import { Columns, Fact, FactGrid, KpiGrid, Section } from '../../components/Cards';
import { CapacityBar } from '../../components/CapacityBar';
import { RelatedTable } from '../../components/RelatedTable';
import { Status, lifecycle, nodeHealth, runtime } from '../../components/status';
import { CustomerLink, EntityLink, ServiceLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { REGION_NAMES } from '../../fixtures/commerce';
import { dateTime, mb, relative } from '../../lib/format';
import { nodeCapacity } from '../../lib/metrics';
import type { IpAllocation, Service } from '../../types';
import { useNodeOps } from './nodeOps';

const TABS = [{ value: 'overview', label: 'Overview' }, { value: 'hardware', label: 'Hardware & resources' }, { value: 'allocations', label: 'Allocations' }, { value: 'services', label: 'Hosted services' }, { value: 'networking', label: 'Networking' }, { value: 'capacity', label: 'Capacity' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'activity', label: 'Activity' }];

export default function NodeDetail({ id, tab = 'overview' }: { id: string; tab?: string }) {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const ops = useNodeOps();
  const n = data.nodes.find((x) => x.id === id);
  const hosted = useMemo(() => data.services.filter((s) => s.nodeId === id), [data.services, id]);
  const allocs = useMemo(() => data.ips.filter((i) => i.nodeId === id), [data.ips, id]);
  const events = useMemo(() => data.audit.filter((e) => e.resource.id === id).slice(0, 20), [data.audit, id]);
  if (!n) return <AdminPage title="Node not found"><EmptyState title="No such node" action={<Button onClick={() => nav('/infrastructure/nodes')}>Back to nodes</Button>} /></AdminPage>;
  const c = nodeCapacity(n);
  const m = can('services:manage');
  const active = hosted.filter((s) => s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE');
  const menu: MenuEntry[] = [
    { id: 'rec', label: 'Reconcile with provider…', icon: 'arrow-reload-horizontal', disabled: !m, onSelect: () => ops.reconcile(n) },
    { id: 'cost', label: 'Set monthly cost…', icon: 'coins-01', disabled: !can('catalog:manage'), disabledReason: 'Requires catalog:manage', onSelect: () => ops.setCost(n) },
    { id: 'cap', label: 'Open capacity view', icon: 'analytics-01', onSelect: () => nav('/infrastructure/capacity') },
  ];
  const tl: TimelineEvent[] = events.map((e) => ({ id: e.id, title: <>{e.action.replace(/[._]/g, ' ')}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</>, description: `${e.actor.name}${e.reason ? ` · “${e.reason}”` : ''}`, time: relative(e.at), iso: e.at }));
  const svcCols = [col<Service>('s', 'Service', (s) => <ServiceLink id={s.id} />, { primary: true, sort: (s) => s.name }), col<Service>('c', 'Customer', (s) => <CustomerLink id={s.customerId} />), col<Service>('p', 'Plan', (s) => s.planName, { sort: (s) => s.planName }), col<Service>('l', 'Contract', (s) => <Status map={lifecycle} value={s.lifecycle} />, { sort: (s) => s.lifecycle }), col<Service>('r', 'Runtime', (s) => <Status map={runtime} value={s.runtime} />, { sort: (s) => s.runtime }), col<Service>('m', 'RAM', (s) => mb(s.resources.memoryMb), { numeric: true, sort: (s) => s.resources.memoryMb })];
  return (
    <AdminPage detail title={n.name} crumbLabel={n.name} parents={[{ label: 'Nodes', to: '/infrastructure/nodes' }]} status={<><Status map={nodeHealth} value={n.health} />{n.maintenance.enabled ? <Badge tone="info">{n.maintenance.drain ? 'Draining' : 'Maintenance'}</Badge> : null}<span className="font-mono text-[13px] font-semibold text-ink3">{n.id}</span></>}
      description={`${REGION_NAMES[n.region]} · ${n.fqdn} · Wings ${n.wingsVersion} · heartbeat ${relative(n.lastHeartbeat)}`}
      actions={<>{n.maintenance.enabled ? <Button variant="primary" leadingIcon="play" disabled={!m} onClick={() => ops.exit(n)}>End maintenance…</Button> : <Button variant="secondary" leadingIcon="wrench-01" disabled={!m} onClick={() => ops.enter(n)} title={!m ? 'Requires services:manage' : undefined}>Enter maintenance…</Button>}<ActionMenu label="More node actions" entries={menu} /></>}>
      <DetailTabs base={`/infrastructure/nodes/${n.id}`} tabs={TABS.map((t) => (t.value === 'services' ? { ...t, badge: hosted.length } : t))} current={tab} label="Node sections" />
      {n.health === 'degraded' ? <Notice tone="warn" title="Wings heartbeat is late">Last heartbeat {relative(n.lastHeartbeat)}. New allocations still land here; consider draining. See incident <EntityLink to="/monitoring/incidents/inc_0006">inc_0006</EntityLink>.</Notice> : null}
      {tab === 'overview' ? (
        <div className="grid gap-5">
          <KpiGrid cols={4} items={[{ label: 'Hosted services', value: active.length, hint: `${hosted.length - active.length} not active`, icon: 'server' }, { label: 'RAM sold', value: `${c.ramSoldPct}%`, hint: `${mb(n.allocated.ramMb)} of ${mb(n.hardware.ramMb)} physical`, icon: 'database' }, { label: 'CPU now', value: `${n.usage.cpuPct}%`, icon: 'cpu' }, { label: 'Disk sold', value: `${c.diskSoldPct}%`, hint: `${mb(n.allocated.diskMb)} of ${mb(n.hardware.diskMb)}`, icon: 'folder-01' }]} />
          <Columns><Section title="Capacity"><div className="grid gap-5"><CapacityBar label="RAM" physical={n.hardware.ramMb} sold={n.allocated.ramMb} used={n.usage.ramMb} limit={c.ramLimit} format={mb} /><CapacityBar label="Disk" physical={n.hardware.diskMb} sold={n.allocated.diskMb} used={n.usage.diskMb} limit={c.diskLimit} format={mb} /></div></Section>
            <Section title="Identity"><DescriptionList items={[{ label: 'Region', value: REGION_NAMES[n.region] }, { label: 'FQDN', value: n.fqdn, mono: true, copy: n.fqdn }, { label: 'Public IP', value: n.publicIp, mono: true }, { label: 'OS', value: n.os }, { label: 'Wings', value: n.wingsVersion, mono: true }, { label: 'Provider connection', value: <EntityLink to={`/settings/integrations/${n.connectionId}`}>{n.connectionId}</EntityLink> }]} /></Section></Columns>
        </div>
      ) : null}
      {tab === 'hardware' ? <Columns><Section title="Hardware (physical)"><DescriptionList items={[{ label: 'CPU cores', value: n.hardware.cores }, { label: 'RAM', value: mb(n.hardware.ramMb) }, { label: 'Disk', value: mb(n.hardware.diskMb) }, { label: 'Uplink', value: `${n.hardware.bandwidthMbps} Mbps` }]} /></Section><Section title="Overallocation policy" description="How much more than physical may be sold."><DescriptionList items={[{ label: 'RAM', value: `+${n.overallocate.ramPct}% → ${mb(c.ramLimit)} sellable` }, { label: 'Disk', value: `+${n.overallocate.diskPct}% → ${mb(c.diskLimit)} sellable` }]} /><p className="mt-3 text-[12.5px] font-semibold text-ink3">Policy is configured in the provider panel; shown here read-only.</p></Section>
        <Section title="Resource use (measured)"><DescriptionList items={[{ label: 'CPU', value: `${n.usage.cpuPct}%` }, { label: 'RAM', value: `${mb(n.usage.ramMb)} (${c.ramUsedPct}% of physical)` }, { label: 'Disk', value: `${mb(n.usage.diskMb)} (${c.diskUsedPct}% of physical)` }]} /></Section>
        <Section title="Reservations (sold)"><DescriptionList items={[{ label: 'RAM reserved', value: `${mb(n.allocated.ramMb)} (${c.ramSoldPct}%)` }, { label: 'Disk reserved', value: `${mb(n.allocated.diskMb)} (${c.diskSoldPct}%)` }, { label: 'CPU reserved', value: `${n.allocated.cpuPct}% of ${n.hardware.cores * 100}%` }]} /></Section></Columns> : null}
      {tab === 'allocations' ? <Section title="Allocations" actions={<Button size="sm" variant="secondary" onClick={() => nav('/infrastructure/allocations')}>All allocations</Button>}><RelatedTable rows={allocs} getRowId={(a) => a.id} caption="Node allocations" pageSize={10} columns={[col<IpAllocation>('a', 'Address', (a) => <span className="font-mono text-[13px]">{a.ip}:{a.port}</span>, { primary: true, sort: (a) => `${a.ip}:${String(a.port).padStart(5, '0')}` }), col<IpAllocation>('k', 'Kind', (a) => <Badge>{a.kind}</Badge>), col<IpAllocation>('s', 'Assigned to', (a) => (a.serviceId ? <ServiceLink id={a.serviceId} /> : <span className="text-ink3">free</span>))]} /></Section> : null}
      {tab === 'services' ? <Section title="Hosted services"><RelatedTable rows={hosted} getRowId={(s) => s.id} caption="Hosted services" onRowClick={(s) => nav(`/services/${s.id}`)} columns={svcCols} pageSize={10} empty="No services on this node." /></Section> : null}
      {tab === 'networking' ? <Columns><Section title="Addresses"><DescriptionList items={[{ label: 'Public IP', value: n.publicIp, mono: true }, { label: 'IP pool', value: n.ipPool, mono: true }, { label: 'Wings API', value: `${n.fqdn}:8080`, mono: true }, { label: 'SFTP', value: `${n.fqdn}:2022`, mono: true }, { label: 'Allocations', value: allocs.length }, { label: 'Free allocations', value: allocs.filter((a) => !a.serviceId && a.kind === 'game').length }]} /></Section><Section title="Reachability"><Notice tone={n.health === 'degraded' ? 'warn' : 'info'} title={n.health === 'degraded' ? 'Packet loss reported' : 'No network issues reported'}>{n.health === 'degraded' ? 'Customers see 3–8% packet loss. Tracked in incident inc_0006.' : 'Heartbeat and panel reachability are normal.'}</Notice></Section></Columns> : null}
      {tab === 'capacity' ? <Section title="Capacity left to sell" description="After overallocation. A plan fits only if both RAM and disk fit."><ul className="grid gap-2 sm:grid-cols-2">{data.plans.filter((p) => p.status === 'ACTIVE' && p.regions.includes(n.region)).map((p) => { const fit = Math.max(0, Math.min(Math.floor(c.ramFreeSellable / p.resources.memoryMb), Math.floor(c.diskFreeSellable / p.resources.diskMb))); return <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span><b>{p.name}</b><span className="block text-[12.5px] text-ink3">{mb(p.resources.memoryMb)} · {mb(p.resources.diskMb)}</span></span><Badge tone={fit > 5 ? 'good' : fit > 0 ? 'warn' : 'bad'}>{fit} more fit</Badge></li>; })}</ul>
        <p className="mt-3 text-[13px] font-semibold text-ink3">Monthly cost: {n.monthlyCost ? <MoneyText value={n.monthlyCost} /> : 'unknown (no margin shown)'}</p></Section> : null}
      {tab === 'maintenance' ? <Section title="Maintenance state">{n.maintenance.enabled ? <div className="grid gap-3"><FactGrid cols={3}><Fact label="Since">{dateTime(n.maintenance.since)}</Fact><Fact label="Expected until">{dateTime(n.maintenance.until)}</Fact><Fact label="Drain">{n.maintenance.drain ? 'Yes: no new allocations' : 'No'}</Fact></FactGrid><p className="font-semibold">Reason: <span className="font-medium">{n.maintenance.reason}</span></p><div><Button variant="primary" disabled={!m} onClick={() => ops.exit(n)}>End maintenance…</Button></div></div> : <div className="grid gap-3"><p className="text-ink2">The node is in normal operation. {active.length} active services would be affected by maintenance.</p><div><Button variant="secondary" disabled={!m} onClick={() => ops.enter(n)}>Enter maintenance…</Button></div></div>}</Section> : null}
      {tab === 'activity' ? <Section title="Activity">{tl.length ? <Timeline events={tl} label="Node activity" /> : <p className="text-ink3">No audit events for this node.</p>}</Section> : null}
      <PreviewNote />
      {ops.node}
    </AdminPage>
  );
}
