import { Badge, Button, DescriptionList, EmptyState, Timeline, type TimelineEvent } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, Section } from '../../components/Cards';
import { Status, staffStatus } from '../../components/status';
import { RelatedTable } from '../../components/RelatedTable';
import { PreviewNote } from '../../components/PreviewNote';
import { col } from '../../components/cols';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession, ROLE_PERMISSIONS } from '../../session';
import { dateTime, relative } from '../../lib/format';
import type { StaffSession } from '../../types';
import { useStaffOps } from './staffOps';

export default function StaffDetail({ id }: { id: string }) {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const { can, staffId } = useSession();
  const ops = useStaffOps();
  const act = useActionDialog();
  const s = data.staff.find((x) => x.id === id);
  if (!s) return <AdminPage title="Staff member not found"><EmptyState title="No such person" action={<Button onClick={() => nav('/staff')}>Back to directory</Button>} /></AdminPage>;
  const m = can('staff:manage');
  const perms = ROLE_PERMISSIONS[s.role];
  const events = data.audit.filter((e) => e.actor.id === s.id || e.resource.id === s.id).slice(0, 15);
  const tl: TimelineEvent[] = events.map((e) => ({ id: e.id, title: <>{e.action.replace(/[._]/g, ' ')}{e.preview ? <Badge tone="warn" className="ml-2">preview</Badge> : null}</>, description: `${e.actor.id === s.id ? 'Performed' : 'Target'} · ${e.resource.label}${e.reason ? ` · “${e.reason}”` : ''}`, time: relative(e.at), iso: e.at, tone: e.result === 'success' ? 'neutral' : 'warn' }));
  const revokeSession = (x: StaffSession) => act.run({ title: 'Revoke session', description: `${x.device} from ${x.ip}. The person must sign in (and pass MFA) again.`, confirmLabel: 'Revoke session', permission: 'staff:manage', stepUp: true, tone: 'danger', onConfirm: ({ reason }) => { patch('staff', s.id, (c) => ({ sessions: c.sessions.filter((y) => y.id !== x.id) })); audit('staff.session_revoked', { type: 'staff_session', id: x.id, label: s.name }, { reason }); return 'Session revoked'; } });
  return (
    <AdminPage detail title={s.name} crumbLabel={s.name} parents={[{ label: 'Directory', to: '/staff' }]} status={<><Status map={staffStatus} value={s.status} /><Badge tone={s.role === 'OWNER' ? 'violet' : 'neutral'}>{s.role}</Badge><Badge tone={s.mfa ? 'good' : 'bad'}>{s.mfa ? 'MFA on' : 'No MFA'}</Badge></>} description={`${s.email} · staff since ${dateTime(s.createdAt)}`}
      actions={<><Button variant="secondary" leadingIcon="shield-user" disabled={!m || s.status !== 'ACTIVE' || s.id === staffId} title={s.id === staffId ? 'You cannot change your own role' : undefined} onClick={() => ops.changeRole(s)}>Change role…</Button>{s.status === 'ACTIVE' ? <Button variant="danger-subtle" disabled={!m || s.id === staffId} onClick={() => ops.revoke(s)}>Revoke access…</Button> : <Button variant="primary" disabled={!m} onClick={() => ops.reinstate(s)}>Reinstate…</Button>}</>}>
      <Columns>
        <Section title="Profile"><DescriptionList items={[{ label: 'Email', value: s.email, copy: s.email }, { label: 'Role', value: s.role }, { label: 'Last sign-in', value: dateTime(s.lastLoginAt) }, { label: 'MFA', value: s.mfa ? 'Enabled' : 'Not enabled' }, { label: 'IP allowlist', value: s.ipAllowlist.length ? s.ipAllowlist.join(', ') : 'Not restricted' }]} /></Section>
        <Section title="Effective permissions" description={`${perms.length} of 14 granted by role ${s.role}`}><ul className="flex flex-wrap gap-1.5">{ROLE_PERMISSIONS.OWNER.map((p) => <li key={p}><Badge tone={perms.includes(p) ? 'good' : 'neutral'} className={perms.includes(p) ? '' : 'line-through opacity-60'}>{p}</Badge></li>)}</ul></Section>
      </Columns>
      <Section title="Sessions" description="Each session shows when step-up verification last happened."><RelatedTable rows={s.sessions} getRowId={(x) => x.id} caption="Staff sessions" empty="No open sessions." pageSize={6} columns={[col<StaffSession>('d', 'Device', (x) => <span className="grid"><b>{x.device}</b><span className="text-[12.5px] text-ink3">{x.location}</span></span>, { primary: true }), col<StaffSession>('ip', 'IP', (x) => <span className="font-mono text-[12.5px]">{x.ip}</span>), col<StaffSession>('l', 'Last seen', (x) => relative(x.lastSeenAt), { sort: (x) => x.lastSeenAt }), col<StaffSession>('su', 'Step-up', (x) => (x.stepUpAt ? relative(x.stepUpAt) : 'none')), col<StaffSession>('a', 'Actions', (x) => (x.current ? <Badge tone="accent">This session</Badge> : <Button size="sm" variant="danger-subtle" disabled={!m} onClick={() => revokeSession(x)}>Revoke…</Button>))]} /></Section>
      <Section title="Recent activity"><Timeline events={tl} label="Staff activity" />{!tl.length ? <p className="text-ink3">No audit events yet.</p> : null}</Section>
      <PreviewNote />
      {ops.node}{act.node}
    </AdminPage>
  );
}
