import { SegmentedBar } from '@/design-system';
import { cn } from '@/lib/utils/cn';

/**
 * Physical capacity vs what is sold vs what is really used. These are three different numbers and are never collapsed into one:
 * `used` ≤ `physical` is measured by Wings; `sold` is the sum of plan limits on the node and may legitimately exceed physical with overallocation.
 */
export function CapacityBar({ label, physical, sold, used, limit, format }: { label: string; physical: number; sold: number; used: number; limit?: number; format: (n: number) => string }) {
  const track = Math.max(physical, sold, limit ?? 0);
  const soldPct = Math.round((sold / physical) * 100);
  const tone = soldPct > 100 ? 'bg-bad' : soldPct > 85 ? 'bg-warn' : 'bg-accent';
  return (
    <div className="grid gap-1.5" role="group" aria-label={`${label}: physical ${format(physical)}, sold ${format(sold)} (${soldPct}%), used ${format(used)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]"><b>{label}</b><span className="font-semibold text-ink3">sold {soldPct}% of physical</span></div>
      <div className="relative">
        <SegmentedBar size="lg" total={track} segments={[{ key: 'used', label: 'used', value: used, tone: 'bg-ink2' }, { key: 'sold', label: 'sold, not used', value: Math.max(0, sold - used), tone }]} summary="" />
        {physical < track ? <span aria-hidden="true" className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-ink" style={{ left: `${(physical / track) * 100}%` }} title="Physical capacity" /> : null}
      </div>
      <dl className={cn('grid grid-cols-3 gap-2 text-[12.5px]')}>
        <div><dt className="text-ink3">Used (measured)</dt><dd className="font-bold tabular-nums">{format(used)}</dd></div>
        <div><dt className="text-ink3">Sold (allocated)</dt><dd className="font-bold tabular-nums">{format(sold)}</dd></div>
        <div><dt className="text-ink3">Physical</dt><dd className="font-bold tabular-nums">{format(physical)}</dd></div>
      </dl>
    </div>
  );
}
