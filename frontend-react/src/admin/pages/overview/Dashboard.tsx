import { useMemo, useState } from 'react';
import { ActivityFeed, Badge, Button, ChartFrame, SegmentedControl, TimeSeriesChart } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { KpiGrid, Section, Columns, Split } from '../../components/Cards';
import { Status, priority } from '../../components/status';
import { CapacityBar } from '../../components/CapacityBar';
import { EntityLink } from '../../components/entities';
import { Link, useNav } from '../../router';
import { useAdmin } from '../../store';
import { ADMIN_NOW, DAY, mb, money, num, relative } from '../../lib/format';
import { CURRENCIES, collected, dailySeries, mrr, nodeCapacity, overdue, supportOpen } from '../../lib/metrics';
import type { Currency } from '../../types';
import { useSession } from '../../session';
import LiveDashboard from './LiveDashboard';

function PreviewDashboard() {
  const { data } = useAdmin();
  const nav = useNav();
  const [cur, setCur] = useState<Currency>('EUR');
  const m = useMemo(() => {
    const od = overdue(data);
    const newCust = data.customers.filter((c) => Date.parse(c.createdAt) > ADMIN_NOW - 30 * DAY).length;
    const newOrders7 = data.orders.filter((o) => Date.parse(o.createdAt) > ADMIN_NOW - 7 * DAY && o.status !== 'DRAFT').length;
    const provFail = data.orders.filter((o) => o.status === 'FULFILLMENT_FAILED' || o.status === 'PARTIALLY_FULFILLED').length;
    const unhealthy = data.nodes.filter((n) => n.health !== 'healthy' || n.maintenance.enabled);
    const sup = supportOpen(data);
    return {
      od, newCust, newOrders7, provFail, unhealthy, sup,
      active: data.services.filter((s) => s.lifecycle === 'ACTIVE').length,
      running: data.services.filter((s) => s.lifecycle === 'ACTIVE' && s.runtime === 'running').length,
      mrr: mrr(data), c30: collected(data, 30), c30prev: collected(data, 30, 30),
      series: dailySeries(data, cur, 30),
      attention: data.actions.filter((a) => a.status !== 'resolved').slice(0, 6),
      unassignedUrgent: data.tickets.filter((t) => !t.assigneeId && t.priority === 'urgent' && t.status === 'open').length,
    };
  }, [data, cur]);
  const total = (c: Currency, list: { currency: Currency; amount: number }[]) => list.find((x) => x.currency === c) ?? { currency: c, amount: 0 };
  const cur30 = total(cur, m.c30), curPrev = total(cur, m.c30prev);
  const delta = curPrev.amount > 0 ? Math.round(((cur30.amount - curPrev.amount) / curPrev.amount) * 100) : null;
  const rawNodes = data.nodes;
  const phys = rawNodes.reduce((a, n) => a + n.hardware.ramMb, 0), sold = rawNodes.reduce((a, n) => a + n.allocated.ramMb, 0), used = rawNodes.reduce((a, n) => a + n.usage.ramMb, 0);
  const activity = data.audit.filter((a) => a.actor.type === 'STAFF').slice(0, 7).map((a) => ({ id: a.id, actor: a.actor.name, action: a.action.replace(/[._]/g, ' '), target: a.resource.label, time: relative(a.at), iso: a.at }));

  return (
    <AdminPage title="Dashboard" description="Platform health, money and queues at a glance. All figures are synthetic demo data frozen at 21 Oct 2026, 09:30 UTC." actions={<><Button variant="secondary" leadingIcon="flash" onClick={() => nav('/actions')}>Action Center{m.attention.length ? ` (${data.actions.filter((a) => a.status !== 'resolved').length})` : ''}</Button></>}>
      <KpiGrid cols={4} items={[
        { label: 'Customers', value: num(data.customers.filter((c) => c.status === 'ACTIVE').length), icon: 'user-group', hint: `${m.newCust} new in 30 days · ${data.customers.length} accounts total`, to: '/customers' },
        { label: 'Active services', value: num(m.active), icon: 'server', hint: `${m.running} running · ${m.active - m.running} not running`, to: '/services' },
        { label: 'New orders (7 days)', value: num(m.newOrders7), icon: 'shopping-cart-01', hint: `${data.orders.filter((o) => o.status === 'AWAITING_PAYMENT').length} awaiting payment`, to: '/orders' },
        { label: 'Overdue invoices', value: num(m.od.rows.length), icon: 'invoice-01', hint: m.od.totals.map(money).join(' · ') || 'None', to: '/billing/invoices' },
        { label: 'Support queue', value: num(m.sup.length), icon: 'message-01', hint: `${data.tickets.filter((t) => !t.assigneeId && (t.status === 'open')).length} unassigned · ${m.unassignedUrgent} urgent`, to: '/support' },
        { label: 'Provisioning failures', value: num(m.provFail), icon: 'alert-circle', delta: m.provFail ? { value: 'paid orders not delivered', direction: 'up', goodWhen: 'down' } : undefined, to: '/provisioning/jobs' },
        { label: 'Nodes needing attention', value: `${m.unhealthy.length} of ${data.nodes.length}`, icon: 'cpu', hint: m.unhealthy.map((n) => n.name).join(', ') || 'All healthy', to: '/infrastructure/nodes' },
        { label: 'Open incidents', value: num(data.incidents.filter((i) => i.status !== 'resolved').length), icon: 'activity-01', hint: 'Public status page', to: '/monitoring/incidents' },
      ]} />

      <Split main={<>
        <ChartFrame title="Collected payments" description={`${money(cur30)} in the last 30 days (${cur}). Currencies are never added together.`} summary={`Daily collected payments in ${cur} over 30 days, total ${money(cur30)}`} height={240} actions={<SegmentedControl aria-label="Currency" size="sm" value={cur} onValueChange={setCur} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />}>
          <TimeSeriesChart kind="area" data={m.series} xKey="day" series={[{ key: 'amount', label: `Collected ${cur}`, color: 'accent' }]} formatX={(v) => String(v).slice(5)} formatY={(v) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 0 }).format(v / 100)} label={`Collected ${cur} per day`} />
        </ChartFrame>
        <Columns>
          <Section title="Recurring revenue (MRR)" description="Monthly-equivalent of active subscriptions, per currency.">
            <ul className="grid gap-2">{CURRENCIES.map((c) => { const v = total(c, m.mrr); return <li key={c} className="flex items-baseline justify-between rounded-md bg-s2 px-3 py-2"><span className="font-bold text-ink2">{c}</span><b className="text-[20px] tabular-nums">{money(v)}</b></li>; })}</ul>
            <p className="mt-2 text-[12.5px] font-semibold text-ink3">Change vs previous 30 days of cash collected ({cur}): {delta == null ? 'n/a' : `${delta > 0 ? '+' : ''}${delta}%`}</p>
          </Section>
          <Section title="Overdue balance" description="Open invoices past their due date." actions={<Link to="/billing/invoices" className="font-bold text-accent hover:underline">View</Link>}>
            {m.od.totals.length ? <ul className="grid gap-2">{m.od.totals.map((t) => <li key={t.currency} className="flex items-baseline justify-between rounded-md bg-s2 px-3 py-2"><span className="font-bold text-ink2">{t.currency}</span><b className="text-[20px] text-bad tabular-nums">{money(t)}</b></li>)}</ul> : <p className="text-ink3">Nothing overdue.</p>}
            <p className="mt-2 text-[12.5px] font-semibold text-ink3">{m.od.rows.length} invoices across {new Set(m.od.rows.map((i) => i.customerId)).size} customers</p>
          </Section>
        </Columns>
        <Section title="Infrastructure allocation" description="Physical capacity, what is sold on it, and what is actually used. Three different numbers." actions={<Link to="/infrastructure" className="font-bold text-accent hover:underline">Infrastructure</Link>}>
          <div className="grid gap-5"><CapacityBar label="RAM · all nodes" physical={phys} sold={sold} used={used} format={mb} /><ul className="grid gap-2 sm:grid-cols-2">{data.nodes.map((n) => { const c = nodeCapacity(n); return <li key={n.id} className="flex items-center justify-between gap-2 rounded-md bg-s2 px-3 py-2"><EntityLink to={`/infrastructure/nodes/${n.id}`}>{n.name}</EntityLink><span className="flex items-center gap-2 text-[13px] font-semibold text-ink3">sold {c.ramSoldPct}% <Status map={{ healthy: { tone: 'good', label: 'Healthy' }, degraded: { tone: 'warn', label: 'Degraded' }, offline: { tone: 'bad', label: 'Offline' } }} value={n.maintenance.enabled ? 'degraded' : n.health} label={n.maintenance.enabled ? 'Maintenance' : undefined} /></span></li>; })}</ul></div>
        </Section>
      </>} aside={<>
        <Section title="Needs attention" description="Highest-priority open items." actions={<Link to="/actions" className="font-bold text-accent hover:underline">All</Link>}>
          <ul className="grid gap-1.5" aria-label="Open action items">
            {m.attention.map((a) => <li key={a.id}><Link to={`/actions/${a.id}`} className="grid gap-1 rounded-md bg-s2 p-3 hover:bg-s3 focus-visible:outline-2 focus-visible:outline-accent"><span className="flex items-center gap-2"><Status map={priority} value={a.priority} /><Badge>{a.category}</Badge></span><span className="font-bold [overflow-wrap:anywhere]">{a.title}</span><span className="text-[12.5px] font-semibold text-ink3">{relative(a.createdAt)} · {a.assignee ?? 'unassigned'}</span></Link></li>)}
          </ul>
        </Section>
        <Section title="Recent admin activity" description="Staff actions from the audit log." actions={<Link to="/audit" className="font-bold text-accent hover:underline">Audit</Link>}>
          <ActivityFeed items={activity} label="Recent admin activity" />
        </Section>
        <Section title="Jump to">
          <div className="flex flex-wrap gap-2">{[['Failed webhooks', '/provisioning/webhooks'], ['Dead-letter jobs', '/provisioning/jobs'], ['Pending approvals', '/staff/approvals'], ['Open incidents', '/monitoring/incidents'], ['Refund requests', '/billing/refunds']].map(([l, to]) => <Button key={to} size="sm" variant="secondary" onClick={() => nav(to!)}>{l}</Button>)}</div>
        </Section>
      </>} />
    </AdminPage>
  );
}

export default function Dashboard() {
  const session = useSession();
  return session.live ? <LiveDashboard /> : <PreviewDashboard />;
}
