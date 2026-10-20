import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { copyText } from './CopyButton';

export interface CommandButtonProps {
  /** The exact text that is copied. Shown in monospace; long commands wrap inside the button instead of widening the page. */
  command: string;
  /** Accessible name prefix. Default "Copy command". The command itself is appended for screen readers. */
  label?: string;
  /** Show a `$` prompt in front. */
  prompt?: boolean;
  onCopied?: () => void;
  onError?: () => void;
  className?: string;
}

/**
 * A shell command that copies itself on click: install snippets, SFTP/connect strings, API calls.
 * Feedback is a text and icon swap plus a polite announcement; no motion beyond a 150 ms color change, so reduced-motion needs no special case.
 */
export function CommandButton({ command, label = 'Copy command', prompt = true, onCopied, onError, className }: CommandButtonProps) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async () => {
    const ok = await copyText(command);
    setState(ok ? 'ok' : 'fail');
    (ok ? onCopied : onError)?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };
  return (
    <>
      <button
        type="button"
        onClick={run}
        aria-label={`${label}: ${command}`}
        className={cn(
          'group flex min-h-ctl-md w-full max-w-full items-center gap-3 rounded-md bg-con px-4 py-2 text-left font-mono text-[13.5px] text-con-ink outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--con),white_8%)] focus-visible:ring-2 focus-visible:ring-accent',
          state === 'fail' && 'ring-2 ring-bad',
          className,
        )}
      >
        {prompt ? <span aria-hidden="true" className="select-none text-con-dim">$</span> : null}
        <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">{command}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold text-con-dim group-hover:text-con-ink" aria-hidden="true">
          <Icon name={state === 'ok' ? 'tick-02' : state === 'fail' ? 'alert-circle' : 'copy-01'} size={16} />
          {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : 'Copy'}
        </span>
      </button>
      <span className="sr-only" role="status">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : ''}</span>
    </>
  );
}
