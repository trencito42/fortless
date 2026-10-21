import { useMemo, useState } from 'react';
import { Button, IconButton, SegmentedControl } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { AdminPage } from '../../components/Page';
import { Section } from '../../components/Cards';
import { ResourceTable } from '../../components/ResourceTable';
import { col, nw } from '../../components/cols';
import { Status, maintenanceStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { ADMIN_NOW, dateTime } from '../../lib/format';
import type { MaintenanceWindow } from '../../types';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MaintenanceList() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [offset, setOffset] = useState(0);
  const base = new Date(ADMIN_NOW); const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
  const days = useMemo(() => { const lead = (first.getUTCDay() + 6) % 7; const n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); return Array.from({ length: Math.ceil((lead + n) / 7) * 7 }, (_, i) => { const d = i - lead + 1; return d >= 1 && d <= n ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d)) : null; }); }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps
  const on = (d: Date) => data.maintenance.filter((m) => { const s = Date.parse(m.startsAt), e = Date.parse(m.endsAt); const a = d.getTime(), b = a + 86_400_000; return s < b && e >= a; });
  const today = new Date(ADMIN_NOW).toISOString().slice(0, 10);
  return (
    <AdminPage title="Scheduled maintenance" description="Public maintenance windows. Each one can mark components as under maintenance for its duration; node maintenance itself is operated under Infrastructure." actions={<><SegmentedControl aria-label="View" size="sm" value={view} onValueChange={setView} options={[{ value: 'calendar', label: 'Calendar', icon: 'calendar-01' }, { value: 'list', label: 'List', icon: 'table' }]} /><Button variant="primary" leadingIcon="add-01" disabled={!can('services:manage')} onClick={() => nav('/monitoring/maintenance/new')}>Schedule</Button></>}>
      {view === 'calendar' ? (
        <Section title={first.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} actions={<span className="flex gap-1"><IconButton label="Previous month" icon="arrow-left-01" variant="secondary" size="sm" onClick={() => setOffset((o) => o - 1)} /><Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Today</Button><IconButton label="Next month" icon="arrow-right-01" variant="secondary" size="sm" onClick={() => setOffset((o) => o + 1)} /></span>}>
          <div className="hidden md:block"><div role="grid" aria-label="Maintenance calendar" className="grid grid-cols-7 gap-1">{DOW.map((d) => <div key={d} role="columnheader" className="px-2 py-1 text-[12px] font-bold text-ink3">{d}</div>)}{days.map((d, i) => { const ev = d ? on(d) : []; const iso = d?.toISOString().slice(0, 10); return <div key={i} role="gridcell" aria-label={d ? d.toDateString() : undefined} className={cn('min-h-[88px] rounded-md p-1.5', d ? 'bg-s2' : 'bg-transparent', iso === today && 'ring-2 ring-accent')}>{d ? <><span className="text-[12px] font-bold text-ink3">{d.getUTCDate()}</span><ul className="mt-1 grid gap-1">{ev.map((m) => <li key={m.id}><button type="button" onClick={() => nav(`/monitoring/maintenance/${m.id}`)} className={cn('w-full truncate rounded-sm px-1.5 py-0.5 text-left text-[11.5px] font-bold focus-visible:outline-2 focus-visible:outline-accent', m.status === 'in_progress' ? 'bg-warn-bg text-warn' : m.status === 'completed' ? 'bg-s3 text-ink2' : 'bg-accent-bg text-accent-ink')}>{m.title}</button></li>)}</ul></> : null}</div>; })}</div></div>
          <ul className="grid gap-2 md:hidden" aria-label="Maintenance this month">{data.maintenance.map((m) => <li key={m.id} className="rounded-md bg-s2 p-3"><EntityLink to={`/monitoring/maintenance/${m.id}`}>{m.title}</EntityLink><p className="text-[12.5px] text-ink3">{dateTime(m.startsAt)}</p></li>)}</ul>
        </Section>
      ) : (
        <ResourceTable<MaintenanceWindow>
          tableId="maintenance" caption="Maintenance windows" rows={data.maintenance} getRowId={(m) => m.id} rowLabel={(m) => m.title} searchText={(m) => m.title}
          segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'upcoming', label: 'Upcoming', test: (m) => m.status === 'scheduled' }, { value: 'live', label: 'In progress', test: (m) => m.status === 'in_progress' }, { value: 'done', label: 'Completed', test: (m) => m.status === 'completed' }]}
          onRowClick={(m) => nav(`/monitoring/maintenance/${m.id}`)}
          columns={[col<MaintenanceWindow>('t', 'Window', (m) => <EntityLink to={`/monitoring/maintenance/${m.id}`}>{m.title}</EntityLink>, { primary: true, sort: (m) => m.title }), col<MaintenanceWindow>('s', 'Status', (m) => <Status map={maintenanceStatus} value={m.status} />, { sort: (m) => m.status }), col<MaintenanceWindow>('a', 'Starts', (m) => nw(dateTime(m.startsAt)), { sort: (m) => m.startsAt }), col<MaintenanceWindow>('b', 'Ends', (m) => nw(dateTime(m.endsAt)), { sort: (m) => m.endsAt }), col<MaintenanceWindow>('c', 'Components', (m) => m.componentIds.length, { numeric: true })]}
          empty={{ title: 'Nothing scheduled' }} />
      )}
    </AdminPage>
  );
}
