import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** Pinned bar for contextual actions. Sits above the mobile tab bar when `aboveTabBar` is set, and clears the home indicator. */
export function FloatingActionBar({ children, visible = true, label, aboveTabBar, className }: { children: ReactNode; visible?: boolean; label: string; aboveTabBar?: boolean; className?: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      aria-hidden={!visible || undefined}
      inert={!visible || undefined}
      className={cn(
        'pointer-events-none fixed inset-x-0 z-[40] flex justify-center px-3 transition-[transform,opacity,visibility] duration-300 ease-petal',
        aboveTabBar ? 'bottom-[calc(env(safe-area-inset-bottom)+88px)] md:bottom-4' : 'bottom-[calc(env(safe-area-inset-bottom)+16px)]',
        visible ? 'translate-y-0 opacity-100' : 'invisible translate-y-6 opacity-0',
      )}
    >
      <div className={cn('pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[28px] bg-ink p-1.5 text-on-ink', className)}>{children}</div>
    </div>
  );
}
