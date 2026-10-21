import { useMemo } from 'react';
import { Badge } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, auditResult } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { relative } from '../../lib/format';
import type { AuditEvent } from '../../types';

const SENSITIVE = /(status_changed|refund|terminated|suspend|membership|exported|session_revoked|published|maintenance|settings|plan_|product_)/;

export default function AccessHistory() {
  const { data } = useAdmin();
  const rows = useMemo(() => data.audit.filter((e) => e.actor.type === 'STAFF'), [data.audit]);
  const staffId = (e: AuditEvent) => e.actor.id;
  return (
    <AdminPage title="Admin access history" description="What staff did in the console: sensitive actions, denials and who exercised them. A subset of the audit log filtered to staff actors.">
      <KpiGrid cols={4} items={[{ label: 'Staff actions (loaded)', value: rows.length }, { label: 'Sensitive actions', value: rows.filter((e) => SENSITIVE.test(e.action)).length, hint: 'Refunds, status, access, publishing' }, { label: 'Denied', value: rows.filter((e) => e.result === 'denied').length, hint: 'Role lacked permission or step-up' }, { label: 'Active staff in period', value: new Set(rows.map(staffId)).size }]} />
      <ResourceTable<AuditEvent>
        tableId="access" caption="Admin access events" rows={rows} getRowId={(e) => e.id} rowLabel={(e) => e.id} searchText={(e) => `${e.actor.name} ${e.action} ${e.resource.id} ${e.ip}`}
        segments={[{ value: 'all', label: 'All staff actions', test: () => true }, { value: 'sensitive', label: 'Sensitive', test: (e) => SENSITIVE.test(e.action) }, { value: 'denied', label: 'Denied', test: (e) => e.result === 'denied' }]}
        filters={[{ id: 'who', label: 'Staff', options: data.staff.map((s) => ({ value: s.id, label: s.name })), test: (e, v) => e.actor.id === v }]}
        dateField={{ label: 'When', get: (e) => e.at }} pageSize={20}
        columns={[
          col<AuditEvent>('t', 'When', (e) => nw(relative(e.at)), { sort: (e) => e.at, primary: true }),
          col<AuditEvent>('w', 'Staff', (e) => <EntityLink to={`/staff/directory/${e.actor.id}`}>{e.actor.name}</EntityLink>, { sort: (e) => e.actor.name }),
          col<AuditEvent>('a', 'Action', (e) => <span className="font-mono text-[12.5px] font-semibold">{e.action}{SENSITIVE.test(e.action) ? <Badge tone="warn" className="ml-2">sensitive</Badge> : null}</span>, { sort: (e) => e.action }),
          col<AuditEvent>('r', 'Target', (e) => <EntityLink to={`/audit/events/${e.id}`}>{e.resource.label}</EntityLink>),
          col<AuditEvent>('ip', 'IP', (e) => <span className="font-mono text-[12.5px]">{e.ip}</span>, { hideOnMobile: true }),
          col<AuditEvent>('s', 'Result', (e) => <Status map={auditResult} value={e.result} />, { sort: (e) => e.result }),
        ]}
        empty={{ title: 'No staff activity' }}
      />
      <PreviewNote />
    </AdminPage>
  );
}
