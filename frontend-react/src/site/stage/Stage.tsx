import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useReducedMotion } from '../hooks';

/**
 * Full-bleed night stage shared by sign-in, sign-up and onboarding: drifting bars (the logo motif) and a soft light that follows the pointer.
 * Everything decorative is aria-hidden and marked data-decorative.
 */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const on = (e: PointerEvent) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { ref.current?.style.setProperty('--mx', `${e.clientX}px`); ref.current?.style.setProperty('--my', `${e.clientY}px`); }); };
    addEventListener('pointermove', on, { passive: true });
    return () => { removeEventListener('pointermove', on); cancelAnimationFrame(raf); };
  }, [reduced]);
  return (
    <div ref={ref} className={cn('relative isolate min-h-dvh overflow-hidden bg-night text-night-ink', className)} style={{ '--mx': '72%', '--my': '18%' } as CSSProperties}>
      <div aria-hidden="true" data-decorative className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'radial-gradient(640px circle at var(--mx) var(--my), rgb(47 107 255 / 0.26), transparent 62%)' }} />
      <div aria-hidden="true" data-decorative className="pointer-events-none absolute inset-0 -z-10">
        <span className="site-float absolute -right-24 top-[14%] block h-14 w-[420px] rounded-full bg-brand/20" />
        <span className="site-float absolute -right-40 top-[calc(14%+4.5rem)] block h-14 w-[520px] rounded-full bg-night3" style={{ animationDelay: '-2s' }} />
        <span className="site-float absolute -right-12 top-[calc(14%+9rem)] block h-14 w-[300px] rounded-full bg-brand/10" style={{ animationDelay: '-4s' }} />
        <span className="site-float absolute -left-32 bottom-[10%] block h-14 w-[380px] rounded-full bg-night3/70" style={{ animationDelay: '-3s' }} />
        <span className="site-float absolute -left-16 bottom-[calc(10%-4.5rem)] block h-14 w-[260px] rounded-full bg-brand/15" style={{ animationDelay: '-5s' }} />
      </div>
      {children}
    </div>
  );
}

/** Big stage headline that rises line by line on mount. Decorative: the real heading lives in the form panel. */
export function StageWords({ lines, className }: { lines: string[]; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, [lines.join('|')]);
  return (
    <div aria-hidden="true" data-decorative data-in={on ? '' : undefined} className={cn('font-extrabold tracking-[-0.055em]', className)}>
      {lines.map((l, i) => <span key={l} className="ln" style={{ '--i': i } as CSSProperties}><span>{l}</span></span>)}
    </div>
  );
}
