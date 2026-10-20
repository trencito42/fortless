import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { IconButton } from '../primitives/IconButton';

/** Dates are plain `YYYY-MM-DD` strings so no time zone can shift a day. */
export type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date): IsoDate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: IsoDate): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1); };
export const addDays = (s: IsoDate, n: number): IsoDate => { const d = fromIso(s); d.setDate(d.getDate() + n); return toIso(d); };
const addMonths = (s: IsoDate, n: number): IsoDate => { const d = fromIso(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, max)); return toIso(d); };

export interface CalendarProps {
  /** Selected day (single mode). */
  value?: IsoDate | null;
  /** Selected range (range mode). Pass `range` to enable it. */
  range?: { start: IsoDate | null; end: IsoDate | null };
  onSelect: (date: IsoDate) => void;
  min?: IsoDate;
  max?: IsoDate;
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: 0 | 1;
  locale?: string;
  label?: string;
  className?: string;
}

/**
 * Month grid with roving focus. Arrows move by day/week, PageUp/PageDown by month (Shift = year), Home/End to the start/end of the week.
 * Days outside min/max are disabled and skipped. Each day button has a full spoken date.
 */
export function Calendar({ value, range, onSelect, min, max, weekStartsOn = 1, locale = 'en-GB', label = 'Calendar', className }: CalendarProps) {
  const today = toIso(new Date());
  const anchor = value ?? range?.start ?? today;
  const [focus, setFocus] = useState<IsoDate>(anchor);
  const [view, setView] = useState<IsoDate>(anchor);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(fromIso(view));
  const dayNames = useMemo(() => {
    const base = new Date(2024, 0, 1 + (weekStartsOn === 0 ? -1 : 0)); // 1 Jan 2024 is a Monday
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return { short: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d), long: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d) }; });
  }, [locale, weekStartsOn]);

  const weeks = useMemo(() => {
    const first = fromIso(view); first.setDate(1);
    const offset = (first.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => { const x = new Date(start); x.setDate(start.getDate() + w * 7 + d); return toIso(x); }));
  }, [view, weekStartsOn]);

  const blocked = (d: IsoDate) => (min !== undefined && d < min) || (max !== undefined && d > max);
  const clamp = (d: IsoDate) => (min && d < min ? min : max && d > max ? max : d);

  useEffect(() => { if (moved.current) { grid.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus(); } }, [focus, view]);

  const go = (d: IsoDate) => {
    const next = clamp(d);
    moved.current = true;
    setFocus(next);
    if (next.slice(0, 7) !== view.slice(0, 7)) setView(next);
  };
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, () => IsoDate | undefined> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1), ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1), PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => addDays(focus, -((fromIso(focus).getDay() - weekStartsOn + 7) % 7)), End: () => addDays(focus, 6 - ((fromIso(focus).getDay() - weekStartsOn + 7) % 7)),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    const n = fn();
    if (n) go(n);
  };

  const spoken = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const inRange = (d: IsoDate) => !!(range?.start && range.end && d > range.start && d < range.end);

  return (
    <div className={cn('grid w-[19.5rem] max-w-full gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <IconButton icon="arrow-left-01" label="Previous month" variant="ghost" size="sm" onClick={() => { moved.current = false; setView(addMonths(view, -1)); }} />
        <p className="font-extrabold tracking-[-0.02em]" aria-live="polite">{monthLabel}</p>
        <IconButton icon="arrow-right-01" label="Next month" variant="ghost" size="sm" onClick={() => { moved.current = false; setView(addMonths(view, 1)); }} />
      </div>
      <div ref={grid} role="grid" aria-label={`${label}, ${monthLabel}`} onKeyDown={onKey} className="grid">
        <div role="row" className="grid grid-cols-7">
          {dayNames.map((n) => <span key={n.long} role="columnheader" aria-label={n.long} className="py-1 text-center text-[12px] font-bold text-ink3">{n.short.slice(0, 2)}</span>)}
        </div>
        {weeks.map((w) => (
          <div key={w[0]} role="row" className="grid grid-cols-7 gap-0.5">
            {w.map((d) => {
              const outside = d.slice(0, 7) !== view.slice(0, 7);
              const isStart = (range ? range.start === d : value === d);
              const isEnd = range?.end === d;
              const selected = (isStart || isEnd) && !outside;
              const off = blocked(d);
              const inBand = inRange(d) && !outside;
              return (
                <span key={d} role="gridcell" aria-selected={selected || undefined} className={cn('relative', inBand && 'bg-accent-bg', range?.end && isStart && range.start !== range.end && !outside && 'rounded-l-md bg-gradient-to-r from-transparent from-50% to-accent-bg to-50%', isEnd && !outside && range?.start !== range.end && 'rounded-r-md bg-gradient-to-l from-transparent from-50% to-accent-bg to-50%')}>
                  <button
                    type="button"
                    data-date={d}
                    tabIndex={d === focus ? 0 : -1}
                    disabled={off}
                    aria-label={spoken.format(fromIso(d))}
                    aria-current={d === today ? 'date' : undefined}
                    onClick={() => { moved.current = true; setFocus(d); onSelect(d); }}
                    className={cn(
                      'grid h-10 w-full place-items-center rounded-md text-[14px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      selected ? 'bg-accent text-on-accent' : inBand ? 'rounded-none text-accent-ink hover:bg-accent-bg' : 'text-ink hover:bg-s2',
                      outside && 'text-ink3',
                      d === today && !selected && 'ring-1 ring-inset ring-ink3',
                      off && 'pointer-events-none opacity-40',
                    )}
                  >{Number(d.slice(8))}</button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
