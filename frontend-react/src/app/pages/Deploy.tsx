import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, CheckboxCardGroup, DescriptionList, FormWizard, Notice, NumberField, RadioCardGroup, SegmentedControl, Select, StatusBadge, Switch, TextField, type ChoiceOption, type WizardStep } from '@/design-system';
import { useApi, useApiQuery } from '../data/DataProvider';
import { useNavigate, useRouter } from '../router';
import { PageHeader } from '../components/PageHeader';
import { CATALOG, type CatalogField } from '../fixtures/catalog';
import { WORKLOAD_LABEL, type BillingCycle, type OrderRecord, type Plan, type Workload } from '../domain/types';
import { mb, money } from '../format';
import type { DeployQuote } from '../data/api';

interface V {
  workload: Workload | ''; mode: 'quick' | 'custom'; engine: string; version: string; preset: string; addons: string[];
  settings: Record<string, string>;
  /** Tokens and passwords. Excluded from the saved draft, so they are never written to browser storage. */
  secrets: Record<string, string>;
  planId: string; regionId: string; cycle: BillingCycle; paymentMethodId: string; terms: boolean;
}
const INITIAL: V = { workload: '', mode: 'quick', engine: '', version: '', preset: '', addons: [], settings: {}, secrets: {}, planId: '', regionId: '', cycle: 'monthly', paymentMethodId: '', terms: false };

const defaultsFor = (w: Workload, mode: V['mode']): Partial<V> => {
  const c = CATALOG[w]; const e = c.engines.find((x) => x.recommended) ?? c.engines[0]!;
  const settings: Record<string, string> = {}; for (const f of c.fields) if (!f.secret) settings[f.key] = f.default;
  return { workload: w, mode, engine: e.id, version: e.versions[0]!, preset: c.presets[0]!.id, addons: [], settings, secrets: {}, planId: '', regionId: '' };
};

function Field({ f, v, set }: { f: CatalogField; v: string; set: (x: string) => void }) {
  if (f.type === 'switch') return <Switch label={f.label} description={f.help} checked={v === 'true'} onCheckedChange={(c) => set(String(c))} />;
  if (f.type === 'select') return <Select label={f.label} description={f.help} value={v} onValueChange={(x) => set(x ?? '')} options={f.options ?? []} />;
  if (f.type === 'number') return <NumberField label={f.label} description={f.help} min={f.min} max={f.max} value={v === '' ? null : Number(v)} onValueChange={(n) => set(n === null ? '' : String(n))} />;
  return <TextField label={f.label} description={f.help} type={f.type === 'secret' ? 'password' : 'text'} autoComplete="off" value={v} onChange={(e) => set(e.target.value)} />;
}

/** Live price. Quotes come from the adapter, so tax rules stay on the server in production. */
function Summary({ v, plans }: { v: V; plans: Plan[] }) {
  const api = useApi();
  const plan = plans.find((p) => p.id === v.planId);
  const [quote, setQuote] = useState<DeployQuote>();
  useEffect(() => {
    if (!v.workload || !plan) { setQuote(undefined); return; }
    let live = true;
    api.quote({ workload: v.workload, mode: v.mode, name: v.settings.name ?? '', engine: v.engine, version: v.version, preset: v.preset, addons: v.addons, settings: v.settings, planId: v.planId, regionId: v.regionId, cycle: v.cycle }).then((q) => { if (live) setQuote(q); }, () => { if (live) setQuote(undefined); });
    return () => { live = false; };
  }, [api, v.workload, v.planId, v.cycle, v.addons, v.mode, v.engine, v.version, v.preset, v.regionId, v.settings, plan]);
  const cat = v.workload ? CATALOG[v.workload] : null;
  return (
    <aside aria-label="Order summary" className="grid gap-3 rounded-lg bg-s1 p-5">
      <h2 className="text-[16px] font-extrabold tracking-[-0.02em]">Your order</h2>
      <DescriptionList items={[
        { label: 'Workload', value: v.workload ? WORKLOAD_LABEL[v.workload] : 'Not chosen' },
        ...(cat && v.engine ? [{ label: 'Software', value: `${cat.engines.find((e) => e.id === v.engine)?.label ?? v.engine} ${v.version}` }] : []),
        { label: 'Plan', value: plan ? `${plan.name} · ${mb(plan.ramMb)} RAM` : 'Not chosen' },
        { label: 'Region', value: v.regionId || 'Not chosen' },
      ]} />
      {quote ? (
        <div className="grid gap-1 border-t border-ink/10 pt-3 text-[14px]">
          {quote.lines.map((l) => <p key={l.label} className="flex justify-between gap-3"><span className="text-ink2">{l.label}</span><span className="font-semibold tabular-nums">{money(l.amount)}</span></p>)}
          <p className="flex justify-between gap-3"><span className="text-ink2">VAT 19%</span><span className="font-semibold tabular-nums">{money(quote.tax)}</span></p>
          <p className="flex justify-between gap-3 pt-1 text-[16px] font-extrabold"><span>Due today</span><span className="tabular-nums">{money(quote.dueToday)}</span></p>
        </div>
      ) : <p className="text-[13.5px] text-ink3">Choose a plan to see the price.</p>}
    </aside>
  );
}

const STAGES = ['Order confirmed', 'Payment captured', 'Allocating resources', 'Installing software', 'Starting your server', 'Ready'];

/** Step 12. Entirely simulated: the prototype creates no server. */
function Progress({ order, onReset }: { order: OrderRecord; onReset: () => void }) {
  const nav = useNavigate();
  const [done, setDone] = useState(0);
  useEffect(() => { if (done >= STAGES.length) return; const t = setTimeout(() => setDone((d) => d + 1), 800); return () => clearTimeout(t); }, [done]);
  const finished = done >= STAGES.length;
  return (
    <div className="grid max-w-2xl gap-5" role="status" aria-live="polite">
      <Notice tone="info" title="Simulated deployment">No server is created and nothing is charged in this prototype. In production this step follows the provisioning state of the new service.</Notice>
      <ol className="grid gap-2">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-3 rounded-lg bg-s1 px-4 py-3">
            <StatusBadge tone={i < done ? 'good' : i === done ? 'warn' : 'neutral'} live={i === done && !finished}>{i < done ? 'Done' : i === done ? 'In progress' : 'Waiting'}</StatusBadge>
            <span className={i <= done ? 'font-semibold' : 'text-ink3'}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-ink2">Order <span className="font-mono font-semibold">{order.number}</span> · {money(order.total)}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!finished} onClick={() => nav('/app/services')}>Go to my servers</Button>
        <Button variant="secondary" onClick={() => nav('/app/billing/orders')}>View order</Button>
        <Button variant="ghost" onClick={onReset}>Deploy another</Button>
      </div>
    </div>
  );
}

export default function Deploy() {
  const api = useApi();
  const { search } = useRouter();
  const nav = useNavigate();
  const plansRes = useApiQuery((a) => a.plans());
  const regionsRes = useApiQuery((a) => a.regions());
  const methodsRes = useApiQuery((a) => a.listPaymentMethods());
  const preset = search.get('workload') as Workload | null;
  const [v, setV] = useState<V>(() => (preset && CATALOG[preset] ? { ...INITIAL, ...defaultsFor(preset, 'quick') } : INITIAL));
  const [order, setOrder] = useState<OrderRecord>();
  const plans = useMemo(() => (plansRes.status === 'ready' ? plansRes.data : []), [plansRes]);
  const regions = regionsRes.status === 'ready' ? regionsRes.data : [];
  const methods = methodsRes.status === 'ready' ? methodsRes.data : [];
  const patch = (p: Partial<V>) => setV((x) => ({ ...x, ...p }));
  const cat = v.workload ? CATALOG[v.workload] : null;
  const planOf = plans.find((p) => p.id === v.planId);
  const need = (cond: unknown, key: string, msg: string) => (cond ? undefined : { [key]: msg });

  const steps: WizardStep<V>[] = [
    { id: 'workload', title: 'What do you want to run?', label: 'Workload', validate: (x) => need(x.workload, 'workload', 'Choose what you want to run.'),
      content: ({ values, errors }) => (
        <RadioCardGroup legend="Workload" columns={3} value={values.workload} error={errors.workload}
          onValueChange={(w) => patch(defaultsFor(w as Workload, values.mode))}
          options={(Object.keys(CATALOG) as Workload[]).map((w): ChoiceOption => ({ value: w, label: CATALOG[w].label, description: CATALOG[w].blurb, icon: CATALOG[w].icon as ChoiceOption['icon'] }))} />
      ) },
    { id: 'mode', title: 'How much do you want to configure?', label: 'Setup', description: 'Quick setup picks recommended software and settings. You can still change anything before paying.',
      content: ({ values }) => (
        <RadioCardGroup legend="Setup mode" columns={2} value={values.mode} onValueChange={(m) => patch({ mode: m as V['mode'], ...(m === 'quick' && values.workload ? defaultsFor(values.workload, 'quick') : {}) })}
          options={[{ value: 'quick', label: 'Quick setup', description: 'Recommended software, version and preset. Ready in a few clicks.', icon: 'rocket-01' }, { value: 'custom', label: 'Custom setup', description: 'Choose the engine, version, preset and add-ons yourself.', icon: 'settings-01' }]} />
      ) },
    { id: 'engine', title: cat?.engines.length === 1 ? 'Software' : 'Choose your software', label: 'Software', validate: (x) => need(x.engine, 'engine', 'Choose a software option.'),
      content: ({ values, errors }) => !cat ? null : values.mode === 'quick' ? <QuickPick text={`${cat.engines.find((e) => e.id === values.engine)?.label ?? ''} is recommended for ${cat.label}.`} onCustom={() => patch({ mode: 'custom' })} /> : (
        <RadioCardGroup legend="Software" columns={2} value={values.engine} error={errors.engine}
          onValueChange={(id) => { const e = cat.engines.find((x) => x.id === id)!; patch({ engine: id, version: e.versions[0]! }); }}
          options={cat.engines.map((e) => ({ value: e.id, label: e.label, description: e.description, meta: e.recommended ? <StatusBadge tone="good">Recommended</StatusBadge> : undefined }))} />
      ) },
    { id: 'version', title: 'Pick a version', label: 'Version', validate: (x) => need(x.version, 'version', 'Choose a version.'),
      content: ({ values, errors }) => !cat ? null : values.mode === 'quick' ? <QuickPick text={`Version ${values.version} is the newest stable release.`} onCustom={() => patch({ mode: 'custom' })} /> : (
        <div className="max-w-sm"><Select label="Version" value={values.version} error={errors.version} onValueChange={(x) => patch({ version: x ?? '' })} options={(cat.engines.find((e) => e.id === values.engine)?.versions ?? []).map((x) => ({ value: x, label: x }))} description="Older versions stay available for plugins and mods that have not updated." /></div>
      ) },
    { id: 'preset', title: 'Start from a preset', label: 'Preset', description: 'A preset sets sensible defaults and suggests a plan. Nothing is locked in.',
      content: ({ values }) => !cat ? null : values.mode === 'quick' ? <QuickPick text={`The ${cat.presets.find((p) => p.id === values.preset)?.label ?? ''} preset is selected.`} onCustom={() => patch({ mode: 'custom' })} /> : (
        <RadioCardGroup legend="Preset" columns={2} value={values.preset} onValueChange={(p) => patch({ preset: p, planId: '' })} options={cat.presets.map((p) => ({ value: p.id, label: p.label, description: p.description }))} />
      ) },
    { id: 'addons', title: 'Add extras', label: 'Add-ons', description: 'All optional. You can add them later from the service page.',
      content: ({ values }) => !cat ? null : (
        <CheckboxCardGroup legend="Add-ons" columns={2} value={values.addons} onValueChange={(a) => patch({ addons: a })}
          options={cat.addons.map((a) => ({ value: a.id, label: a.label, description: a.planned ? `${a.description} (planned, not available yet)` : a.description, disabled: a.planned, meta: a.price ? `${money({ amount: a.price, currency: 'EUR' })}/mo` : 'Included' }))} />
      ) },
    { id: 'settings', title: 'Name and configure it', label: 'Settings',
      validate: (x) => { const er: Record<string, string> = {}; if (!x.workload) return er; for (const f of CATALOG[x.workload].fields) { const val = f.secret ? x.secrets[f.key] ?? '' : x.settings[f.key] ?? ''; if (f.required && (f.type === 'switch' ? val !== 'true' : !val.trim())) er[f.key] = f.type === 'switch' ? 'You must accept this to continue.' : `${f.label} is required.`; if (f.key === 'password' && val && val.length < 12) er[f.key] = 'Use at least 12 characters.'; } return er; },
      content: ({ values, errors }) => !cat ? null : (
        <div className="grid max-w-xl gap-4">
          {cat.fields.map((f) => (
            <div key={f.key} className="grid gap-1">
              <Field f={f} v={f.secret ? values.secrets[f.key] ?? '' : values.settings[f.key] ?? ''} set={(x) => (f.secret ? patch({ secrets: { ...values.secrets, [f.key]: x } }) : patch({ settings: { ...values.settings, [f.key]: x } }))} />
              {errors[f.key] ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors[f.key]}</p> : null}
            </div>
          ))}
        </div>
      ) },
    { id: 'plan', title: 'Choose a plan', label: 'Plan', validate: (x) => need(x.planId, 'planId', 'Choose a plan.'),
      content: ({ values, errors }) => {
        const list = plans.filter((p) => !values.workload || p.workloads.includes(values.workload));
        const rec = cat?.presets.find((p) => p.id === values.preset)?.recommendedPlan;
        return (
          <div className="grid gap-4">
            <SegmentedControl<BillingCycle> aria-label="Billing cycle" value={values.cycle} onValueChange={(c) => patch({ cycle: c })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly · 2 months free' }]} />
            <RadioCardGroup legend="Plan" columns={2} value={values.planId} error={errors.planId} onValueChange={(p) => patch({ planId: p, regionId: '' })}
              options={list.map((p) => ({ value: p.id, label: <>{p.name}{p.id === rec ? <StatusBadge tone="good" className="ml-2">Suggested</StatusBadge> : null}</>, description: `${mb(p.ramMb)} RAM · ${p.cpuPct / 100} vCPU · ${mb(p.diskMb)} NVMe${p.slots ? ` · ${p.slots} slots` : ''}`, meta: `${money(values.cycle === 'yearly' ? p.priceYearly : p.priceMonthly)}/${values.cycle === 'yearly' ? 'yr' : 'mo'}` }))} />
          </div>
        );
      } },
    { id: 'region', title: 'Choose a region', label: 'Region', description: 'Pick the one closest to your players. It cannot be changed later without a migration.', validate: (x) => need(x.regionId, 'regionId', 'Choose a region.'),
      content: ({ values, errors }) => (
        <RadioCardGroup legend="Region" columns={2} value={values.regionId} error={errors.regionId} onValueChange={(r) => patch({ regionId: r })}
          options={regions.map((r) => { const out = !r.available || !!planOf?.soldOutIn?.includes(r.id); return { value: r.id, label: `${r.name}, ${r.country}`, description: out ? (r.available ? `${planOf?.name} is sold out here.` : 'Not open yet.') : 'Available', disabled: out }; })} />
      ) },
    { id: 'review', title: 'Review your server', label: 'Review', description: 'Check everything. You can go back to any step.',
      content: ({ values }) => !cat ? null : (
        <div className="grid max-w-2xl gap-4">
          <DescriptionList items={[
            { label: 'Workload', value: cat.label }, { label: 'Setup', value: values.mode === 'quick' ? 'Quick' : 'Custom' },
            { label: 'Software', value: `${cat.engines.find((e) => e.id === values.engine)?.label} ${values.version}` }, { label: 'Preset', value: cat.presets.find((p) => p.id === values.preset)?.label ?? '' },
            { label: 'Name', value: values.settings.name ?? '' }, { label: 'Add-ons', value: values.addons.length ? values.addons.map((a) => cat.addons.find((x) => x.id === a)?.label).join(', ') : 'None' },
            { label: 'Plan', value: planOf ? `${planOf.name} (${values.cycle})` : '' }, { label: 'Region', value: regions.find((r) => r.id === values.regionId)?.name ?? '' },
          ]} />
          {cat.fields.filter((f) => f.secret).length ? <Notice tone="info">Secrets such as tokens and passwords are not shown here and are not saved in your browser.</Notice> : null}
        </div>
      ) },
    { id: 'checkout', title: 'Checkout preview', label: 'Checkout', description: 'Payment is simulated. No card is charged.',
      validate: (x) => ({ ...(x.paymentMethodId ? {} : { paymentMethodId: 'Choose a payment method.' }), ...(x.terms ? {} : { terms: 'Accept the terms to place the order.' }) }),
      content: ({ values, errors }) => (
        <div className="grid max-w-xl gap-4">
          <Select label="Payment method" value={values.paymentMethodId} error={errors.paymentMethodId} onValueChange={(m) => patch({ paymentMethodId: m ?? '' })} placeholder="Choose a card"
            options={methods.map((m) => ({ value: m.id, label: `${m.brand.toUpperCase()} •••• ${m.last4}${m.isDefault ? ' (default)' : ''}`, description: m.last4 === '0087' ? 'Prototype: this card is declined, to show the failure state.' : undefined }))} />
          <div className="grid gap-1"><Checkbox label="I agree to the Terms of Service and acknowledge the cancellation policy" checked={values.terms} onCheckedChange={(c) => patch({ terms: c })} />{errors.terms ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors.terms}</p> : null}</div>
          <Notice tone="warn" title="Simulated checkout">In production, payment is confirmed by the payment provider and your server starts after the invoice is paid.</Notice>
        </div>
      ) },
  ];

  const submit = async (x: V) => {
    const cart = await api.cart(); for (const c of cart) await api.removeFromCart(c.id);
    const plan = plans.find((p) => p.id === x.planId)!;
    await api.addToCart({ kind: 'service', title: x.settings.name || `${WORKLOAD_LABEL[x.workload as Workload]} server`, detail: `${plan.name} · ${CATALOG[x.workload as Workload].engines.find((e) => e.id === x.engine)?.label} ${x.version}`, cycle: x.cycle, price: x.cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly });
    setOrder(await api.checkout({ paymentMethodId: x.paymentMethodId, acceptedTerms: x.terms }));
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="Deploy a new server" description={order ? 'Step 12 of 12: your server is being set up.' : 'Eleven short steps, then your server is on its way. Nothing is charged until you place the order.'} crumbs={[{ label: 'Servers & instances', to: '/app/services' }, { label: 'Deploy' }]} />
      {order ? <Progress order={order} onReset={() => { setOrder(undefined); setV(INITIAL); }} /> : (
        plansRes.status === 'loading' || regionsRes.status === 'loading' ? <p role="status" className="text-ink3">Loading plans…</p> :
        plansRes.status === 'error' ? <Notice tone="bad" title="Could not load plans" action={<Button size="sm" variant="secondary" onClick={plansRes.reload}>Retry</Button>}>{plansRes.error}</Notice> :
        <FormWizard<V> steps={steps} values={v} onChange={setV} onSubmit={submit} submitLabel="Place order" onCancel={() => nav('/app/services')} aside={(x) => <Summary v={x} plans={plans} />} persistKey="customer-deploy" persistExclude={['secrets', 'terms', 'paymentMethodId']} />
      )}
    </div>
  );
}

function QuickPick({ text, onCustom }: { text: string; onCustom: () => void }) {
  return <div className="grid max-w-xl justify-items-start gap-3 rounded-lg bg-s1 p-5"><p className="font-semibold">{text}</p><p className="text-ink2">Quick setup chose this for you.</p><Button variant="secondary" size="sm" onClick={onCustom}>Customise this</Button></div>;
}
