import { useMemo } from 'react';
import { Button } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { col } from '../../components/cols';
import { Status, planStatus } from '../../components/status';
import { EntityLink } from '../../components/entities';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { intervalLabel, mb, money } from '../../lib/format';
import type { Plan } from '../../types';

export default function PlanList() {
  const { data } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const prod = useMemo(() => new Map(data.products.map((p) => [p.id, p.name])), [data.products]);
  const sold = useMemo(() => new Map(data.plans.map((p) => [p.id, data.services.filter((s) => s.planId === p.id && (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE')).length])), [data.plans, data.services]);
  const monthlyEur = (p: Plan) => p.prices.find((x) => x.currency === 'EUR' && x.interval === 'MONTHLY')?.priceMinorUnits ?? 0;
  return (
    <AdminPage title="Plans" description="Plan versions are immutable. Editing an active plan creates a new version; services keep the version they were sold on." actions={<Button variant="primary" leadingIcon="add-01" disabled={!can('catalog:manage')} onClick={() => nav('/products/plans/new')}>New plan</Button>}>
      <ResourceTable<Plan>
        tableId="plans" caption="Plans" rows={data.plans} getRowId={(p) => p.id} rowLabel={(p) => `${p.name} v${p.version}`} searchText={(p) => `${p.name} ${prod.get(p.productId) ?? ''}`}
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'ACTIVE', label: 'Active', test: (p) => p.status === 'ACTIVE' }, { value: 'DRAFT', label: 'Draft', test: (p) => p.status === 'DRAFT' }, { value: 'RETIRED', label: 'Retired', test: (p) => p.status === 'RETIRED' }]}
        filters={[{ id: 'prod', label: 'Product', options: data.products.map((p) => ({ value: p.id, label: p.name })), test: (p, v) => p.productId === v }]}
        onRowClick={(p) => nav(`/products/plans/${p.id}`)} pageSize={12}
        columns={[
          col<Plan>('n', 'Plan', (p) => <span className="grid md:min-w-[10rem]"><EntityLink to={`/products/plans/${p.id}`}>{p.name}</EntityLink><span className="text-[12.5px] text-ink3">{prod.get(p.productId)} · v{p.version}</span></span>, { primary: true, sort: (p) => p.name }),
          col<Plan>('s', 'Status', (p) => <Status map={planStatus} value={p.status} />, { sort: (p) => p.status }),
          col<Plan>('r', 'Resources', (p) => <span className="whitespace-nowrap text-[13px]">{mb(p.resources.memoryMb)} · {p.resources.cpuPct}% CPU · {mb(p.resources.diskMb)}</span>, { sort: (p) => p.resources.memoryMb }),
          col<Plan>('p', 'Monthly (EUR)', (p) => money({ amount: monthlyEur(p), currency: 'EUR' }), { sort: monthlyEur, numeric: true }),
          col<Plan>('c', 'Cycles', (p) => [...new Set(p.prices.map((x) => intervalLabel[x.interval]))].length),
          col<Plan>('rg', 'Regions', (p) => p.regions.join(', ').toUpperCase(), { hideOnMobile: true }),
          col<Plan>('sold', 'Active services', (p) => sold.get(p.id) ?? 0, { sort: (p) => sold.get(p.id) ?? 0, numeric: true }),
        ]}
        empty={{ title: 'No plans' }}
      />
    </AdminPage>
  );
}
