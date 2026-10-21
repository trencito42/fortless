import { useMemo, useState } from 'react';
import { Badge, Button, CheckboxGroup, EmptyState, Notice, NumberField, Select, Switch, TextField } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { Status, planStatus } from '../../components/status';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { REGION_NAMES } from '../../fixtures/commerce';
import { intervalLabel, mb, money } from '../../lib/format';
import type { BillingInterval, Currency, Plan, PlanOption, PlanPrice } from '../../types';

const CURS: Currency[] = ['EUR', 'USD', 'RON'];
const INTERVALS: BillingInterval[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];
const blank = (productId: string): Plan => ({ id: '', productId, version: 1, name: '', status: 'DRAFT', resources: { memoryMb: 1024, cpuPct: 100, diskMb: 10240, databases: 0, backups: 1, eggId: 3, dockerImage: '' }, prices: [], options: [], regions: ['fra'], capacityLimit: null });

export default function PlanBuilder({ id }: { id: string }) {
  const { data, add, patch, audit, newId } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can } = useSession();
  const act = useActionDialog();
  const isNew = id === 'new';
  const existing = data.plans.find((p) => p.id === id);
  const [plan, setPlan] = useState<Plan>(() => existing ? structuredClone(existing) : blank(data.products.find((p) => p.providerType !== 'NONE')!.id));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => { setPlan((p) => ({ ...p, [k]: v })); setDirty(true); };
  const setRes = <K extends keyof Plan['resources']>(k: K, v: Plan['resources'][K]) => { setPlan((p) => ({ ...p, resources: { ...p.resources, [k]: v } })); setDirty(true); };
  const priceOf = (c: Currency, i: BillingInterval) => plan.prices.find((p) => p.currency === c && p.interval === i);
  const setPrice = (c: Currency, i: BillingInterval, major: string) => { setPlan((p) => { const rest = p.prices.filter((x) => !(x.currency === c && x.interval === i)); const n = Math.round(Number(major.replace(',', '.')) * 100); const row: PlanPrice | null = major === '' ? null : { currency: c, interval: i, priceMinorUnits: Number.isFinite(n) ? n : 0, setupFeeMinorUnits: priceOf(c, i)?.setupFeeMinorUnits ?? 0 }; return { ...p, prices: row ? [...rest, row] : rest }; }); setDirty(true); };
  const product = data.products.find((p) => p.id === plan.productId);
  const eggs = data.eggs.filter((e) => e.compatible);
  const soldNow = existing ? data.services.filter((s) => s.planId === existing.id && s.lifecycle === 'ACTIVE').length : 0;
  const nodesByRegion = (r: string) => data.nodes.filter((n) => n.region === r);
  const readonly = !can('catalog:manage');
  const locked = !!existing && existing.status === 'RETIRED';

  const validate = () => {
    const e: Record<string, string> = {};
    if (plan.name.trim().length < 3) e['name'] = 'Name must be at least 3 characters.';
    if (plan.resources.memoryMb < 128) e['ram'] = 'RAM must be at least 128 MB.';
    if (plan.resources.diskMb < 512) e['disk'] = 'Disk must be at least 512 MB.';
    if (plan.resources.cpuPct < 10) e['cpu'] = 'CPU must be at least 10%.';
    if (!plan.regions.length) e['regions'] = 'Choose at least one location.';
    if (!plan.resources.eggId) e['egg'] = 'Choose a provider egg.';
    if (!CURS.every((c) => priceOf(c, 'MONTHLY') && priceOf(c, 'MONTHLY')!.priceMinorUnits > 0)) e['prices'] = 'A monthly price in every currency is required, so any customer can order.';
    plan.options.forEach((o, i) => { if (!/^[a-z][a-z0-9_]*$/.test(o.key)) e[`opt${i}`] = 'Option key: lowercase letters, digits and underscores.'; });
    setErrors(e); return Object.keys(e).length === 0;
  };
  const cleanRegions = useMemo(() => Object.keys(REGION_NAMES), []);
  const save = (status: 'DRAFT' | 'ACTIVE') => {
    if (!validate()) { toast({ tone: 'bad', title: 'Fix the highlighted fields first' }); return; }
    const newVersion = existing && existing.status === 'ACTIVE';
    const rec: Plan = { ...plan, status, id: isNew || newVersion ? newId('pln') : plan.id, version: newVersion ? existing!.version + 1 : plan.version, resources: { ...plan.resources, dockerImage: data.eggs.find((x) => x.id === plan.resources.eggId)?.dockerImage ?? '' } };
    if (isNew || newVersion) { add('plans', rec, 'end'); if (newVersion) patch('plans', existing!.id, { status: 'RETIRED' }); } else patch('plans', plan.id, rec);
    audit(newVersion ? 'catalog.plan_version_created' : isNew ? 'catalog.plan_created' : 'catalog.plan_updated', { type: 'plan', id: rec.id, label: rec.name }, { after: { status, version: String(rec.version) } });
    toast({ tone: 'good', title: newVersion ? `Version ${rec.version} created; v${existing!.version} retired (preview)` : status === 'ACTIVE' ? 'Plan activated (preview)' : 'Draft saved (preview)' });
    setDirty(false); nav(`/products/plans/${rec.id}`);
  };
  const activate = () => act.run({ title: existing && existing.status === 'ACTIVE' ? `Publish version ${existing.version + 1}` : 'Activate plan', confirmLabel: 'Activate', permission: 'catalog:manage', stepUp: true, reasonRequired: true, description: 'Active versions can be sold immediately. The previous active version is retired but keeps serving existing services.', effects: ['New orders use this version from now on', 'Existing services stay on their sold version until a plan change', 'Quotes already issued stay valid until they expire'], onConfirm: () => { save('ACTIVE'); } });

  const preview = CURS.map((c) => priceOf(c, 'MONTHLY')).filter(Boolean) as PlanPrice[];
  return (
    <AdminPage detail title={isNew ? 'New plan' : `${plan.name || 'Plan'} · v${plan.version}`} crumbLabel={isNew ? 'New plan' : plan.name} parents={[{ label: 'Plans', to: '/products/plans' }]} status={<Status map={planStatus} value={plan.status} />}
      description={product ? `Product: ${product.name}. Backend plan versions are immutable; changes to an active plan publish a new version.` : undefined}
      actions={<><Button variant="ghost" onClick={() => nav('/products/plans')}>{dirty ? 'Discard' : 'Back'}</Button><Button variant="secondary" disabled={readonly || locked || (!dirty && !isNew)} onClick={() => save('DRAFT')}>Save draft</Button><Button variant="primary" disabled={readonly || locked} onClick={() => (validate() ? activate() : toast({ tone: 'bad', title: 'Fix the highlighted fields first' }))}>{existing?.status === 'ACTIVE' ? 'Publish new version…' : 'Activate…'}</Button></>}>
      {readonly ? <Notice tone="warn" title="Read-only">Requires <code className="font-mono font-bold">catalog:manage</code>.</Notice> : null}
      {locked ? <Notice tone="info" title="Retired version">Retired versions are immutable and kept for services that were sold on them.</Notice> : null}
      {existing && soldNow > 0 ? <Notice tone="info" title={`${soldNow} active services run on this version`}>They keep these limits and prices. Changing them here only affects new orders (as a new version).</Notice> : null}
      {Object.keys(errors).length ? <Notice tone="bad" title="Cannot save yet">{Object.values(errors).join(' ')}</Notice> : null}
      <Split main={<>
        <Section title="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Plan name" required value={plan.name} onChange={(e) => set('name', e.target.value)} error={errors['name']} disabled={readonly || locked} />
            <Select label="Product" value={plan.productId} onValueChange={(v) => set('productId', v ?? plan.productId)} options={data.products.filter((p) => p.providerType !== 'NONE').map((p) => ({ value: p.id, label: p.name }))} disabled={readonly || locked || !isNew} />
          </div>
        </Section>
        <Section title="Resources" description="Limits enforced by the provider for each service on this plan.">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="RAM (MB)" value={plan.resources.memoryMb} onValueChange={(v) => setRes('memoryMb', v ?? 0)} min={0} step={128} error={errors['ram']} disabled={readonly || locked} />
            <NumberField label="Disk (MB)" value={plan.resources.diskMb} onValueChange={(v) => setRes('diskMb', v ?? 0)} min={0} step={1024} error={errors['disk']} disabled={readonly || locked} />
            <NumberField label="CPU (%)" value={plan.resources.cpuPct} onValueChange={(v) => setRes('cpuPct', v ?? 0)} min={0} step={10} error={errors['cpu']} disabled={readonly || locked} />
            <NumberField label="Databases" value={plan.resources.databases} onValueChange={(v) => setRes('databases', v ?? 0)} min={0} max={10} disabled={readonly || locked} />
            <NumberField label="Backup slots" value={plan.resources.backups} onValueChange={(v) => setRes('backups', v ?? 0)} min={0} max={20} disabled={readonly || locked} />
          </div>
        </Section>
        <Section title="Provider template" description="Egg and container image used when the server is created.">
          <div className="grid gap-4 sm:grid-cols-2"><Select label="Egg" value={plan.resources.eggId ? String(plan.resources.eggId) : null} error={errors['egg']} onValueChange={(v) => setRes('eggId', Number(v))} options={eggs.map((e) => ({ value: String(e.id), label: `${e.name} (${e.nest})` }))} disabled={readonly || locked} /><TextField label="Docker image" value={data.eggs.find((e) => e.id === plan.resources.eggId)?.dockerImage ?? ''} readOnly description="Comes from the egg; change it in the provider panel." /></div>
        </Section>
        <Section title="Locations" description="Where this plan can be placed. A paid order is never moved to another region.">
          <CheckboxGroup legend="Available regions" value={plan.regions} onValueChange={(v) => set('regions', v)} error={errors['regions']} disabled={readonly || locked} options={cleanRegions.map((r) => ({ value: r, label: REGION_NAMES[r]!, description: `${nodesByRegion(r).length} node(s), ${nodesByRegion(r).filter((n) => !n.maintenance.enabled && n.health !== 'offline').length} accepting orders` }))} />
        </Section>
        <Section title="Prices" description="Net of tax, in minor-unit precision. Every currency has its own price; nothing is converted at checkout.">
          {errors['prices'] ? <p role="alert" className="mb-2 text-[13px] font-semibold text-bad">{errors['prices']}</p> : null}
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] border-collapse text-left"><caption className="sr-only">Plan prices by currency and billing cycle</caption><thead><tr className="text-ink3"><th scope="col" className="py-2 pr-3 text-[12.5px] font-bold">Currency</th>{INTERVALS.map((i) => <th key={i} scope="col" className="px-2 py-2 text-[12.5px] font-bold">{intervalLabel[i]}</th>)}</tr></thead><tbody>{CURS.map((c) => <tr key={c}><th scope="row" className="py-2 pr-3 font-bold">{c}</th>{INTERVALS.map((i) => <td key={i} className="px-2 py-1.5"><TextField label={`${c} ${intervalLabel[i]} price`} hideLabel inputMode="decimal" value={priceOf(c, i) ? (priceOf(c, i)!.priceMinorUnits / 100).toFixed(2) : ''} onChange={(e) => setPrice(c, i, e.target.value)} placeholder="—" disabled={readonly || locked} /></td>)}</tr>)}</tbody></table></div>
        </Section>
        <Section title="Options & add-ons" description="Choices the customer makes at checkout. Price deltas are added to the cycle price."
          actions={<Button size="sm" variant="secondary" leadingIcon="add-01" disabled={readonly || locked} onClick={() => set('options', [...plan.options, { id: newId('opt'), key: '', label: '', inputType: 'select', isRequired: false, priceDeltaMinorUnits: 0 }])}>Add option</Button>}>
          {plan.options.length === 0 ? <p className="text-ink3">No options. The plan is sold as configured.</p> : <ul className="grid gap-3">{plan.options.map((o, i) => { const upd = (patch: Partial<PlanOption>) => set('options', plan.options.map((x, j) => (j === i ? { ...x, ...patch } : x))); return (
            <li key={o.id} className="grid gap-3 rounded-lg bg-s2 p-3 sm:grid-cols-[1fr_1fr_9rem_8rem_auto] sm:items-end"><TextField label="Key" value={o.key} onChange={(e) => upd({ key: e.target.value })} error={errors[`opt${i}`]} disabled={readonly || locked} /><TextField label="Label" value={o.label} onChange={(e) => upd({ label: e.target.value })} disabled={readonly || locked} /><Select label="Input" value={o.inputType} onValueChange={(v) => upd({ inputType: (v ?? 'select') as PlanOption['inputType'] })} options={[{ value: 'select', label: 'Choice' }, { value: 'number', label: 'Number' }, { value: 'toggle', label: 'Toggle' }]} disabled={readonly || locked} /><NumberField label="Price Δ (¢)" value={o.priceDeltaMinorUnits} onValueChange={(v) => upd({ priceDeltaMinorUnits: v ?? 0 })} step={50} disabled={readonly || locked} /><div className="flex items-center gap-2"><Switch label="Required" checked={o.isRequired} onCheckedChange={(v) => upd({ isRequired: v })} disabled={readonly || locked} /><Button size="sm" variant="ghost" onClick={() => set('options', plan.options.filter((_, j) => j !== i))} disabled={readonly || locked}>Remove</Button></div></li>); })}</ul>}
        </Section>
        <Section title="Capacity limit" description="Stop selling this plan after N active services. Empty means limited only by node capacity.">
          <div className="grid gap-3 sm:grid-cols-2"><NumberField label="Maximum active services" value={plan.capacityLimit} onValueChange={(v) => set('capacityLimit', v)} min={1} placeholder="No limit" disabled={readonly || locked} />{existing ? <div className="rounded-md bg-s2 p-3 text-[13.5px]"><b>{soldNow}</b> active now{plan.capacityLimit ? ` · ${Math.max(0, plan.capacityLimit - soldNow)} left` : ''}</div> : null}</div>
        </Section>
      </>} aside={<>
        <Section title="Customer preview" description="How the plan appears at checkout."><div className="grid gap-2 rounded-lg bg-s2 p-4"><p className="text-[18px] font-extrabold">{plan.name || 'Plan name'}</p><p className="text-ink2">{product?.name}</p><ul className="grid gap-1 text-[14px]"><li>{mb(plan.resources.memoryMb)} RAM</li><li>{plan.resources.cpuPct}% CPU · {mb(plan.resources.diskMb)} disk</li><li>{plan.resources.databases} databases · {plan.resources.backups} backups</li><li>{plan.regions.map((r) => r.toUpperCase()).join(', ') || 'No location'}</li></ul><p className="font-bold">{preview.length ? preview.map((p) => money({ amount: p.priceMinorUnits, currency: p.currency })).join(' · ') : 'No price yet'}<span className="font-medium text-ink3"> / month</span></p></div></Section>
        <Section title="Cost and margin"><Notice tone="info" title="Unknown costs are not guessed">Per-plan cost depends on node cost and overallocation. Node costs are set on Infrastructure → Capacity. Until every node used by this plan has a cost, no margin is shown.</Notice>{nodesByRegion('buc').some((n) => !n.monthlyCost) && plan.regions.includes('buc') ? <p className="mt-2 text-[13px] font-semibold text-warn">Bucharest 01 has no recorded cost.</p> : null}</Section>
        <Section title="Version"><div className="grid gap-1 text-[14px]"><span>Version <Badge>v{plan.version}</Badge></span>{existing?.status === 'ACTIVE' ? <span className="text-ink2">Saving publishes <b>v{plan.version + 1}</b> and retires v{plan.version}.</span> : null}</div></Section>
      </>} />
      {isNew && !data.products.length ? <EmptyState title="Create a product first" /> : null}
      <PreviewNote />
      {act.node}
    </AdminPage>
  );
}
