import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-xs bg-s3 px-1.5 font-mono text-[11px] font-bold text-ink2', className)}>{children}</kbd>;
}
