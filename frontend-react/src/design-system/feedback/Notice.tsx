import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

export type NoticeTone = 'info' | 'warn' | 'bad' | 'good';
const tones: Record<NoticeTone, { box: string; icon: IconName }> = {
  info: { box: 'bg-info-bg text-info', icon: 'alert-circle' },
  warn: { box: 'bg-warn-bg text-warn', icon: 'alert-01' },
  bad: { box: 'bg-bad-bg text-bad', icon: 'alert-circle' },
  good: { box: 'bg-good-bg text-good', icon: 'tick-02' },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Right-aligned control, for example a retry button. */
  action?: ReactNode;
  className?: string;
}

/**
 * Inline message that stays in the page flow: limits ("moderation is disabled because…"), provider problems, results.
 * "bad" is announced as an alert; the other tones are polite status text. Tone is carried by icon and text, never color alone.
 */
export function Notice({ tone = 'info', title, children, action, className }: NoticeProps) {
  const t = tones[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex flex-wrap items-start gap-3 rounded-lg p-4', t.box, className)}>
      <Icon name={t.icon} size={20} className="mt-0.5 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title ? <p className="font-extrabold">{title}</p> : null}
        {children ? <div className="text-[14px] font-medium">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
