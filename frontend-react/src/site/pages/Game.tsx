import { useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/design-system';
import { CATALOG } from '@/app/fixtures/catalog';
import { useRouter, match } from '@/app/router';
import { Headline, Reveal, SiteButton, StatusDot, Wrap } from '../ui';
import { useTopic } from '../TopicModal';
import { GAMES, gameBySlug, type Game } from '../fixtures/games';
import { eur, gb, useCatalogPlans, type LivePlan } from '../data/catalog';

const TONE = {
  blue: 'bg-accent text-on-accent', lime: 'bg-lime text-lime-ink', night: 'bg-night text-night-ink', paper: 'bg-s1 text-ink',
} as const;
const monthly = (p: LivePlan) => p.prices.find((x) => x.interval === 'MONTHLY' && x.currency === 'EUR');

const deployUrl = (g: Game, planId: string) => `/app/deploy?workload=${encodeURIComponent(g.workload)}${planId ? `&plan=${encodeURIComponent(planId)}` : ''}`;

function GameHero({ g, planName, planId }: { g: Game; planName: string; planId: string }) {
  const { open } = useTopic();
  return (
    <section aria-label={`${g.name} hosting`} className="pt-32 pb-10 sm:pt-40">
      <Wrap className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid gap-7">
          <Headline as="h1" lines={[`${g.name} hosting.`, ...g.headline]} className="text-[clamp(44px,7vw,108px)] leading-[0.9]" />
          <Reveal delay={400} className="grid gap-7">
            <p className="max-w-xl text-[19px] text-ink2">{g.lede}</p>
            <div className="flex flex-wrap gap-3">
              <SiteButton to={deployUrl(g, planId)} size="lg" icon="arrow-up-right-01">Start a {g.name} server</SiteButton>
              <SiteButton size="lg" variant="soft" onClick={() => open('console')}>Try the console</SiteButton>
            </div>
            {planName ? <p className="text-[14px] text-ink3">Selected plan: {planName}. <a href="#plans" className="font-bold text-ink2 underline-offset-4 hover:underline">Compare plans</a></p> : null}
          </Reveal>
        </div>
        <Reveal delay={250}>
          <div className="relative">
            <div className="site-pop rounded-[32px] bg-lime p-5 text-lime-ink shadow-[0_30px_60px_-30px_rgb(11_26_43/0.5)]" style={{ rotate: '-2deg' }}>
              <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-lime-ink text-lime"><Icon name={g.icon} size={24} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[18px] font-extrabold leading-tight">survival-server</p><p className="truncate text-[13px]">{g.address}</p></div>
                <span className="flex items-center gap-1.5 rounded-full bg-lime-ink/10 px-3 py-1 text-[13px] font-bold"><StatusDot tone="good" live />Running</span></div>
              <div className="mt-4 rounded-2xl bg-night p-4 font-mono text-[12.5px] leading-relaxed text-night-ink" aria-hidden="true">
                {g.consoleLines.map(([k, t], i) => <p key={i} className={k === 'ok' ? 'text-con-ok' : k === 'dim' ? 'text-night-dim' : ''}>{t}</p>)}
              </div>
            </div>
            <div aria-hidden="true" className="site-pop absolute -bottom-6 -left-3 flex items-center gap-3 rounded-[22px] bg-s1 px-4 py-3 shadow-[0_18px_40px_-18px_rgb(11_26_43/0.45)] sm:-left-8" style={{ rotate: '3deg', animationDelay: '600ms' }}>
              <span className="grid size-10 place-items-center rounded-full bg-violet-bg text-[14px] font-extrabold text-violet">A</span>
              <p className="text-[14.5px]"><span className="font-extrabold">Ana</span> joined the server</p>
            </div>
          </div>
        <p className="mt-8 text-[12.5px] text-ink3">Illustration with sample data, not a live server.</p>
        </Reveal>
      </Wrap>
    </section>
  );
}

function Reasons({ g }: { g: Game }) {
  return (
    <section aria-label={`Why ${g.name} on Fortless`} className="py-20">
      <Wrap className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="sr-only">Why {g.name} on Fortless</h2>
        {g.reasons.map((r, i) => (
          <Reveal key={r.title} delay={i * 80}>
            <div className={cn('group grid h-full min-h-[260px] content-between gap-8 rounded-[32px] p-6 transition-transform duration-500 ease-spring hover:-translate-y-1.5 hover:-rotate-[0.6deg]', TONE[r.tone])}>
              <span className="grid size-12 place-items-center rounded-2xl bg-white/15 transition-transform duration-500 ease-spring group-hover:rotate-[-8deg] group-hover:scale-110"><Icon name={r.icon} size={24} /></span>
              <div><h3 className="text-[26px] font-extrabold leading-none tracking-[-0.05em]">{r.title}</h3><p className="mt-3 text-[15.5px] ">{r.text}</p></div>
            </div>
          </Reveal>
        ))}
      </Wrap>
    </section>
  );
}

function Engines({ g }: { g: Game }) {
  const c = CATALOG[g.workload];
  const [id, setId] = useState(c.engines.find((e) => e.recommended)?.id ?? c.engines[0]!.id);
  const e = c.engines.find((x) => x.id === id)!;
  const uid = useId();
  return (
    <section aria-label="Engines and presets" className="py-20">
      <Wrap className="grid gap-12">
        <Headline lines={['Choose how it', 'plays.']} className="text-[clamp(40px,6vw,88px)] leading-[0.92]" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Reveal className="rounded-[32px] bg-s1 p-6">
            <p id={uid} className="text-[15px] font-bold text-ink2">Engine</p>
            <div role="radiogroup" aria-labelledby={uid} className="mt-3 flex flex-wrap gap-2">
              {c.engines.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === id} onClick={() => setId(x.id)}
                  className={cn('h-12 rounded-full px-5 text-[15px] font-extrabold outline-none transition-[background-color,color,transform] duration-300 ease-spring focus-visible:ring-2 focus-visible:ring-accent active:scale-95', x.id === id ? 'bg-accent text-on-accent' : 'bg-s3 text-ink hover:bg-s4')}>
                  {x.label}</button>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-s2 p-5" aria-live="polite">
              <p className="text-[24px] font-extrabold tracking-[-0.04em]">{e.label}{e.recommended ? <span className="ml-2 rounded-full bg-accent-bg px-3 py-1 align-middle text-[12.5px] font-bold text-accent-ink">Most popular choice</span> : null}</p>
              <p className="mt-1 text-[16px] text-ink2">{e.description}</p>
              <p className="mt-4 flex flex-wrap gap-2">{e.versions.map((v) => <span key={v} className="rounded-full bg-s3 px-3 py-1 font-mono text-[13px]">{v}</span>)}</p>
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {c.presets.map((p, i) => (
              <Reveal key={p.id} delay={i * 70}>
                <div className="grid h-full content-between gap-6 rounded-[28px] bg-s1 p-5 transition-transform duration-500 ease-spring hover:-translate-y-1">
                  <div><h3 className="text-[22px] font-extrabold tracking-[-0.04em]">{p.label}</h3><p className="mt-1 text-[15px] text-ink2">{p.description}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Wrap>
    </section>
  );
}

function Plans({ g, plan, set, state }: { g: Game; plan: string; set: (id: string) => void; state: ReturnType<typeof useCatalogPlans> }) {
  const list = state.plans.filter((p) => monthly(p));
  return (
    <section id="plans" aria-label="Plans" className="py-20">
      <Wrap className="grid gap-12">
        <Headline lines={['Pick a size.', 'Change it later.']} className="text-[clamp(40px,6vw,88px)] leading-[0.92]" />
        {state.status === 'loading' ? <div className="h-64 rounded-[32px] bg-s1" aria-busy="true" aria-label="Loading plans" /> : null}
        {state.status === 'error' ? <p role="alert" className="rounded-[24px] bg-s1 p-6 text-[16px] text-ink2">Plans and prices could not be loaded right now. Try again in a moment; the price is always shown before you pay.</p> : null}
        {state.status === 'ready' && list.length === 0 ? <p className="rounded-[24px] bg-s1 p-6 text-[16px] text-ink2">{g.name} plans are not published yet, so there is nothing to order today. Create an account and we will show them here as soon as they open.</p> : null}
        {list.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((p, i) => {
              const on = plan === p.planVersionId;
              const m = monthly(p)!;
              return (
                <Reveal as="li" key={p.planVersionId} delay={i * 70}>
                  <button type="button" aria-pressed={on} onClick={() => set(p.planVersionId)} className={cn('grid h-full w-full content-between gap-8 rounded-[32px] p-6 text-left outline-none transition-[transform,background-color] duration-500 ease-spring hover:-translate-y-1.5 focus-visible:ring-2 focus-visible:ring-accent', on ? 'bg-accent text-on-accent' : 'bg-s1')}>
                    <div><p className="text-[28px] font-extrabold tracking-[-0.05em]">{p.planName}</p>
                      <p className="mt-3 flex items-baseline gap-1"><span className="text-[44px] font-extrabold leading-none tracking-[-0.06em]">{eur(m.priceMinorUnits)}</span><span className="text-[14px]">/ month</span></p>
                      {m.setupFeeMinorUnits ? <p className="mt-1 text-[13px]">Plus {eur(m.setupFeeMinorUnits)} one-time setup</p> : null}</div>
                    <ul className="grid gap-1.5 text-[14.5px]">
                      {[`${gb(p.resources.memoryMb)} memory`, `${gb(p.resources.diskMb)} storage`, `${p.resources.backups} backups`, `${p.resources.databases} databases`].map((f) => <li key={f} className="flex items-center gap-2"><Icon name="checkmark-circle-02" size={16} className="shrink-0" />{f}</li>)}
                    </ul>
                  </button>
                </Reveal>
              );
            })}
          </ul>
        ) : null}
        <p className="text-[13px] text-ink3">Prices come from the live catalog. Taxes and the final total are shown before checkout.</p>
      </Wrap>
    </section>
  );
}

function GameFaq({ g }: { g: Game }) {
  const [open, setOpen] = useState(0);
  const uid = useId();
  return (
    <section aria-label={`${g.name} questions`} className="py-20">
      <Wrap className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <Headline lines={['Good to', 'know.']} className="text-[clamp(40px,5.2vw,76px)] leading-[0.92]" />
        <ul className="grid gap-2.5">
          {g.faq.map(([q, a], i) => (
            <Reveal as="li" key={q} delay={i * 60}>
              <div className="rounded-[24px] bg-s1">
                <h3><button type="button" id={`${uid}-q${i}`} aria-expanded={open === i} aria-controls={`${uid}-a${i}`} onClick={() => setOpen(open === i ? -1 : i)} className="flex min-h-16 w-full items-center justify-between gap-4 rounded-[24px] px-6 py-4 text-left text-[18px] font-extrabold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-accent">{q}<Icon name="add-01" className="shrink-0 transition-transform duration-500 ease-spring" style={{ rotate: open === i ? '45deg' : '0deg' }} size={20} /></button></h3>
                <div id={`${uid}-a${i}`} role="region" aria-labelledby={`${uid}-q${i}`} className={cn('grid transition-[grid-template-rows] duration-500 ease-spring', open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}><div className="overflow-hidden"><p className="px-6 pb-5 text-[16px] text-ink2">{a}</p></div></div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

function Closing({ g }: { g: Game }) {
  const others = GAMES.filter((x) => x.slug !== g.slug);
  return (
    <section aria-label="Get started" className="py-12">
      <Wrap>
        <div className="grid gap-8 rounded-[40px] bg-night p-8 text-night-ink sm:p-14">
          <Headline lines={['Ready when', 'your friends are.']} className="text-[clamp(44px,7vw,108px)] leading-[0.9]" />
          <div className="flex flex-wrap gap-3"><SiteButton to={deployUrl(g, "")} size="lg" variant="lime" icon="arrow-up-right-01">Start a {g.name} server</SiteButton><SiteButton to="/" size="lg" variant="night">See everything you can host</SiteButton></div>
          {others.length ? <p className="text-[15px] text-night-dim">Also on Fortless: {others.map((o) => o.name).join(', ')}.</p> : null}
        </div>
      </Wrap>
    </section>
  );
}

export default function GamePage() {
  const { path } = useRouter();
  const g = gameBySlug(match('/games/:slug', path)?.slug ?? '');
  const state = useCatalogPlans(g?.workload ?? '');
  const [chosen, setChosen] = useState('');
  if (!g) return (
    <Wrap className="grid gap-6 py-40"><h1 className="text-[clamp(40px,6vw,88px)] font-extrabold leading-[0.92] tracking-[-0.055em]">That game isn’t here.</h1><div><SiteButton to="/" variant="ink">Back to home</SiteButton></div></Wrap>
  );
  const plan = state.plans.find((p) => p.planVersionId === chosen);
  return (<><GameHero g={g} planName={plan?.planName ?? ''} planId={plan?.planVersionId ?? ''} /><Reasons g={g} /><Engines g={g} /><Plans g={g} plan={chosen} set={setChosen} state={state} /><GameFaq g={g} /><Closing g={g} /></>);
}
