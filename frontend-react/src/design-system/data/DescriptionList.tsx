import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { CopyButton } from '../actions/CopyButton';

export interface DescriptionItem {
  label: string;
  value: ReactNode;
  /** Plain text to copy. Adds a copy button. */
  copy?: string;
  mono?: boolean;
}

/** Label/value pairs for detail screens. Semantic dl: stacked on phones, two columns from sm. */
export function DescriptionList({ items, columns = 1, className }: { items: DescriptionItem[]; columns?: 1 | 2; className?: string }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3', columns === 2 && 'md:grid-cols-2', className)}>
      {items.map((it) => (
        <div key={it.label} className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(110px,160px)_1fr] sm:items-center sm:gap-4">
          <dt className="text-[13px] font-semibold text-ink3">{it.label}</dt>
          <dd className={cn('flex min-w-0 items-center gap-2 font-semibold', it.mono && 'font-mono text-[13.5px]')}>
            <span className="min-w-0 break-words">{it.value}</span>
            {it.copy ? <CopyButton value={it.copy} label={`Copy ${it.label}`} size="sm" /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
