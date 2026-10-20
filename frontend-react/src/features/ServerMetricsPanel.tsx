import { MetricCard, ChartFrame, TimeSeriesChart, TimeRangeSelector, type ChartState, type TimeRange } from '@/design-system';
import type { ServerState } from './status';

/** Latest resource readings from the panel API. Undefined means "not reported", never zero. */
export interface ServerResources {
  cpuPercent?: number;
  memoryBytes?: number; memoryLimitBytes?: number;
  diskBytes?: number; diskLimitBytes?: number;
  networkRxBytes?: number; networkTxBytes?: number;
  uptimeSeconds?: number;
}
export interface MetricPoint { t: string; cpu?: number; memory?: number }

const gb = (b: number) => (b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1);
const dur = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

export interface ServerMetricsPanelProps {
  state: ServerState;
  resources?: ServerResources;
  loading?: boolean;
  /** Historical points, when the backend stores them. Omit and the history chart explains that nothing is recorded. */
  history?: MetricPoint[];
  historyState?: ChartState;
  range?: TimeRange;
  onRangeChange?: (r: TimeRange) => void;
  /** Overrides the chart subtitle, for example "Since you opened this page" when samples come from the live socket. */
  historyDescription?: string;
  historyEmptyMessage?: string;
}

/**
 * Live counters plus optional history. When the server is offline the counters say so instead of showing zeros.
 * Pterodactyl exposes live stats only, so history requires Fortless to record samples (see docs/MIGRATION.md).
 */
export function ServerMetricsPanel({ state, resources, loading, history, historyState, range = '24h', onRangeChange, historyDescription, historyEmptyMessage }: ServerMetricsPanelProps) {
  const off = state !== 'running' && state !== 'starting';
  const mode = loading ? 'loading' : off || !resources ? 'unavailable' : 'ready';
  const reason = off ? 'Server is not running' : 'Not reported yet';
  const r = resources;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="CPU" icon="cpu" state={r?.cpuPercent == null && mode === 'ready' ? 'unavailable' : mode} unavailableReason={reason} value={r?.cpuPercent != null ? r.cpuPercent.toFixed(0) : undefined} unit="%" />
        <MetricCard label="Memory" icon="database" state={r?.memoryBytes == null && mode === 'ready' ? 'unavailable' : mode} unavailableReason={reason} value={r?.memoryBytes != null ? gb(r.memoryBytes) : undefined} unit={r?.memoryLimitBytes ? `/ ${gb(r.memoryLimitBytes)} GB` : 'GB'} />
        <MetricCard label="Disk" icon="folder-01" state={r?.diskBytes == null && mode === 'ready' ? 'unavailable' : mode === 'unavailable' && r?.diskBytes != null ? 'ready' : mode} unavailableReason={reason} value={r?.diskBytes != null ? gb(r.diskBytes) : undefined} unit={r?.diskLimitBytes ? `/ ${gb(r.diskLimitBytes)} GB` : 'GB'} />
        <MetricCard label="Uptime" icon="clock-01" state={r?.uptimeSeconds == null && mode === 'ready' ? 'unavailable' : mode} unavailableReason={reason} value={r?.uptimeSeconds != null ? dur(r.uptimeSeconds) : undefined} />
      </div>
      <ChartFrame
        title="Resource history"
        description={historyDescription ?? "CPU and memory over time"}
        state={historyState ?? (history ? (history.length ? 'ready' : 'empty') : 'empty')}
        emptyMessage={historyEmptyMessage ?? "History is not recorded for this server yet."}
        summary={`CPU and memory history, ${range}`}
        actions={onRangeChange ? <TimeRangeSelector value={range} onValueChange={onRangeChange} /> : undefined}
      >
        <TimeSeriesChart data={(history ?? []) as unknown as Record<string, unknown>[]} xKey="t" series={[{ key: 'cpu', label: 'CPU %' }, { key: 'memory', label: 'Memory %', color: 'violet' }]} formatY={(v) => `${v}%`} domain={[0, 100]} />
      </ChartFrame>
    </div>
  );
}
