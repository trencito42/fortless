import { useMemo } from 'react';
import { Badge, ChartFrame, Notice, SegmentedBar, TimeSeriesChart } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { col } from '../../components/cols';
import { useAdmin } from '../../store';
import { ADMIN_NOW, DAY, ageMinutes } from '../../lib/format';
import { SLA_LABEL } from './ticketOps';

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
const fmt = (min: number | null) => (min == null ? '—' : min < 90 ? `${min} min` : min < 2880 ? `${(min / 60).toFixed(1)} h` : `${(min / 1440).toFixed(1)} d`);
interface Agent { id: string; name: string; open: number; waiting: number; solved30: number; medFirst: number | null }

export default function Performance() {
  const { data } = useAdmin();
  const m = useMemo(() => {
    const t = data.tickets;
    const active = t.filter((x) => x.status !== 'closed' && x.status !== 'resolved');
    const firstMin = t.filter((x) => x.firstResponseAt).map((x) => Math.round((Date.parse(x.firstResponseAt!) - Date.parse(x.createdAt)) / 60000));
    const answered = t.filter((x) => x.firstResponseAt);
    const onTime = answered.filter((x) => Date.parse(x.firstResponseAt!) <= Date.parse(x.firstResponseDueAt)).length;
    const buckets = [{ key: 'a', label: '< 4 h', value: 0, tone: 'bg-good' }, { key: 'b', label: '4–24 h', value: 0, tone: 'bg-accent' }, { key: 'c', label: '1–3 d', value: 0, tone: 'bg-warn' }, { key: 'd', label: '> 3 d', value: 0, tone: 'bg-bad' }];
    for (const x of active) { const a = ageMinutes(x.createdAt); buckets[a < 240 ? 0 : a < 1440 ? 1 : a < 4320 ? 2 : 3]!.value++; }
    const agents: Agent[] = data.staff.filter((s) => s.status === 'ACTIVE' && ['SUPPORT', 'ADMINISTRATOR', 'BILLING', 'INFRASTRUCTURE'].includes(s.role)).map((s) => { const mine = t.filter((x) => x.assigneeId === s.id); return { id: s.id, name: s.name, open: mine.filter((x) => x.status === 'open' || x.status === 'waiting_staff').length, waiting: mine.filter((x) => x.status === 'waiting_customer').length, solved30: mine.filter((x) => (x.status === 'resolved' || x.status === 'closed') && Date.parse(x.updatedAt) > ADMIN_NOW - 30 * DAY).length, medFirst: median(mine.filter((x) => x.firstResponseAt).map((x) => Math.round((Date.parse(x.firstResponseAt!) - Date.parse(x.createdAt)) / 60000))) }; });
    const days = Array.from({ length: 30 }, (_, k) => { const d = new Date(ADMIN_NOW - (29 - k) * DAY).toISOString().slice(0, 10); return { day: d, created: t.filter((x) => x.createdAt.slice(0, 10) === d).length }; });
    return { active, medFirst: median(firstMin), onTimePct: answered.length ? Math.round((onTime / answered.length) * 100) : null, buckets, agents, days, unassigned: active.filter((x) => !x.assigneeId).length, breached: t.filter((x) => SLA_LABEL(x).state === 'breached').length };
  }, [data]);
  return (
    <AdminPage title="Support performance" description="Queue age, workload and response times, computed from the demo tickets. SLA here means the department’s first-response target; resolution SLAs are not modelled in the backend.">
      <Notice tone="info" title="Computed from synthetic tickets">There are only 96 demo tickets, so percentages are noisy. Satisfaction scores are not collected by the backend and are not shown.</Notice>
      <KpiGrid cols={4} items={[{ label: 'Active tickets', value: m.active.length, icon: 'inbox' }, { label: 'Unassigned', value: m.unassigned, icon: 'user' }, { label: 'Median first response', value: fmt(m.medFirst), icon: 'clock-01', hint: `${m.breached} overdue now` }, { label: 'First response on time', value: m.onTimePct == null ? '—' : `${m.onTimePct}%`, icon: 'tick-02', hint: 'Of answered tickets' }]} />
      <Columns>
        <Section title="Queue age" description="Active tickets by time since they were opened."><SegmentedBar size="lg" segments={m.buckets} summary={m.buckets.map((b) => `${b.value} ${b.label}`).join(', ')} /><ul className="mt-3 grid grid-cols-2 gap-2 text-[13.5px] sm:grid-cols-4">{m.buckets.map((b) => <li key={b.key} className="rounded-md bg-s2 p-2.5"><span className="block text-ink3">{b.label}</span><b className="text-[18px]">{b.value}</b></li>)}</ul></Section>
        <ChartFrame title="Tickets created per day" description="Last 30 days" summary="Number of tickets created per day over the last 30 days" height={200}><TimeSeriesChart kind="bar" data={m.days} xKey="day" series={[{ key: 'created', label: 'Created', color: 'accent' }]} formatX={(v) => String(v).slice(5)} label="Tickets per day" /></ChartFrame>
      </Columns>
      <Section title="Agent workload"><RelatedTable rows={m.agents} getRowId={(a) => a.id} caption="Agent workload" pageSize={10} columns={[col<Agent>('n', 'Agent', (a) => <b>{a.name}</b>, { primary: true, sort: (a) => a.name }), col<Agent>('o', 'Waiting on us', (a) => <span className={a.open > 6 ? 'font-bold text-warn' : ''}>{a.open}{a.open > 6 ? <Badge tone="warn" className="ml-2">High</Badge> : null}</span>, { numeric: true, sort: (a) => a.open }), col<Agent>('w', 'Waiting customer', (a) => a.waiting, { numeric: true, sort: (a) => a.waiting }), col<Agent>('s', 'Solved (30 d)', (a) => a.solved30, { numeric: true, sort: (a) => a.solved30 }), col<Agent>('f', 'Median first response', (a) => fmt(a.medFirst), { numeric: true, sort: (a) => a.medFirst ?? 99999 })]} /></Section>
    </AdminPage>
  );
}
