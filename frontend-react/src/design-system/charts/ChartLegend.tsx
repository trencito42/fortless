import { cn } from '@/lib/utils/cn';
import { seriesColor, type Series } from './TimeSeriesChart';

export interface ChartLegendProps {
  series: Series[];
  /** Keys currently hidden. Controlled by the caller so the chart and legend stay in sync. */
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
  /** Optional latest value per series key, already formatted ("71%"). */
  values?: Record<string, string>;
  className?: string;
}

/**
 * Interactive legend: each series is a toggle button (aria-pressed). The last visible series cannot be hidden,
 * so the chart never turns into an empty frame by accident.
 */
export function ChartLegend({ series, hidden, onHiddenChange, values, className }: ChartLegendProps) {
  const visible = series.filter((s) => !hidden.includes(s.key)).length;
  return (
    <ul aria-label="Series" className={cn('flex flex-wrap gap-2', className)}>
      {series.map((s, i) => {
        const off = hidden.includes(s.key);
        const lastOn = !off && visible === 1;
        return (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={!off}
              disabled={lastOn}
              title={lastOn ? 'At least one series must stay visible' : undefined}
              onClick={() => onHiddenChange(off ? hidden.filter((k) => k !== s.key) : [...hidden, s.key])}
              className={cn('inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent', off ? 'bg-s2 text-ink3 line-through' : 'bg-s3 text-ink', lastOn ? 'cursor-default' : 'hover:bg-s4')}
            >
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: off ? 'var(--s4)' : seriesColor(s, i) }} />
              {s.label}
              {values?.[s.key] && !off ? <span className="text-ink2">{values[s.key]}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
