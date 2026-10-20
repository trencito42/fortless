import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

export const badgeStyles = cva('inline-flex h-[26px] w-max shrink-0 items-center gap-1.5 rounded-full px-[11px] text-xs font-bold leading-none whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-s3 text-ink2',
      accent: 'bg-accent-bg text-accent-ink',
      good: 'bg-good-bg text-good',
      warn: 'bg-warn-bg text-warn',
      bad: 'bg-bad-bg text-bad',
      info: 'bg-info-bg text-info',
      violet: 'bg-violet-bg text-violet',
      lime: 'bg-lime text-lime-ink',
      ink: 'bg-ink text-on-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export type BadgeTone = NonNullable<VariantProps<typeof badgeStyles>['tone']>;

export interface BadgeProps extends VariantProps<typeof badgeStyles> {
  children: ReactNode;
  className?: string;
}
/** Static label (counts, "New", plan names). For a state that changes over time use StatusBadge. */
export function Badge({ tone, children, className }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone }), className)}>{children}</span>;
}
