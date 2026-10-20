import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

export type TimelineTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
export interface TimelineEvent {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Already formatted, e.g. "2 hours ago". Provide `iso` for the machine-readable value. */
  time: string;
  iso?: string;
  icon?: IconName;
  tone?: TimelineTone;
}

const tones: Record<TimelineTone, string> = { neutral: 'bg-s3 text-ink2', good: 'bg-good-bg text-good', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', accent: 'bg-accent-bg text-accent' };

/** Vertical event list (billing history, deploy steps, audit trail). Ordered: newest first by convention of the caller. */
export function Timeline({ events, label }: { events: TimelineEvent[]; label: string }) {
  return (
    <ol aria-label={label} className="grid">
      {events.map((e, i) => (
        <li key={e.id} className="relative grid grid-cols-[36px_1fr] gap-3 pb-5 last:pb-0">
          {i < events.length - 1 ? <span aria-hidden="true" className="absolute top-9 bottom-0 left-[17px] w-0.5 rounded-full bg-s3" /> : null}
          <span className={cn('grid size-9 place-items-center rounded-full', tones[e.tone ?? 'neutral'])}><Icon name={e.icon ?? 'clock-01'} size={18} /></span>
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-bold">{e.title}</p>
              <time dateTime={e.iso} className="text-[13px] font-semibold text-ink3">{e.time}</time>
            </div>
            {e.description ? <p className="text-ink2">{e.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface ActivityItem { id: string; actor: string; action: string; target?: string; time: string; iso?: string }

/** Compact "who did what" feed. Use Timeline when each event needs its own icon or detail. */
export function ActivityFeed({ items, label, empty = 'No activity yet.' }: { items: ActivityItem[]; label: string; empty?: string }) {
  if (items.length === 0) return <p className="text-ink3">{empty}</p>;
  return (
    <ul aria-label={label} className="grid gap-3">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-s3 text-[11px] font-extrabold text-ink2">{a.actor.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
          <p className="min-w-0 flex-1"><b>{a.actor}</b> <span className="text-ink2">{a.action}</span>{a.target ? <> <b>{a.target}</b></> : null}</p>
          <time dateTime={a.iso} className="shrink-0 text-[13px] font-semibold text-ink3">{a.time}</time>
        </li>
      ))}
    </ul>
  );
}
