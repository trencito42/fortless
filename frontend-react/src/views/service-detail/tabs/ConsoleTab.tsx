import { useEffect, useRef, useState } from 'react';
import { Button, Notice, ServerConsole, StatusBadge, type ConsoleHandle } from '@/design-system';
import { useService } from '../context';

const LABEL = { off: 'Not connected', connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', closed: 'Disconnected', denied: 'Access denied', error: 'Connection problem' } as const;
const TONE = { off: 'neutral', connecting: 'warn', connected: 'good', reconnecting: 'warn', closed: 'neutral', denied: 'bad', error: 'bad' } as const;

/** Oldest-first recall list from stored history; skips masked entries. */
export function historyToRecall(h: ReadonlyArray<{ commandRedacted: string; createdAt: string }>): string[] {
  return [...h].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => r.commandRedacted).filter((c) => c && !/\*{3,}|\[redacted\]/i.test(c));
}

/** The Wings console through the single page socket. Output is replayed from the buffer on open, so switching tabs loses nothing. */
export function ConsoleTab() {
  const { live, can, summary, ports, id } = useService();
  const [recall, setRecall] = useState<string[]>([]);
  // Stored commands carry `commandRedacted` (the raw text never reaches the browser). Masked entries are not recallable.
  useEffect(() => {
    const ac = new AbortController();
    ports.console.history(id, ac.signal).then((r) => setRecall(historyToRecall(r.history)), () => undefined);
    return () => ac.abort();
  }, [ports, id]);
  const ref = useRef<ConsoleHandle>(null);

  useEffect(() => {
    let raf = 0; let off: (() => void) | undefined; let stop = false;
    const attach = () => {
      if (stop) return;
      if (!ref.current) { raf = requestAnimationFrame(attach); return; }
      ref.current.clear();
      off = live.subscribe((l) => ref.current?.writeln(l));
    };
    attach();
    return () => { stop = true; cancelAnimationFrame(raf); off?.(); };
  }, [live.subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  const offline = live.powerState === 'offline' || (live.powerState === null && summary.state === 'offline');
  const reason = !can('control.console') ? 'Your access level can watch the console but not send commands.'
    : live.status === 'denied' || live.status === 'error' ? (live.detail ?? 'The console is not available.')
    : live.status !== 'connected' ? 'Waiting for the console connection…'
    : offline ? 'Start the server to send commands.' : undefined;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={TONE[live.status]} live={live.status === 'connecting' || live.status === 'reconnecting'}>{LABEL[live.status]}</StatusBadge>
        {live.status === 'reconnecting' && live.detail ? <span className="text-[13px] text-ink3">{live.detail}</span> : null}
      </div>
      {live.status === 'denied' || live.status === 'error' ? (
        <Notice tone={live.status === 'denied' ? 'warn' : 'bad'} title={live.status === 'denied' ? 'Console not available' : 'Console connection failed'} action={live.status === 'error' ? <Button size="sm" variant="secondary" onClick={live.reconnect}>Try again</Button> : undefined}>{live.detail ?? 'The console could not be reached.'}</Notice>
      ) : null}
      <ServerConsole ref={ref} height={420} label={`Console for ${summary.name}`} inputDisabledReason={reason} onCommand={live.send} initialHistory={recall} />
    </div>
  );
}
