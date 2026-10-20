import { Card, CardHeader, DescriptionList, Notice } from '@/design-system';
import { useService } from '../context';

const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)} GB` : `${n} MB`);

/**
 * The plan's resource allocation. Comes from GET /services/:id (desiredConfig), which is the plan's limits, not live usage.
 * The shipped app shows the same three limits; there is no route to change them here (that is a plan change).
 */
export function AllocationTab() {
  const { summary } = useService();
  const l = summary.limits;
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Allocation" description={`Resources included in ${summary.name}.`} />
      {l ? <DescriptionList columns={2} items={[{ label: 'Memory', value: mb(l.memoryMb) }, { label: 'CPU share', value: `${l.cpuPct}%` }, { label: 'Storage', value: mb(l.diskMb) }]} />
        : <Notice tone="info">The plan limits have not been recorded for this service yet.</Notice>}
      <p className="text-[13.5px] text-ink3">To change these limits, change your plan from Billing. Live usage is on the Overview tab.</p>
    </Card>
  );
}
