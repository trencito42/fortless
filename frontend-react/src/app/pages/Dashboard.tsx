import { Button, ButtonGroup, Card, CardHeader, EmptyState, Icon, Notice, SegmentedBar, Skeleton, StatusBadge, Timeline, type TimelineEvent } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { useApiQuery } from '../data/DataProvider';
import { Link, useNavigate } from '../router';
import { PageHeader } from '../components/PageHeader';
import { ServiceStateBadge, Stat, WorkloadIcon } from '../components/bits';
import { daysUntil, date, dateTime, mb, money, relative } from '../format';
import type { ServiceRow } from '../domain/types';
import { ticketStatus, type TicketState as UiTicket } from '@/features';

const counts = (s: ServiceRow[]) => ({ running: s.filter((x) => x.state === 'running').length, stopped: s.filter((x) => x.state === 'offline').length, suspended: s.filter((x) => x.state === 'suspended').length, problem: s.filter((x) => x.state === 'error').length, busy: s.filter((x) => ['starting', 'stopping', 'installing'].includes(x.state)).length });

/** Command center: what needs attention first, then health, money and support. Every block links to where you act on it. */
export default function Dashboard() {
  const nav = useNavigate();
  const services = useApiQuery((a) => a.listServices());
  const warnings = useApiQuery((a) => a.warnings());
  const invoices = useApiQuery((a) => a.listInvoices());
  const subs = useApiQuery((a) => a.listSubscriptions());
  const tickets = useApiQuery((a) => a.listTickets());
  const events = useApiQuery((a) => a.serviceEvents());
  const activity = useApiQuery((a) => a.activity());
  const identity = useApiQuery((a) => a.identity());

  const svc = services.status === 'ready' ? services.data : [];
  const c = counts(svc);
  const ramLimit = svc.filter((s) => s.state !== 'suspended').reduce((a, s) => a + s.resources.ramLimitMb, 0);
  const diskLimit = svc.reduce((a, s) => a + s.resources.diskLimitMb, 0);
  const due = invoices.status === 'ready' ? invoices.data.filter((i) => i.state === 'open' || i.state === 'overdue') : [];
  const dueTotal = due.reduce((a, i) => a + i.total.amount, 0);
  const dueCurrencies = [...new Set(due.map((invoice) => invoice.total.currency))];
  const dueDisplay = dueCurrencies.length > 1 ? 'Multiple currencies' : money({ amount: dueTotal, currency: dueCurrencies[0] ?? 'EUR' });
  const renewals = subs.status === 'ready' ? subs.data.filter((s) => s.renewsOn && s.state === 'active').sort((a, b) => a.renewsOn!.localeCompare(b.renewsOn!)).slice(0, 4) : [];
  const openTickets = tickets.status === 'ready' ? tickets.data.filter((t) => t.state !== 'closed') : [];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Welcome${identity.status === 'ready' ? `, ${identity.data.fullName.split(/\s+/)[0]}` : ''}`}
        description="Here is what needs you today, then the health of your services."
        actions={
          <ButtonGroup aria-label="Quick actions">
            <Button variant="primary" leadingIcon="add-01" onClick={() => nav('/app/deploy')}>Deploy</Button>
            <Button variant="secondary" leadingIcon="message-01" onClick={() => nav('/app/support/new')}>New ticket</Button>
            <Button variant="secondary" leadingIcon="credit-card" onClick={() => nav('/app/billing/invoices')}>Pay invoice</Button>
          </ButtonGroup>
        }
      />

      {warnings.status === 'ready' && warnings.data.length ? (
        <section aria-labelledby="attn" className="grid gap-2">
          <h2 id="attn" className="text-lg font-extrabold tracking-[-0.03em]">Needs attention <span className="ml-1 text-ink3">{warnings.data.length}</span></h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {warnings.data.map((w) => (
              <li key={w.id}>
                <Notice tone={w.severity === 'error' ? 'bad' : 'warn'} title={w.title} action={w.action ? <Button size="sm" variant="secondary" onClick={() => nav(w.action!.to)}>{w.action.label}</Button> : undefined}>{w.detail}</Notice>
              </li>
            ))}
          </ul>
        </section>
      ) : warnings.status === 'error' ? <Notice tone="bad" title="Could not check for warnings" action={<Button size="sm" variant="secondary" onClick={warnings.reload}>Retry</Button>}>Your services are not affected.</Notice> : null}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="grid gap-3">
          {services.status === 'loading' ? <Skeleton className="h-24 w-full" /> : services.status === 'error' ? (
            <Notice tone="bad" title="Services unavailable" action={<Button size="sm" variant="secondary" onClick={services.reload}>Retry</Button>}>{services.error}</Notice>
          ) : (
            <>
              <Stat label="Services" value={svc.length} hint="Account-scoped inventory" />
              <SegmentedBar summary={`${c.running} running, ${c.stopped} stopped, ${c.suspended} suspended, ${c.problem} with errors, ${c.busy} busy`} segments={[
                { key: 'run', label: 'running', value: c.running, tone: 'bg-good' },
                { key: 'stop', label: 'stopped', value: c.stopped, tone: 'bg-s4' },
                { key: 'busy', label: 'busy', value: c.busy, tone: 'bg-warn' },
                { key: 'bad', label: 'suspended or with errors', value: c.suspended + c.problem, tone: 'bg-bad' },
              ]} />
              <p className="text-[13px] font-semibold text-ink2">{c.running} running · {c.stopped} stopped · {c.suspended} suspended{c.problem ? ` · ${c.problem} crashed` : ''}</p>
            </>
          )}
        </Card>
        <Card className="grid gap-3">
          {services.status === 'loading' ? <Skeleton className="h-24 w-full" /> : services.status === 'error' ? (
            <Notice tone="bad" title="Resource limits unavailable">No estimate is shown.</Notice>
          ) : (
            <>
              <Stat label="Allocated memory" value={mb(ramLimit)} hint="Plan limits, not live consumption" />
              <Stat label="Allocated storage" value={mb(diskLimit)} hint="Live usage is shown only when observed" />
            </>
          )}
        </Card>
        <Card className="grid gap-3">
          {invoices.status === 'loading' ? <Skeleton className="h-24 w-full" /> : invoices.status === 'error' ? (
            <Notice tone="bad" title="Billing unavailable" action={<Button size="sm" variant="secondary" onClick={invoices.reload}>Retry</Button>}>Balance was not calculated.</Notice>
          ) : (
            <>
              <Stat label="Balance due" value={dueDisplay} tone={due.some((i) => i.state === 'overdue') ? 'bad' : due.length ? 'warn' : 'good'} hint={due.length ? `${due.length} open invoice${due.length > 1 ? 's' : ''}` : 'Nothing to pay'} />
              <Link to="/app/billing/invoices" className="text-[14px] font-bold text-accent-ink hover:underline">Open invoices</Link>
            </>
          )}
        </Card>
        <Card className="grid gap-3">
          {tickets.status === 'loading' ? <Skeleton className="h-24 w-full" /> : tickets.status === 'error' ? (
            <Notice tone="bad" title="Support unavailable" action={<Button size="sm" variant="secondary" onClick={tickets.reload}>Retry</Button>}>Ticket count was not calculated.</Notice>
          ) : (
            <>
              <Stat label="Open tickets" value={openTickets.length} hint={openTickets.some((t) => t.unread) ? 'A reply is waiting for you' : 'No new replies'} />
              <Link to="/app/support" className="text-[14px] font-bold text-accent-ink hover:underline">Open support</Link>
            </>
          )}
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card as="section" aria-labelledby="svc-h">
            <CardHeader level={2} title={<span id="svc-h">Your services</span>} actions={<Button size="sm" variant="secondary" onClick={() => nav('/app/services')}>View all</Button>} />
            {services.status === 'loading' ? <div role="status" aria-label="Loading services" className="grid gap-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
              : services.status === 'error' ? <Notice tone="bad" action={<Button size="sm" variant="secondary" onClick={services.reload}>Retry</Button>}>{services.error}</Notice>
              : svc.length === 0 ? <EmptyState icon="server" title="No services yet" description="Deploy your first server in a few minutes." action={<Button variant="primary" onClick={() => nav('/app/deploy')}>Deploy a service</Button>} />
              : (
                <ul className="grid divide-y divide-ink/10">
                  {svc.slice(0, 6).map((s) => (
                    <li key={s.id}>
                      <Link to={`/app/services/${s.id}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-3 hover:bg-s2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(8rem,12rem)_auto] sm:px-2 sm:-mx-2 sm:rounded-md">
                        <WorkloadIcon workload={s.workload} />
                        <div className="min-w-0"><p className="truncate font-bold">{s.name}</p><p className="truncate text-[13px] text-ink3">{s.engine} · {s.regionName}</p></div>
                        <div className="hidden text-[13px] font-semibold text-ink3 sm:block">{s.note ?? `${mb(s.resources.ramLimitMb)} RAM allocated`}</div>
                        <div className="col-start-2 sm:col-start-auto"><ServiceStateBadge state={s.state} /></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </Card>

          <Card as="section" aria-labelledby="ev-h">
            <CardHeader level={2} title={<span id="ev-h">Important service events</span>} />
            {events.status === 'loading' ? <Skeleton className="h-32 w-full" /> : events.status === 'error' ? <Notice tone="bad" action={<Button size="sm" variant="secondary" onClick={events.reload}>Retry</Button>}>{events.error}</Notice>
              : events.data.length === 0 ? <p className="text-ink3">Nothing notable in the last 7 days.</p>
              : <Timeline label="Service events" events={events.data.map<TimelineEvent>((e) => ({ id: e.id, title: e.serviceName, description: e.text, time: relative(e.at), iso: e.at, icon: e.severity === 'error' ? 'alert-circle' : e.severity === 'warn' ? 'alert-01' : 'information-circle', tone: e.severity === 'error' ? 'bad' : e.severity === 'warn' ? 'warn' : 'neutral' }))} />}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card as="section" aria-labelledby="ren-h">
            <CardHeader level={2} title={<span id="ren-h">Upcoming renewals</span>} />
            {subs.status === 'loading' ? <Skeleton className="h-28 w-full" /> : subs.status === 'error' ? <Notice tone="bad" action={<Button size="sm" variant="secondary" onClick={subs.reload}>Retry</Button>}>{subs.error}</Notice> : renewals.length === 0 ? <p className="text-ink3">No renewals in the next 30 days.</p> : (
              <ul className="grid divide-y divide-ink/10">
                {renewals.map((r) => { const dd = daysUntil(r.renewsOn!); return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="truncate font-bold">{r.serviceName}</p><p className="text-[13px] text-ink3">{date(r.renewsOn!)} · {dd <= 0 ? 'today' : `in ${dd} days`}</p></div>
                    <p className="font-bold tabular-nums">{money(r.price)}</p>
                  </li>
                ); })}
              </ul>
            )}
          </Card>

          <Card as="section" aria-labelledby="tk-h">
            <CardHeader level={2} title={<span id="tk-h">Recent tickets</span>} actions={<Button size="sm" variant="secondary" onClick={() => nav('/app/support/new')}>New</Button>} />
            {tickets.status === 'loading' ? <Skeleton className="h-28 w-full" /> : tickets.status === 'error' ? <Notice tone="bad">{tickets.error}</Notice> : (
              <ul className="grid divide-y divide-ink/10">
                {tickets.data.slice(0, 3).map((t) => { const st = ticketStatus[(t.state === 'awaiting-customer' ? 'waiting' : t.state) as UiTicket]; return (
                  <li key={t.id}>
                    <Link to={`/app/support/${t.id}`} className="grid gap-1 py-2.5 hover:text-accent-ink">
                      <span className="flex items-center justify-between gap-2"><span className="truncate font-bold">{t.subject}</span><StatusBadge tone={st.tone}>{st.label}</StatusBadge></span>
                      <span className="text-[13px] text-ink3">{t.number} · updated {relative(t.updatedAt)}{t.unread ? ' · new reply' : ''}</span>
                    </Link>
                  </li>
                ); })}
              </ul>
            )}
          </Card>

          <Card as="section" aria-labelledby="ac-h">
            <CardHeader level={2} title={<span id="ac-h">Recent account activity</span>} actions={<Button size="sm" variant="secondary" onClick={() => nav('/app/account/activity')}>Audit trail</Button>} />
            {activity.status === 'loading' ? <Skeleton className="h-28 w-full" /> : activity.status === 'error' ? <Notice tone="bad">{activity.error}</Notice> : (
              <ul className="grid gap-2.5">
                {activity.data.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 text-[14px]">
                    <Icon name={a.outcome === 'failed' ? 'alert-circle' : 'checkmark-circle-02'} size={18} className={cn('mt-0.5 shrink-0', a.outcome === 'failed' ? 'text-bad' : 'text-ink3')} />
                    <span className="min-w-0"><span className="font-bold">{a.actor}</span> {a.action.toLowerCase()}{a.target ? <> <span className="font-semibold">{a.target}</span></> : null}<span className="block text-[13px] text-ink3">{dateTime(a.at)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
