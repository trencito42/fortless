import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '../primitives/Skeleton';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export type ChartState = 'ready' | 'loading' | 'empty' | 'error' | 'stale';

export interface ChartFrameProps {
  title: string;
  description?: ReactNode;
  state?: ChartState;
  /** Text alternative describing what the chart shows, e.g. "CPU usage, last 24 hours, peak 71%". Required for ready charts. */
  summary: string;
  emptyMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
  /** Shown next to the title when data is stale, e.g. "Last updated 12 minutes ago". */
  staleLabel?: string;
  actions?: ReactNode;
  height?: number;
  children: ReactNode;
  className?: string;
}

/**
 * Card around any chart. It owns the non-happy states so every chart handles loading, no data,
 * failure and stale data the same way, and never draws invented values.
 */
export function ChartFrame({ title, description, state = 'ready', summary, emptyMessage = 'No data for this period yet.', errorMessage = 'Could not load this chart.', onRetry, staleLabel, actions, height = 220, children, className }: ChartFrameProps) {
  return (
    <section aria-label={title} className={cn('grid gap-3 rounded-lg bg-s1 p-4 sm:p-5', className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="text-[16px] font-extrabold tracking-[-0.03em]">{title}</h3>
          {description ? <p className="text-[13.5px] text-ink3">{description}</p> : null}
        </div>
        {actions}
      </header>
      {state === 'stale' && staleLabel ? (
        <p role="status" className="flex items-center gap-1.5 rounded-sm bg-warn-bg px-3 py-1.5 text-[13px] font-semibold text-warn"><Icon name="clock-01" size={15} />{staleLabel}</p>
      ) : null}
      <div style={{ height }} className="relative min-w-0">
        {state === 'loading' ? (
          <div role="status" aria-label={`Loading ${title}`} className="grid h-full gap-2"><Skeleton className="h-full" /></div>
        ) : state === 'empty' ? (
          <div className="grid h-full place-items-center rounded-md bg-s2 text-center text-ink3"><p className="px-4 font-semibold">{emptyMessage}</p></div>
        ) : state === 'error' ? (
          <div role="alert" className="grid h-full place-content-center justify-items-center gap-2 rounded-md bg-bad-bg px-4 text-center text-bad"><p className="font-semibold">{errorMessage}</p>{onRetry ? <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={onRetry}>Try again</Button> : null}</div>
        ) : (
          <div role="img" aria-label={summary} className={cn('h-full', state === 'stale' && 'opacity-70')}>{children}</div>
        )}
      </div>
    </section>
  );
}
