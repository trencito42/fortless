import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Spinner } from '../primitives/Spinner';
import { LogViewer, type LogLine } from './LogViewer';

export type TaskState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface TaskStep { id: string; label: string; state: TaskState; detail?: ReactNode }

const icon = (s: TaskState) => s === 'done' ? <Icon name="tick-02" size={16} /> : s === 'failed' ? <Icon name="cancel-01" size={16} /> : s === 'running' ? <Spinner size={16} /> : s === 'skipped' ? <Icon name="remove-01" size={16} /> : null;
const cls: Record<TaskState, string> = { pending: 'bg-s3 text-ink3', running: 'bg-accent-bg text-accent', done: 'bg-good-bg text-good', failed: 'bg-bad-bg text-bad', skipped: 'bg-s3 text-ink3' };
const word: Record<TaskState, string> = { pending: 'Waiting', running: 'In progress', done: 'Done', failed: 'Failed', skipped: 'Skipped' };

/** Ordered steps with a state each (install, build, start). State comes from the backend; this only renders it. */
export function TaskProgress({ steps, label }: { steps: TaskStep[]; label: string }) {
  return (
    <ol aria-label={label} className="grid gap-2">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-3 rounded-md bg-s2 p-3">
          <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', cls[s.state])}>{icon(s.state) ?? <span className="size-2 rounded-full bg-current" />}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{s.label}</p>
            {s.detail ? <p className="text-[13.5px] text-ink2">{s.detail}</p> : null}
          </div>
          <span className={cn('text-[12.5px] font-bold', s.state === 'failed' ? 'text-bad' : s.state === 'done' ? 'text-good' : 'text-ink3')}>{word[s.state]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Steps on top, raw log beneath. Typical for a deploy or backup restore. */
export function DeploymentLog({ steps, lines, label }: { steps: TaskStep[]; lines: LogLine[]; label: string }) {
  return (
    <div className="grid gap-4">
      <TaskProgress steps={steps} label={`${label} steps`} />
      <LogViewer lines={lines} label={`${label} log`} height={240} />
    </div>
  );
}
