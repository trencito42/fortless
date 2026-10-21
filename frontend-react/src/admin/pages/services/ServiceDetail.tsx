import { useMemo, useState } from 'react';
import { ActionMenu, Badge, Button, DescriptionList, EmptyState, LogViewer, Notice, Switch, TimeSeriesChart, Timeline, type MenuEntry, type TimelineEvent, type LogLine, ChartFrame } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { DetailTabs } from '../../components/DetailTabs';
import { Columns, Fact, FactGrid, Section, Split } from '../../components/Cards';
import { Status, invoiceKey, invoiceStatus, jobStatus, lifecycle, providerSync, runtime, subscriptionStatus } from '../../components/status';
import { CustomerLink, InvoiceLink, JobLink, NodeLink, OrderLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { RelatedTable } from '../../components/RelatedTable';
import { UsageMeter } from '../../components/UsageMeter';
import { PreviewNote } from '../../components/PreviewNote';
import { col, nw } from '../../components/cols';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { REGION_NAMES } from '../../fixtures/commerce';
import { date, dateTime, intervalLabel, mb, relative } from '../../lib/format';
import { providerDiff } from '../../lib/provider';
import { syntheticSeries } from '../../lib/series';
import type { Invoice, IpAllocation, Job } from '../../types';
import { useServiceOps } from './serviceOps';

const TABS = [{ value: 'overview', label: 'Overview' }, { value: 'operations', label: 'Operations' }, { value: 'resources', label: 'Resources' }, { value: 'provider', label: 'Provider' }, { value: 'networking', label: 'Networking' }, { value: 'billing', label: 'Billing' }, { value: 'provisioning', label: 'Provisioning' }, { value: 'diagnostics', label: 'Diagnostics' }, { value: 'activity', label: 'Activity' }, { value: 'access', label: 'Access' }];

export default function ServiceDetail({ id, tab = 'overview' }: { id: string; tab?: string }) {
  const { data, patch } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const toast = useToast();
  const ops = useServiceOps();
  const [range, setRange] = useState<'cpu' | 'ram'>('cpu');
  const s = data.services.find((x) => x.id === id);
  const customer = data.customers.find((c) => c.id === s?.customerId);
  const order = data.orders.find((o) => o.id === s?.orderId);
  const node = data.nodes.find((n) => n.id === s?.nodeId);
  const sub = data.subscriptions.find((x) => x.id === s?.billing.subscriptionId);
  const invoices = useMemo(() => data.invoices.filter((i) => i.serviceId === id), [data.invoices, id]);
  const jobs = useMemo(() => data.jobs.filter((j) => j.serviceId === id || (order && j.orderId === order.id)), [data.jobs, id, order]);
  const events = useMemo(() => data.audit.filter((e) => e.resource.id === id).slice(0, 30), [data.audit, id]);
  const tickets = useMemo(() => data.tickets.filter((t) => s && t.serviceIds.includes(s.id)), [data.tickets, s]);
  if (!s || !customer) return <AdminPage title="Service not found"><EmptyState title="No such service" description={`There is no service ${id} in the demo data.`} action={<Button onClick={() => nav('/services')}>Back to services</Button>} /></AdminPage>;
  const manage = can('services:manage');
  const active = s.lifecycle === 'ACTIVE';
  const why = !manage ? 'Requires services:manage' : !active ? `Contract is ${s.lifecycle.toLowerCase().replace('_', ' ')}; runtime actions are blocked` : undefined;
  const diff = providerDiff(s);
  const bad = diff.filter((d) => !d.ok);
  const cpuSeries = syntheticSeries(`${s.id}-cpu`, 48, Math.max(5, s.usage.cpuPct), 14);
  const ramSeries = syntheticSeries(`${s.id}-ram`, 48, s.usage.memoryMb, s.resources.memoryMb * 0.06).map((p) => ({ ...p, v: Math.min(p.v, s.resources.memoryMb) }));
  const logs: LogLine[] = s.runtime === 'running' ? [
    { id: 1, text: '[Server thread/INFO]: Done (6.412s)! For help, type "help"', level: 'info' }, { id: 2, text: '[Server thread/INFO]: Player joined the game', level: 'info' }, { id: 3, text: '[Server thread/WARN]: Can\'t keep up! Is the server overloaded? Running 2145ms behind', level: 'warn' }, { id: 4, text: '[Server thread/INFO]: Autosave complete', level: 'info' },
  ] : [{ id: 1, text: 'No console output: server is not running.', level: 'debug' }];
  const checks: Array<[string, 'ok' | 'warn' | 'bad', string]> = [
    ['Contract ↔ runtime consistent', s.lifecycle === 'ACTIVE' || s.runtime === 'offline' || s.runtime === 'unknown' ? 'ok' : 'bad', s.lifecycle === 'ACTIVE' ? 'Active contract' : 'Non-active contract; runtime must be offline'],
    ['Provider record reachable', s.provider.sync === 'missing_remote' || s.provider.sync === 'unlinked' ? (s.lifecycle === 'TERMINATED' ? 'ok' : 'bad') : 'ok', s.provider.sync === 'unlinked' ? 'No external id stored' : s.provider.sync === 'missing_remote' ? 'Provider returned 404' : 'Server found by external id'],
    ['Provider state matches business record', bad.length ? 'warn' : 'ok', bad.length ? `${bad.length} difference${bad.length > 1 ? 's' : ''}: ${bad.map((b) => b.field).join(', ')}` : 'No differences'],
    ['Node heartbeat', node && node.health !== 'healthy' ? 'warn' : 'ok', node ? `${node.name}: ${node.health}${node.maintenance.enabled ? ' (maintenance)' : ''}` : 'Unknown node'],
    ['Disk headroom', s.usage.diskMb / s.resources.diskMb > 0.9 ? 'warn' : 'ok', `${Math.round((s.usage.diskMb / s.resources.diskMb) * 100)}% used`],
    ['Memory headroom', s.usage.memoryMb / s.resources.memoryMb > 0.9 ? 'warn' : 'ok', `${Math.round((s.usage.memoryMb / s.resources.memoryMb) * 100)}% used`],
    ['Allocation unique on node', 'ok', `${s.ip}:${s.port} is assigned only to this service`],
  ];
  const timeline: TimelineEvent[] = [
    ...(order ? [{ id: 't-order', title: 'Order placed', description: <OrderLink id={order.id} />, time: dateTime(order.createdAt), iso: order.createdAt, icon: 'shopping-cart-01' as const, tone: 'neutral' as const }] : []),
    ...(order?.paymentIds[0] ? [{ id: 't-pay', title: 'Payment confirmed by webhook', description: 'Stripe signature verified; invoice marked paid', time: dateTime(data.payments.find((p) => p.id === order.paymentIds[0])?.createdAt), icon: 'credit-card' as const, tone: 'good' as const }] : []),
    ...jobs.filter((j) => j.type === 'PROVISION_SERVICE').map((j) => ({ id: `t-${j.id}`, title: 'Provisioning job', description: <span className="inline-flex items-center gap-2"><JobLink id={j.id} /><Status map={jobStatus} value={j.status} /></span>, time: dateTime(j.createdAt), iso: j.createdAt, icon: 'layers-01' as const, tone: 'neutral' as const })),
    { id: 't-prov', title: 'Provider server created', description: `Tag ${s.provider.correlationTag} · external id ${s.provider.externalId ?? 'unknown'}`, time: dateTime(s.createdAt), iso: s.createdAt, icon: 'server', tone: 'good' },
    { id: 't-act', title: 'Service activated', description: `Contract ${s.lifecycle.toLowerCase().replace('_', ' ')} now`, time: dateTime(s.createdAt), icon: 'rocket-01', tone: 'good' },
  ];
  const auditTl: TimelineEvent[] = events.map((e) => ({ id: e.id, title: <>{e.action.replace(/[._]/g, ' ')}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</>, description: `${e.actor.name}${e.reason ? ` · “${e.reason}”` : ''}`, time: relative(e.at), iso: e.at, tone: e.result === 'success' ? 'neutral' : 'warn' }));

  const overflow: MenuEntry[] = [
    { id: 'recon', label: 'Reconcile with provider…', icon: 'arrow-reload-horizontal', disabled: !manage, onSelect: () => ops.reconcile(s) },
    { id: 'migrate', label: 'Migrate to another node…', icon: 'arrow-up-right-01', disabled: !manage || !active, disabledReason: why, onSelect: () => ops.migrate(s) },
    { id: 'plan', label: 'Change plan…', icon: 'sliders-horizontal', disabled: !manage || s.lifecycle === 'TERMINATED', onSelect: () => ops.changePlan(s) },
    { id: 'sep', kind: 'separator' },
    ...(s.lifecycle === 'TERMINATED' ? [{ id: 'rec', label: 'Recover from termination…', icon: 'history' as const, disabled: !manage, onSelect: () => ops.recover(s) }] : [{ id: 'term', label: 'Terminate service…', icon: 'delete-02' as const, tone: 'danger' as const, disabled: !manage, disabledReason: 'Requires services:manage', onSelect: () => ops.terminate(s) }]),
  ];

  const opCard = (title: string, text: string, btn: string, onClick: () => void, o: { variant?: 'secondary' | 'danger-subtle' | 'primary'; disabled?: boolean; reason?: string } = {}) => (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-s2 p-3.5"><div className="min-w-0 flex-1 basis-56"><p className="font-bold">{title}</p><p className="text-[13.5px] text-ink2">{text}</p>{o.disabled && o.reason ? <p className="mt-1 text-[12.5px] font-semibold text-warn">{o.reason}</p> : null}</div><Button size="sm" variant={o.variant ?? 'secondary'} onClick={onClick} disabled={o.disabled}>{btn}</Button></li>
  );

  return (
    <AdminPage detail title={s.name} status={<><Status map={lifecycle} value={s.lifecycle} /><Status map={runtime} value={s.runtime} /><Status map={providerSync} value={s.provider.sync} /><span className="font-mono text-[13px] font-semibold text-ink3">{s.id}</span></>}
      description={<>{s.productName} · {s.planName} · <CustomerLink id={s.customerId} /> · {node?.name ?? s.nodeId} ({REGION_NAMES[s.region]})</>}
      actions={<><Button variant="secondary" leadingIcon="refresh" disabled={!!why} onClick={() => ops.power(s, 'restart')} title={why}>Restart</Button><Button variant="secondary" leadingIcon="terminal" onClick={() => nav(`/services/${s.id}/diagnostics`)}>Diagnostics</Button>{s.lifecycle === 'SUSPENDED' ? <Button variant="primary" leadingIcon="play" disabled={!manage} onClick={() => ops.unsuspend(s)}>Unsuspend</Button> : <Button variant="secondary" leadingIcon="pause" disabled={!manage || !active} onClick={() => ops.suspend(s)}>Suspend</Button>}<ActionMenu label="More service actions" entries={overflow} /></>}>
      <DetailTabs base={`/services/${s.id}`} tabs={TABS} current={tab} label="Service sections" />
      {s.provider.sync !== 'in_sync' && s.lifecycle !== 'TERMINATED' ? <Notice tone="warn" title="Provider record needs review" action={<Button size="sm" variant="secondary" onClick={() => nav(`/services/${s.id}/provider`)}>Open provider tab</Button>}>The business record and the provider disagree. Reconciliation is read-only; applying a change is a separate decision.</Notice> : null}

      {tab === 'overview' ? (
        <Split main={<>
          <Columns>
            <Section title="Contract" description="Business record. Changes by billing and staff decisions."><FactGrid cols={2}><Fact label="Lifecycle"><Status map={lifecycle} value={s.lifecycle} /></Fact><Fact label="Created">{date(s.createdAt)}</Fact><Fact label="Price"><MoneyText value={s.billing.price} /> / {intervalLabel[s.billing.interval]?.toLowerCase()}</Fact><Fact label="Next renewal">{s.billing.nextRenewal ? date(s.billing.nextRenewal) : '—'}</Fact></FactGrid></Section>
            <Section title="Runtime" description="Server process as the provider reports it."><FactGrid cols={2}><Fact label="State"><Status map={runtime} value={s.runtime} /></Fact><Fact label="Last provider sync">{relative(s.provider.lastSyncAt)}</Fact><Fact label="Memory">{mb(s.usage.memoryMb)} / {mb(s.resources.memoryMb)}</Fact><Fact label="Disk">{mb(s.usage.diskMb)} / {mb(s.resources.diskMb)}</Fact></FactGrid></Section>
          </Columns>
          <Section title="Related records"><FactGrid cols={3}><Fact label="Customer"><CustomerLink id={s.customerId} /></Fact><Fact label="Order"><OrderLink id={s.orderId} /></Fact><Fact label="Node"><NodeLink id={s.nodeId} /></Fact><Fact label="Subscription">{sub ? <Status map={subscriptionStatus} value={sub.status} /> : '—'}</Fact><Fact label="Invoices">{invoices.length}</Fact><Fact label="Open tickets">{tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length}</Fact></FactGrid></Section>
        </>} aside={<><Section title="Console tail" description="Read-only sample. Staff never get an interactive console."><LogViewer lines={logs} label="Console output" height={200} /></Section><Section title="Quick facts"><DescriptionList items={[{ label: 'Address', value: `${s.ip}:${s.port}`, mono: true, copy: `${s.ip}:${s.port}` }, { label: 'Provider id', value: s.provider.identifier, mono: true, copy: s.provider.identifier }, { label: 'Correlation tag', value: s.provider.correlationTag, mono: true }]} /></Section></>} />
      ) : null}

      {tab === 'operations' ? (
        <div className="grid gap-5">
          {!active ? <Notice tone="info" title={`Contract is ${s.lifecycle.toLowerCase().replace('_', ' ')}`}>Power and rebuild actions are blocked until the contract is active again. Contract actions below are still available.</Notice> : null}
          <Section title="Runtime" description="Affect the server process only. Never change billing or contract.">
            <ul className="grid gap-2">
              {opCard('Start', 'Start the server if it is offline.', 'Start…', () => ops.power(s, 'start'), { disabled: !!why || s.runtime === 'running', reason: why ?? (s.runtime === 'running' ? 'Already running' : undefined) })}
              {opCard('Stop', 'Graceful stop. Players are disconnected.', 'Stop…', () => ops.power(s, 'stop'), { disabled: !!why || s.runtime !== 'running', reason: why ?? (s.runtime !== 'running' ? 'Not running' : undefined) })}
              {opCard('Restart', 'Stop, then start again.', 'Restart…', () => ops.power(s, 'restart'), { disabled: !!why, reason: why })}
              {opCard('Kill process', 'Force-stop a hung server. Unsaved data can be lost.', 'Kill…', () => ops.power(s, 'kill'), { variant: 'danger-subtle', disabled: !!why || s.runtime === 'offline', reason: why ?? (s.runtime === 'offline' ? 'Already offline' : undefined) })}
              {opCard('Reinstall', 'Wipe files and run the install script again.', 'Reinstall…', () => ops.reinstall(s), { variant: 'danger-subtle', disabled: !!why, reason: why })}
              {opCard('Rebuild container', 'Recreate the container with current limits. Files are kept.', 'Rebuild…', () => ops.rebuild(s), { disabled: !!why, reason: why })}
            </ul>
          </Section>
          <Section title="Contract & plan" description="Business decisions. They change what the customer pays or can use.">
            <ul className="grid gap-2">
              {s.lifecycle === 'SUSPENDED' ? opCard('Unsuspend', 'Return the contract to active.', 'Unsuspend…', () => ops.unsuspend(s), { variant: 'primary', disabled: !manage, reason: 'Requires services:manage' }) : opCard('Suspend', 'Stop the server and block the customer from starting it.', 'Suspend…', () => ops.suspend(s), { variant: 'danger-subtle', disabled: !manage || !active, reason: !manage ? 'Requires services:manage' : 'Only active services can be suspended' })}
              {opCard('Change plan', 'Move to another plan of the same product.', 'Change plan…', () => ops.changePlan(s), { disabled: !manage || s.lifecycle === 'TERMINATED', reason: 'Requires services:manage and a non-terminated contract' })}
              {opCard('Adjust resource limits', 'Override RAM, disk and CPU for this service only.', 'Adjust…', () => ops.resources(s), { disabled: !manage || s.lifecycle === 'TERMINATED', reason: 'Requires services:manage and a non-terminated contract' })}
            </ul>
          </Section>
          <Section title="Placement & provider">
            <ul className="grid gap-2">
              {opCard('Migrate to another node', 'Guided workflow with capacity check, compatibility and downtime window.', 'Open wizard', () => ops.migrate(s), { disabled: !manage || !active, reason: why })}
              {opCard('Reconcile with provider', 'Read the server from the provider and compare. Read-only.', 'Reconcile…', () => ops.reconcile(s), { disabled: !manage || s.lifecycle === 'TERMINATED', reason: 'Requires services:manage' })}
              {s.provider.sync === 'unlinked' ? opCard('Relink provider server', 'Search by correlation tag and attach a single match. Never creates.', 'Relink…', () => ops.relink(s), { disabled: !manage }) : null}
            </ul>
          </Section>
          <Section title="Danger zone">
            <ul className="grid gap-2">
              {s.lifecycle === 'TERMINATED' ? opCard('Recover from termination', 'Possible while backups are inside the retention window.', 'Recover…', () => ops.recover(s), { disabled: !manage }) : opCard('Terminate service', 'Delete the server and its data. Cannot be undone after the retention window.', 'Terminate…', () => ops.terminate(s), { variant: 'danger-subtle', disabled: !manage, reason: 'Requires services:manage' })}
            </ul>
          </Section>
          <PreviewNote />
        </div>
      ) : null}

      {tab === 'resources' ? (
        <div className="grid gap-5">
          <Section title="Usage vs limits" description="Measured by Wings. Limits come from the plan unless overridden."><div className="grid gap-4 sm:grid-cols-3"><UsageMeter label="Memory" used={s.usage.memoryMb} limit={s.resources.memoryMb} format={mb} /><UsageMeter label="Disk" used={s.usage.diskMb} limit={s.resources.diskMb} format={mb} /><UsageMeter label="CPU" used={s.usage.cpuPct} limit={s.resources.cpuPct} format={(n) => `${n}%`} /></div><div className="mt-4"><Button size="sm" variant="secondary" disabled={!manage} onClick={() => ops.resources(s)}>Adjust limits…</Button></div></Section>
          <ChartFrame title={range === 'cpu' ? 'CPU, last 48 hours' : 'Memory, last 48 hours'} description="Synthetic sample for the preview; real series come from provider metrics." summary={`${range === 'cpu' ? 'CPU percent' : 'Memory MB'} for ${s.name}, synthetic sample`} height={220} actions={<div className="flex gap-1"><Button size="sm" variant={range === 'cpu' ? 'subtle' : 'ghost'} onClick={() => setRange('cpu')}>CPU</Button><Button size="sm" variant={range === 'ram' ? 'subtle' : 'ghost'} onClick={() => setRange('ram')}>Memory</Button></div>}>
            <TimeSeriesChart kind="area" data={range === 'cpu' ? cpuSeries : ramSeries} xKey="t" series={[{ key: 'v', label: range === 'cpu' ? 'CPU %' : 'Memory MB', color: range === 'cpu' ? 'accent' : 'violet' }]} formatY={(v) => (range === 'cpu' ? `${Math.round(v)}%` : mb(v))} label="Resource usage" />
          </ChartFrame>
          <Section title="Plan limits"><DescriptionList columns={2} items={[{ label: 'Plan', value: `${s.productName} · ${s.planName}` }, { label: 'Memory', value: mb(s.resources.memoryMb) }, { label: 'Disk', value: mb(s.resources.diskMb) }, { label: 'CPU', value: `${s.resources.cpuPct}%` }, { label: 'Databases', value: s.resources.databases }, { label: 'Backups', value: s.resources.backups }]} /></Section>
        </div>
      ) : null}

      {tab === 'provider' ? (
        <div className="grid gap-5">
          <Notice tone="info" title="Two records, two sources of truth">Left is what Fortless has sold and stored. Right is what the provider reports. A timeout from the provider is an unknown outcome, never proof the server is missing.</Notice>
          <Section title="Business record vs provider state" actions={<Button size="sm" variant="secondary" disabled={!manage || s.lifecycle === 'TERMINATED'} onClick={() => ops.reconcile(s)}>Reconcile…</Button>}>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-left text-[14px]"><caption className="sr-only">Business record compared with provider state</caption><thead><tr className="text-ink3"><th scope="col" className="py-2 pr-3 text-[12.5px] font-bold">Field</th><th scope="col" className="px-3 py-2 text-[12.5px] font-bold">Fortless</th><th scope="col" className="px-3 py-2 text-[12.5px] font-bold">Provider</th><th scope="col" className="py-2 pl-3 text-[12.5px] font-bold">Match</th></tr></thead><tbody>{diff.map((d) => <tr key={d.field} className="odd:bg-s2/60"><th scope="row" className="py-2.5 pr-3 pl-2 font-semibold">{d.field}</th><td className="px-3 py-2.5">{d.business}</td><td className="px-3 py-2.5">{d.provider}</td><td className="py-2.5 pl-3"><Badge tone={d.ok ? 'good' : 'warn'}>{d.ok ? 'Match' : 'Differs'}</Badge></td></tr>)}</tbody></table></div>
          </Section>
          <Columns>
            <Section title="Provider identifiers"><DescriptionList items={[{ label: 'Adapter', value: s.provider.type }, { label: 'Server UUID', value: s.provider.serverUuid, mono: true, copy: s.provider.serverUuid }, { label: 'Identifier', value: s.provider.identifier, mono: true }, { label: 'External id', value: s.provider.externalId ?? 'not set', mono: true }, { label: 'Allocation id', value: s.provider.allocationId ?? 'not set', mono: true }, { label: 'Correlation tag', value: s.provider.correlationTag, mono: true, copy: s.provider.correlationTag }]} /></Section>
            <Section title="Sync"><DescriptionList items={[{ label: 'State', value: <Status map={providerSync} value={s.provider.sync} /> }, { label: 'Last sync', value: dateTime(s.provider.lastSyncAt) }, { label: 'Panel', value: 'panel.fortless.example' }]} />{s.provider.sync === 'unlinked' ? <div className="mt-3"><Button size="sm" variant="secondary" disabled={!manage} onClick={() => ops.relink(s)}>Relink…</Button></div> : null}</Section>
          </Columns>
        </div>
      ) : null}

      {tab === 'networking' ? (
        <Columns>
          <Section title="Primary allocation"><DescriptionList items={[{ label: 'Public address', value: `${s.ip}:${s.port}`, mono: true, copy: `${s.ip}:${s.port}` }, { label: 'Node', value: <NodeLink id={s.nodeId} /> }, { label: 'Region', value: REGION_NAMES[s.region] ?? s.region }, { label: 'Protocol', value: 'TCP + UDP' }]} /></Section>
          <Section title="Allocations on this service"><RelatedTable rows={data.ips.filter((i) => i.serviceId === s.id)} getRowId={(i) => i.id} caption="Allocations" empty="No allocation is assigned." columns={[col<IpAllocation>('a', 'Address', (i) => <span className="font-mono text-[13px]">{i.ip}:{i.port}</span>, { primary: true }), col<IpAllocation>('k', 'Kind', (i) => <Badge>{i.kind}</Badge>), col<IpAllocation>('n', 'Node', (i) => <NodeLink id={i.nodeId} />)]} /></Section>
          <Section title="DNS & domains"><Notice tone="warn" title="Not available yet">No DNS provider is connected to the backend, so custom domains and SRV records cannot be managed from here.</Notice></Section>
          <Section title="Firewall"><Notice tone="info">Per-service firewall rules are managed by the node. The backend exposes no firewall API.</Notice></Section>
        </Columns>
      ) : null}

      {tab === 'billing' ? (
        <Split main={<Section title="Invoices for this service"><RelatedTable rows={invoices} getRowId={(i) => i.id} caption="Invoices" onRowClick={(i) => nav(`/billing/invoices/${i.id}`)} empty="No invoices." columns={[col<Invoice>('n', 'Invoice', (i) => <InvoiceLink id={i.id} />, { primary: true, sort: (i) => i.number }), col<Invoice>('st', 'Status', (i) => <Status map={invoiceStatus} value={invoiceKey(i)} />), col<Invoice>('t', 'Total', (i) => <MoneyText value={i.total} />, { numeric: true, sort: (i) => i.total.amount }), col<Invoice>('d', 'Due', (i) => nw(date(i.dueAt)), { sort: (i) => i.dueAt })]} /></Section>}
          aside={<Section title="Subscription">{sub ? <><DescriptionList items={[{ label: 'Status', value: <Status map={subscriptionStatus} value={sub.status} /> }, { label: 'Cycle', value: intervalLabel[sub.interval] ?? sub.interval }, { label: 'Price', value: <MoneyText value={sub.price} /> }, { label: 'Period ends', value: date(sub.currentPeriodEnd) }, { label: 'Failed attempts', value: sub.failedAttempts }]} /><div className="mt-3"><Switch label="Auto-renew" checked={sub.autoRenew} disabled={!can('accounts:manage') || sub.status === 'CANCELED'} onCheckedChange={(v) => { patch('subscriptions', sub.id, { autoRenew: v }); patch('services', s.id, (cur) => ({ billing: { ...cur.billing, autoRenew: v } })); toast({ tone: 'info', title: `Auto-renew ${v ? 'on' : 'off'} (preview)` }); }} description={can('accounts:manage') ? 'Preview only' : 'Requires accounts:manage'} /></div></> : <p className="text-ink3">No subscription.</p>}</Section>} />
      ) : null}

      {tab === 'provisioning' ? (
        <div className="grid gap-5">
          <Section title="Order → payment → job → provider → service"><Timeline events={timeline} label="Provisioning timeline" /></Section>
          <Section title="Jobs"><RelatedTable rows={jobs} getRowId={(j) => j.id} caption="Jobs for this service" onRowClick={(j) => nav(`/provisioning/jobs/${j.id}`)} empty="No jobs." columns={[col<Job>('id', 'Job', (j) => <JobLink id={j.id} />, { primary: true, sort: (j) => j.id }), col<Job>('t', 'Type', (j) => j.type.replace(/_/g, ' ').toLowerCase()), col<Job>('s', 'Status', (j) => <Status map={jobStatus} value={j.status} />, { sort: (j) => j.status }), col<Job>('c', 'Created', (j) => nw(relative(j.createdAt)), { sort: (j) => j.createdAt })]} /></Section>
        </div>
      ) : null}

      {tab === 'diagnostics' ? (
        <Section title="Health checks" description="Computed from the demo data on this page. In production each check is a bounded, read-only probe.">
          <ul className="grid gap-2" aria-label="Diagnostic checks">{checks.map(([l, st, d]) => <li key={l} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3.5 py-3"><span><b>{l}</b><span className="block text-[13px] text-ink2">{d}</span></span><Badge tone={st === 'ok' ? 'good' : st === 'warn' ? 'warn' : 'bad'}>{st === 'ok' ? 'Pass' : st === 'warn' ? 'Review' : 'Fail'}</Badge></li>)}</ul>
        </Section>
      ) : null}

      {tab === 'activity' ? <Section title="Activity" description="Audit events on this service.">{auditTl.length ? <Timeline events={auditTl} label="Service activity" /> : <p className="text-ink3">No audit events recorded for this service.</p>}</Section> : null}

      {tab === 'access' ? (
        <Columns>
          <Section title="Who can access"><DescriptionList items={[{ label: 'Owner account', value: <CustomerLink id={s.customerId} /> }, { label: 'Subusers', value: `${customer.members.length} account member${customer.members.length === 1 ? '' : 's'}` }, { label: 'SFTP host', value: `${node?.fqdn ?? 'node'}:2022`, mono: true }, { label: 'SFTP password', value: 'Not stored or visible' }]} /></Section>
          <Section title="Staff access policy"><Notice tone="info" title="No credentials, no console">Staff can see state, logs excerpts and metrics, and run audited operations. They cannot read customer passwords, SFTP credentials, API keys or open an interactive console on a customer server.</Notice></Section>
        </Columns>
      ) : null}
      {ops.node}
    </AdminPage>
  );
}
