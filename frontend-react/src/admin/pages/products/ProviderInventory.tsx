import { useState } from 'react';
import { Badge, Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { Status, connectionHealth, nodeHealth } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { EntityLink } from '../../components/entities';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { REGION_NAMES } from '../../fixtures/commerce';
import { iso, relative } from '../../lib/format';
import type { InfraNode, ProviderEgg } from '../../types';

export default function ProviderInventory() {
  const { data, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const conn = data.connections.find((c) => c.id === 'conn_ptero')!;
  const sync = () => act.run({ title: 'Sync inventory from Pterodactyl', description: 'Read-only: lists nests, eggs, nodes and allocations through the application API and compares them with Fortless plans.', confirmLabel: 'Sync now', permission: 'catalog:read', effects: ['GET nests, eggs, nodes, allocations (no writes)', 'Flag plans whose egg or image no longer exists', 'Never create or delete anything at the provider'], onConfirm: () => { setSyncedAt(iso(0)); audit('catalog.inventory_synced', { type: 'connection', id: conn.id, label: conn.name }); return 'Inventory synced (simulated)'; } });
  return (
    <AdminPage title="Provider inventory" description="What the Pterodactyl panel offers and how Fortless plans map to it. Read-only: Fortless never edits eggs or nodes here." actions={<Button variant="secondary" leadingIcon="refresh" onClick={sync} disabled={!can('catalog:read')}>Sync inventory…</Button>}>
      <KpiGrid cols={4} items={[{ label: 'Panel connection', value: <Status map={connectionHealth} value={conn.health} />, icon: 'plug-01', hint: `Last sync ${relative(syncedAt ?? conn.lastSyncAt)}` }, { label: 'Eggs', value: data.eggs.length, icon: 'layers-01', hint: `${data.eggs.filter((e) => e.mappedPlans.length).length} mapped to plans` }, { label: 'Nodes', value: data.nodes.length, icon: 'cpu', hint: `${data.nodes.filter((n) => n.health === 'healthy').length} healthy` }, { label: 'Locations', value: Object.keys(REGION_NAMES).length, icon: 'location-01' }]} />
      {data.eggs.some((e) => !e.compatible) ? <Notice tone="warn" title="Unmapped or incompatible eggs">{data.eggs.filter((e) => !e.compatible).map((e) => e.name).join(', ')} cannot be used by any plan right now. See the notes in the table.</Notice> : null}
      <Section title="Eggs & templates">
        <RelatedTable rows={data.eggs} getRowId={(e) => String(e.id)} caption="Provider eggs" pageSize={10} columns={[
          col<ProviderEgg>('n', 'Egg', (e) => <span className="grid"><b>{e.name}</b><span className="text-[12.5px] text-ink3">{e.nest} · #{e.id}</span></span>, { primary: true, sort: (e) => e.name }),
          col<ProviderEgg>('i', 'Docker image', (e) => <span className="font-mono text-[12.5px] break-all">{e.dockerImage}</span>, { hideOnMobile: true }),
          col<ProviderEgg>('m', 'Mapped plans', (e) => (e.mappedPlans.length ? <span className="flex flex-wrap gap-1">{e.mappedPlans.map((p) => <EntityLink key={p} to={`/products/plans/${p}`}>{data.plans.find((x) => x.id === p)?.name ?? p}</EntityLink>)}</span> : <span className="text-ink3">none</span>)),
          col<ProviderEgg>('c', 'Compatibility', (e) => <span className="grid"><Badge tone={e.compatible ? 'good' : 'warn'}>{e.compatible ? 'Compatible' : 'Needs review'}</Badge>{e.note ? <span className="mt-1 text-[12.5px] text-ink3">{e.note}</span> : null}</span>),
        ]} />
      </Section>
      <Columns>
        <Section title="Nodes & locations"><RelatedTable rows={data.nodes} getRowId={(n) => n.id} caption="Provider nodes" pageSize={8} columns={[col<InfraNode>('n', 'Node', (n) => <EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink>, { primary: true }), col<InfraNode>('r', 'Location', (n) => REGION_NAMES[n.region]), col<InfraNode>('h', 'State', (n) => <Status map={nodeHealth} value={n.health} />), col<InfraNode>('a', 'Accepting orders', (n) => <Badge tone={n.maintenance.enabled ? 'warn' : 'good'}>{n.maintenance.enabled ? 'No (maintenance)' : 'Yes'}</Badge>)]} /></Section>
        <Section title="Plan availability by region"><RelatedTable rows={data.plans.filter((p) => p.status === 'ACTIVE')} getRowId={(p) => p.id} caption="Active plans by region" pageSize={8} columns={[col<typeof data.plans[number]>('p', 'Plan', (p) => <EntityLink to={`/products/plans/${p.id}`}>{p.name}</EntityLink>, { primary: true }), col<typeof data.plans[number]>('r', 'Regions', (p) => p.regions.map((r) => r.toUpperCase()).join(' · ')), col<typeof data.plans[number]>('o', 'Orderable now', (p) => p.regions.filter((r) => data.nodes.some((n) => n.region === r && !n.maintenance.enabled && n.health !== 'offline')).length + ' of ' + p.regions.length)]} /></Section>
      </Columns>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
