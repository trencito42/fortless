import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetricPoint } from '@/features';
import type { WingsStats } from './contracts';
import type { ConsoleConnection, ConsoleStatus, ServiceDetailPorts } from './ports';

export interface LiveChannel {
  status: ConsoleStatus | 'off';
  detail?: string;
  /** Wings power state: running, starting, stopping, offline. null until the socket reports one. */
  powerState: string | null;
  stats: WingsStats | null;
  /** Samples gathered since the page opened (about one per second, capped). Not stored anywhere. */
  history: MetricPoint[];
  /** Replays buffered output, then streams new lines. Returns the unsubscribe function. */
  subscribe: (fn: (line: string) => void) => () => void;
  send: (command: string) => Promise<void>;
  /** Opens a fresh socket after the retries ran out. */
  reconnect: () => void;
}

const MAX_LINES = 1000;
const MAX_POINTS = 120;

/**
 * Owns the single console socket for the page. Overview reads stats from it and the Console tab reads output, so switching
 * tabs never reconnects. Closed on unmount. `enabled` is false when the service/user cannot use the console at all.
 */
export function useLiveChannel(ports: ServiceDetailPorts, id: string, enabled: boolean, canRecord: boolean): LiveChannel {
  const [status, setStatus] = useState<ConsoleStatus | 'off'>('off');
  const [detail, setDetail] = useState<string>();
  const [powerState, setPowerState] = useState<string | null>(null);
  const [stats, setStats] = useState<WingsStats | null>(null);
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const buffer = useRef<string[]>([]);
  const subs = useRef(new Set<(l: string) => void>());
  const conn = useRef<ConsoleConnection | null>(null);
  const lastStat = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    buffer.current = []; setHistory([]); setStats(null); setPowerState(null);
    if (!enabled) { setStatus('off'); return; }
    const c = ports.console.connect(id, {
      onLine: (l) => { buffer.current.push(l); if (buffer.current.length > MAX_LINES) buffer.current.shift(); subs.current.forEach((f) => f(l)); },
      onStatus: (s, d) => { setStatus(s); setDetail(d); },
      onPowerState: setPowerState,
      onStats: (s) => {
        setStats(s);
        const now = Date.now();
        if (now - lastStat.current < 900) return;
        lastStat.current = now;
        const mem = s.memory_limit_bytes ? ((s.memory_bytes ?? 0) / s.memory_limit_bytes) * 100 : undefined;
        setHistory((h) => [...h.slice(-(MAX_POINTS - 1)), { t: new Date(now).toISOString(), cpu: s.cpu_absolute, memory: mem }]);
      },
    });
    conn.current = c;
    return () => { c.close(); conn.current = null; };
  }, [ports, id, enabled, nonce]);

  const subscribe = useCallback((fn: (l: string) => void) => { buffer.current.forEach(fn); subs.current.add(fn); return () => { subs.current.delete(fn); }; }, []);
  const send = useCallback(async (command: string) => {
    if (!conn.current) throw new Error('The console is not connected, so the command was not sent.');
    await conn.current.send(command);
    // Audit trail only; failures never turn a delivered command into an error.
    if (canRecord) void ports.console.recordCommand(id, command, true).catch(() => undefined);
  }, [ports, id, canRecord]);

  const reconnect = useCallback(() => setNonce((n) => n + 1), []);
  return { status, detail, powerState, stats, history, subscribe, send, reconnect };
}
