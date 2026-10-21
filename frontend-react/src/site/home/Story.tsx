import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { Headline, Wrap } from '../ui';
import { useReducedMotion, useStickyProgress } from '../hooks';

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

interface Chapter { id: string; title: string; text: string; scene: (t: number) => ReactNode }

/* ---- Scenes: pure functions of t (0 to 1 within the chapter), so scrolling scrubs them forward and back. ---- */
function Pick({ t }: { t: number }) {
  const items: [IconName, string, string][] = [['layers-01', 'Game server', 'Minecraft and more'], ['discord', 'Discord bot', 'Node.js or Python'], ['package', 'App or API', 'Any start command']];
  const picked = t > 0.25;
  return (
    <div className="grid gap-3">
      <p className="text-[22px] font-extrabold tracking-[-0.04em]">What are you hosting?</p>
      <div className="grid grid-cols-3 gap-2.5">
        {items.map(([ic, l, s], i) => (
          <div key={l} className={cn('grid gap-2 rounded-2xl p-3 transition-colors duration-500 sm:p-4', i === 0 && picked ? 'bg-accent text-on-accent' : 'bg-s1')} style={{ transform: `translateY(${(1 - ease(t * 3 - i * 0.3)) * 24}px)`, opacity: clamp(t * 4 - i * 0.3 + 0.2) }}>
            <span className={cn('grid size-10 place-items-center rounded-xl', i === 0 && picked ? 'bg-white/20' : 'bg-accent-bg text-accent-ink')}><Icon name={ic} size={20} /></span>
            <span className="text-[15px] font-extrabold leading-tight tracking-[-0.02em]">{l}</span>
            <span className={cn('hidden text-[12.5px] sm:block', i === 0 && picked ? 'text-white/80' : 'text-ink2')}>{s}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 rounded-2xl bg-s1 p-4 transition-[opacity,transform] duration-500" style={{ opacity: clamp((t - 0.4) * 4), transform: `translateY(${(1 - clamp((t - 0.4) * 4)) * 14}px)` }}>
        <p className="text-[12.5px] font-bold text-ink2">Server type</p>
        <div className="flex flex-wrap gap-2">{['Paper', 'Fabric', 'Forge', 'Vanilla'].map((x, i) => <span key={x} className={cn('rounded-full px-3.5 py-1.5 text-[13.5px] font-bold', i === 0 ? 'bg-ink text-on-ink' : 'bg-s3 text-ink2')}>{x}</span>)}</div>
      </div>
    </div>
  );
}

function Shape({ t }: { t: number }) {
  const sizes = [['Starter', 2], ['Standard', 4], ['Large', 8]] as const;
  const idx = t < 0.35 ? 0 : t < 0.7 ? 1 : 1;
  const ram = 2 + ease(t * 1.6) * 2;
  return (
    <div className="grid gap-3">
      <p className="text-[22px] font-extrabold tracking-[-0.04em]">Pick a size that fits.</p>
      <div className="grid grid-cols-3 gap-2.5">
        {sizes.map(([n, g], i) => (
          <div key={n} className={cn('rounded-2xl p-3 transition-colors duration-500 sm:p-4', i === idx ? 'bg-ink text-on-ink' : 'bg-s1')}>
            <p className="text-[15px] font-extrabold tracking-[-0.02em]">{n}</p>
            <p className={cn('text-[26px] font-extrabold tracking-[-0.05em] tabular-nums', i === idx ? '' : 'text-ink2')}>{g}<span className="text-[14px] font-bold"> GB</span></p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-s1 p-4">
        <div className="flex justify-between text-[13px] font-bold text-ink2"><span>Memory</span><span className="tabular-nums text-ink">{ram.toFixed(1)} GB</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full bg-brand" style={{ width: `${(ram / 8) * 100}%` }} /></div>
        <p className="mt-3 text-[13.5px] text-ink2" style={{ opacity: clamp((t - 0.5) * 4) }}>Change the size later without starting over.</p>
      </div>
    </div>
  );
}

function Launch({ t }: { t: number }) {
  const steps = ['Order confirmed', 'Server created', 'Configuration applied', 'Service online'];
  const done = (i: number) => t > (i + 1) / (steps.length + 0.6);
  return (
    <div className="grid gap-3">
      <p className="text-[22px] font-extrabold tracking-[-0.04em]">Launching survival-server…</p>
      <ul className="grid gap-2">
        {steps.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-3 rounded-2xl bg-s1 p-3.5 transition-opacity duration-500', done(i) ? 'opacity-100' : 'opacity-60')}>
            <span className={cn('grid size-7 place-items-center rounded-full transition-colors duration-300', done(i) ? 'bg-good text-on-accent' : 'bg-s3 text-ink2')}>{done(i) ? <Icon name="tick-02" size={15} /> : <span className="size-2 rounded-full bg-current" />}</span>
            <span className="text-[16px] font-extrabold tracking-[-0.02em]">{s}</span>
          </li>
        ))}
      </ul>
      <div className="h-2 overflow-hidden rounded-full bg-s1"><div className="h-full rounded-full bg-brand" style={{ width: `${clamp(t * 1.15) * 100}%` }} /></div>
    </div>
  );
}

function Run({ t }: { t: number }) {
  const lines = ['Starting server instance', 'Loading configuration', 'Server started successfully', 'Ready for connections'];
  const shown = Math.floor(clamp(t * 1.6) * (lines.length + 0.99));
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between"><p className="text-[22px] font-extrabold tracking-[-0.04em]">survival-server</p><span className="inline-flex items-center gap-1.5 rounded-full bg-good-bg px-3 py-1 text-[12.5px] font-bold text-good"><span className="size-2 rounded-full bg-good" />Running</span></div>
      <div className="rounded-2xl bg-con p-4 font-mono text-[12.5px] text-con-ink">
        {lines.slice(0, shown).map((l, i) => <p key={l} className={i === 2 ? 'text-con-ok' : ''}><span className="text-con-dim">[10:32:{18 + i}]</span> {l}</p>)}
        <p className="text-con-dim">&gt; <span className="site-caret inline-block h-3 w-1.5 bg-con-ink" /></p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-2xl bg-s1 p-3.5" style={{ opacity: clamp((t - 0.45) * 5), transform: `translateY(${(1 - clamp((t - 0.45) * 5)) * 12}px)` }}><span className="grid size-9 place-items-center rounded-xl bg-accent-bg text-accent-ink"><Icon name="archive-01" size={18} /></span><span><span className="block text-[14px] font-extrabold">Backup created</span><span className="block text-[12.5px] text-ink2">Just now</span></span></div>
        <div className="flex items-center gap-3 rounded-2xl bg-s1 p-3.5" style={{ opacity: clamp((t - 0.6) * 5), transform: `translateY(${(1 - clamp((t - 0.6) * 5)) * 12}px)` }}><span className="grid size-9 place-items-center rounded-xl bg-good-bg text-good"><Icon name="user-group" size={18} /></span><span><span className="block text-[14px] font-extrabold">4 players online</span><span className="block text-[12.5px] text-ink2">TPS 20.0</span></span></div>
      </div>
    </div>
  );
}

const CHAPTERS: Chapter[] = [
  { id: 'pick', title: 'Choose what fits.', text: 'A game server, a Discord bot or an app. Fortless prepares the right environment so you do not have to.', scene: (t) => <Pick t={t} /> },
  { id: 'shape', title: 'Make it yours.', text: 'Name it, choose a size and a few settings. Every option is explained in plain words.', scene: (t) => <Shape t={t} /> },
  { id: 'launch', title: 'Press launch.', text: 'Provisioning, configuration and start-up happen for you, with every step visible.', scene: (t) => <Launch t={t} /> },
  { id: 'run', title: 'Stay in control.', text: 'Console, power controls, backups and billing live in the same panel, from the first minute.', scene: (t) => <Run t={t} /> },
];

export function Story() {
  const reduced = useReducedMotion();
  const [ref, p] = useStickyProgress<HTMLDivElement>();
  const n = CHAPTERS.length;
  const active = Math.min(n - 1, Math.floor(p * n));
  const local = (i: number) => clamp(p * n - i);

  const head = (
    <div className="grid gap-5">
      <Headline lines={['From idea to', 'online in four moves.']} className="text-[clamp(40px,6.2vw,92px)] leading-[0.92]" />
    </div>
  );

  if (reduced) {
    return (
      <section id="story" aria-label="How it works" className="py-28"><Wrap className="grid gap-12">{head}
        <ol className="grid gap-6 lg:grid-cols-2">{CHAPTERS.map((c, i) => (
          <li key={c.id} className="grid gap-4 rounded-[28px] bg-s1 p-6"><p className="text-[28px] font-extrabold tracking-[-0.05em]"><span className="mr-3 text-ink2">0{i + 1}</span>{c.title}</p><p className="text-ink2">{c.text}</p><div className="rounded-3xl bg-accent-bg p-4">{c.scene(1)}</div></li>
        ))}</ol></Wrap></section>
    );
  }

  return (
    <section id="story" aria-label="How it works" className="relative">
      <Wrap className="pb-10 pt-28">{head}</Wrap>
      <div ref={ref} className="relative" style={{ height: `${n * 85}svh` }}>
        <div className="sticky top-0 flex h-[100svh] items-center">
          <Wrap className="grid w-full items-center gap-6 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
            <div className="grid gap-5">
              <ol className="grid gap-2" aria-label="Steps">
                {CHAPTERS.map((c, i) => (
                  <li key={c.id} aria-current={i === active ? 'step' : undefined} className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-3xl p-4 transition-[background-color,opacity] duration-500 sm:p-5', i === active ? 'bg-s1' : 'opacity-75', i !== active && 'max-lg:hidden')}>
                    <span className={cn('grid size-9 place-items-center rounded-full text-[14px] font-extrabold transition-colors duration-500', i === active ? 'bg-accent text-on-accent' : i < active ? 'bg-good text-on-accent' : 'bg-s3 text-ink2')}>{i < active ? <Icon name="tick-02" size={16} /> : i + 1}</span>
                    <div><p className="text-[clamp(24px,3.2vw,40px)] font-extrabold leading-none tracking-[-0.05em]">{c.title}</p>
                      <div className={cn('grid transition-[grid-template-rows,opacity] duration-500 ease-petal', i === active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}><p className="overflow-hidden pt-2 text-[16px] text-ink2">{c.text}</p></div></div>
                  </li>
                ))}
              </ol>
            </div>
            <div data-scrub className="relative h-[clamp(360px,52svh,540px)] rounded-[32px] bg-accent-bg p-4 sm:p-6" aria-live="polite">
              {CHAPTERS.map((c, i) => (
                <div key={c.id} aria-hidden={i !== active} className={cn('absolute inset-4 grid content-center transition-[opacity,transform] duration-500 ease-petal sm:inset-6', i === active ? 'opacity-100' : 'pointer-events-none opacity-0', i < active ? '-translate-y-4' : i > active ? 'translate-y-4' : '')}>{c.scene(local(i))}</div>
              ))}
            </div>
          </Wrap>
        </div>
      </div>
    </section>
  );
}
