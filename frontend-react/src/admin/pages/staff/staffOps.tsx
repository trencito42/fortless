import { Select, TextField } from '@/design-system';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession, ROLES, ROLE_PERMISSIONS } from '../../session';
import { iso } from '../../lib/format';
import { ROLE_BLURB } from '../../lib/roles';
import type { StaffMember, StaffRole } from '../../types';

/** Staff membership changes. Rules mirror applyStaffChange(): no self-change, never remove the last active OWNER. Escalations also raise an approval request (planned control). */
export function useStaffOps() {
  const { data, patch, add, audit, newId } = useAdmin();
  const { staffId, staffName } = useSession();
  const dlg = useActionDialog();
  const ent = (s: StaffMember) => ({ type: 'staff_membership', id: s.id, label: s.name });
  const owners = data.staff.filter((s) => s.role === 'OWNER' && s.status === 'ACTIVE');
  const guard = (s: StaffMember, role: StaffRole | 'REVOKED'): string | null => (s.id === staffId ? 'Self-modification is blocked to prevent administrative lockout.' : s.role === 'OWNER' && s.status === 'ACTIVE' && (role !== 'OWNER') && owners.length <= 1 ? 'The final active owner cannot be removed.' : null);
  const escalation = (from: StaffRole, to: StaffRole) => ROLE_PERMISSIONS[to].filter((p) => !ROLE_PERMISSIONS[from].includes(p));

  const changeRole = (s: StaffMember) => dlg.run({
    title: `Change role of ${s.name}`, description: 'Roles are fixed bundles of permissions defined in code. The change takes effect on the person’s next request.', confirmLabel: 'Change role', permission: 'staff:manage', stepUp: true, tone: 'danger', reasonRequired: true, initial: { role: s.role },
    validate: (v) => (v['role'] === s.role ? { role: 'Pick a different role.' } : guard(s, v['role'] as StaffRole) ? { role: guard(s, v['role'] as StaffRole)! } : {}),
    fields: ({ values, set, errors }) => { const add_ = values['role'] && values['role'] !== s.role ? escalation(s.role, values['role'] as StaffRole) : []; return <div className="grid gap-3"><Select label="New role" value={values['role']} error={errors['role']} onValueChange={(v) => set('role', v ?? s.role)} options={ROLES.map((r) => ({ value: r, label: `${r} — ${ROLE_BLURB[r]}` }))} />{add_.length ? <p className="rounded-md bg-warn-bg p-3 text-[13.5px] font-semibold text-warn">Grants {add_.length} permission(s) they do not have now: {add_.join(', ')}. In production this should be approved by a second owner.</p> : null}</div>; },
    onConfirm: ({ values, reason }) => {
      const to = values['role'] as StaffRole; const esc = escalation(s.role, to);
      patch('staff', s.id, { role: to });
      if (esc.length) add('approvals', { id: newId('apr'), kind: 'permission_change', summary: `Grant ${s.role} → ${to} to ${s.name}`, requestedBy: staffName, requestedAt: iso(0), status: 'approved', resource: { type: 'staff', id: s.id, label: s.name, to: `/staff/directory/${s.id}` }, decidedBy: staffName, decidedAt: iso(0), reason: 'Self-approved in preview: the backend has no approval workflow yet.', amount: null });
      audit('staff.membership_changed', ent(s), { reason, before: { role: s.role }, after: { role: to } }); return `${s.name} is now ${to}`;
    },
  });
  const revoke = (s: StaffMember) => dlg.run({ title: `Revoke access for ${s.name}`, description: 'Ends every session and removes admin access. History and audit trail stay.', confirmLabel: 'Revoke access', permission: 'staff:manage', stepUp: true, tone: 'danger', reasonRequired: true, requireText: s.name,
    validate: () => (guard(s, 'REVOKED') ? { reason: guard(s, 'REVOKED')! } : {}),
    onConfirm: ({ reason }) => { patch('staff', s.id, { status: 'REVOKED', sessions: [] }); audit('staff.membership_changed', ent(s), { reason, before: { status: 'ACTIVE' }, after: { status: 'REVOKED' } }); return `${s.name} revoked`; } });
  const reinstate = (s: StaffMember) => dlg.run({ title: `Reinstate ${s.name}`, confirmLabel: 'Reinstate', permission: 'staff:manage', stepUp: true, reasonRequired: true, description: 'Restores access with the previous role. MFA must be set up again at the next sign-in.', onConfirm: ({ reason }) => { patch('staff', s.id, { status: 'ACTIVE' }); audit('staff.membership_changed', ent(s), { reason, after: { status: 'ACTIVE' } }); return `${s.name} reinstated`; } });
  const invite = () => dlg.run({ title: 'Invite staff member', description: 'Sends a one-time invitation. The person sets their own password and MFA; staff never choose passwords for others.', confirmLabel: 'Send invitation', permission: 'staff:manage', stepUp: true, reasonRequired: true, initial: { email: '', name: '', role: 'SUPPORT' },
    validate: (v) => ({ ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['email']!) ? { email: 'Enter a valid email address.' } : data.staff.some((x) => x.email === v['email']) ? { email: 'This person already has staff access.' } : {}), ...(v['name']!.trim().length < 3 ? { name: 'Enter the full name.' } : {}) }),
    fields: ({ values, set, errors }) => <div className="grid gap-3"><TextField label="Full name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} /><TextField label="Work email" type="email" value={values['email']} onChange={(e) => set('email', e.target.value)} error={errors['email']} /><Select label="Role" value={values['role']} onValueChange={(v) => set('role', v ?? 'SUPPORT')} options={ROLES.filter((r) => r !== 'OWNER').map((r) => ({ value: r, label: `${r} — ${ROLE_BLURB[r]}` }))} /></div>,
    onConfirm: ({ values, reason }) => { const st: StaffMember = { id: newId('stf'), name: values['name']!.trim(), email: values['email']!, role: values['role'] as StaffRole, status: 'ACTIVE', mfa: false, lastLoginAt: null, createdAt: iso(0), ipAllowlist: [], sessions: [] }; add('staff', st, 'end'); audit('staff.invited', ent(st), { reason, after: { role: st.role } }); return `Invitation sent to ${st.email}`; } });
  return { node: dlg.node, changeRole, revoke, reinstate, invite, guard };
}
