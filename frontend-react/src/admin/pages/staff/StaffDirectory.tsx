import { useEffect, useState } from 'react';
import { Badge, Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, staffStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useAdminRouter, useNav } from '../../router';
import { useSession } from '../../session';
import { relative } from '../../lib/format';
import type { StaffMember } from '../../types';
import { useStaffOps } from './staffOps';

export default function StaffDirectory() {
  const { data } = useAdmin();
  const nav = useNav();
  const { search } = useAdminRouter();
  const { can, staffId } = useSession();
  const ops = useStaffOps();
  const [started, setStarted] = useState(false);
  const m = can('staff:manage');
  // Opens the invite dialog once when arriving from a quick action (?invite=1).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (search.get('invite') === '1' && !started && m) { setStarted(true); ops.invite(); } }, [search, m]);
  const active = data.staff.filter((s) => s.status === 'ACTIVE');
  return (
    <AdminPage title="Staff directory" description="People with admin access. Roles are fixed permission bundles; MFA and step-up protect sensitive actions." actions={<Button variant="primary" leadingIcon="user-add-01" disabled={!m} onClick={ops.invite} title={!m ? 'Requires staff:manage' : undefined}>Invite staff…</Button>}>
      <KpiGrid cols={4} items={[{ label: 'Active staff', value: active.length, icon: 'shield-user' }, { label: 'MFA enabled', value: `${active.filter((s) => s.mfa).length} of ${active.length}`, icon: 'finger-print-scan', hint: active.some((s) => !s.mfa) ? `${active.filter((s) => !s.mfa).map((s) => s.name).join(', ')} without MFA` : 'Everyone' }, { label: 'Owners', value: active.filter((s) => s.role === 'OWNER').length, icon: 'key-01', hint: 'At least one is always required' }, { label: 'Open sessions', value: active.reduce((a, s) => a + s.sessions.length, 0), icon: 'laptop', to: '/staff/sessions' }]} />
      <ResourceTable<StaffMember>
        tableId="staff" caption="Staff" rows={data.staff} getRowId={(s) => s.id} rowLabel={(s) => s.name} searchText={(s) => `${s.name} ${s.email} ${s.role}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'active', label: 'Active', test: (s) => s.status === 'ACTIVE' }, { value: 'nomfa', label: 'Without MFA', test: (s) => s.status === 'ACTIVE' && !s.mfa }, { value: 'revoked', label: 'Revoked', test: (s) => s.status === 'REVOKED' }]}
        filters={[{ id: 'role', label: 'Role', options: ['OWNER', 'ADMINISTRATOR', 'BILLING', 'SUPPORT', 'INFRASTRUCTURE', 'AUDITOR'].map((r) => ({ value: r, label: r })), test: (s, v) => s.role === v }]}
        onRowClick={(s) => nav(`/staff/directory/${s.id}`)}
        columns={[
          col<StaffMember>('n', 'Person', (s) => <span className="grid md:min-w-[10rem]"><EntityLink to={`/staff/directory/${s.id}`}>{s.name}{s.id === staffId ? ' (you)' : ''}</EntityLink><span className="text-[12.5px] text-ink3">{s.email}</span></span>, { primary: true, sort: (s) => s.name }),
          col<StaffMember>('r', 'Role', (s) => <Badge tone={s.role === 'OWNER' ? 'violet' : 'neutral'}>{s.role}</Badge>, { sort: (s) => s.role }),
          col<StaffMember>('st', 'Status', (s) => <Status map={staffStatus} value={s.status} />, { sort: (s) => s.status }),
          col<StaffMember>('mfa', 'MFA', (s) => <Badge tone={s.mfa ? 'good' : s.status === 'ACTIVE' ? 'bad' : 'neutral'}>{s.mfa ? 'Enabled' : 'Off'}</Badge>, { sort: (s) => String(s.mfa) }),
          col<StaffMember>('l', 'Last sign-in', (s) => nw(relative(s.lastLoginAt)), { sort: (s) => s.lastLoginAt ?? '' }),
          col<StaffMember>('se', 'Sessions', (s) => s.sessions.length, { numeric: true, sort: (s) => s.sessions.length, hideOnMobile: true }),
          col<StaffMember>('ip', 'IP allowlist', (s) => (s.ipAllowlist.length ? s.ipAllowlist.join(', ') : <span className="text-ink3">none</span>), { hideOnMobile: true }),
        ]}
        rowActions={(s) => [{ id: 'o', label: 'Open profile', icon: 'arrow-up-right-01', onSelect: () => nav(`/staff/directory/${s.id}`) }, { id: 'r', label: 'Change role…', icon: 'shield-user', disabled: !m || s.status !== 'ACTIVE', disabledReason: 'Requires staff:manage and an active member', onSelect: () => ops.changeRole(s) }, s.status === 'ACTIVE' ? { id: 'rv', label: 'Revoke access…', icon: 'lock', tone: 'danger' as const, disabled: !m, onSelect: () => ops.revoke(s) } : { id: 'rs', label: 'Reinstate…', icon: 'play', disabled: !m, onSelect: () => ops.reinstate(s) }]}
        empty={{ title: 'No staff' }}
      />
      <PreviewNote>Changing your own membership is blocked, and the last active owner cannot be removed. These two rules are enforced by the backend as well.</PreviewNote>
      {ops.node}
    </AdminPage>
  );
}
