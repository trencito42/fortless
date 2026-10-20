import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { Headline, Wrap } from '../ui';
import { useInView } from '../hooks';

const CONTROLS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'finger-print-scan', title: 'Two-factor sign-in', text: 'Authenticator codes and passkeys.' },
  { icon: 'shield-user', title: 'Scoped permissions', text: 'Teammates see and do only what you allow.' },
  { icon: 'history', title: 'Audit log', text: 'Every sign-in and change, with who and when.' },
  { icon: 'key-01', title: 'API keys', text: 'Create, name and revoke them any time.' },
];
const LOG = [['Sam restarted survival-server', '2 min ago'], ['Backup “Nightly” created', 'Yesterday'], ['New API key “CI deploy”', '2 hours ago']];

export function Trust() {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px -15% 0px');
  return (
    <section id="trust" aria-label="Security" className="py-12">
      <Wrap>
        <div ref={ref} className="grid gap-10 rounded-[40px] bg-night p-6 text-night-ink sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:p-16">
          <div className="grid content-between gap-8">
            <Headline lines={['Secure by default.', 'Yours to control.']} className="text-[clamp(40px,5.6vw,84px)] leading-[0.92]" />
            <p className="max-w-md text-[18px] text-night-dim">Multi-factor sign-in, scoped permissions and an audit log are part of the account, not bolted on later.</p>
          </div>
          <div className="grid gap-3">
            <ul className="grid gap-2.5">
              {CONTROLS.map((c, i) => (
                <li key={c.title} className="flex items-center gap-4 rounded-2xl bg-night2 p-4 transition-[opacity,transform] duration-700 ease-petal" style={{ opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(16px)', transitionDelay: `${i * 140}ms` }}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-night3 text-lime"><Icon name={c.icon} size={22} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[17px] font-extrabold tracking-[-0.02em]">{c.title}</span><span className="block text-[14px] text-night-dim">{c.text}</span></span>
                  <span aria-hidden="true" className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-500', seen ? 'bg-lime' : 'bg-night3')} style={{ transitionDelay: `${500 + i * 260}ms` }}><span className={cn('absolute top-1 size-5 rounded-full transition-[left,background-color] duration-500', seen ? 'bg-lime-ink' : 'bg-night-dim')} style={{ left: seen ? 24 : 4, transitionDelay: `${500 + i * 260}ms` }} /></span>
                </li>
              ))}
            </ul>
            <ul aria-label="Recent activity example" className="grid gap-1.5 rounded-2xl bg-night2 p-4">
              {LOG.map(([a, t], i) => <li key={a} className="flex items-center justify-between gap-3 text-[13.5px] transition-opacity duration-700" style={{ opacity: seen ? 1 : 0, transitionDelay: `${1500 + i * 250}ms` }}><span className="flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-lime" /><span className="truncate font-semibold">{a}</span></span><span className="shrink-0 text-night-dim">{t}</span></li>)}
            </ul>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
