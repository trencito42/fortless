import { cn } from '@/lib/utils/cn';
import { Icon } from '@/design-system';
import { Wrap } from '../ui';
import { HEALTH_LABEL, HEALTH_TONE, useStatus, type Health, type Incident } from '../data/status';

const DOT = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad', accent: 'bg-accent' } as const;
const TEXT = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', accent: 'text-accent-ink' } as const;
const BANNER = { OPERATIONAL: ['good', 'All systems operational'], DEGRADED: ['warn', 'Some systems are degraded'], MAJOR_OUTAGE: ['bad', 'Major outage'], MAINTENANCE: ['accent', 'Maintenance in progress'] } as const;
const IMPACT: Record<Incident['impact'], string> = { NONE: 'No impact', MINOR: 'Minor', MAJOR: 'Major', CRITICAL: 'Critical' };
const STAGE: Record<Incident['status'], string> = { INVESTIGATING: 'Investigating', IDENTIFIED: 'Identified', MONITORING: 'Monitoring', RESOLVED: 'Resolved' };
const stamp = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)) + ' UTC';

function Dot({ h }: { h: Health }) { return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', DOT[HEALTH_TONE[h]])} />; }

function IncidentItem({ n }: { n: Incident }) {
  const updates = [...n.updates].reverse();
  return (
    <li className="grid gap-2 rounded-2xl bg-s1 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] font-extrabold tracking-[-0.02em]">{n.title}</h3>
        <p className="text-[13px] text-ink3">{IMPACT[n.impact]} impact · {STAGE[n.status]}</p>
      </div>
      <p className="text-[13px] text-ink3">Started {stamp(n.createdAt)}{n.resolvedAt ? ` · Resolved ${stamp(n.resolvedAt)}` : ''}</p>
      {updates.length ? <ol className="mt-1 grid gap-2">{updates.map((u) => <li key={u.id} className="grid gap-0.5 sm:grid-cols-[130px_1fr] sm:gap-3"><p className="text-[13px] font-bold text-ink2">{STAGE[u.status]}<span className="block font-medium text-ink3">{stamp(u.createdAt)}</span></p><p className="text-[14.5px] text-ink2">{u.message}</p></li>)}</ol> : null}
    </li>
  );
}

/** A reference page, not a landing page: compact, neutral, and it only says what the status feed says. */
export default function Status() {
  const { snap, error, busy, refresh } = useStatus();
  const groups = new Map<string, NonNullable<typeof snap>['components']>();
  for (const c of snap?.components ?? []) groups.set(c.groupName, [...(groups.get(c.groupName) ?? []), c]);
  const [tone, label] = snap ? BANNER[snap.indicator] : ['accent', ''] as const;
  const maintenance = (snap?.components ?? []).filter((c) => c.status === 'MAINTENANCE');

  return (
    <Wrap className="grid max-w-[880px] gap-8 pb-20 pt-[112px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[28px] font-extrabold tracking-[-0.04em]">System status</h1>
          <p className="text-[14px] text-ink3">{snap ? `Last updated ${stamp(snap.generatedAt)}` : error ? 'Last update unavailable' : 'Loading…'}</p></div>
        <button type="button" onClick={refresh} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-full bg-s3 px-4 text-[13.5px] font-bold outline-none hover:bg-s4 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"><Icon name="refresh" size={15} className={busy ? 'animate-spin' : ''} />Refresh</button>
      </header>

      {error && !snap ? (
        <div role="alert" className="rounded-2xl bg-s1 p-5"><p className="flex items-center gap-2 text-[17px] font-extrabold"><Icon name="alert-circle" size={18} className="text-warn" />Status is unavailable</p>
          <p className="mt-1 text-[14.5px] text-ink2">We could not read the status feed, so we can’t tell you whether systems are healthy. Please try again in a moment, or contact support if you need help right now.</p></div>
      ) : null}
      {error && snap ? <p role="alert" className="rounded-xl bg-warn-bg px-4 py-2.5 text-[13.5px] font-semibold text-warn">The latest refresh failed. Showing the last information we received.</p> : null}

      {snap ? (
        <>
          <p role="status" className={cn('flex items-center gap-3 rounded-2xl bg-s1 p-4 text-[18px] font-extrabold tracking-[-0.02em] sm:p-5', TEXT[tone])}><span aria-hidden="true" className={cn('size-2.5 rounded-full', DOT[tone])} /><span className="text-ink">{label}</span></p>

          {snap.activeIncidents.length ? <section aria-labelledby="st-active" className="grid gap-3"><h2 id="st-active" className="text-[15px] font-extrabold text-ink2">Current incidents</h2><ul className="grid gap-2">{snap.activeIncidents.map((n) => <IncidentItem key={n.id} n={n} />)}</ul></section> : null}

          {maintenance.length ? <section aria-labelledby="st-maint" className="grid gap-3"><h2 id="st-maint" className="text-[15px] font-extrabold text-ink2">Maintenance</h2><ul className="grid gap-2">{maintenance.map((c) => <li key={c.id} className="rounded-2xl bg-s1 p-4 text-[14.5px]"><span className="font-bold">{c.name}</span> <span className="text-ink2">is under maintenance. Since {stamp(c.updatedAt)}.</span></li>)}</ul></section> : null}

          <section aria-labelledby="st-comp" className="grid gap-3">
            <h2 id="st-comp" className="text-[15px] font-extrabold text-ink2">Components</h2>
            {snap.components.length === 0 ? <p className="rounded-2xl bg-s1 p-4 text-[14.5px] text-ink2">No components are published yet.</p> : [...groups].map(([g, list]) => (
              <div key={g} className="overflow-hidden rounded-2xl bg-s1">
                <p className="px-4 pt-3 text-[12.5px] font-bold text-ink3 sm:px-5">{g}</p>
                <ul className="grid gap-px">{list.map((c) => <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><span className="text-[15px] font-bold">{c.name}</span><span className={cn('inline-flex items-center gap-2 text-[13.5px] font-bold', TEXT[HEALTH_TONE[c.status]])}><Dot h={c.status} />{HEALTH_LABEL[c.status]}</span></li>)}</ul>
              </div>
            ))}
          </section>

          <section aria-labelledby="st-past" className="grid gap-3">
            <h2 id="st-past" className="text-[15px] font-extrabold text-ink2">Incident history</h2>
            {snap.pastIncidents.length === 0 ? <p className="rounded-2xl bg-s1 p-4 text-[14.5px] text-ink2">No past incidents have been published.</p> : <ul className="grid gap-2">{snap.pastIncidents.map((n) => <IncidentItem key={n.id} n={n} />)}</ul>}
          </section>
        </>
      ) : null}
    </Wrap>
  );
}
