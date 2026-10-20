import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** Layout helpers used only by the workbench stories. */
export function Stack({ children, className, gap = 4 }: { children: ReactNode; className?: string; gap?: 2 | 3 | 4 | 6 | 8 }) {
  const g = { 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 6: 'gap-6', 8: 'gap-8' }[gap];
  return <div className={cn('grid min-w-0', g, className)}>{children}</div>;
}
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>;
}
export function Cap({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-bold text-ink3">{children}</p>;
}
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0 rounded-lg bg-s1 p-[18px]', className)}>{children}</div>;
}
