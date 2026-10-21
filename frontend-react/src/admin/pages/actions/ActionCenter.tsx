import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, actionStatus, priority } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { ageMinutes, relative, title } from '../../lib/format';
import type { ActionItem } from '../../types';
import { useActionOps } from './actionOps';

const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const ageLabel = (iso: string) => { const m = ageMinutes(iso); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

export default function ActionCenter() {
  const { data } = useAdmin();
  const nav = useNav();
  const { staffName } = useSession();
  const ops = useActionOps();
  const open = data.actions.filter((a) => a.status !== 'resolved');
  const seg = (v: string, label: string, test: (a: ActionItem) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Action Center" description="One queue for everything that needs a human: failed provisioning, stuck jobs, webhooks, unreconciled payments, urgent tickets, node and capacity problems, security and email failures.">
      <KpiGrid cols={4} items={[
        { label: 'Critical', value: open.filter((a) => a.priority === 'critical').length, icon: 'alert-circle', hint: 'Customer-visible or money at risk' },
        { label: 'Unassigned', value: open.filter((a) => !a.assignee).length, icon: 'user', hint: 'Nobody owns these yet' },
        { label: 'Assigned to me', value: open.filter((a) => a.assignee === staffName).length, icon: 'user-circle', hint: staffName },
        { label: 'Oldest open', value: open.length ? ageLabel(open.reduce((m, a) => (a.createdAt < m ? a.createdAt : m), open[0]!.createdAt)) : '—', icon: 'clock-01', hint: 'Time since it was raised' },
      ]} />
      <ResourceTable<ActionItem>
        tableId="actions" caption="Action items" rows={data.actions} getRowId={(a) => a.id} rowLabel={(a) => a.title}
        searchText={(a) => `${a.title} ${a.detail} ${a.resource.label} ${a.assignee ?? ''} ${a.category}`} searchPlaceholder="Search title, resource, assignee"
        segments={[seg('open', 'Open', (a) => a.status === 'open'), seg('active', 'Open + acknowledged', (a) => a.status !== 'resolved'), seg('mine', 'Mine', (a) => a.assignee === staffName && a.status !== 'resolved'), seg('unassigned', 'Unassigned', (a) => !a.assignee && a.status !== 'resolved'), seg('acknowledged', 'Acknowledged', (a) => a.status === 'acknowledged'), seg('resolved', 'Resolved', (a) => a.status === 'resolved'), seg('all', 'All', () => true)]}
        defaultSegment="active"
        filters={[
          { id: 'pr', label: 'Priority', options: (['critical', 'high', 'medium', 'low'] as const).map((p) => ({ value: p, label: title(p) })), test: (a, v) => a.priority === v },
          { id: 'cat', label: 'Category', options: ['provisioning', 'jobs', 'webhooks', 'payments', 'support', 'nodes', 'capacity', 'security', 'email'].map((c) => ({ value: c, label: title(c) })), test: (a, v) => a.category === v },
          { id: 'as', label: 'Assignee', options: [{ value: 'none', label: 'Unassigned' }, ...data.staff.filter((s) => s.status === 'ACTIVE').map((s) => ({ value: s.name, label: s.name }))], test: (a, v) => (v === 'none' ? !a.assignee : a.assignee === v) },
        ]}
        dateField={{ label: 'Raised', get: (a) => a.createdAt }}
        onRowClick={(a) => nav(`/actions/${a.id}`)}
        columns={[
          col<ActionItem>('pr', 'Priority', (a) => <Status map={priority} value={a.priority} />, { sort: (a) => order[a.priority] }),
          col<ActionItem>('t', 'Issue', (a) => <span className="grid min-w-[16rem] max-w-[34rem]"><EntityLink to={`/actions/${a.id}`}>{a.title}</EntityLink><span className="line-clamp-2 text-[12.5px] font-medium text-ink3">{a.detail}</span></span>, { primary: true, sort: (a) => a.title }),
          col<ActionItem>('c', 'Category', (a) => <Badge>{title(a.category)}</Badge>, { sort: (a) => a.category }),
          col<ActionItem>('r', 'Resource', (a) => <EntityLink to={a.resource.to}>{a.resource.label}</EntityLink>, { hideOnMobile: true }),
          col<ActionItem>('a', 'Assignee', (a) => a.assignee ?? <span className="text-ink3">Unassigned</span>, { sort: (a) => a.assignee ?? '~' }),
          col<ActionItem>('age', 'Age', (a) => <span title={relative(a.createdAt)}>{nw(ageLabel(a.createdAt))}</span>, { sort: (a) => a.createdAt, numeric: true }),
          col<ActionItem>('s', 'Status', (a) => <Status map={actionStatus} value={a.status} />, { sort: (a) => a.status }),
        ]}
        rowActions={(a) => [
          { id: 'open', label: 'Open details', icon: 'arrow-up-right-01', onSelect: () => nav(`/actions/${a.id}`) },
          { id: 'res', label: 'Open resource', icon: 'link-01', onSelect: () => nav(a.resource.to) },
          { id: 'sep', kind: 'separator' },
          { id: 'ack', label: 'Acknowledge', icon: 'tick-02', disabled: a.status !== 'open', onSelect: () => ops.acknowledge([a]) },
          { id: 'me', label: 'Assign to me', icon: 'user', onSelect: () => ops.assignMe([a]) },
          { id: 'as', label: 'Assign to…', icon: 'user-add-01', onSelect: () => ops.assign(a) },
          { id: 'res2', label: a.status === 'resolved' ? 'Reopen' : 'Resolve…', icon: 'checkmark-circle-02', onSelect: () => (a.status === 'resolved' ? ops.reopen(a) : ops.resolve([a])) },
        ]}
        bulkActions={(sel) => <><Button size="sm" variant="secondary" onClick={() => ops.acknowledge(sel)}>Acknowledge</Button><Button size="sm" variant="secondary" onClick={() => ops.assignMe(sel)}>Assign to me</Button><Button size="sm" variant="secondary" onClick={() => ops.resolve(sel)}>Resolve…</Button></>}
        empty={{ title: 'All clear', description: 'Nothing needs attention right now.' }}
      />
      <PreviewNote>Items are derived from the demo data (failed orders, jobs, webhooks, payments, tickets, nodes). Acknowledge, assign and resolve only change this queue; they do not touch the underlying resource.</PreviewNote>
      {ops.node}
    </AdminPage>
  );
}
