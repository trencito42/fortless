import { useEffect, useState } from 'react';
import { DiagnosticsCard } from './DiagnosticsCard';
import { Card, CardHeader, CopyField, DescriptionList, Notice } from '@/design-system';
import { ServerMetricsPanel, type ServerResources } from '@/features';
import type { PlatformCapabilitiesDto } from '../contracts';
import { verificationLabel } from '../access';
import { useService } from '../context';
import { liveToState, statsToResources, usageToResources } from '../mappers';

const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)} GB` : `${n} MB`);

/** Live counters from the console socket when it is connected, otherwise from GET /usage every 10 seconds. */
export function OverviewTab({ platform }: { platform: PlatformCapabilitiesDto | null }) {
  const { id, ports, summary, detail, live } = useService();
  const state = liveToState(live.powerState) ?? summary.state;
  const connected = live.status === 'connected' && live.stats !== null;
  const [polled, setPolled] = useState<ServerResources | null | undefined>(undefined);
  const [pollError, setPollError] = useState<string>();

  useEffect(() => {
    if (connected) return;
    const ctl = new AbortController();
    const read = () => ports.service.usage(id, ctl.signal).then((u) => { if (!ctl.signal.aborted) { setPolled(usageToResources(u)); setPollError(undefined); } }, (e: unknown) => { if (!ctl.signal.aborted && !(e instanceof DOMException)) setPollError(e instanceof Error ? e.message : 'Usage could not be read.'); });
    void read();
    const t = setInterval(() => void read(), 10000);
    return () => { ctl.abort(); clearInterval(t); };
  }, [connected, ports, id]);

  const resources = connected && live.stats ? statsToResources(live.stats) : polled ?? undefined;
  const loading = !resources && !pollError && (live.status === 'connecting' || polled === undefined);
  const lim = summary.limits;
  return (
    <div className="grid gap-4">
      {pollError && !resources ? <Notice tone="warn">Live usage is unavailable: {pollError}</Notice> : null}
      <ServerMetricsPanel state={state} resources={resources} loading={loading} history={live.history} historyState={live.history.length > 1 ? 'ready' : 'empty'}
        historyDescription="CPU and memory since you opened this page" historyEmptyMessage={connected ? 'Collecting samples…' : 'Live samples need the console connection.'} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card pad="lg" className="grid gap-4">
          <CardHeader title="Connection & datacenter" description="Where this service lives." />
          {summary.nodeFqdn ? <CopyField label="Node hostname" value={summary.nodeFqdn} /> : null}
          <DescriptionList items={[
            { label: 'Service ID', value: summary.id, copy: summary.id, mono: true },
            { label: 'Provider ID', value: summary.identifier ?? 'Provisioning', copy: summary.identifier ?? undefined, mono: true },
            { label: 'Provider', value: summary.providerType },
            { label: 'Datacenter', value: `${summary.regionName} (${summary.regionCode})` },
            { label: 'Node', value: summary.nodeName },
          ]} />
        </Card>
        <Card pad="lg" className="grid gap-4">
          <CardHeader title="Plan limits" description={detail.planName} />
          <DescriptionList items={lim ? [
            { label: 'Memory', value: mb(lim.memoryMb) }, { label: 'CPU limit', value: `${lim.cpuPct}%` }, { label: 'Disk', value: mb(lim.diskMb) },
          ] : [{ label: 'Limits', value: 'Not reported yet' }]} />
          <DescriptionList items={[
            { label: 'Access', value: summary.accessKind === 'ACCOUNT' ? 'Owner' : `Shared by ${summary.sharedBy ?? 'the owner'}` },
            { label: 'Provider checks', value: platform ? verificationLabel(platform.provisioning.verification) : 'Unknown' },
          ]} />
        </Card>
      </div>
      <DiagnosticsCard />
    </div>
  );
}
