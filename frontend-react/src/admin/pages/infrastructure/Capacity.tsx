import { useMemo } from 'react';
import { Badge, Button, Notice } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Columns, KpiGrid, Section } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { CapacityBar } from '../../components/CapacityBar';
import { PreviewNote } from '../../components/PreviewNote';
import { EntityLink } from '../../components/entities';
import { col } from '../../components/cols';
import { useAdmin } from '../../store';
import { useSession } from '../../session';
import { REGION_NAMES } from '../../fixtures/commerce';
import { mb, money, mrrOf, sumByCurrency } from '../../lib/format';
import { nodeCapacity } from '../../lib/metrics';
import type { InfraNode, Money } from '../../types';
import { useNodeOps } from './nodeOps';

interface Row { n: InfraNode; mrr: Money[]; eurMrr: number; margin: number | null; otherCur: string[] }

export default function Capacity() {
  const { data } = useAdmin();
  const { can } = useSession();
  const ops = useNodeOps();
  const rows = useMemo<Row[]>(() => data.nodes.map((n) => {
    const active = data.services.filter((s) => s.nodeId === n.id && s.lifecycle === 'ACTIVE');
    const mrr = sumByCurrency(active.map((s) => mrrOf(s.billing.price, s.billing.interval)));
    const eurMrr = mrr.find((x) => x.currency === 'EUR')?.amount ?? 0;
    return { n, mrr, eurMrr, margin: n.monthlyCost ? eurMrr - n.monthlyCost.amount : null, otherCur: mrr.filter((x) => x.currency !== 'EUR').map((x) => x.currency) };
  }), [data.nodes, data.services]);
  const unknown = rows.filter((r) => !r.n.monthlyCost);
  const costTotal = rows.reduce((a, r) => a + (r.n.monthlyCost?.amount ?? 0), 0);
  return (
    <AdminPage title="Capacity & profitability" description="What each node costs, what is sold on it and what is left. Margin is shown only where the node cost is known, and only for revenue in the cost currency.">
      {unknown.length ? <Notice tone="warn" title="Some costs are unknown">{unknown.map((r) => r.n.name).join(', ')} {unknown.length > 1 ? 'have' : 'has'} no recorded monthly cost. No margin is shown for {unknown.length > 1 ? 'them' : 'it'}, and fleet totals exclude {unknown.length > 1 ? 'them' : 'it'}.</Notice> : null}
      <KpiGrid cols={4} items={[
        { label: 'Known monthly cost', value: money({ amount: costTotal, currency: 'EUR' }), icon: 'coins-01', hint: `${rows.length - unknown.length} of ${rows.length} nodes` },
        { label: 'EUR recurring revenue on nodes', value: money({ amount: rows.reduce((a, r) => a + r.eurMrr, 0), currency: 'EUR' }), icon: 'wallet-01', hint: 'USD and RON revenue is not converted' },
        { label: 'RAM left to sell', value: mb(data.nodes.reduce((a, n) => a + nodeCapacity(n).ramFreeSellable, 0)), icon: 'database', hint: 'After overallocation, all regions' },
        { label: 'Nodes above 90% sold', value: rows.filter((r) => nodeCapacity(r.n).ramSoldPct > 90).length, icon: 'alert-01' },
      ]} />
      <Section title="Per node" description="Cost, revenue and capacity side by side.">
        <RelatedTable rows={rows} getRowId={(r) => r.n.id} caption="Node economics" pageSize={10} columns={[
          col<Row>('n', 'Node', (r) => <span className="grid min-w-[8rem]"><EntityLink to={`/infrastructure/nodes/${r.n.id}`}>{r.n.name}</EntityLink><span className="text-[12.5px] text-ink3">{REGION_NAMES[r.n.region]}</span></span>, { primary: true, sort: (r) => r.n.name }),
          col<Row>('c', 'Monthly cost', (r) => (r.n.monthlyCost ? money(r.n.monthlyCost) : <Badge tone="warn">Unknown</Badge>), { numeric: true, sort: (r) => r.n.monthlyCost?.amount ?? -1 }),
          col<Row>('rev', 'Recurring revenue', (r) => <span className="grid">{r.mrr.length ? r.mrr.map((x) => <span key={x.currency} className="tabular-nums">{money(x)}</span>) : '—'}</span>, { numeric: true, sort: (r) => r.eurMrr }),
          col<Row>('m', 'Est. margin (EUR)', (r) => (r.margin == null ? <span className="text-ink3">n/a: cost unknown</span> : <span className={r.margin < 0 ? 'font-bold text-bad' : 'font-bold text-good'}>{money({ amount: r.margin, currency: 'EUR' })}{r.otherCur.length ? <span className="block text-[11.5px] font-semibold text-ink3">excl. {r.otherCur.join(', ')}</span> : null}</span>), { numeric: true, sort: (r) => r.margin ?? -999999 }),
          col<Row>('ram', 'RAM sold / physical', (r) => `${nodeCapacity(r.n).ramSoldPct}%`, { numeric: true, sort: (r) => nodeCapacity(r.n).ramSoldPct }),
          col<Row>('left', 'RAM left to sell', (r) => mb(nodeCapacity(r.n).ramFreeSellable), { numeric: true, sort: (r) => nodeCapacity(r.n).ramFreeSellable, hideOnMobile: true }),
          col<Row>('a', 'Cost', (r) => <Button size="sm" variant="ghost" disabled={!can('catalog:manage')} onClick={() => ops.setCost(r.n)}>Set cost…</Button>, { hideOnMobile: true }),
        ]} />
      </Section>
      <Columns>
        {rows.slice(0, 4).map((r) => <Section key={r.n.id} title={r.n.name} description={REGION_NAMES[r.n.region]}><div className="grid gap-5"><CapacityBar label="RAM" physical={r.n.hardware.ramMb} sold={r.n.allocated.ramMb} used={r.n.usage.ramMb} limit={nodeCapacity(r.n).ramLimit} format={mb} /><CapacityBar label="Disk" physical={r.n.hardware.diskMb} sold={r.n.allocated.diskMb} used={r.n.usage.diskMb} format={mb} /></div></Section>)}
      </Columns>
      <PreviewNote>Margin = recurring EUR revenue of active services on the node minus its monthly cost. It ignores tax, payment fees, support cost and shared overhead, and it is not shown when the cost is unknown.</PreviewNote>
      {ops.node}
    </AdminPage>
  );
}
