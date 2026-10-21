import { useMemo } from 'react';
import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, priority as prioMap, ticketStatus } from '../../components/status';
import { CustomerLink, StaffName, TicketLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { relative } from '../../lib/format';
import type { Ticket } from '../../types';
import { SLA_LABEL, useTicketOps } from './ticketOps';

const prio = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export default function Inbox() {
  const { data } = useAdmin();
  const nav = useNav();
  const { staffId } = useSession();
  const ops = useTicketOps();
  const cust = useMemo(() => new Map(data.customers.map((c) => [c.id, c.name])), [data.customers]);
  const dep = useMemo(() => new Map(data.departments.map((d) => [d.id, d.name])), [data.departments]);
  const seg = (v: string, label: string, test: (t: Ticket) => boolean) => ({ value: v, label, test });
  const activeT = (t: Ticket) => t.status !== 'closed' && t.status !== 'resolved';
  const breached = data.tickets.filter((t) => SLA_LABEL(t).state === 'breached').length;
  return (
    <AdminPage title="Support inbox" description="Every customer conversation. First-response targets come from the department; the clock stops at the first staff reply.">
      <KpiGrid cols={4} items={[{ label: 'Open queue', value: data.tickets.filter((t) => t.status === 'open' || t.status === 'waiting_staff').length, icon: 'inbox', hint: 'Waiting on us' }, { label: 'Unassigned', value: data.tickets.filter((t) => !t.assigneeId && activeT(t)).length, icon: 'user', hint: `${data.tickets.filter((t) => !t.assigneeId && activeT(t) && t.priority === 'urgent').length} urgent` }, { label: 'First response overdue', value: breached, icon: 'clock-01', hint: 'Unanswered past the target' }, { label: 'Waiting on customer', value: data.tickets.filter((t) => t.status === 'waiting_customer').length, icon: 'hourglass' }]} />
      <ResourceTable<Ticket>
        tableId="tickets" caption="Tickets" rows={data.tickets} getRowId={(t) => t.id} rowLabel={(t) => `${t.id} ${t.subject}`}
        searchText={(t) => `${t.id} ${t.subject} ${cust.get(t.customerId) ?? ''} ${t.requester} ${t.tags.join(' ')} ${t.messages.map((m) => m.body).join(' ')}`} searchPlaceholder="Search subject, customer, tag, message text"
        segments={[seg('all', 'All', () => true), seg('unassigned', 'Unassigned', (t) => !t.assigneeId && activeT(t)), seg('mine', 'Mine', (t) => t.assigneeId === staffId && activeT(t)), seg('open', 'Open', (t) => t.status === 'open'), seg('waiting_customer', 'Waiting customer', (t) => t.status === 'waiting_customer'), seg('waiting_staff', 'Waiting staff', (t) => t.status === 'waiting_staff'), seg('resolved', 'Resolved', (t) => t.status === 'resolved'), seg('closed', 'Closed', (t) => t.status === 'closed')]}
        defaultSegment="all"
        filters={[{ id: 'dep', label: 'Department', options: data.departments.map((d) => ({ value: d.id, label: d.name })), test: (t, v) => t.departmentId === v }, { id: 'pr', label: 'Priority', options: (['urgent', 'high', 'normal', 'low'] as const).map((p) => ({ value: p, label: p })), test: (t, v) => t.priority === v }, { id: 'as', label: 'Assignee', options: data.staff.filter((s) => s.status === 'ACTIVE').map((s) => ({ value: s.id, label: s.name })), test: (t, v) => t.assigneeId === v }, { id: 'sla', label: 'SLA', options: [{ value: 'breached', label: 'Overdue' }, { value: 'running', label: 'Running' }, { value: 'missed', label: 'Answered late' }], test: (t, v) => SLA_LABEL(t).state === v }]}
        dateField={{ label: 'Updated', get: (t) => t.updatedAt }}
        onRowClick={(t) => nav(`/support/tickets/${t.id}`)} pageSize={20}
        columns={[
          col<Ticket>('p', 'Priority', (t) => <Status map={prioMap} value={t.priority} />, { sort: (t) => prio[t.priority] }),
          col<Ticket>('s', 'Ticket', (t) => <span className="grid md:min-w-[14rem] max-w-[30rem]"><span className="line-clamp-1 font-bold">{t.subject}</span><span className="flex items-center gap-1.5 text-[12.5px] text-ink3"><TicketLink id={t.id} />{t.tags.slice(0, 2).map((x) => <Badge key={x}>{x}</Badge>)}</span></span>, { primary: true, sort: (t) => t.subject }),
          col<Ticket>('c', 'Customer', (t) => <span className="block md:min-w-[8rem]"><CustomerLink id={t.customerId} /></span>, { sort: (t) => cust.get(t.customerId) ?? '' }),
          col<Ticket>('st', 'Status', (t) => <Status map={ticketStatus} value={t.status} />, { sort: (t) => t.status }),
          col<Ticket>('d', 'Department', (t) => dep.get(t.departmentId), { sort: (t) => dep.get(t.departmentId) ?? '', hideOnMobile: true }),
          col<Ticket>('a', 'Assignee', (t) => <StaffName id={t.assigneeId} />, { sort: (t) => t.assigneeId ?? '~' }),
          col<Ticket>('sla', 'First response', (t) => { const s = SLA_LABEL(t); return <Badge tone={s.state === 'breached' || s.state === 'missed' ? 'bad' : s.state === 'running' ? 'info' : 'neutral'}>{s.text}</Badge>; }, { hideOnMobile: true }),
          col<Ticket>('u', 'Updated', (t) => nw(relative(t.updatedAt)), { sort: (t) => t.updatedAt }),
        ]}
        rowActions={(t) => [{ id: 'open', label: 'Open conversation', icon: 'arrow-up-right-01', onSelect: () => nav(`/support/tickets/${t.id}`) }, { id: 'me', label: 'Assign to me', icon: 'user', disabled: !ops.m, onSelect: () => ops.assign([t], staffId) }, { id: 'res', label: 'Mark resolved', icon: 'checkmark-circle-02', disabled: !ops.m || t.status === 'resolved' || t.status === 'closed', onSelect: () => ops.setStatus([t], 'resolved') }]}
        bulkActions={(sel) => <><Button size="sm" variant="secondary" disabled={!ops.m} onClick={() => ops.assign(sel, staffId)}>Assign to me</Button><Button size="sm" variant="secondary" disabled={!ops.m} onClick={() => ops.setStatus(sel, 'resolved')}>Resolve</Button><Button size="sm" variant="secondary" disabled={!ops.m} onClick={() => ops.setStatus(sel, 'closed')}>Close</Button></>}
        empty={{ title: 'Inbox zero', description: 'No tickets match.' }}
      />
      <PreviewNote>Replies and status changes are recorded in this browser tab only; no email is sent.</PreviewNote>
    </AdminPage>
  );
}
