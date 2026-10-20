import { LogoMark } from '@/design-system';
import { Link, useRouter } from '@/app/router';
import { scrollToId } from './hooks';
import { Wrap } from './ui';

export function SiteFooter() {
  const { path, navigate } = useRouter();
  const go = (id: string) => { if (path === '/') scrollToId(id); else { navigate('/'); setTimeout(() => scrollToId(id), 150); } };
  const a = 'rounded-md py-1 text-[15px] font-semibold text-ink2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <footer className="pb-12 pt-24">
      <Wrap className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="grid content-start gap-3">
          <Link to="/" aria-label="Fortless home" className="flex w-fit items-center gap-2.5"><LogoMark size={30} /><span className="text-[22px] font-extrabold tracking-[-0.05em]">fortless</span></Link>
          <p className="max-w-xs text-ink2">Everything you host, in one place.</p>
        </div>
        <nav aria-label="Explore" className="grid content-start gap-1"><p className="mb-1 text-[13px] font-bold text-ink3">Explore</p>
          <button type="button" className={`${a} text-left`} onClick={() => go('services')}>Hosting</button>
          <button type="button" className={`${a} text-left`} onClick={() => go('platform')}>Platform</button>
          <Link to="/games/minecraft" className={a}>Minecraft hosting</Link>
          <Link to="/status" className={a}>System status</Link>
        </nav>
        <nav aria-label="More" className="grid content-start gap-1"><p className="mb-1 text-[13px] font-bold text-ink3">More</p>
          <button type="button" className={`${a} text-left`} onClick={() => go('story')}>How it works</button>
          <button type="button" className={`${a} text-left`} onClick={() => go('trust')}>Security</button>
          <button type="button" className={`${a} text-left`} onClick={() => go('faq')}>Questions and answers</button>
        </nav>
        <nav aria-label="Account" className="grid content-start gap-1"><p className="mb-1 text-[13px] font-bold text-ink3">Account</p>
          <Link to="/login" className={a}>Sign in</Link>
          <Link to="/register" className={a}>Create account</Link>
          <Link to="/app" className={a}>Dashboard</Link>
        </nav>
      </Wrap>
      <Wrap className="mt-14"><p className="text-[13px] text-ink3">© {new Date().getFullYear()} Fortless. All rights reserved.</p></Wrap>
    </footer>
  );
}
