import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { Headline, Wrap } from '../ui';
import { useInView } from '../hooks';
import { useTopic } from '../TopicModal';

function Tile({ icon, topic, title, text, className, dark, children, delay = 0 }: { icon: IconName; topic: string; title: string; text: string; className?: string; dark?: boolean; delay?: number; children: (seen: boolean) => ReactNode }) {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px -10% 0px');
  const { open } = useTopic();
  return (
    <div ref={ref} data-in={seen ? '' : undefined} style={{ '--d': delay } as React.CSSProperties} className={cn('rv relative grid content-between gap-6 rounded-[28px] p-6 sm:p-7', dark ? 'bg-night text-night-ink' : 'bg-s1', className)}>
      <button type="button" onClick={() => open(topic)} aria-haspopup="dialog" aria-label={`Try ${title}`} className={cn('absolute right-5 top-5 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold outline-none transition-[background-color,transform] duration-300 ease-spring hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent', dark ? 'bg-lime text-lime-ink' : 'bg-s3 text-ink hover:bg-ink hover:text-on-ink')}>Try it<Icon name="arrow-up-right-01" size={16} /></button>
      <div className="grid gap-3">
        <span className={cn('grid size-11 place-items-center rounded-2xl', dark ? 'bg-night3 text-lime' : 'bg-accent-bg text-accent-ink')}><Icon name={icon} size={22} /></span>
        <div><p className="site-h text-[clamp(26px,2.6vw,34px)] font-extrabold leading-none tracking-[-0.05em]">{title}</p><p className={cn('mt-2 max-w-sm text-[15.5px]', dark ? 'text-night-dim' : 'text-ink2')}>{text}</p></div>
      </div>
      <div aria-hidden="true">{children(seen)}</div>
    </div>
  );
}

const Row = ({ children, i, seen }: { children: ReactNode; i: number; seen: boolean }) => <li className="flex items-center gap-3 rounded-xl bg-s2 px-3.5 py-2.5 transition-[opacity,transform] duration-700 ease-petal" style={{ transitionDelay: `${300 + i * 140}ms`, opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(10px)' }}>{children}</li>;

export function Platform() {
  return (
    <section id="platform" aria-label="Platform" className="py-28">
      <Wrap className="grid gap-12">
        <div className="grid gap-5"><Headline lines={['Everything you need.', 'None of the clutter.']} className="text-[clamp(40px,6.2vw,92px)] leading-[0.92]" /></div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Tile className="lg:col-span-2" dark icon="terminal" topic="console" title="A console that feels instant" text="Watch your service start, type commands and see the answer. No SSH client, no port juggling.">
            {(seen) => <div className="rounded-2xl bg-con p-4 font-mono text-[12.5px] text-con-ink">
              {[['[10:41:02]', 'Starting server instance'], ['[10:41:05]', 'Loading configuration'], ['[10:41:09]', '✓ Ready for connections']].map(([t, l], i) => <p key={l} className={cn('transition-opacity duration-500', l!.startsWith('✓') && 'text-con-ok')} style={{ opacity: seen ? 1 : 0, transitionDelay: `${400 + i * 450}ms` }}><span className="text-con-dim">{t}</span> {l}</p>)}
              <p className="mt-1 text-white transition-opacity duration-500" style={{ opacity: seen ? 1 : 0, transitionDelay: '1900ms' }}>&gt; say Backup in 5 minutes<span className="site-caret ml-0.5 inline-block h-3 w-1.5 bg-con-ink" /></p></div>}
          </Tile>
          <Tile delay={100} icon="folder-01" topic="files" title="Files in the browser" text="Edit and upload files without a separate client.">
            {(seen) => <ul className="grid gap-1.5 text-[13.5px] font-bold">
              <Row i={0} seen={seen}><Icon name="folder-01" size={16} className="text-ink3" />plugins<span className="ml-auto font-medium text-ink3">12 items</span></Row>
              <Row i={1} seen={seen}><Icon name="file-01" size={16} className="text-ink3" />server.properties<span className="ml-auto font-medium text-ink3">1.2 KB</span></Row>
              <li className="rounded-xl bg-s2 px-3.5 py-2.5"><div className="flex justify-between text-[12.5px]"><span>world.zip</span><span className="text-ink3">{seen ? '72%' : '0%'}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full bg-brand transition-[width] duration-[1800ms] ease-petal" style={{ width: seen ? '72%' : '0%', transitionDelay: '700ms' }} /></div></li></ul>}
          </Tile>
          <Tile icon="archive-01" topic="backups" title="Backups" text="Restore points you can trust before you try something risky.">
            {(seen) => <ul className="grid gap-1.5 text-[13.5px] font-bold">{['Before update', 'Nightly', 'Manual'].map((l, i) => <Row key={l} i={i} seen={seen}><span className="grid size-6 place-items-center rounded-full bg-good-bg text-good"><Icon name="tick-02" size={13} /></span>{l}<span className="ml-auto rounded-full bg-s3 px-2.5 py-0.5 text-[11.5px]">Restore</span></Row>)}</ul>}
          </Tile>
          <Tile delay={100} icon="clock-01" topic="backups" title="Schedules" text="Restart, back up or run a command on a timer.">
            {(seen) => <ul className="grid gap-1.5 text-[13.5px] font-bold">{[['Nightly restart', '04:00'], ['Weekly backup', 'Sun 03:00']].map(([l, t], i) => <Row key={l} i={i} seen={seen}>{l}<span className="ml-auto font-medium text-ink3">{t}</span><span className={cn('relative h-5 w-9 rounded-full transition-colors duration-500', seen ? 'bg-good' : 'bg-s4')} style={{ transitionDelay: `${900 + i * 300}ms` }}><span className="absolute top-0.5 size-4 rounded-full bg-white transition-[left] duration-500" style={{ left: seen ? 18 : 2, transitionDelay: `${900 + i * 300}ms` }} /></span></Row>)}</ul>}
          </Tile>
          <Tile delay={200} icon="wallet-01" topic="billing" title="Billing you can read" text="Orders, renewals and invoices, together.">
            {(seen) => <ul className="grid gap-1.5 text-[13.5px] font-bold">{[['Invoice #1042', 'Paid'], ['Invoice #1051', 'Paid'], ['Renews in 13 days', 'Auto']].map(([l, s], i) => <Row key={l} i={i} seen={seen}>{l}<span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-[11.5px]', s === 'Paid' ? 'bg-good-bg text-good' : 'bg-accent-bg text-accent-ink')}>{s}</span></Row>)}</ul>}
          </Tile>
          <Tile className="lg:col-span-3" icon="message-01" topic="support" title="Help that stays with your account" text="Open a ticket from the same dashboard. Your services, your history and the conversation in one thread.">
            {(seen) => <div className="grid gap-2 sm:grid-cols-2">{[['You', 'My bot restarts every few minutes.', false], ['Fortless', 'Thanks. We are reading the logs now. Could you share the start command you set?', true]].map(([w, t, them], i) => <div key={String(w)} className={cn('rounded-2xl p-4 text-[14px] transition-[opacity,transform] duration-700 ease-petal', them ? 'bg-accent-bg text-accent-ink' : 'bg-s2')} style={{ opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(12px)', transitionDelay: `${500 + i * 600}ms` }}><p className="text-[12px] font-bold opacity-70">{w}</p><p className="font-semibold">{t}</p></div>)}</div>}
          </Tile>
        </div>
      </Wrap>
    </section>
  );
}
