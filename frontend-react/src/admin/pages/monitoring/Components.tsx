import { Badge, Button, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, componentHealth } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { relative } from '../../lib/format';
import type { StatusComponent } from '../../types';
import { useComponentOps } from './monitoringOps';

export default function Components() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const toast = useToast();
  const ops = useComponentOps();
  const m = can('services:manage');
  return (
    <AdminPage title="Component health" description="Every component the platform depends on. Health is measured or set by staff; it is independent from incident messages.">
      <ResourceTable<StatusComponent>
        tableId="components" caption="Components" rows={data.components} getRowId={(c) => c.id} rowLabel={(c) => c.name} searchText={(c) => `${c.name} ${c.group} ${c.description}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'issues', label: 'Not operational', test: (c) => c.health !== 'operational' }, { value: 'public', label: 'Public', test: (c) => c.public }, { value: 'internal', label: 'Internal only', test: (c) => !c.public }]}
        filters={[{ id: 'g', label: 'Group', options: [...new Set(data.components.map((c) => c.group))].map((g) => ({ value: g, label: g })), test: (c, v) => c.group === v }]}
        columns={[
          col<StatusComponent>('n', 'Component', (c) => <span className="grid min-w-[12rem]"><b>{c.name}</b><span className="text-[12.5px] text-ink3">{c.description}</span></span>, { primary: true, sort: (c) => c.name }),
          col<StatusComponent>('g', 'Group', (c) => c.group, { sort: (c) => c.group }),
          col<StatusComponent>('h', 'Health', (c) => <Status map={componentHealth} value={c.health} />, { sort: (c) => c.health }),
          col<StatusComponent>('u', '30-day uptime', (c) => `${c.uptime30d.toFixed(2)}%`, { numeric: true, sort: (c) => c.uptime30d }),
          col<StatusComponent>('l', 'Latency', (c) => (c.latencyMs != null ? `${c.latencyMs} ms` : '—'), { numeric: true, sort: (c) => c.latencyMs ?? -1, hideOnMobile: true }),
          col<StatusComponent>('c', 'Checked', (c) => nw(relative(c.checkedAt)), { hideOnMobile: true }),
          col<StatusComponent>('p', 'Public', (c) => <Switch hideLabel label={`Show ${c.name} on the public page`} checked={c.public} disabled={!m} onCheckedChange={(v) => { patch('components', c.id, { public: v }); audit('status.component_visibility', { type: 'component', id: c.id, label: c.name }, { after: { public: String(v) } }); toast({ tone: 'info', title: `${c.name} ${v ? 'is now public' : 'is now internal only'} (preview)` }); }} />, { sort: (c) => String(c.public) }),
          col<StatusComponent>('a', 'Set health', (c) => <Button size="sm" variant="ghost" disabled={!m} onClick={() => ops.setHealth(c)}>Set…</Button>),
        ]}
        empty={{ title: 'No components' }}
      />
      <PreviewNote><Badge tone="info">Tip</Badge> Setting a node component to “Under maintenance” does not put the node in maintenance, and vice versa. They are announced and operated separately.</PreviewNote>
      {ops.node}
    </AdminPage>
  );
}
