import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '../primitives/Button';
import { SearchField } from '../forms/TextField';
import { SegmentedControl } from '../actions/SegmentedControl';
import { CopyButton } from '../actions/CopyButton';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface LogLine { id: string | number; text: string; level?: LogLevel; time?: string }

const levelCls: Record<LogLevel, string> = { info: 'text-con-ink', warn: 'text-con-warn', error: 'text-con-bad', debug: 'text-con-dim' };

export interface LogViewerProps {
  lines: LogLine[];
  label: string;
  height?: number;
  /** Keep the view pinned to the newest line until the user scrolls up. Default true. */
  follow?: boolean;
  emptyMessage?: string;
  /** Hard cap on rendered lines (oldest dropped from the view, not from `lines`). */
  maxRendered?: number;
}

/**
 * Read-only log pane with level filter, text search, follow mode and copy. Lightweight (no terminal emulation):
 * use it for build and deploy logs; use ServerConsole when you need a live interactive console.
 */
export function LogViewer({ lines, label, height = 320, follow = true, emptyMessage = 'No log lines yet.', maxRendered = 2000 }: LogViewerProps) {
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  const [q, setQ] = useState('');
  const [pinned, setPinned] = useState(follow);
  const box = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = lines.filter((l) => (level === 'all' || (level === 'warn' ? l.level === 'warn' || l.level === 'error' : l.level === 'error')) && (!t || l.text.toLowerCase().includes(t)));
    return f.slice(-maxRendered);
  }, [lines, level, q, maxRendered]);

  useEffect(() => {
    if (pinned && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [shown, pinned]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Filter lines" className="min-w-0 flex-1 sm:max-w-[260px]" />
        <SegmentedControl aria-label="Log level" size="sm" value={level} onValueChange={setLevel} options={[{ value: 'all', label: 'All' }, { value: 'warn', label: 'Warnings' }, { value: 'error', label: 'Errors' }]} />
        <div className="ml-auto flex items-center gap-1">
          <CopyButton value={() => shown.map((l) => l.text).join('\n')} label="Copy visible lines" size="sm" />
          {!pinned ? <Button size="sm" variant="secondary" leadingIcon="arrow-down-01" onClick={() => setPinned(true)}>Jump to latest</Button> : null}
        </div>
      </div>
      {/* Scrollable region must be focusable so keyboard users can scroll it (axe: scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={box} onScroll={onScroll} role="log" aria-label={label} tabIndex={0} style={{ height }} className="overflow-auto rounded-lg bg-con p-3 font-mono text-[12.5px] leading-[1.55] outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {shown.length === 0 ? <p className="text-con-dim">{lines.length === 0 ? emptyMessage : 'No lines match the filter.'}</p> : null}
        {shown.map((l) => (
          <div key={l.id} className={cn('flex gap-3 whitespace-pre-wrap break-all', levelCls[l.level ?? 'info'])}>
            {l.time ? <span className="shrink-0 text-con-dim select-none">{l.time}</span> : null}
            <span className="min-w-0">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
