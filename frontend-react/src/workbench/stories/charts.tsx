import { useState } from 'react';
import { defineStory } from '../types';
import { ChartFrame, TimeSeriesChart, MetricCard, TimeRangeSelector, ProgressRing, Gauge, DonutChart, type TimeRange } from '@/design-system';
import { Row } from '../layout';

/** Deterministic sample series for the workbench. Labelled as sample wherever shown. */
const sample = (n: number, base: number, amp: number, phase = 0) => Array.from({ length: n }, (_, i) => ({ t: `${String(i).padStart(2, '0')}:00`, a: Math.round(base + Math.sin(i / 3 + phase) * amp), b: Math.round(base / 2 + Math.cos(i / 4 + phase) * amp / 2) }));
const DATA = sample(24, 45, 20);
const pct = (v: number) => `${v}%`;

function Range() {
  const [r, setR] = useState<TimeRange>('24h');
  return (
    <ChartFrame title="CPU usage" description="Sample data, not a real server" summary="CPU usage over the last 24 hours, sample data" actions={<TimeRangeSelector value={r} onValueChange={setR} />}>
      <TimeSeriesChart data={DATA} xKey="t" series={[{ key: 'a', label: 'CPU' }]} formatY={pct} domain={[0, 100]} />
    </ChartFrame>
  );
}

export const chartStories = [
  defineStory({
    id: 'metric-card',
    title: 'MetricCard',
    category: 'Charts',
    layer: 'B: composition',
    purpose: 'One number with context. Shows a dash and a reason when the source reported nothing; never invents a value.',
    source: 'Fortless Views.html: dashboard and service overview counters',
    variants: ['ready', 'with delta', 'with sparkline', 'loading', 'unavailable'],
    props: ['label, value, unit, icon', 'state: ready | loading | unavailable', 'unavailableReason', 'delta {value, direction, goodWhen}', 'trend: number[] (real samples only)'],
    a11y: 'Loading is a labelled status. Unavailable exposes "No value" and the reason as text. Delta direction is shown by icon and text, not color alone.',
    responsive: 'Fluid in a grid; value stays on one line.',
    status: 'implemented',
    scenarios: [
      { name: 'States', render: () => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Players online" value="18" unit="/ 50" icon="user-group" delta={{ value: '+4 vs yesterday', direction: 'up' }} trend={DATA.map((d) => d.a)} />
          <MetricCard label="Memory" value="2.1" unit="GB" icon="cpu" delta={{ value: '+12%', direction: 'up', goodWhen: 'down' }} />
          <MetricCard label="Uptime" state="loading" />
          <MetricCard label="CPU" state="unavailable" unavailableReason="Server is offline" icon="cpu" />
        </div>
      ) },
    ],
  }),
  defineStory({
    id: 'charts',
    title: 'Charts (area, line, bar, stacked)',
    category: 'Charts',
    layer: 'B: composition',
    purpose: 'Time-series charts inside a frame that owns loading, empty, error and stale states.',
    source: 'new (Fortless Views.html shows usage only as counters)',
    variants: ['area', 'line', 'bar', 'stacked bar', 'loading', 'empty', 'error', 'stale', 'with TimeRangeSelector'],
    props: ['ChartFrame: title, summary (required), state, onRetry, staleLabel, actions', 'TimeSeriesChart: kind, data, xKey, series, stacked, formatX/Y, domain'],
    a11y: 'The chart is role=img with a text summary supplied by the caller; tooltips are a hover/touch extra. Series are distinguishable by legend and shape, not color alone only where a legend is shown (add one for production use).',
    responsive: 'Width is fluid via ResponsiveContainer; y axis is 44px wide.',
    status: 'partial',
    gaps: 'Chart region is keyboard readable (arrows, Home/End, Esc) but the tooltip is not pinned on touch. Data shown here is deterministic sample data. Fortless has no usage-history API, so a production usage page needs that backend first.',
    scenarios: [
      { name: 'Area with range selector', render: () => <Range /> },
      { name: 'Line and stacked bars', render: () => (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="Bandwidth" description="Sample data" summary="Bandwidth line chart, sample data"><TimeSeriesChart kind="line" data={DATA} xKey="t" series={[{ key: 'a', label: 'Inbound' }, { key: 'b', label: 'Outbound', color: 'violet' }]} /></ChartFrame>
          <ChartFrame title="Requests by status" description="Sample data" summary="Stacked bar chart, sample data"><TimeSeriesChart kind="bar" stacked data={sample(12, 30, 10)} xKey="t" series={[{ key: 'a', label: 'OK', color: 'good' }, { key: 'b', label: 'Errors', color: 'bad' }]} /></ChartFrame>
        </div>
      ) },
      { name: 'Non-ready states', render: () => (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChartFrame title="Loading" summary="" state="loading"><span /></ChartFrame>
          <ChartFrame title="Empty" summary="" state="empty" emptyMessage="No samples yet. Start the server to collect metrics."><span /></ChartFrame>
          <ChartFrame title="Error" summary="" state="error" onRetry={() => {}}><span /></ChartFrame>
          <ChartFrame title="Stale" summary="CPU, last known values" state="stale" staleLabel="Last updated 12 minutes ago"><TimeSeriesChart data={DATA} xKey="t" series={[{ key: 'a', label: 'CPU' }]} /></ChartFrame>
        </div>
      ) },
    ],
  }),
  defineStory({
    id: 'radial',
    title: 'ProgressRing, Gauge and DonutChart',
    category: 'Charts',
    layer: 'A: primitive',
    purpose: 'Capacity and share-of-total: disk full, memory used, tickets by status.',
    source: 'new',
    variants: ['ring', 'gauge with thresholds', 'donut with legend'],
    props: ['ProgressRing: value, label, tone', 'Gauge: value, label, caption, tone?', 'DonutChart: segments, center'],
    a11y: 'Ring is role=progressbar, gauge is role=meter, both with values. Donut legend lists the numbers.',
    responsive: 'Fixed small footprint; donut stacks legend below on phones.',
    status: 'implemented',
    scenarios: [
      { name: 'Rings and gauges', render: () => (
        <Row>
          <ProgressRing value={42} label="Disk used" />
          <ProgressRing value={81} label="Memory used" tone="warn" />
          <div className="w-[200px]"><Gauge value={93} label="CPU" caption="Sample data" /></div>
        </Row>
      ) },
      { name: 'Donut', render: () => <DonutChart segments={[{ label: 'Open', value: 6 }, { label: 'Waiting on you', value: 3, tone: 'warn' }, { label: 'Resolved', value: 21, tone: 'good' }]} center={<span>30<br /><small className="text-[11px] text-ink3">tickets</small></span>} /> },
    ],
  }),
];
