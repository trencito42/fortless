import { Select } from '@/design-system';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { iso } from '../../lib/format';
import type { ActionItem } from '../../types';

/** Acknowledge / assign / resolve for Action Center items. Each change is history on the item and a preview audit event. */
export function useActionOps() {
  const { data, patch, audit } = useAdmin();
  const { staffName } = useSession();
  const dlg = useActionDialog();
  const hist = (a: ActionItem, text: string) => ({ history: [...a.history, { id: `${a.id}_h${a.history.length}`, at: iso(0), actor: staffName, text }] });
  const ent = (a: ActionItem) => ({ type: 'action', id: a.id, label: a.title });
  const acknowledge = (items: ActionItem[]) => { items.forEach((a) => { if (a.status === 'open') { patch('actions', a.id, (c) => ({ status: 'acknowledged' as const, ...hist(c, 'Acknowledged'), assignee: c.assignee ?? staffName })); audit('action.acknowledged', ent(a)); } }); };
  const assignMe = (items: ActionItem[]) => { items.forEach((a) => { patch('actions', a.id, (c) => ({ assignee: staffName, ...hist(c, `Assigned to ${staffName}`) })); audit('action.assigned', ent(a), { after: { assignee: staffName } }); }); };
  const assign = (a: ActionItem) => dlg.run({ title: 'Assign action', confirmLabel: 'Assign', initial: { who: a.assignee ?? staffName }, reasonRequired: false, fields: ({ values, set }) => <Select label="Assignee" value={values['who']} onValueChange={(v) => set('who', v ?? '')} options={data.staff.filter((s) => s.status === 'ACTIVE').map((s) => ({ value: s.name, label: `${s.name} · ${s.role}` }))} />, onConfirm: ({ values }) => { patch('actions', a.id, (c) => ({ assignee: values['who']!, ...hist(c, `Assigned to ${values['who']}`) })); audit('action.assigned', ent(a), { after: { assignee: values['who']! } }); return `Assigned to ${values['who']}`; } });
  const resolve = (items: ActionItem[]) => dlg.run({ title: items.length > 1 ? `Resolve ${items.length} items` : 'Resolve action', description: 'Resolving records that the underlying problem is handled. It does not fix anything by itself: use the linked resource for that.', confirmLabel: 'Mark resolved', reasonRequired: true, reasonLabel: 'Resolution note (kept in history)', onConfirm: ({ reason }) => { items.forEach((a) => { patch('actions', a.id, (c) => ({ status: 'resolved' as const, ...hist(c, `Resolved: ${reason}`) })); audit('action.resolved', ent(a), { reason }); }); return items.length > 1 ? `${items.length} items resolved` : 'Resolved'; } });
  const reopen = (a: ActionItem) => { patch('actions', a.id, (c) => ({ status: 'open' as const, ...hist(c, 'Reopened') })); audit('action.reopened', ent(a)); };
  const addNote = (a: ActionItem, body: string) => { patch('actions', a.id, (c) => ({ notes: [{ id: `${a.id}_n${c.notes.length}`, author: staffName, at: iso(0), body }, ...c.notes], ...hist(c, 'Added a note') })); };
  return { node: dlg.node, acknowledge, assignMe, assign, resolve, reopen, addNote };
}
