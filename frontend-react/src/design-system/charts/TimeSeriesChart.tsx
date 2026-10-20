import { useState, type KeyboardEvent } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type SeriesColor = 'accent' | 'good' | 'warn' | 'bad' | 'violet' | 'ink';
export interface Series { key: string; label: string; color?: SeriesColor }
const COLOR: Record<SeriesColor, string> = { accent: 'var(--accent)', good: 'var(--good)', warn: 'var(--con-warn)', bad: 'var(--bad)', violet: 'var(--violet)', ink: 'var(--ink2)' };
const FALLBACK: SeriesColor[] = ['accent', 'violet', 'good', 'warn'];

/** Resolved CSS color for a series, shared with ChartLegend so swatches always match the lines. */
export const seriesColor = (s: Series, i: number): string => COLOR[s.color ?? FALLBACK[i % FALLBACK.length] ?? 'accent'];

export interface TimeSeriesChartProps<T extends Record<string, unknown>> {
  kind?: 'area' | 'line' | 'bar';
  data: T[];
  xKey: keyof T & string;
  series: Series[];
  stacked?: boolean;
  formatX?: (v: unknown) => string;
  formatY?: (v: number) => string;
  /** Fixed y domain, e.g. [0, 100] for percentages. */
  domain?: [number, number];
  /** Series keys to hide (driven by ChartLegend). Hidden series keep their color slot, so toggling never recolors the rest. */
  hidden?: string[];
  /** Name for the keyboard-focusable chart region. Defaults to "Chart". */
  label?: string;
}

const tick = { fontSize: 12, fontWeight: 600, fill: 'var(--ink3)' } as const;

/** Area, line or (stacked) bar chart over an x axis. Colors come from Petal tokens so light and dark both work. */
export function TimeSeriesChart<T extends Record<string, unknown>>({ kind = 'area', data, xKey, series, stacked, formatX, formatY, domain, hidden = [], label = 'Chart' }: TimeSeriesChartProps<T>) {
  // Keyboard access: the region is focusable, Left/Right/Home/End move a cursor and the tooltip follows it.
  const [idx, setIdx] = useState<number | null>(null);
  const last = data.length - 1;
  const onKey = (e: KeyboardEvent) => {
    const at = idx ?? (e.key === 'ArrowLeft' ? last + 1 : -1);
    const next = e.key === 'ArrowRight' ? Math.min(last, at + 1) : e.key === 'ArrowLeft' ? Math.max(0, at - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'Escape' ? null : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setIdx(next);
  };
  const point = idx !== null ? data[idx] : undefined;
  const visible = series.filter((s) => !hidden.includes(s.key));
  const spoken = point ? `${formatX ? formatX(point[xKey]) : String(point[xKey])}: ${visible.map((s) => `${s.label} ${typeof point[s.key] === 'number' ? (formatY ? formatY(point[s.key] as number) : String(point[s.key])) : '—'}`).join(', ')}` : '';
  const col = seriesColor;
  const isHidden = (s: Series) => hidden.includes(s.key);
  const common = { data, margin: { top: 6, right: 6, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--s3)" />
      <XAxis dataKey={xKey as string} tick={tick} tickLine={false} axisLine={false} tickFormatter={formatX} minTickGap={24} />
      <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={formatY} domain={domain} />
      <Tooltip
        {...(idx !== null ? { active: true, defaultIndex: idx } : {})}
        cursor={{ stroke: 'var(--s4)' }}
        formatter={(v, n) => [formatY && typeof v === 'number' ? formatY(v) : String(v), n]}
        labelFormatter={formatX ? (l) => formatX(l) : undefined}
        contentStyle={{ background: 'var(--s1)', border: 'none', borderRadius: 12, boxShadow: '0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent)', fontWeight: 600 }}
        labelStyle={{ color: 'var(--ink3)' }}
      />
    </>
  );
  return (
    <div role="group" aria-roledescription="chart" aria-label={`${label}. Use the left and right arrow keys to read values.`} tabIndex={0} onKeyDown={onKey} onBlur={() => setIdx(null)} className="relative h-full w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent">
    <span className="sr-only" aria-live="polite">{spoken}</span>
    <ResponsiveContainer width="100%" height="100%">
      {kind === 'bar' ? (
        <BarChart accessibilityLayer={false} {...common}>
          {axes}
          {series.map((s, i) => isHidden(s) ? null : <Bar key={s.key} dataKey={s.key} name={s.label} fill={col(s, i)} stackId={stacked ? 'a' : undefined} radius={stacked ? 0 : [6, 6, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      ) : kind === 'line' ? (
        <LineChart accessibilityLayer={false} {...common}>
          {axes}
          {series.map((s, i) => isHidden(s) ? null : <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={col(s, i)} strokeWidth={2.5} dot={false} isAnimationActive={false} />)}
        </LineChart>
      ) : (
        <AreaChart accessibilityLayer={false} {...common}>
          {axes}
          {series.map((s, i) => isHidden(s) ? null : <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={col(s, i)} strokeWidth={2.5} fill={col(s, i)} fillOpacity={0.14} stackId={stacked ? 'a' : undefined} isAnimationActive={false} />)}
        </AreaChart>
      )}
    </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line with no axes. Decorative: the number next to it carries the meaning. */
export function Sparkline({ values, color = 'accent' }: { values: number[]; color?: SeriesColor }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden="true" className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart accessibilityLayer={false} data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Area type="monotone" dataKey="v" stroke={COLOR[color]} strokeWidth={2} fill={COLOR[color]} fillOpacity={0.14} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
