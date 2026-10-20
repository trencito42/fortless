import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

const TONE = { accent: 'var(--accent)', good: 'var(--good)', warn: 'var(--con-warn)', bad: 'var(--bad)' } as const;
export type RadialTone = keyof typeof TONE;

/** Picks good/warn/bad from thresholds so a full disk or hot CPU looks different without anyone choosing a color. */
export function toneForPercent(pct: number, warnAt = 75, badAt = 90): RadialTone {
  return pct >= badAt ? 'bad' : pct >= warnAt ? 'warn' : 'good';
}

export interface ProgressRingProps {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  tone?: RadialTone;
  label: string;
  children?: ReactNode;
}

/** Circular progress. Exposed as role=progressbar with the value. */
export function ProgressRing({ value, size = 88, stroke = 10, tone = 'accent', label, children }: ProgressRingProps) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <span className="absolute text-[15px] font-extrabold">{children ?? `${Math.round(v)}%`}</span>
    </div>
  );
}

/** Half-circle gauge with the value and caption beneath the arc. */
export function Gauge({ value, label, caption, tone }: { value: number; label: string; caption?: string; tone?: RadialTone }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? toneForPercent(v);
  const r = 70, c = Math.PI * r;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="grid justify-items-center">
      <svg viewBox="0 0 180 100" width="100%" style={{ maxWidth: 220 }} aria-hidden="true">
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--s3)" strokeWidth="14" strokeLinecap="round" />
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke={TONE[t]} strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <p className="-mt-9 text-[26px] leading-none font-extrabold tracking-[-0.04em]">{Math.round(v)}%</p>
      {caption ? <p className="mt-2 text-[13px] font-semibold text-ink3">{caption}</p> : null}
    </div>
  );
}

export interface DonutSegment { label: string; value: number; tone?: RadialTone | 'violet' | 'ink' }
const SEG = { ...TONE, violet: 'var(--violet)', ink: 'var(--ink2)' } as const;
const SEG_ORDER: DonutSegment['tone'][] = ['accent', 'violet', 'good', 'warn'];

/** Share-of-total chart with a legend that carries the numbers, so color is never the only encoding. */
export function DonutChart({ segments, center, className }: { segments: DonutSegment[]; center?: ReactNode; className?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className={cn('grid items-center gap-4 sm:grid-cols-[160px_1fr]', className)}>
      <div className="relative mx-auto size-[160px]" aria-hidden="true" inert>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie data={segments} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {segments.map((s, i) => <Cell key={s.label} fill={SEG[s.tone ?? SEG_ORDER[i % SEG_ORDER.length] ?? 'accent']} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {center ? <div className="absolute inset-0 grid place-items-center text-center font-extrabold">{center}</div> : null}
      </div>
      <ul className="grid gap-2">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span aria-hidden="true" className="size-3 rounded-full" style={{ background: SEG[s.tone ?? SEG_ORDER[i % SEG_ORDER.length] ?? 'accent'] }} />
            <span className="flex-1 font-semibold text-ink2">{s.label}</span>
            <b className="tabular-nums">{s.value}</b>
            <span className="w-12 text-right text-[13px] text-ink3 tabular-nums">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
