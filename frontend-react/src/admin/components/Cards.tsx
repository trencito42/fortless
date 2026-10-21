import type { ReactNode } from 'react';
import { Card, CardHeader, MetricCard, type MetricCardProps } from '@/design-system';
import { Link } from '../router';
import { cn } from '@/lib/utils/cn';

/** A titled flat panel. */
export function Section({ title, description, actions, children, className, level = 3, pad = 'md' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; level?: 2 | 3 | 4; pad?: 'sm' | 'md' | 'lg' }) {
  return (
    <Card as="section" pad={pad} className={cn('grid content-start', className)}>
      {title ? <CardHeader title={title} description={description} actions={actions} level={level} /> : null}
      {children}
    </Card>
  );
}

/** Responsive row of KPI cards. */
export function KpiGrid({ items, cols = 4 }: { items: Array<MetricCardProps & { to?: string }>; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 xl:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4', 5: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5', 6: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6' }[cols];
  return <div className={cn('grid grid-cols-1 gap-3', c)}>{items.map(({ to, ...m }) => to ? <Link key={m.label} to={to} aria-label={`${m.label}: open details`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-accent [&>div]:h-full [&>div]:transition-colors [&:hover>div]:bg-s2"><MetricCard {...m} /></Link> : <MetricCard key={m.label} {...m} />)}</div>;
}

export function Split({ main, aside, asideWidth = 360 }: { main: ReactNode; aside: ReactNode; asideWidth?: number }) {
  return <div className="grid min-w-0 items-start gap-5 xl:[grid-template-columns:minmax(0,1fr)_var(--aside)]" style={{ ['--aside' as string]: `${asideWidth}px` }}><div className="grid min-w-0 gap-5">{main}</div><div className="grid min-w-0 gap-5">{aside}</div></div>;
}

export function Columns({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={cn('grid min-w-0 gap-5', cols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3')}>{children}</div>;
}

/** Plain label/value stat for dense summaries. */
export function Fact({ label, children, tone }: { label: string; children: ReactNode; tone?: 'bad' | 'warn' | 'good' }) {
  return <div className="grid min-w-0 gap-0.5"><dt className="text-[12.5px] font-bold text-ink3">{label}</dt><dd className={cn('min-w-0 font-bold [overflow-wrap:anywhere]', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn', tone === 'good' && 'text-good')}>{children}</dd></div>;
}
export const FactGrid = ({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) => <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4', cols === 3 && 'md:grid-cols-3', cols === 4 && 'md:grid-cols-4')}>{children}</dl>;
