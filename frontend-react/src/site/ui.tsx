import { createElement, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/design-system';
import { Link } from '@/app/router';
import { useInView } from './hooks';

/** Fades and lifts its children in once. `delay` staggers siblings. */
export function Reveal({ as = 'div', delay = 0, className, children, ...rest }: { as?: ElementType; delay?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const [ref, seen] = useInView<HTMLElement>();
  return createElement(as, { ref, className: cn('rv', className), style: { '--d': delay } as CSSProperties, 'data-in': seen ? '' : undefined, ...rest }, children);
}

/** Headline that rises line by line. Pass each visual line as one array item so wrapping never splits a mask. */
export function Headline({ as = 'h2', lines, className, delay = 0, nowrap }: { as?: 'h1' | 'h2' | 'h3'; lines: ReactNode[]; className?: string; delay?: number; nowrap?: boolean }) {
  const [ref, seen] = useInView<HTMLElement>('0px 0px -8% 0px');
  return createElement(as, { ref, 'data-in': seen ? '' : undefined, className: cn('font-extrabold tracking-[-0.055em] [text-wrap:balance]', className), style: { '--d': delay } as CSSProperties }, lines.map((l, i) => <span key={i} className={cn('ln', nowrap && 'whitespace-nowrap')} style={{ '--i': i } as CSSProperties}><span>{l}</span></span>));
}

type BtnProps = { to?: string; href?: string; onClick?: () => void; variant?: 'brand' | 'ink' | 'soft' | 'lime' | 'night'; size?: 'md' | 'lg'; icon?: IconName; children: ReactNode; className?: string; 'aria-label'?: string };
const V = { brand: 'bg-accent text-on-accent hover:bg-accent-h', ink: 'bg-ink text-on-ink hover:opacity-90', soft: 'bg-s3 text-ink hover:bg-s4', lime: 'bg-lime text-lime-ink hover:brightness-95', night: 'bg-night3 text-night-ink hover:bg-night2' } as const;
export function SiteButton({ to, href, onClick, variant = 'brand', size = 'md', icon, children, className, ...a }: BtnProps) {
  const cls = cn('group inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-[-0.01em] whitespace-nowrap outline-none transition-[background-color,transform,opacity] duration-200 ease-petal focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97]', size === 'lg' ? 'h-14 px-7 text-[16px]' : 'h-11 px-5 text-[14.5px]', V[variant], className);
  const inner = <>{children}{icon ? <Icon name={icon} size={size === 'lg' ? 18 : 16} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> : null}</>;
  if (to) return <Link to={to} className={cls} {...a}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...a}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} {...a}>{inner}</button>;
}

/** Page width shared by every site section. */
export const Wrap = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('mx-auto w-full max-w-[1280px] px-4 sm:px-6', className)}>{children}</div>;

export function StatusDot({ tone = 'good', live }: { tone?: 'good' | 'warn' | 'bad' | 'idle'; live?: boolean }) {
  const c = { good: 'bg-good text-good', warn: 'bg-warn text-warn', bad: 'bg-bad text-bad', idle: 'bg-ink3 text-ink3' }[tone];
  return <span aria-hidden="true" className={cn('relative inline-block size-2 rounded-full', c, live && 'site-pulse')} />;
}
