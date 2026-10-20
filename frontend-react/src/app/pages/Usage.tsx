import { useMemo, useState } from 'react';
import { Select, type TimeRange } from '@/design-system';
import { UsageOverview } from '@/features';
import { useApiQuery } from '../data/DataProvider';
import { PageHeader } from '../components/PageHeader';
import { CapabilityNote } from '../components/CapabilityNote';
import { mb } from '../format';

const FMT: Record<TimeRange, Intl.DateTimeFormatOptions> = { '1h': { hour: '2-digit', minute: '2-digit' }, '24h': { hour: '2-digit', minute: '2-digit' }, '7d': { weekday: 'short', hour: '2-digit' }, '30d': { day: 'numeric', month: 'short' } };

/** Usage history per service. Planned: it needs a metrics backend, so the data is deterministic fixtures and the page says so. */
export default function Usage() {
  const services = useApiQuery((a) => a.listServices());
  const [id, setId] = useState<string | null>('svc_survival');
  const [range, setRange] = useState<TimeRange>('24h');
  const series = useApiQuery((a) => a.usage(id ?? 'svc_survival', range), [id, range]);
  const samples = useMemo(() => (series.status === 'ready' ? series.data.points.map((p) => ({ label: new Date(p.t).toLocaleString('en-GB', { ...FMT[range], timeZone: 'UTC' }), cpu: p.cpu, ramMb: p.ramMb, inMbps: p.netInMbps, outMbps: p.netOutMbps })) : []), [series, range]);
  return (
    <div className="grid gap-5">
      <PageHeader title="Usage" description="How much of your plan each service uses, over time." />
      <CapabilityNote area="usage" />
      <div className="max-w-sm"><Select label="Service" value={id} onValueChange={setId} options={services.status === 'ready' ? services.data.filter((s) => s.provider === 'PTERODACTYL').map((s) => ({ value: s.id, label: s.name })) : []} /></div>
      <UsageOverview range={range} onRangeChange={setRange} samples={samples} state={series.status === 'loading' ? 'loading' : series.status === 'error' ? 'error' : samples.length ? 'ready' : 'empty'} onRetry={series.reload} bandwidth={series.status === 'ready' ? series.data.bandwidth : undefined} formatMemory={mb} />
    </div>
  );
}
