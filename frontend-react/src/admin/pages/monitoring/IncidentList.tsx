import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, incidentStatus, severity } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { date, relative } from '../../lib/format';
import type { Incident } from '../../types';

export default function IncidentList() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const seg = (v: string, label: string, test: (i: Incident) => boolean) => ({ value: v, label, test });
  const names = (i: Incident) => i.componentIds.map((id) => data.components.find((c) => c.id === id)?.name ?? id).join(', ');
  return (
    <AdminPage title="Incidents" description="Public and internal communication about problems. An incident has a lifecycle (investigating → resolved); the health of each affected component is set separately." actions={<Button variant="primary" leadingIcon="add-01" disabled={!can('services:manage')} onClick={() => nav('/monitoring/incidents/new')}>Declare incident</Button>}>
      <ResourceTable<Incident>
        tableId="incidents" caption="Incidents" rows={data.incidents} getRowId={(i) => i.id} rowLabel={(i) => i.title} searchText={(i) => `${i.title} ${i.id} ${names(i)}`}
        segments={[seg('all', 'All', () => true), seg('open', 'Open', (i) => i.status !== 'resolved'), seg('resolved', 'Resolved', (i) => i.status === 'resolved'), seg('unpublished', 'Not published', (i) => !i.published)]} defaultSegment="all"
        filters={[{ id: 'sev', label: 'Severity', options: ['minor', 'major', 'critical'].map((s) => ({ value: s, label: s })), test: (i, v) => i.severity === v }, { id: 'st', label: 'Status', options: Object.keys(incidentStatus).map((s) => ({ value: s, label: incidentStatus[s]!.label })), test: (i, v) => i.status === v }]}
        dateField={{ label: 'Started', get: (i) => i.startedAt }} onRowClick={(i) => nav(`/monitoring/incidents/${i.id}`)}
        columns={[
          col<Incident>('t', 'Incident', (i) => <span className="grid min-w-[14rem]"><EntityLink to={`/monitoring/incidents/${i.id}`}>{i.title}</EntityLink><span className="font-mono text-[12px] text-ink3">{i.id}</span></span>, { primary: true, sort: (i) => i.title }),
          col<Incident>('s', 'Status', (i) => <Status map={incidentStatus} value={i.status} />, { sort: (i) => i.status }),
          col<Incident>('v', 'Severity', (i) => <Status map={severity} value={i.severity} />, { sort: (i) => i.severity }),
          col<Incident>('c', 'Components', (i) => <span className="block max-w-[18rem] truncate" title={names(i)}>{names(i)}</span>, { hideOnMobile: true }),
          col<Incident>('p', 'Public', (i) => (i.published ? 'Yes' : 'No'), { sort: (i) => String(i.published) }),
          col<Incident>('st', 'Started', (i) => nw(relative(i.startedAt)), { sort: (i) => i.startedAt }),
          col<Incident>('r', 'Resolved', (i) => (i.resolvedAt ? nw(date(i.resolvedAt)) : '—'), { sort: (i) => i.resolvedAt ?? '', hideOnMobile: true }),
        ]}
        empty={{ title: 'No incidents', description: 'Quiet is good.' }}
      />
    </AdminPage>
  );
}
