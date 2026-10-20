import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'error';
  className?: string;
}
/** An empty screen is an invitation to act: say what is missing and offer the next step. */
export function EmptyState({ icon = 'inbox', title, description, action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div className={cn('grid justify-items-center gap-3 rounded-lg bg-s2 px-6 py-10 text-center', className)} role={tone === 'error' ? 'alert' : undefined}>
      <span className={cn('grid size-12 place-items-center rounded-md', tone === 'error' ? 'bg-bad-bg text-bad' : 'bg-s3 text-ink2')}>
        <Icon name={tone === 'error' ? 'alert-circle' : icon} size={24} />
      </span>
      <div className="grid max-w-[44ch] gap-1">
        <h3 className="text-lg font-extrabold tracking-[-0.03em]">{title}</h3>
        {description ? <p className="text-ink2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
