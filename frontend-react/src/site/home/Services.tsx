import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { Headline, Reveal, StatusDot, Wrap } from '../ui';
import { useTopic } from '../TopicModal';

type Look = { card: string; sub: string; tile: string; mini: string; pill: string };
const LOOK: Record<'blue' | 'lime' | 'night' | 'paper', Look> = {
  blue: { card: 'bg-accent text-on-accent', sub: 'text-on-accent', tile: 'bg-white/20', mini: 'bg-night text-night-ink', pill: 'bg-white/20 group-hover:bg-white group-hover:text-accent' },
  lime: { card: 'bg-lime text-lime-ink', sub: 'text-lime-ink/80', tile: 'bg-lime-ink/10', mini: 'bg-lime-ink/10', pill: 'bg-lime-ink/10 group-hover:bg-lime-ink group-hover:text-lime' },
  night: { card: 'bg-night text-night-ink', sub: 'text-night-dim', tile: 'bg-night3', mini: 'bg-night2', pill: 'bg-night3 group-hover:bg-lime group-hover:text-lime-ink' },
  paper: { card: 'bg-s1 text-ink', sub: 'text-ink2', tile: 'bg-warn-bg text-warn', mini: 'bg-s2', pill: 'bg-s3 group-hover:bg-ink group-hover:text-on-ink' },
};

function Card({ topic, look, icon, title, text, cta, className, delay, children }: { topic: string; look: keyof typeof LOOK; icon: IconName; title: string; text: string; cta: string; className?: string; delay: number; children: ReactNode }) {
  const { open } = useTopic();
  const L = LOOK[look];
  return (
    <Reveal delay={delay} className={className}>
      <button type="button" onClick={() => open(topic)} aria-haspopup="dialog" aria-label={`${title}: ${cta}`}
        className={cn('group relative grid h-full min-h-[360px] w-full content-between gap-8 overflow-hidden rounded-[32px] p-6 text-left outline-none transition-transform duration-500 ease-spring hover:-translate-y-1.5 hover:-rotate-[0.6deg] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.985] sm:p-8', L.card)}>
        <div className="grid gap-4">
          <span className={cn('grid size-14 place-items-center rounded-2xl transition-transform duration-500 ease-spring group-hover:rotate-[-8deg] group-hover:scale-110', L.tile)}><Icon name={icon} size={28} /></span>
          <div><p className="site-h text-[clamp(32px,3.6vw,48px)] font-extrabold leading-none tracking-[-0.055em]">{title}</p><p className={cn('mt-3 max-w-md text-[17px]', L.sub)}>{text}</p></div>
        </div>
        <div className="grid gap-4">
          <div className={cn('rounded-2xl p-4', L.mini)} aria-hidden="true">{children}</div>
          <span className="flex items-center justify-between text-[15px] font-bold">{cta}<span className={cn('grid size-11 place-items-center rounded-full transition-[background-color,color,transform] duration-500 ease-spring group-hover:rotate-45', L.pill)}><Icon name="arrow-up-right-01" size={20} /></span></span>
        </div>
      </button>
    </Reveal>
  );
}

export function Services() {
  return (
    <section id="services" aria-label="What you can host" className="py-28">
      <Wrap className="grid gap-12">
        <div className="grid gap-5"><Headline lines={['Whatever you’re building,', 'give it a home.']} className="text-[clamp(40px,6.2vw,92px)] leading-[0.92]" />
          <Reveal delay={200}><p className="max-w-xl text-[19px] text-ink2">From a small community bot to your next big project. Tap a card to see it working.</p></Reveal></div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7" delay={0} topic="games" look="blue" icon="layers-01" title="Game servers" text="A world for your friends or your whole community, kept running without the setup maze." cta="See a game server">
            <div className="flex items-center justify-between font-mono text-[12.5px]"><span><span className="text-night-dim">[10:32:21]</span> <span className="text-lime">Server started successfully</span></span><span className="hidden items-center gap-1.5 font-sans font-bold sm:flex"><StatusDot tone="good" live />4 online</span></div>
            <div className="mt-3 flex">{['A', 'M', 'D', 'I'].map((x, i) => <span key={x} className="grid size-9 place-items-center rounded-full bg-white text-[12.5px] font-extrabold text-accent ring-2 ring-accent" style={{ marginLeft: i ? -8 : 0 }}>{x}</span>)}</div>
          </Card>
          <Card className="lg:col-span-5" delay={100} topic="bots" look="lime" icon="discord" title="Discord bots" text="Host the bots your community depends on. Built for processes that never sleep." cta="See a bot running">
            <div className="flex items-center gap-3"><span className="relative grid size-11 place-items-center rounded-full bg-lime-ink text-lime"><Icon name="discord" size={22} /><span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-good ring-2 ring-lime" /></span><div><p className="font-extrabold">community-bot</p><p className="text-[13px] opacity-75">Online · 38 ms</p></div></div>
          </Card>
          <Card className="lg:col-span-5" delay={0} topic="apps" look="night" icon="package" title="Apps and APIs" text="Node.js services with a start command, environment variables and a deploy log you can read." cta="Deploy an app">
            <p className="font-mono text-[12.5px]"><span className="text-night-dim">$</span> npm start</p><p className="font-mono text-[12.5px] text-con-ok">✓ Listening on port 3000</p>
          </Card>
          <Card className="lg:col-span-7" delay={100} topic="domains" look="paper" icon="globe-02" title="Domains" text="Find a name and point it at the services it belongs to, with DNS records you can edit in one place." cta="Edit some records">
            <ul className="grid gap-1.5 font-mono text-[12.5px]">{[['A', '@', '203.0.113.10'], ['CNAME', 'www', 'yourname.example']].map(([t, n, v]) => <li key={n} className="flex items-center gap-3"><span className="w-14 font-bold">{t}</span><span className="w-10 text-ink3">{n}</span><span className="min-w-0 flex-1 truncate text-ink2">{v}</span></li>)}</ul>
          </Card>
        </div>
      </Wrap>
    </section>
  );
}
