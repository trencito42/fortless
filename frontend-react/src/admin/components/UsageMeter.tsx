import { cn } from '@/lib/utils/cn';

/** Thin bar with the numbers written beside it; colour is a hint, not the information. */
export function UsageMeter({ label, used, limit, format }: { label: string; used: number; limit: number; format: (n: number) => string }) {
  const p = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="grid gap-1" role="img" aria-label={`${label}: ${format(used)} of ${format(limit)}, ${p}%`}>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold"><span className="text-ink3">{label}</span><span className="tabular-nums text-ink2">{format(used)} / {format(limit)} · {p}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-s3"><div className={cn('h-full rounded-full', p >= 90 ? 'bg-bad' : p >= 75 ? 'bg-warn' : 'bg-accent')} style={{ width: `${p}%` }} /></div>
    </div>
  );
}
