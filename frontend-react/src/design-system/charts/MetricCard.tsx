import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';
import { Skeleton } from '../primitives/Skeleton';
import { SegmentedControl } from '../actions/SegmentedControl';
import { Sparkline } from './TimeSeriesChart';

export interface MetricCardProps {
  label: string;
  /** Formatted value. Leave undefined with state "unavailable" when the source did not report it: never show a made-up number. */
  value?: ReactNode;
  unit?: string;
  icon?: IconName;
  state?: 'ready' | 'loading' | 'unavailable';
  /** Why there is no value, e.g. "Server is offline". */
  unavailableReason?: string;
  /** Change versus the previous period. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; /** Whether "up" is good news. */ goodWhen?: 'up' | 'down' };
  /** Real recent samples only. */
  trend?: number[];
  hint?: ReactNode;
  className?: string;
}

/** Single number with context. Honest about missing data. */
export function MetricCard({ label, value, unit, icon, state = 'ready', unavailableReason, delta, trend, hint, className }: MetricCardProps) {
  const good = delta ? (delta.direction === 'flat' ? undefined : delta.direction === (delta.goodWhen ?? 'up')) : undefined;
  return (
    <div className={cn('grid gap-2 rounded-lg bg-s1 p-4 sm:p-5', className)} aria-busy={state === 'loading' || undefined}>
      <div className="flex items-center justify-between gap-2 text-ink3">
        <span className="text-[13.5px] font-semibold">{label}</span>
        {icon ? <Icon name={icon} size={18} /> : null}
      </div>
      {state === 'loading' ? (
        <div role="status" aria-label={`Loading ${label}`}><Skeleton className="h-9 w-24" /></div>
      ) : state === 'unavailable' ? (
        <div>
          <p className="text-[30px] leading-none font-extrabold tracking-[-0.04em] text-ink3" aria-label="No value">—</p>
          {unavailableReason ? <p className="mt-1.5 text-[13px] font-semibold text-ink3">{unavailableReason}</p> : null}
        </div>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[clamp(22px,4.2vw,30px)] leading-tight font-extrabold tracking-[-0.04em] [overflow-wrap:anywhere]">
            {value}
            {unit ? <span className="text-[14px] font-bold whitespace-nowrap text-ink3">{unit}</span> : null}
          </p>
          {delta ? (
            <p className={cn('flex items-center gap-1 text-[13px] font-bold', good === undefined ? 'text-ink3' : good ? 'text-good' : 'text-bad')}>
              <Icon name={delta.direction === 'up' ? 'arrow-up-01' : delta.direction === 'down' ? 'arrow-down-01' : 'remove-01'} size={14} />
              {delta.value}
            </p>
          ) : null}
          {hint ? <p className="text-[13px] text-ink3">{hint}</p> : null}
          {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
        </>
      )}
    </div>
  );
}

export type TimeRange = '1h' | '24h' | '7d' | '30d';
export function TimeRangeSelector({ value, onValueChange, ranges = ['1h', '24h', '7d', '30d'] }: { value: TimeRange; onValueChange: (r: TimeRange) => void; ranges?: TimeRange[] }) {
  return <SegmentedControl aria-label="Time range" size="sm" value={value} onValueChange={onValueChange} options={ranges.map((r) => ({ value: r, label: r }))} />;
}
