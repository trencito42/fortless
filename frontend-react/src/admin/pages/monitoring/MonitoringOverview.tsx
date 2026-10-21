import { Badge, Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { Status, componentHealth, incidentStatus, severity, maintenanceStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { dateTime, relative } from '../../lib/format';
import { overallOf } from './monitoringOps';

export default function MonitoringOverview() {
  const { data } = useAdmin();
  const nav = useNav();
  const overall = overallOf(data.components.filter((c) => c.public));
  const open = data.incidents.filter((i) => i.status !== 'resolved');
  const groups = [...new Set(data.components.map((c) => c.group))];
  const upcoming = data.maintenance.filter((m) => m.status === 'scheduled' || m.status === 'in_progress');
  return (
    <AdminPage title="Monitoring & status" description="Component health, incidents and maintenance, and what customers see on the public status page. Incident status and component health are separate: one is a message, the other is a measurement." actions={<><Button variant="primary" leadingIcon="alert-01" onClick={() => nav('/monitoring/incidents/new')}>Declare incident</Button><Button variant="secondary" onClick={() => nav('/monitoring/public')}>Public page</Button></>}>
      <Notice tone={overall === 'operational' ? 'good' : overall === 'major_outage' ? 'bad' : 'warn'} title={`Public status: ${componentHealth[overall]!.label}`}>{open.length ? `${open.length} open incident${open.length > 1 ? 's' : ''}.` : 'No open incidents.'} {data.components.filter((c) => c.health !== 'operational').length} component(s) not fully operational.</Notice>
      <KpiGrid cols={4} items={[{ label: 'Open incidents', value: open.length, icon: 'alert-01', to: '/monitoring/incidents' }, { label: 'Components not operational', value: data.components.filter((c) => c.health !== 'operational').length, icon: 'activity-01', to: '/monitoring/components', hint: `of ${data.components.length}` }, { label: 'Maintenance', value: upcoming.length, icon: 'wrench-01', hint: `${upcoming.filter((m) => m.status === 'in_progress').length} in progress`, to: '/monitoring/maintenance' }, { label: 'Lowest 30-day uptime', value: `${Math.min(...data.components.map((c) => c.uptime30d)).toFixed(2)}%`, icon: 'analytics-01', hint: data.components.reduce((m, c) => (c.uptime30d < m.uptime30d ? c : m)).name }]} />
      <Columns>
        <Section title="Components by group">{groups.map((g) => <div key={g} className="mb-3 last:mb-0"><p className="mb-1 text-[12.5px] font-bold text-ink3">{g}</p><ul className="grid gap-1.5">{data.components.filter((c) => c.group === g).map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><span className="font-semibold">{c.name}</span><Status map={componentHealth} value={c.health} /></li>)}</ul></div>)}</Section>
        <div className="grid content-start gap-5">
          <Section title="Active incidents" actions={<Button size="sm" variant="ghost" onClick={() => nav('/monitoring/incidents')}>All</Button>}>{open.length ? <ul className="grid gap-2">{open.map((i) => <li key={i.id} className="grid gap-1 rounded-md bg-s2 p-3"><span className="flex flex-wrap items-center gap-2"><Status map={incidentStatus} value={i.status} /><Status map={severity} value={i.severity} />{!i.published ? <Badge tone="warn">Not public</Badge> : null}</span><EntityLink to={`/monitoring/incidents/${i.id}`}>{i.title}</EntityLink><span className="text-[12.5px] text-ink3">Started {relative(i.startedAt)} · {i.updates.length} updates</span></li>)}</ul> : <p className="text-ink3">No open incidents.</p>}</Section>
          <Section title="Maintenance" actions={<Button size="sm" variant="ghost" onClick={() => nav('/monitoring/maintenance')}>All</Button>}><ul className="grid gap-2">{upcoming.map((m) => <li key={m.id} className="grid gap-1 rounded-md bg-s2 p-3"><span className="flex items-center gap-2"><Status map={maintenanceStatus} value={m.status} /></span><EntityLink to={`/monitoring/maintenance/${m.id}`}>{m.title}</EntityLink><span className="text-[12.5px] text-ink3">{dateTime(m.startsAt)} → {dateTime(m.endsAt)}</span></li>)}</ul></Section>
        </div>
      </Columns>
    </AdminPage>
  );
}
