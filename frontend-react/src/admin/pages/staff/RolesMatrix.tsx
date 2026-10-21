import { Fragment, useState } from 'react';
import { Badge, Icon, Notice, SegmentedControl } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { ROLES, ROLE_PERMISSIONS } from '../../session';
import { ROLE_BLURB } from '../../lib/roles';
import type { StaffPermission } from '../../types';

const GROUPS: Array<{ title: string; items: Array<[StaffPermission, string]> }> = [
  { title: 'Access', items: [['admin:access', 'Open the admin console']] },
  { title: 'Customers & billing', items: [['accounts:read', 'View accounts, orders, invoices, payments'], ['accounts:manage', 'Edit accounts, notes, billing profile; refunds; reprocess payment events']] },
  { title: 'Services & infrastructure', items: [['services:read', 'View services, nodes, capacity'], ['services:manage', 'Power, suspend, terminate, maintenance, incidents, SMTP and email templates']] },
  { title: 'Support', items: [['tickets:read', 'View tickets and support settings'], ['tickets:manage', 'Reply, route, departments, macros']] },
  { title: 'Catalog', items: [['catalog:read', 'View products, plans, coupons, inventory'], ['catalog:manage', 'Create and publish products, plans, coupons']] },
  { title: 'Content', items: [['content:read', 'View articles and announcements'], ['content:manage', 'Edit knowledge base and announcements']] },
  { title: 'Governance', items: [['audit:read', 'Read audit log, jobs, export (step-up)'], ['staff:read', 'View staff'], ['staff:manage', 'Invite, change roles, revoke']] },
];
const PLANNED: Array<[string, string, string]> = [
  ['billing:refund', 'Issue refunds up to a limit', 'Today covered by accounts:manage, so BILLING cannot refund at all'],
  ['billing:refund_large', 'Approve refunds above the threshold', 'Needs a second-approver workflow'],
  ['services:terminate', 'Terminate services', 'Today part of services:manage'],
  ['audit:export', 'Export the audit log', 'Today audit:read plus step-up'],
  ['settings:payments', 'Change payment provider settings', 'Settings are environment-managed; no UI permission exists'],
  ['accounts:impersonate', 'Act as a customer', 'Deliberately never provided'],
];

export default function RolesMatrix() {
  const { data } = useAdmin();
  const [view, setView] = useState<'matrix' | 'role'>('matrix');
  const [role, setRole] = useState(ROLES[0]!);
  const count = (r: string) => data.staff.filter((s) => s.role === r && s.status === 'ACTIVE').length;
  return (
    <AdminPage title="Roles & permissions" description="Who can do what. The backend maps each role to a fixed list of permissions; every endpoint checks the permission server-side, and the interface only mirrors it.">
      <Notice tone="info" title="Read-only by design">Roles are defined in code and changed through a reviewed release. Granular permissions below are planned and are not enforced today.</Notice>
      <div><SegmentedControl aria-label="Matrix view" size="sm" value={view} onValueChange={setView} options={[{ value: 'matrix', label: 'All roles' }, { value: 'role', label: 'One role' }]} /></div>
      {view === 'matrix' ? (
        <Section title="Permission matrix">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><caption className="sr-only">Permissions granted to each role</caption>
            <thead><tr className="text-ink3"><th scope="col" className="py-2 pr-3 text-[12.5px] font-bold">Permission</th>{ROLES.map((r) => <th key={r} scope="col" className="px-2 py-2 text-center text-[12.5px] font-bold"><span className="block">{r}</span><span className="block font-semibold">{count(r)} active</span></th>)}</tr></thead>
            <tbody>{GROUPS.map((g) => <Fragment key={g.title}>
              <tr><th scope="rowgroup" colSpan={7} className="bg-s2 px-2 py-1.5 text-[12px] font-bold text-ink3">{g.title}</th></tr>
              {g.items.map(([p, d]) => <tr key={p} className="odd:bg-s2/40"><th scope="row" className="py-2.5 pr-3 pl-2"><span className="block font-mono text-[13px] font-bold">{p}</span><span className="block text-[12.5px] font-medium text-ink3">{d}</span></th>{ROLES.map((r) => { const on = ROLE_PERMISSIONS[r].includes(p); return <td key={r} className="px-2 py-2.5 text-center">{on ? <Icon name="tick-02" size={18} className="mx-auto text-good" label={`${r} has ${p}`} /> : <span aria-label={`${r} lacks ${p}`} className="text-ink3">—</span>}</td>; })}</tr>)}
            </Fragment>)}</tbody></table></div>
        </Section>
      ) : (
        <Section title="Role" actions={<SegmentedControl aria-label="Role" size="sm" value={role} onValueChange={(v) => setRole(v)} options={ROLES.slice(0, 3).map((r) => ({ value: r, label: r }))} />}>
          <div className="mb-3 flex flex-wrap gap-1.5">{ROLES.map((r) => <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} className={cn('rounded-full px-3 py-1.5 text-[13px] font-bold', role === r ? 'bg-accent text-on-accent' : 'bg-s3 text-ink2 hover:bg-s4')}>{r}</button>)}</div>
          <p className="mb-3 text-ink2"><b>{role}</b>: {ROLE_BLURB[role]}. {count(role)} active member(s): {data.staff.filter((s) => s.role === role && s.status === 'ACTIVE').map((s) => s.name).join(', ') || 'none'}.</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">{ROLE_PERMISSIONS.OWNER.map((p) => <li key={p} className={cn('flex items-center justify-between gap-2 rounded-md px-3 py-2', ROLE_PERMISSIONS[role].includes(p) ? 'bg-good-bg text-good' : 'bg-s2 text-ink3')}><span className="font-mono text-[13px] font-bold">{p}</span><span className="text-[12.5px] font-bold">{ROLE_PERMISSIONS[role].includes(p) ? 'Allowed' : 'Denied'}</span></li>)}</ul>
        </Section>
      )}
      <Section title="Planned granular permissions" description="Not in the backend. Shown so the model can be reviewed before it is built."><ul className="grid gap-2">{PLANNED.map(([p, d, n]) => <li key={p} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-s2 px-3 py-2.5"><span><span className="font-mono text-[13px] font-bold">{p}</span><span className="block text-[13.5px]">{d}</span><span className="block text-[12.5px] text-ink3">{n}</span></span><Badge tone="warn">Not enforced</Badge></li>)}</ul></Section>
      <PreviewNote>Use “View as role” in the profile menu to see how each role changes navigation and which buttons are disabled.</PreviewNote>
    </AdminPage>
  );
}
