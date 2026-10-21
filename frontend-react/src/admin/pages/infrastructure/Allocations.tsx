import { Badge, Button, NumberField, Select } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col } from '../../components/cols';
import { ServiceLink, NodeLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import type { IpAllocation } from '../../types';

export default function Allocations() {
  const { data, add, patch, audit, newId } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const m = can('services:manage');
  const free = data.ips.filter((i) => !i.serviceId && i.kind === 'game');
  const addRange = () => act.run({ title: 'Add allocation range', description: 'Registers extra ports on a node IP. They become orderable immediately.', confirmLabel: 'Add range', permission: 'services:manage', stepUp: true, initial: { node: data.nodes[0]!.id, from: '31000', to: '31009' },
    validate: (v) => ({ ...(Number(v['from']) < 1024 || Number(v['from']) > 65535 ? { from: 'Port must be 1024–65535.' } : {}), ...(Number(v['to']) < Number(v['from']) || Number(v['to']) - Number(v['from']) > 99 ? { to: 'End must be ≥ start, at most 100 ports.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-3"><Select label="Node" value={values['node']} onValueChange={(v) => set('node', v ?? '')} options={data.nodes.map((n) => ({ value: n.id, label: n.name }))} /><NumberField label="From port" value={Number(values['from'])} onValueChange={(v) => set('from', String(v ?? ''))} min={1024} max={65535} error={errors['from']} /><NumberField label="To port" value={Number(values['to'])} onValueChange={(v) => set('to', String(v ?? ''))} min={1024} max={65535} error={errors['to']} /></div>,
    onConfirm: ({ values }) => { const n = data.nodes.find((x) => x.id === values['node'])!; for (let p = Number(values['from']); p <= Number(values['to']); p++) add('ips', { id: newId('alloc'), ip: n.publicIp, port: p, nodeId: n.id, serviceId: null, alias: null, kind: 'game' }, 'end'); audit('infrastructure.allocations_added', { type: 'node', id: n.id, label: n.name }, { after: { range: `${values['from']}-${values['to']}` } }); return `${Number(values['to']) - Number(values['from']) + 1} allocations added`; } });
  const toggleReserve = (a: IpAllocation) => act.run({ title: a.kind === 'reserved' ? 'Release reservation' : 'Reserve allocation', description: a.kind === 'reserved' ? 'Makes the port orderable again.' : 'Keeps the port out of automatic placement.', confirmLabel: a.kind === 'reserved' ? 'Release' : 'Reserve', permission: 'services:manage', reasonRequired: false, onConfirm: () => { patch('ips', a.id, { kind: a.kind === 'reserved' ? 'game' : 'reserved' }); audit('infrastructure.allocation_changed', { type: 'allocation', id: a.id, label: `${a.ip}:${a.port}` }); return 'Allocation updated'; } });
  return (
    <AdminPage title="IPs & allocations" description="Every IP:port the nodes can hand out. An allocation belongs to at most one service; free ones are what new orders consume." actions={<Button variant="secondary" leadingIcon="add-01" disabled={!m} onClick={addRange}>Add range…</Button>}>
      <KpiGrid cols={4} items={[{ label: 'Total allocations', value: data.ips.length }, { label: 'Assigned', value: data.ips.filter((i) => i.serviceId).length }, { label: 'Free to order', value: free.length, hint: 'Kind “game”, not assigned' }, { label: 'Reserved', value: data.ips.filter((i) => i.kind === 'reserved').length }]} />
      <ResourceTable<IpAllocation>
        tableId="allocations" caption="Allocations" rows={data.ips} getRowId={(a) => a.id} rowLabel={(a) => `${a.ip}:${a.port}`} searchText={(a) => `${a.ip}:${a.port} ${a.serviceId ?? ''} ${a.nodeId} ${a.alias ?? ''}`} searchPlaceholder="Search IP, port, service, node" pageSize={20}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'free', label: 'Free', test: (a) => !a.serviceId && a.kind === 'game' }, { value: 'assigned', label: 'Assigned', test: (a) => !!a.serviceId }, { value: 'reserved', label: 'Reserved / system', test: (a) => a.kind !== 'game' }]}
        filters={[{ id: 'node', label: 'Node', options: data.nodes.map((n) => ({ value: n.id, label: n.name })), test: (a, v) => a.nodeId === v }]}
        columns={[
          col<IpAllocation>('a', 'Address', (a) => <span className="font-mono text-[13px] whitespace-nowrap">{a.ip}:{a.port}</span>, { primary: true, sort: (a) => `${a.ip}:${String(a.port).padStart(5, '0')}` }),
          col<IpAllocation>('n', 'Node', (a) => <NodeLink id={a.nodeId} />, { sort: (a) => a.nodeId }),
          col<IpAllocation>('k', 'Kind', (a) => <Badge tone={a.kind === 'game' ? 'neutral' : a.kind === 'reserved' ? 'warn' : 'violet'}>{a.kind}</Badge>, { sort: (a) => a.kind }),
          col<IpAllocation>('s', 'Assigned to', (a) => (a.serviceId ? <ServiceLink id={a.serviceId} /> : a.alias ? <span className="text-ink2">{a.alias}</span> : <span className="text-ink3">free</span>), { sort: (a) => a.serviceId ?? '' }),
        ]}
        rowActions={(a) => [{ id: 'r', label: a.kind === 'reserved' ? 'Release reservation…' : 'Reserve…', icon: 'lock', disabled: !m || !!a.serviceId || a.kind === 'primary', disabledReason: a.serviceId ? 'In use by a service' : a.kind === 'primary' ? 'System allocation' : 'Requires services:manage', onSelect: () => toggleReserve(a) }]}
        empty={{ title: 'No allocations' }}
      />
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
