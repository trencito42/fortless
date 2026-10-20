import { useState } from 'react';
import { Notice, PlanComparison, PricingTable, SegmentedControl, type PricingPlan } from '@/design-system';
import { ResourceView } from '@/views/shared/ResourceView';
import { useApiQuery } from '../../data/DataProvider';
import { useNavigate } from '../../router';
import { PageHeader } from '../../components/PageHeader';
import { CapabilityNote } from '../../components/CapabilityNote';
import { mb, money } from '../../format';
import type { BillingCycle } from '../../domain/types';

/** Plans and pricing: cards to choose from, a comparison table underneath. Commercial hosting plans, priced per month or year. */
export default function Plans() {
  const nav = useNavigate();
  const res = useApiQuery((a) => a.plans());
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  return (
    <div className="grid gap-5">
      <PageHeader title="Plans & pricing" description="Every plan includes DDoS protection and NVMe storage. Switch plans any time; the difference is prorated." crumbs={[{ label: 'Billing', to: '/app/billing' }, { label: 'Plans & pricing' }]} />
      <CapabilityNote area="billing" />
      <ResourceView res={res} reload={res.reload} label="Loading plans">
        {(plans) => {
          const cards: PricingPlan[] = plans.map((p) => ({ id: p.id, name: p.name, price: money(cycle === 'yearly' ? { ...p.priceYearly, amount: Math.round(p.priceYearly.amount / 12) } : p.priceMonthly), period: '/ month', note: cycle === 'yearly' ? `${money(p.priceYearly)} billed yearly` : undefined, features: p.features, highlight: p.highlight, description: `${mb(p.ramMb)} RAM · ${p.cpuPct / 100} vCPU` }));
          return (
            <>
              <PricingTable plans={cards} onSelect={() => nav("/app/deploy")} selectLabel={(p) => `Deploy on ${p.name}`}
                header={<div className="flex flex-wrap items-center gap-3"><SegmentedControl<BillingCycle> aria-label="Billing cycle" value={cycle} onValueChange={setCycle} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly · 2 months free' }]} /></div>} />
              <section className="grid gap-3" aria-labelledby="cmp"><h2 id="cmp" className="text-lg font-extrabold tracking-[-0.03em]">Compare plans</h2>
                <PlanComparison plans={plans} rows={[
                  { label: 'Memory', values: Object.fromEntries(plans.map((p) => [p.id, mb(p.ramMb)])) },
                  { label: 'CPU', values: Object.fromEntries(plans.map((p) => [p.id, `${p.cpuPct / 100} vCPU`])) },
                  { label: 'Storage (NVMe)', values: Object.fromEntries(plans.map((p) => [p.id, mb(p.diskMb)])) },
                  { label: 'Player slots', values: Object.fromEntries(plans.map((p) => [p.id, p.slots ? String(p.slots) : '–'])) },
                  { label: 'Bandwidth', values: Object.fromEntries(plans.map((p) => [p.id, `${p.bandwidthGb} GB`])) },
                  { label: 'Dedicated IP', values: Object.fromEntries(plans.map((p) => [p.id, p.features.some((f) => f.includes('Dedicated IP'))])) },
                  { label: 'Priority support', values: Object.fromEntries(plans.map((p) => [p.id, p.features.some((f) => f.includes('Priority'))])) },
                ]} />
              </section>
              <Notice tone="info">Shared-capacity tiers are not offered here. Every plan reserves its own memory and CPU.</Notice>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
