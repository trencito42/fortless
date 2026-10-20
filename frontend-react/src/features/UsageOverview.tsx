import { Card, CardHeader, ChartFrame, MetricCard, TimeRangeSelector, TimeSeriesChart, type ChartState, type TimeRange } from '@/design-system';

export interface UsageSample { /** Already formatted x label. */ label: string; cpu: number; ramMb: number; inMbps: number; outMbps: number }
export interface UsageOverviewProps {
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  samples: UsageSample[];
  state: ChartState;
  onRetry?: () => void;
  bandwidth?: { usedGb: number; limitGb: number };
  formatMemory: (mb: number) => string;
}

const peak = (s: UsageSample[], k: 'cpu' | 'ramMb' | 'inMbps' | 'outMbps') => s.reduce((a, d) => Math.max(a, d[k]), 0);

/** Usage history for one service: peaks, CPU, memory, network and the monthly bandwidth quota. Each chart has its own loading, empty and error state and a text summary. */
export function UsageOverview({ range, onRangeChange, samples, state, onRetry, bandwidth, formatMemory }: UsageOverviewProps) {
  const data = samples.map((s) => ({ t: s.label, cpu: s.cpu, ram: Math.round(s.ramMb), inMbps: s.inMbps, outMbps: s.outMbps }));
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><TimeRangeSelector value={range} onValueChange={onRangeChange} /></div>
      <section aria-label="Peaks" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CPU peak" value={`${peak(samples, 'cpu')}%`} icon="cpu" state={state === 'loading' ? 'loading' : 'ready'} />
        <MetricCard label="Memory peak" value={formatMemory(peak(samples, 'ramMb'))} icon="database" state={state === 'loading' ? 'loading' : 'ready'} />
        <MetricCard label="Network in (peak)" value={`${peak(samples, 'inMbps').toFixed(1)} Mbps`} icon="arrow-down-01" state={state === 'loading' ? 'loading' : 'ready'} />
        <MetricCard label="Network out (peak)" value={`${peak(samples, 'outMbps').toFixed(1)} Mbps`} icon="arrow-up-01" state={state === 'loading' ? 'loading' : 'ready'} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="CPU" description="Percent of your plan's CPU" state={state} onRetry={onRetry} summary={`CPU usage over the last ${range}, peak ${peak(samples, 'cpu')} percent`} height={220}>
          <TimeSeriesChart kind="area" data={data} xKey="t" series={[{ key: 'cpu', label: 'CPU', color: 'accent' }]} domain={[0, 100]} formatY={(v) => `${v}%`} />
        </ChartFrame>
        <ChartFrame title="Memory" description="Resident memory" state={state} onRetry={onRetry} summary={`Memory over the last ${range}, peak ${formatMemory(peak(samples, 'ramMb'))}`} height={220}>
          <TimeSeriesChart kind="area" data={data} xKey="t" series={[{ key: 'ram', label: 'Memory', color: 'violet' }]} formatY={(v) => formatMemory(v)} />
        </ChartFrame>
        <ChartFrame title="Network" description="Traffic in and out" state={state} onRetry={onRetry} summary={`Network traffic over the last ${range}, peak out ${peak(samples, 'outMbps').toFixed(1)} megabits per second`} height={220}>
          <TimeSeriesChart kind="line" data={data} xKey="t" series={[{ key: 'inMbps', label: 'In', color: 'good' }, { key: 'outMbps', label: 'Out', color: 'warn' }]} formatY={(v) => `${v} Mbps`} />
        </ChartFrame>
        {bandwidth ? (
          <Card pad="lg" className="grid gap-3">
            <CardHeader title="Bandwidth this month" description="Outgoing traffic counted against your plan." />
            <p className="text-[28px] font-extrabold tracking-[-0.04em] tabular-nums">{bandwidth.usedGb} GB <span className="text-[15px] font-semibold text-ink3">of {bandwidth.limitGb} GB</span></p>
            <div className="h-2 overflow-hidden rounded-full bg-s3" role="progressbar" aria-label="Bandwidth used" aria-valuemin={0} aria-valuemax={bandwidth.limitGb} aria-valuenow={bandwidth.usedGb}><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (bandwidth.usedGb / bandwidth.limitGb) * 100)}%` }} /></div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
