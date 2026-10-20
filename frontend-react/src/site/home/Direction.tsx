import { Icon } from '@/design-system';
import { Link } from '@/app/router';
import { Headline, Reveal, StatusDot, Wrap } from '../ui';
import { HEALTH_LABEL, HEALTH_TONE, useStatus } from '../data/status';

/** Live read of /api/v1/status. If the feed cannot be read this says so instead of showing a green dot. */
export function Direction() {
  const { snap, error } = useStatus();
  const tone = snap ? (snap.indicator === 'OPERATIONAL' ? 'good' : snap.indicator === 'MAJOR_OUTAGE' ? 'bad' : 'warn') : 'idle';
  return (
    <section aria-label="System status" className="py-28">
      <Wrap className="grid gap-12">
        <div className="grid gap-5"><p className="text-[14px] font-bold text-ink3">In the open</p><Headline lines={['Check how', 'we’re doing.']} className="text-[clamp(40px,6.2vw,92px)] leading-[0.92]" /></div>
        <Reveal>
          <Link to="/status" className="group grid gap-6 rounded-[28px] bg-s1 p-6 outline-none transition-colors hover:bg-s2 focus-visible:ring-2 focus-visible:ring-accent sm:p-8">
            <div className="flex items-center justify-between"><p className="text-[32px] font-extrabold tracking-[-0.05em]">System status</p><span className="grid size-10 place-items-center rounded-full bg-s3 transition-colors group-hover:bg-brand group-hover:text-white"><Icon name="arrow-up-right-01" size={18} /></span></div>
            <p className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.03em]"><StatusDot tone={tone} />{snap ? snap.headline : error ? 'Status is currently unavailable' : 'Checking…'}</p>
            {snap && snap.components.length ? <ul className="grid gap-1.5 sm:grid-cols-2">{snap.components.slice(0, 6).map((c) => <li key={c.id} className="flex items-center justify-between rounded-xl bg-s2 px-3.5 py-2.5 text-[14px] font-bold transition-colors group-hover:bg-s1">{c.name}<span className={HEALTH_TONE[c.status] === 'good' ? 'text-good' : 'text-warn'}>{HEALTH_LABEL[c.status]}</span></li>)}</ul> : null}
          </Link>
        </Reveal>
      </Wrap>
    </section>
  );
}
