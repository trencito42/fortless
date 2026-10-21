import { useMemo } from 'react';
import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, lifecycle, providerSync, runtime } from '../../components/status';
import { CustomerLink, EntityLink, NodeLink } from '../../components/entities';
import { MoneyText } from '../../components/Money';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { useActionDialog } from '../../components/ActionDialog';
import { REGION_NAMES } from '../../fixtures/commerce';
import { date, intervalLabel, mb } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';
import type { Service } from '../../types';
import { useServiceOps } from './serviceOps';

export default function ServiceList() {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can } = useSession();
  const ops = useServiceOps();
  const bulk = useActionDialog();
  const rows = data.services;
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const can_ = can('services:manage');
  return (
    <AdminPage title="Services" description="Every provisioned service. The contract (lifecycle) is the business record; runtime is the server process. They change for different reasons and are shown separately.">
      <ResourceTable<Service>
        tableId="services" caption="Services" rows={rows} getRowId={(s) => s.id} rowLabel={(s) => s.name}
        searchText={(s) => `${s.name} ${s.id} ${cust.get(s.customerId) ?? ''} ${s.ip}:${s.port} ${s.productName} ${s.planName} ${s.nodeId} ${s.provider.identifier}`} searchPlaceholder="Search service, customer, IP, node, provider id"
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'ACTIVE', label: 'Active', test: (s) => s.lifecycle === 'ACTIVE' }, { value: 'PAST_DUE', label: 'Past due', test: (s) => s.lifecycle === 'PAST_DUE' }, { value: 'SUSPENDED', label: 'Suspended', test: (s) => s.lifecycle === 'SUSPENDED' }, { value: 'CANCELLED', label: 'Cancelled', test: (s) => s.lifecycle === 'CANCELLED' }, { value: 'TERMINATED', label: 'Terminated', test: (s) => s.lifecycle === 'TERMINATED' }]}
        defaultSegment="ACTIVE"
        filters={[
          { id: 'rt', label: 'Runtime', options: (['running', 'offline', 'starting', 'installing', 'error', 'unknown'] as const).map((r) => ({ value: r, label: runtime[r]!.label })), test: (s, v) => s.runtime === v },
          { id: 'prod', label: 'Product', options: data.products.filter((p) => p.providerType !== 'NONE').map((p) => ({ value: p.id, label: p.name })), test: (s, v) => s.productId === v },
          { id: 'node', label: 'Node', options: data.nodes.map((n) => ({ value: n.id, label: n.name })), test: (s, v) => s.nodeId === v },
          { id: 'reg', label: 'Region', options: Object.entries(REGION_NAMES).map(([k, l]) => ({ value: k, label: l })), test: (s, v) => s.region === v },
          { id: 'sync', label: 'Provider sync', options: (['in_sync', 'drift', 'missing_remote', 'unlinked'] as const).map((r) => ({ value: r, label: providerSync[r]!.label })), test: (s, v) => s.provider.sync === v },
          { id: 'cycle', label: 'Billing cycle', options: Object.entries(intervalLabel).map(([k, l]) => ({ value: k, label: l })), test: (s, v) => s.billing.interval === v },
        ]}
        dateField={{ label: 'Created', get: (s) => s.createdAt }}
        advanced={{ fields: [{ id: 'ram', label: 'RAM (MB)', type: 'number' }, { id: 'price', label: 'Price (major units)', type: 'number' }, { id: 'name', label: 'Service name', type: 'text' }], getValue: (s, f) => (f === 'ram' ? s.resources.memoryMb : f === 'price' ? s.billing.price.amount / 100 : s.name) }}
        onRowClick={(s) => nav(`/services/${s.id}`)}
        columns={[
          col<Service>('name', 'Service', (s) => <span className="grid min-w-[9rem]"><EntityLink to={`/services/${s.id}`}>{s.name}</EntityLink><span className="font-mono text-[12px] text-ink3">{s.id}</span></span>, { sort: (s) => s.name, primary: true }),
          col<Service>('cust', 'Customer', (s) => <span className="block min-w-[8rem]"><CustomerLink id={s.customerId} /></span>, { sort: (s) => cust.get(s.customerId) ?? '' }),
          col<Service>('plan', 'Product · plan', (s) => <span className="grid min-w-[8rem]"><span className="font-semibold">{s.productName}</span><span className="text-[12.5px] text-ink3">{s.planName}</span></span>, { sort: (s) => s.planName }),
          col<Service>('life', 'Contract', (s) => <Status map={lifecycle} value={s.lifecycle} />, { sort: (s) => s.lifecycle }),
          col<Service>('rt', 'Runtime', (s) => <Status map={runtime} value={s.runtime} />, { sort: (s) => s.runtime }),
          col<Service>('node', 'Node', (s) => <span className="grid"><NodeLink id={s.nodeId} /><span className="text-[12.5px] text-ink3">{REGION_NAMES[s.region]}</span></span>, { sort: (s) => s.nodeId }),
          col<Service>('addr', 'Address', (s) => <span className="font-mono text-[13px] whitespace-nowrap">{s.ip}:{s.port}</span>, { hideOnMobile: true }),
          col<Service>('res', 'Resources', (s) => <span className="whitespace-nowrap text-[13px]">{mb(s.resources.memoryMb)} · {s.resources.cpuPct}% · {mb(s.resources.diskMb)}</span>, { sort: (s) => s.resources.memoryMb, hideOnMobile: true }),
          col<Service>('bill', 'Billing', (s) => <span className="grid whitespace-nowrap"><MoneyText value={s.billing.price} /><span className="text-[12.5px] text-ink3">{intervalLabel[s.billing.interval]}</span></span>, { sort: (s) => s.billing.price.amount, numeric: true }),
          col<Service>('renew', 'Renews', (s) => nw(s.billing.nextRenewal ? date(s.billing.nextRenewal) : '—'), { sort: (s) => s.billing.nextRenewal ?? '', hideOnMobile: true }),
          col<Service>('sync', 'Provider', (s) => <Status map={providerSync} value={s.provider.sync} />, { sort: (s) => s.provider.sync, hideOnMobile: true }),
        ]}
        rowActions={(s) => [
          { id: 'open', label: 'Open service', icon: 'arrow-up-right-01', onSelect: () => nav(`/services/${s.id}`) },
          { id: 'ops', label: 'Operations', icon: 'sliders-horizontal', onSelect: () => nav(`/services/${s.id}/operations`) },
          { id: 'sep', kind: 'separator' },
          { id: 'restart', label: 'Restart', icon: 'refresh', disabled: !can_ || s.lifecycle !== 'ACTIVE', disabledReason: !can_ ? 'Requires services:manage' : 'Contract is not active', onSelect: () => ops.power(s, 'restart') },
          s.lifecycle === 'SUSPENDED' ? { id: 'unsusp', label: 'Unsuspend…', icon: 'play', disabled: !can_, onSelect: () => ops.unsuspend(s) } : { id: 'susp', label: 'Suspend…', icon: 'pause', tone: 'danger', disabled: !can_ || s.lifecycle !== 'ACTIVE', disabledReason: !can_ ? 'Requires services:manage' : 'Only active services can be suspended', onSelect: () => ops.suspend(s) },
          { id: 'recon', label: 'Reconcile with provider…', icon: 'arrow-reload-horizontal', disabled: !can_ || s.lifecycle === 'TERMINATED', onSelect: () => ops.reconcile(s) },
        ]}
        bulkActions={(sel) => <>
          <Button size="sm" variant="secondary" disabled={!can_} onClick={() => bulk.run({ title: `Reconcile ${sel.length} services`, description: 'Queues one read-only reconciliation per service. Nothing is written to the provider.', confirmLabel: 'Queue reconciliation', permission: 'services:manage', onConfirm: () => { sel.forEach((s) => { patch('services', s.id, (cur) => ({ provider: { ...cur.provider, lastSyncAt: new Date().toISOString() } })); }); audit('service.bulk_reconcile', { type: 'service', id: `${sel.length} services` }); return `${sel.length} reconciliations queued`; } })}>Reconcile</Button>
          <Button size="sm" variant="danger-subtle" disabled={!can_ || sel.some((s) => s.lifecycle !== 'ACTIVE')} onClick={() => bulk.run({ title: `Suspend ${sel.length} services`, confirmLabel: 'Suspend all', permission: 'services:manage', stepUp: true, tone: 'danger', effects: ['Each service becomes SUSPENDED and is stopped (one job each)'], onConfirm: ({ reason }) => { sel.forEach((s) => { patch('services', s.id, { lifecycle: 'SUSPENDED', runtime: 'offline' }); audit('service.suspended', { type: 'service', id: s.id, label: s.name }, { accountId: s.customerId, reason }); }); return `${sel.length} services suspended`; } })}>Suspend…</Button>
          <Button size="sm" variant="secondary" onClick={() => { downloadCsv('services-demo.csv', ['id', 'name', 'customer', 'plan', 'lifecycle', 'runtime', 'node'], sel.map((s) => [s.id, s.name, cust.get(s.customerId), s.planName, s.lifecycle, s.runtime, s.nodeId])); toast({ tone: 'info', title: 'CSV downloaded', description: 'Contains synthetic demo rows.' }); }}>Export CSV</Button>
        </>}
        toolbar={<Badge tone="neutral">{data.services.filter((s) => s.provider.sync !== 'in_sync' && s.lifecycle !== 'TERMINATED').length} need provider review</Badge>}
        empty={{ title: 'No services', description: 'Services are created by provisioning after a paid order.' }}
      />
      {ops.node}{bulk.node}
    </AdminPage>
  );
}
