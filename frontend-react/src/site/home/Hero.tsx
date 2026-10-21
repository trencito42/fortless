import { Icon } from '@/design-system';
import { cn } from '@/lib/utils/cn';
import { Headline, Reveal, SiteButton, StatusDot, Wrap } from '../ui';
import { scrollToId, useReducedMotion, useScrollY } from '../hooks';
import { WorkspaceDemo } from './WorkspaceDemo';

/** Stickers: small cards that pop in around the headline, float, and straighten up on hover. Illustrative content. */
function Stickers() {
  const base = 'site-pop absolute rounded-[26px] shadow-[0_18px_40px_-18px_rgb(11_26_43/0.45)] transition-transform duration-500 ease-spring hover:z-10 hover:scale-110 hover:!rotate-0';
  return (
    <div aria-hidden="true" data-decorative className="pointer-events-none absolute right-0 top-2 hidden h-[480px] w-[400px] xl:block">
      <div className={cn(base, 'pointer-events-auto right-16 top-0 w-[270px] bg-accent p-4 text-on-accent')} style={{ rotate: '-4deg', animationDelay: '700ms' }}>
        <div className="site-float" style={{ animationDelay: '-1s' }}>
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white/20"><Icon name="layers-01" size={22} /></span><div className="min-w-0 flex-1"><p className="truncate font-extrabold">survival-server</p><p className="text-[12.5px] opacity-80">Minecraft · Frankfurt</p></div></div>
          <div className="mt-3 flex items-end gap-1" style={{ height: 34 }}>{[40, 62, 48, 80, 55, 70, 38, 66, 52, 74].map((h, i) => <span key={i} className="w-full rounded-full bg-white/80" style={{ height: `${h}%` }} />)}</div>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-bold"><StatusDot tone="good" live />Running · 39% CPU</p>
        </div>
      </div>
      <div className={cn(base, 'pointer-events-auto right-0 top-[196px] flex items-center gap-3 bg-lime px-4 py-3 text-lime-ink')} style={{ rotate: '5deg', animationDelay: '900ms' }}>
        <span className="grid size-10 place-items-center rounded-full bg-lime-ink text-lime"><Icon name="archive-01" size={20} /></span>
        <div><p className="font-extrabold leading-tight">Backup done</p><p className="text-[12.5px] opacity-75">1.2 GB · 04:00</p></div>
      </div>
      <div className={cn(base, 'pointer-events-auto right-28 top-[286px] flex items-center gap-3 bg-s1 px-4 py-3 text-ink')} style={{ rotate: '-2deg', animationDelay: '1100ms' }}>
        <span className="grid size-10 place-items-center rounded-full bg-violet-bg text-[14px] font-extrabold text-violet">A</span>
        <p className="text-[14.5px]"><span className="font-extrabold">Ana</span> joined <span className="font-bold text-accent-ink">survival-server</span></p>
      </div>
      <div className={cn(base, 'pointer-events-auto right-4 top-[372px] flex items-center gap-3 bg-night px-4 py-3 text-night-ink')} style={{ rotate: '3deg', animationDelay: '1300ms' }}>
        <span className="relative grid size-10 place-items-center rounded-full bg-night3"><Icon name="discord" size={20} /><span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-con-ok ring-2 ring-night" /></span>
        <div><p className="font-extrabold leading-tight">community-bot</p><p className="text-[12.5px] text-night-dim">Online · 38 ms</p></div>
      </div>
    </div>
  );
}

export function Hero() {
  const y = useScrollY();
  const reduced = useReducedMotion();
  const k = reduced ? 1 : Math.min(1, y / 420);
  return (
    <section aria-labelledby="hero-title" className="relative pt-[120px] sm:pt-[132px]">
      <Wrap className="relative">
        <Stickers />
        <Headline as="h1" lines={['Hosting,', 'minus the', 'hassle.']} nowrap className="mt-6 text-[clamp(60px,13.2vw,190px)] leading-[0.9]" />
        <Reveal delay={500} className="mt-8 grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <p id="hero-title" className="max-w-xl text-[19px] leading-snug text-ink2 sm:text-[22px]">Launch a game server, a Discord bot or an app in minutes, then run it from one calm control panel. Console, files, backups and billing included.</p>
          <div className="flex flex-wrap gap-3">
            <SiteButton to="/register" size="lg" icon="arrow-up-right-01">Start hosting</SiteButton>
            <SiteButton variant="soft" size="lg" onClick={() => scrollToId('story')}><Icon name="play" size={16} />See how it works</SiteButton>
          </div>
        </Reveal>
        <Reveal delay={250} className="mt-14 [perspective:1600px]">
          <div className="origin-top will-change-transform" style={{ transform: `rotateX(${(1 - k) * 9}deg) scale(${0.955 + k * 0.045})`, opacity: 0.86 + k * 0.14 }}>
            <WorkspaceDemo />
          </div>
          <p className="mt-3 px-2 text-[13px] text-ink3">Interface preview with sample data, not a live service. Try it: switch services, press Restart, or type <code className="rounded bg-s3 px-1.5 py-0.5 font-mono text-[12px] text-ink">help</code> in the console.</p>
        </Reveal>
      </Wrap>
    </section>
  );
}
