import { Badge, Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid, Section } from '../../components/Cards';
import { col } from '../../components/cols';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { RelatedTable } from '../../components/RelatedTable';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { ADMIN_NOW, dateTime, relative } from '../../lib/format';
import type { SecurityEvent, StaffSession } from '../../types';

type Row = StaffSession & { who: string };

export default function StaffSessions() {
  const { data, patch, audit } = useAdmin();
  const { can } = useSession();
  const act = useActionDialog();
  const rows: Row[] = data.staff.flatMap((s) => s.sessions.map((x) => ({ ...x, who: s.name })));
  const m = can('staff:manage');
  const stepFresh = (x: StaffSession) => !!x.stepUpAt && ADMIN_NOW - Date.parse(x.stepUpAt) < 5 * 60_000;
  const revoke = (x: Row) => act.run({ title: `Revoke session of ${x.who}`, description: `${x.device} from ${x.ip}.`, confirmLabel: 'Revoke session', permission: 'staff:manage', stepUp: true, tone: 'danger', reasonRequired: true, onConfirm: ({ reason }) => { patch('staff', x.staffId, (c) => ({ sessions: c.sessions.filter((y) => y.id !== x.id) })); audit('staff.session_revoked', { type: 'staff_session', id: x.id, label: x.who }, { reason }); return 'Session revoked'; } });
  const noMfa = data.staff.filter((s) => s.status === 'ACTIVE' && !s.mfa);
  const staffNames = new Set(data.staff.map((s) => s.name));
  const events = data.security.filter((e) => staffNames.has(e.actor)).slice(0, 12);
  return (
    <AdminPage title="Staff sessions & security" description="Open staff sessions, step-up freshness and authentication events. Revoking a session signs that device out immediately.">
      {noMfa.length ? <Notice tone="bad" title={`${noMfa.length} active staff without MFA`}>{noMfa.map((s) => <span key={s.id} className="mr-2"><EntityLink to={`/staff/directory/${s.id}`}>{s.name}</EntityLink></span>)}Without MFA they cannot complete step-up, so sensitive actions are unsafe for them.</Notice> : null}
      <KpiGrid cols={4} items={[{ label: 'Open sessions', value: rows.length, icon: 'laptop' }, { label: 'Fresh step-up', value: rows.filter(stepFresh).length, icon: 'finger-print-scan', hint: 'Within 5 minutes' }, { label: 'MFA coverage', value: `${Math.round((data.staff.filter((s) => s.status === 'ACTIVE' && s.mfa).length / Math.max(1, data.staff.filter((s) => s.status === 'ACTIVE').length)) * 100)}%`, icon: 'shield-01' }, { label: 'Allowlisted staff', value: data.staff.filter((s) => s.ipAllowlist.length).length, icon: 'lock', hint: 'IP-restricted' }]} />
      <ResourceTable<Row>
        tableId="staff-sessions" caption="Staff sessions" rows={rows} getRowId={(x) => x.id} rowLabel={(x) => `${x.who} session`} searchText={(x) => `${x.who} ${x.device} ${x.ip} ${x.location}`}
        columns={[
          col<Row>('w', 'Person', (x) => <b>{x.who}{x.current ? <Badge tone="accent" className="ml-2">you</Badge> : null}</b>, { primary: true, sort: (x) => x.who }),
          col<Row>('d', 'Device', (x) => <span className="grid"><span>{x.device}</span><span className="text-[12.5px] text-ink3">{x.location}</span></span>),
          col<Row>('ip', 'IP', (x) => <span className="font-mono text-[12.5px]">{x.ip}</span>),
          col<Row>('s', 'Started', (x) => <span title={dateTime(x.startedAt)}>{relative(x.startedAt)}</span>, { sort: (x) => x.startedAt }),
          col<Row>('l', 'Last seen', (x) => relative(x.lastSeenAt), { sort: (x) => x.lastSeenAt }),
          col<Row>('su', 'Step-up', (x) => <Badge tone={stepFresh(x) ? 'good' : 'neutral'}>{x.stepUpAt ? relative(x.stepUpAt) : 'none'}</Badge>),
          col<Row>('a', 'Action', (x) => (x.current ? <span className="text-ink3">Current</span> : <Button size="sm" variant="danger-subtle" disabled={!m} onClick={() => revoke(x)}>Revoke…</Button>)),
        ]}
        empty={{ title: 'No open sessions' }}
      />
      <Section title="Recent staff security events"><RelatedTable rows={events} getRowId={(e) => e.id} caption="Staff security events" empty="No staff-related events." pageSize={6} columns={[col<SecurityEvent>('t', 'When', (e) => relative(e.at), { primary: true, sort: (e) => e.at }), col<SecurityEvent>('k', 'Event', (e) => e.kind.replace(/_/g, ' ')), col<SecurityEvent>('a', 'Actor', (e) => e.actor), col<SecurityEvent>('d', 'Detail', (e) => e.detail)]} /></Section>
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
