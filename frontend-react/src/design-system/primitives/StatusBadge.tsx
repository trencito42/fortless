import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { badgeStyles, type BadgeTone } from './Badge';

export interface StatusBadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  /** Leading dot. On by default so status never relies on color alone: the label always carries the meaning. */
  dot?: boolean;
  /** Animated ping for live states (running, provisioning). Respects reduced motion. */
  live?: boolean;
  className?: string;
}

const dotColor: Record<BadgeTone, string> = {
  neutral: 'bg-ink3',
  accent: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-info',
  violet: 'bg-violet',
  lime: 'bg-lime-ink',
  ink: 'bg-on-ink',
};

/**
 * One visual language for state across the product. The caller supplies tone and label, because a
 * running server, an unpaid invoice and a pending domain share a look but not a meaning.
 * Domain mappings live in features/status.ts.
 */
export function StatusBadge({ tone, children, dot = true, live = false, className }: StatusBadgeProps) {
  return (
    <span className={cn(badgeStyles({ tone }), className)}>
      {dot ? (
        <span className={cn('relative size-2 rounded-full', dotColor[tone])} aria-hidden="true">
          {live ? <span className={cn('absolute inset-0 rounded-full animate-[fl-ping_1.8s_var(--ease)_infinite]', dotColor[tone])} /> : null}
        </span>
      ) : null}
      {children}
    </span>
  );
}
