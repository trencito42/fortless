import { cn } from '@/lib/utils/cn';

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  /** Tailwind background class from the token set (`bg-good`, `bg-warn`, `bg-bad`, `bg-accent`, `bg-s4`). */
  tone: string;
}

export interface SegmentedBarProps {
  segments: BarSegment[];
  /** Denominator. Defaults to the sum of the segments; pass a larger value to leave an empty track (quotas). */
  total?: number;
  /** Text read by assistive tech. Defaults to "label value, …". */
  summary?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const H = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const;

/**
 * Stacked proportion bar: fully rounded segments separated by a small gap, on a rounded track.
 * Segments with a value of 0 are not drawn. One role="img" with a text summary, since the colours alone carry no information.
 */
export function SegmentedBar({ segments, total, summary, size = 'md', className }: SegmentedBarProps) {
  const shown = segments.filter((s) => s.value > 0);
  const sum = shown.reduce((a, s) => a + s.value, 0);
  const denom = Math.max(total ?? sum, sum, 1);
  const label = summary ?? (shown.map((s) => `${s.value} ${s.label}`).join(', ') || 'No data');
  return (
    <div className={cn('flex gap-0.5 overflow-hidden rounded-full bg-s3', H[size], className)} role="img" aria-label={label}>
      {shown.map((s) => (
        <span key={s.key} className={cn('h-full min-w-1.5 rounded-full', s.tone)} style={{ width: `${(s.value / denom) * 100}%` }} />
      ))}
    </div>
  );
}
