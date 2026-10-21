import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { iso } from '../../lib/format';
import type { Ticket, TicketPriority, TicketStatus } from '../../types';

export const SLA_LABEL = (t: Ticket, now = Date.parse('2026-10-21T09:30:00Z')) => {
  if (t.firstResponseAt) return { state: Date.parse(t.firstResponseAt) <= Date.parse(t.firstResponseDueAt) ? 'met' : 'missed', text: Date.parse(t.firstResponseAt) <= Date.parse(t.firstResponseDueAt) ? 'First response on time' : 'First response late' } as const;
  if (t.status === 'closed' || t.status === 'resolved') return { state: 'na', text: 'Closed without response' } as const;
  const left = Math.round((Date.parse(t.firstResponseDueAt) - now) / 60000);
  return left < 0 ? { state: 'breached', text: `Overdue by ${Math.abs(left) >= 120 ? `${Math.round(Math.abs(left) / 60)} h` : `${Math.abs(left)} min`}` } as const : { state: 'running', text: `Due in ${left >= 120 ? `${Math.round(left / 60)} h` : `${left} min`}` } as const;
};

/** Ticket property changes. Each writes a preview audit event; none sends mail. */
export function useTicketOps() {
  const { data, patch, audit, newId } = useAdmin();
  const { staffId, staffName, can } = useSession();
  const toast = useToast();
  const ent = (t: Ticket) => ({ type: 'ticket', id: t.id, label: t.subject });
  const m = can('tickets:manage');
  const setStatus = (ts: Ticket[], status: TicketStatus) => { ts.forEach((t) => { patch('tickets', t.id, { status, updatedAt: iso(0) }); audit('ticket.status_changed', ent(t), { accountId: t.customerId, before: { status: t.status }, after: { status } }); }); toast({ tone: 'good', title: `${ts.length > 1 ? `${ts.length} tickets` : ts[0]!.id} → ${status.replace('_', ' ')} (preview)` }); };
  const setPriority = (t: Ticket, priority: TicketPriority) => { patch('tickets', t.id, { priority }); audit('ticket.priority_changed', ent(t), { accountId: t.customerId, before: { priority: t.priority }, after: { priority } }); toast({ tone: 'info', title: `Priority: ${priority} (preview)` }); };
  const assign = (ts: Ticket[], staffIdNew: string | null) => { ts.forEach((t) => { patch('tickets', t.id, { assigneeId: staffIdNew, updatedAt: iso(0) }); audit('ticket.assigned', ent(t), { accountId: t.customerId, after: { assignee: data.staff.find((s) => s.id === staffIdNew)?.name ?? 'nobody' } }); }); toast({ tone: 'good', title: `${ts.length > 1 ? `${ts.length} tickets` : ts[0]!.id} ${staffIdNew ? 'assigned' : 'unassigned'} (preview)` }); };
  const setDepartment = (t: Ticket, departmentId: string) => { patch('tickets', t.id, { departmentId }); audit('ticket.department_changed', ent(t), { accountId: t.customerId, after: { department: data.departments.find((d) => d.id === departmentId)?.name ?? departmentId } }); toast({ tone: 'info', title: 'Department changed (preview)' }); };
  const reply = (t: Ticket, body: string, internal: boolean, nextStatus?: TicketStatus, attachments: { name: string; size: number }[] = []) => {
    patch('tickets', t.id, (c) => ({ messages: [...c.messages, { id: newId('tm'), author: internal ? 'internal' as const : 'staff' as const, name: staffName, at: iso(0), body, attachments }], updatedAt: iso(0), firstResponseAt: c.firstResponseAt ?? (internal ? null : iso(0)), status: nextStatus ?? (internal ? c.status : 'waiting_customer' as const), assigneeId: c.assigneeId ?? staffId }));
    audit(internal ? 'ticket.note_added' : 'ticket.replied', ent(t), { accountId: t.customerId });
    toast({ tone: 'good', title: internal ? 'Internal note added' : 'Reply recorded (preview)', description: internal ? undefined : 'No email was sent to the customer.' });
  };
  return { m, setStatus, setPriority, assign, setDepartment, reply };
}
