import { Headline, Reveal, SiteButton, Wrap } from '../ui';
import { useReducedMotion, useScrollY } from '../hooks';

export function FinalCta() {
  const y = useScrollY();
  const reduced = useReducedMotion();
  const d = reduced ? 0 : Math.sin(y / 400) * 26;
  return (
    <section aria-label="Get started" className="py-12">
      <Wrap>
        <div className="relative overflow-hidden rounded-[40px] bg-night p-8 text-night-ink sm:p-14 lg:p-20">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-10 hidden md:block">
            <span className="mb-4 block h-16 w-[340px] rounded-full bg-brand" style={{ transform: `translateX(${d}px)` }} />
            <span className="mb-4 ml-10 block h-16 w-[300px] rounded-full bg-brand/60" style={{ transform: `translateX(${-d}px)` }} />
            <span className="ml-24 block h-16 w-[240px] rounded-full bg-brand/30" style={{ transform: `translateX(${d * 0.6}px)` }} />
          </div>
          <div className="relative grid gap-8">
            <Headline lines={['Make room for', 'what’s next.']} className="text-[clamp(48px,8vw,124px)] leading-[0.88]" />
            <Reveal delay={300} className="grid gap-8"><p className="max-w-lg text-[19px] text-night-dim">Create your account, pick what you want to host and be online in minutes.</p>
              <div className="flex flex-wrap gap-3"><SiteButton to="/register" size="lg" variant="lime" icon="arrow-up-right-01">Create your account</SiteButton><SiteButton to="/login" size="lg" variant="night">Sign in</SiteButton></div></Reveal>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
