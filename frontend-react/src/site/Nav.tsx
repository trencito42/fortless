import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, IconButton, LogoMark, useTheme, type IconName } from '@/design-system';
import { Link, useRouter } from '@/app/router';
import { SiteButton } from './ui';
import { scrollToId } from './hooks';
import { useTopic } from './TopicModal';

interface MenuItem { icon: IconName; title: string; desc: string; topic?: string; to?: string }
interface Menu { id: string; label: string; items: MenuItem[] }

/** Text-only mega menu: no images, no video. Each entry opens a modal with a small live demo (see topics.ts). */
export const MENUS: Menu[] = [
  {
    id: 'hosting', label: 'Hosting',
    items: [
      { icon: 'layers-01', title: 'Game servers', desc: 'Minecraft and other multiplayer games.', topic: 'games' },
      { icon: 'discord', title: 'Discord bots', desc: 'Upload or connect Git, keep it online.', topic: 'bots' },
      { icon: 'package', title: 'Apps and APIs', desc: 'Node.js services with a start command.', topic: 'apps' },
      { icon: 'globe-02', title: 'Domains', desc: 'Point a domain, manage DNS records.', topic: 'domains' },
    ],
  },
  {
    id: 'platform', label: 'Platform',
    items: [
      { icon: 'terminal', title: 'Console and power', desc: 'Start, stop and type into the console.', topic: 'console' },
      { icon: 'folder-01', title: 'Files', desc: 'Edit and upload files from the browser.', topic: 'files' },
      { icon: 'archive-01', title: 'Backups and schedules', desc: 'Restore points and timed tasks.', topic: 'backups' },
      { icon: 'user-group', title: 'Team access', desc: 'Scoped permissions per person.', topic: 'team' },
      { icon: 'wallet-01', title: 'Billing', desc: 'Orders, renewals and invoices.', topic: 'billing' },
      { icon: 'message-01', title: 'Support', desc: 'Tickets that stay with your account.', topic: 'support' },
    ],
  },
  {
    id: 'why', label: 'Why Fortless',
    items: [
      { icon: 'rocket-01', title: 'Online in minutes', desc: 'Four steps from idea to running service.', topic: 'online' },
      { icon: 'shield-01', title: 'Secure by default', desc: 'Two-factor sign-in, audit log, scoped access.', topic: 'secure' },
      { icon: 'message-01', title: 'Real support', desc: 'Tickets that stay with your account.', topic: 'support' },
    ],
  },
];

function useGoto() {
  const { path, navigate } = useRouter();
  return (target: string) => {
    if (target.startsWith('/#')) {
      const id = target.slice(2);
      if (path === '/') scrollToId(id); else { navigate('/'); setTimeout(() => scrollToId(id), 150); }
    } else navigate(target);
  };
}

function useScrollProgress() {
  const [p, setP] = useState({ y: 0, ratio: 0 });
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const h = document.documentElement.scrollHeight - innerHeight; setP({ y: scrollY, ratio: h > 0 ? Math.min(1, scrollY / h) : 0 }); }); };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return p;
}

export function SiteNav() {
  const { path } = useRouter();
  const goto = useGoto();
  const topic = useTopic();
  const pick = (it: MenuItem) => { if (it.topic) topic.open(it.topic); else if (it.to) goto(it.to); };
  const theme = useTheme();
  const { y } = useScrollProgress();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const root = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const uid = useId();
  const scrolled = y > 24;

  useEffect(() => { setOpen(null); setMobile(false); }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setMobile(false); } };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    addEventListener('keydown', onKey); addEventListener('mousedown', onDown);
    return () => { removeEventListener('keydown', onKey); removeEventListener('mousedown', onDown); };
  }, []);
  useEffect(() => { document.body.style.overflow = mobile ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [mobile]);

  const hover = (id: string | null) => { clearTimeout(closeTimer.current); if (id) setOpen(id); else closeTimer.current = setTimeout(() => setOpen(null), 160); };
  const active = MENUS.find((m) => m.id === open);

  const link = 'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-bold text-ink2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <header ref={root} className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 sm:px-6" onMouseLeave={() => hover(null)}>
      <div className={cn('mx-auto max-w-[1280px] transition-[padding] duration-300 ease-petal', scrolled ? 'pt-2' : 'pt-4')}>
        <div className="pointer-events-auto relative overflow-hidden rounded-[28px] bg-s1">
          <nav aria-label="Main" className="flex h-[60px] items-center gap-2 pl-5 pr-2">
            <Link to="/" aria-label="Fortless home" className="mr-2 flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <LogoMark size={30} /><span className="text-[21px] font-extrabold tracking-[-0.05em]">fortless</span>
            </Link>
            <ul className="mx-auto hidden items-center gap-1 lg:flex">
              {MENUS.map((m) => (
                <li key={m.id} onMouseEnter={() => hover(m.id)}>
                  <button type="button" className={cn(link, open === m.id && 'text-ink')} aria-expanded={open === m.id} aria-controls={`${uid}-${m.id}`}
                    onClick={() => setOpen(open === m.id ? null : m.id)}
                    onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(m.id); setTimeout(() => document.querySelector<HTMLElement>(`#${CSS.escape(`${uid}-${m.id}`)} a, #${CSS.escape(`${uid}-${m.id}`)} button`)?.focus(), 30); } }}>
                    {m.label}<Icon name="arrow-down-01" size={14} className={cn('transition-transform duration-200', open === m.id && 'rotate-180')} />
                  </button>
                </li>
              ))}
              <li onMouseEnter={() => hover(null)}><Link to="/status" className={cn(link, path === '/status' && 'text-ink')} aria-current={path === '/status' ? 'page' : undefined}>Status</Link></li>
              <li><button type="button" className={link} onClick={() => goto('/#faq')}>FAQ</button></li>
            </ul>
            <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
              <IconButton label={theme.resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} icon={theme.resolved === 'dark' ? 'sun-03' : 'moon-01'} variant="ghost" onClick={theme.toggle} />
              <Link to="/login" className="hidden h-11 items-center rounded-full px-4 text-[15px] font-bold text-ink2 hover:text-ink sm:inline-flex">Sign in</Link>
              <SiteButton to="/register" icon="arrow-up-right-01" className="hidden sm:inline-flex">Start hosting</SiteButton>
              <IconButton label={mobile ? 'Close menu' : 'Open menu'} icon={mobile ? 'cancel-01' : 'menu-02'} variant="secondary" className="lg:hidden" aria-expanded={mobile} onClick={() => setMobile((v) => !v)} />
            </div>
          </nav>

          {/* Desktop mega panel */}
          <div aria-hidden={!active} className={cn('hidden grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-petal lg:grid', active && 'grid-rows-[1fr]')}>
            <div className="overflow-hidden">
              {MENUS.map((m) => (
                <div key={m.id} id={`${uid}-${m.id}`} role="region" aria-label={m.label} hidden={open !== m.id} className="px-3 pb-4 pt-2" onMouseEnter={() => hover(m.id)}>
                  <ul className={cn('grid gap-x-8 gap-y-1', m.items.length > 4 ? 'md:grid-cols-2' : 'grid-cols-1')}>
                    {m.items.map((it) => (
                      <li key={it.title}>
                        <button type="button" onClick={() => { setOpen(null); pick(it); }} className="group grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl p-3 text-left outline-none transition-colors hover:bg-s2 focus-visible:ring-2 focus-visible:ring-accent">
                          <span className="grid size-11 place-items-center rounded-xl bg-accent-bg text-accent-ink transition-transform duration-300 ease-petal group-hover:scale-105"><Icon name={it.icon} size={20} /></span>
                          <span className="min-w-0"><span className="block font-menu text-[17px] font-bold leading-tight tracking-[-0.01em]">{it.title}</span><span className="block text-[14px] text-ink2">{it.desc}</span></span>
                          <Icon name="arrow-right-01" size={18} className="text-ink3 transition-transform duration-200 group-hover:translate-x-1" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobile ? (
        <div className="pointer-events-auto fixed inset-0 top-0 z-[-1] overflow-y-auto bg-bg px-4 pb-10 pt-[88px] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <ul className="grid gap-2">
            {MENUS.map((m) => (
              <li key={m.id} className="rounded-3xl bg-s1 p-2">
                <p className="px-4 pb-1 pt-3 text-[13px] font-bold text-ink3">{m.label}</p>
                <ul>{m.items.map((it) => (
                  <li key={it.title}><button type="button" onClick={() => { setMobile(false); pick(it); }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left font-menu text-[16px] font-bold tracking-[-0.01em] hover:bg-s2"><Icon name={it.icon} size={20} className="text-accent-ink" />{it.title}</button></li>
                ))}</ul>
              </li>
            ))}
            <li className="grid grid-cols-2 gap-2">
              <Link to="/status" className="grid h-14 place-items-center rounded-2xl bg-s1 text-[16px] font-extrabold">Status</Link>
              <button type="button" onClick={() => { setMobile(false); goto('/#faq'); }} className="grid h-14 place-items-center rounded-2xl bg-s1 text-[16px] font-extrabold">FAQ</button>
            </li>
          </ul>
          <div className="mt-4 grid gap-2"><SiteButton to="/register" size="lg" icon="arrow-up-right-01">Start hosting</SiteButton><SiteButton to="/login" size="lg" variant="soft">Sign in</SiteButton></div>
        </div>
      ) : null}
    </header>
  );
}
