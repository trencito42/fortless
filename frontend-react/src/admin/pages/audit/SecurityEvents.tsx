import { Badge } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { KpiGrid } from '../../components/Cards';
import { col, nw } from '../../components/cols';
import { Status, severity } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { relative, title } from '../../lib/format';
import type { SecurityEvent } from '../../types';

export default function SecurityEvents() {
  const { data } = useAdmin();
  const cust = new Map(data.customers.map((c) => [c.id, c.name]));
  const seg = (v: string, label: string, test: (e: SecurityEvent) => boolean) => ({ value: v, label, test });
  return (
    <AdminPage title="Security events" description="Sign-in problems, MFA and step-up failures, permission denials, rate limits and suspicious activity, for customers and staff. Details never include passwords, codes or tokens.">
      <KpiGrid cols={4} items={[{ label: 'Critical (14 d)', value: data.security.filter((e) => e.severity === 'critical').length, icon: 'alert-circle' }, { label: 'Warnings', value: data.security.filter((e) => e.severity === 'warning').length, icon: 'alert-01' }, { label: 'Rate-limited', value: data.security.filter((e) => e.kind === 'rate_limited').length, icon: 'timer-01' }, { label: 'Permission denials', value: data.security.filter((e) => e.kind === 'permission_denied' || e.kind === 'step_up_denied').length, icon: 'lock' }]} />
      <ResourceTable<SecurityEvent>
        tableId="security" caption="Security events" rows={data.security} getRowId={(e) => e.id} rowLabel={(e) => e.id} searchText={(e) => `${e.actor} ${e.ip} ${e.detail} ${e.kind} ${e.correlationId}`} searchPlaceholder="Search actor, IP, detail"
        segments={[seg('all', 'All', () => true), seg('critical', 'Critical', (e) => e.severity === 'critical'), seg('warning', 'Warnings', (e) => e.severity === 'warning'), seg('info', 'Info', (e) => e.severity === 'info')]}
        filters={[{ id: 'k', label: 'Kind', options: [...new Set(data.security.map((e) => e.kind))].map((k) => ({ value: k, label: title(k) })), test: (e, v) => e.kind === v }]}
        dateField={{ label: 'When', get: (e) => e.at }} pageSize={20}
        columns={[
          col<SecurityEvent>('t', 'When', (e) => nw(relative(e.at)), { sort: (e) => e.at, primary: true }),
          col<SecurityEvent>('s', 'Severity', (e) => <Status map={severity} value={e.severity} />, { sort: (e) => e.severity }),
          col<SecurityEvent>('k', 'Event', (e) => <Badge>{title(e.kind)}</Badge>, { sort: (e) => e.kind }),
          col<SecurityEvent>('a', 'Actor', (e) => e.actor, { sort: (e) => e.actor }),
          col<SecurityEvent>('ip', 'IP', (e) => <span className="font-mono text-[12.5px]">{e.ip}</span>, { hideOnMobile: true }),
          col<SecurityEvent>('d', 'Detail', (e) => e.detail),
          col<SecurityEvent>('ac', 'Account', (e) => (e.accountId ? <EntityLink to={`/customers/${e.accountId}/security`}>{cust.get(e.accountId) ?? e.accountId}</EntityLink> : '—'), { hideOnMobile: true }),
        ]}
        empty={{ title: 'No security events' }}
      />
    </AdminPage>
  );
}
