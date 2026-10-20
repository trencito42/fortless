import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, CheckboxCardGroup, DescriptionList, FormWizard, Notice, NumberField, RadioCardGroup, SegmentedControl, Select, StatusBadge, Switch, TextField, type ChoiceOption, type WizardStep } from '@/design-system';
import { useApi, useApiQuery } from '../data/DataProvider';
import { useNavigate, useRouter } from '../router';
import { PageHeader } from '../components/PageHeader';
import type { BillingCycle, Plan } from '../domain/types';
import { mb, money } from '../format';
import { ApiError, type CatalogField, type CheckoutResult, type DeployQuote, type DeploySpec, type WorkloadCatalog } from '../data/api';

interface V {
  workload: string; mode: 'quick' | 'custom'; engine: string; version: string; preset: string; addons: string[];
  settings: Record<string, string>;
  /** Tokens and passwords. Excluded from the saved draft, so they are never written to browser storage. */
  secrets: Record<string, string>;
  planId: string; regionId: string; cycle: BillingCycle; terms: boolean;
}
const INITIAL: V = { workload: '', mode: 'quick', engine: '', version: '', preset: '', addons: [], settings: {}, secrets: {}, planId: '', regionId: '', cycle: 'monthly', terms: false };

const defaultsFor = (catalog: Record<string, WorkloadCatalog>, w: string, mode: V['mode']): Partial<V> => {
  const c = catalog[w]; if (!c) return {};
  const e = c.engines.find((x) => x.recommended) ?? c.engines[0]!;
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
function Summary({ v, plans, catalog }: { v: V; plans: Plan[]; catalog: Record<string, WorkloadCatalog> }) {
  const api = useApi();
  const plan = plans.find((p) => p.id === v.planId);
  const [quote, setQuote] = useState<DeployQuote>();
  const [quoteError, setQuoteError] = useState<string>();
  useEffect(() => {
    if (!v.workload || !plan) { setQuote(undefined); setQuoteError(undefined); return; }
    const controller = new AbortController();
    setQuote(undefined); setQuoteError(undefined);
    const timer = setTimeout(() => {
      api.previewQuote({
        workload: v.workload,
        mode: v.mode,
        name: v.settings.name ?? '',
        engine: v.engine,
        version: v.version,
        preset: v.preset,
        addons: v.addons,
        settings: v.settings,
        planId: v.planId,
        regionId: v.regionId,
        cycle: v.cycle,
      }, controller.signal).then(
        (q) => { if (!controller.signal.aborted) setQuote(q); },
        (error: unknown) => { if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : 'Price preview failed.'); }
      );
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, v.workload, v.planId, v.cycle, v.addons, v.mode, v.engine, v.version, v.preset, v.regionId, v.settings, plan]);
  const cat = v.workload ? catalog[v.workload] : null;
  return (
    <aside aria-label="Order summary" className="grid gap-3 rounded-lg bg-s1 p-5">
      <h2 className="text-[16px] font-extrabold tracking-[-0.02em]">Your order</h2>
      <DescriptionList items={[
        { label: 'Workload', value: cat?.label ?? 'Not chosen' },
        ...(cat && v.engine ? [{ label: 'Software', value: `${cat.engines.find((e) => e.id === v.engine)?.label ?? v.engine} ${v.version}` }] : []),
        { label: 'Plan', value: plan ? `${plan.name} · ${mb(plan.ramMb)} RAM` : 'Not chosen' },
        { label: 'Region', value: v.regionId || 'Not chosen' },
      ]} />
      {quote ? (
        <div className="grid gap-1 border-t border-ink/10 pt-3 text-[14px]">
          {quote.lines.map((l) => <p key={l.label} className="flex justify-between gap-3"><span className="text-ink2">{l.label}</span><span className="font-semibold tabular-nums">{money(l.amount)}</span></p>)}
          <p className="flex justify-between gap-3"><span className="text-ink2">{quote.taxLabel ?? 'Tax'}</span><span className="font-semibold tabular-nums">{money(quote.tax)}</span></p>
          <p className="flex justify-between gap-3 pt-1 text-[16px] font-extrabold"><span>Due today</span><span className="tabular-nums">{money(quote.dueToday)}</span></p>
        </div>
      ) : quoteError ? <Notice tone="bad" title="Price unavailable">{quoteError}</Notice> : <p className="text-[13.5px] text-ink3">{plan ? 'Calculating the authoritative price…' : 'Choose a plan to see the price.'}</p>}
    </aside>
  );
}

export default function Deploy() {
  const api = useApi();
  const { search } = useRouter();
  const nav = useNavigate();
  const plansRes = useApiQuery((a) => a.plans());
  const regionsRes = useApiQuery((a) => a.regions());
  const catalogRes = useApiQuery((a) => a.deploymentCatalog());
  const preset = search.get('workload');
  const [v, setV] = useState<V>(INITIAL);
  const [checkoutNotice, setCheckoutNotice] = useState<string>();
  const submitting = useRef(false);
  const intention = useRef<{ fingerprint: string; key: string; quoteId: string; result?: CheckoutResult } | undefined>(undefined);
  const plans = useMemo(() => (plansRes.status === 'ready' ? plansRes.data : []), [plansRes]);
  const regions = regionsRes.status === 'ready' ? regionsRes.data : [];
  const catalog = useMemo(() => catalogRes.status === 'ready' ? Object.fromEntries(catalogRes.data.map((item) => [item.id, item])) : {}, [catalogRes]);
  useEffect(() => { if (preset && !v.workload && catalog[preset]) setV((current) => ({ ...current, ...defaultsFor(catalog, preset, catalog[preset]!.defaultMode) })); }, [catalog, preset, v.workload]);
  const patch = (p: Partial<V>) => setV((x) => ({ ...x, ...p }));
  const cat = v.workload ? catalog[v.workload] : null;
  const planOf = plans.find((p) => p.id === v.planId);
  const need = (cond: unknown, key: string, msg: string) => (cond ? undefined : { [key]: msg });

  const specFor = (x: V): DeploySpec => ({ workload: x.workload, mode: x.mode, name: x.settings.name ?? `${catalog[x.workload]?.label ?? 'Fortless'} server`, engine: x.engine, version: x.version, preset: x.preset, addons: x.addons, settings: x.settings, secrets: x.secrets, planId: x.planId, regionId: x.regionId, cycle: x.cycle });
  const fingerprint = JSON.stringify(specFor(v));
  useEffect(() => {
    if (intention.current && intention.current.fingerprint !== fingerprint) {
      intention.current = undefined;
      setCheckoutNotice(undefined);
    }
  }, [fingerprint]);

  const steps: WizardStep<V>[] = [
    { id: 'workload', title: 'What do you want to run?', label: 'Workload', validate: (x) => need(x.workload, 'workload', 'Choose what you want to run.'),
      content: ({ values, errors }) => (
        <RadioCardGroup legend="Workload" columns={3} value={values.workload} error={errors.workload}
          onValueChange={(w) => patch(defaultsFor(catalog, w, values.mode))}
          options={Object.values(catalog).map((workload): ChoiceOption => ({ value: workload.id, label: workload.label, description: workload.blurb, icon: workload.icon as ChoiceOption['icon'] }))} />
      ) },
    { id: 'mode', title: 'How much do you want to configure?', label: 'Setup', description: 'Quick setup picks recommended software and settings. You can still change anything before paying.',
      content: ({ values }) => (
        <RadioCardGroup legend="Setup mode" columns={2} value={values.mode} onValueChange={(m) => patch({ mode: m as V['mode'], ...(m === 'quick' && values.workload ? defaultsFor(catalog, values.workload, 'quick') : {}) })}
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
          options={cat.addons.map((a) => ({ value: a.id, label: a.label, description: a.description, meta: 'Included in deployment' }))} />
      ) },
    { id: 'settings', title: 'Name and configure it', label: 'Settings',
      validate: (x) => { const er: Record<string, string> = {}; if (!x.workload) return er; for (const f of catalog[x.workload]?.fields ?? []) { const val = f.secret ? x.secrets[f.key] ?? '' : x.settings[f.key] ?? ''; if (f.required && (f.type === 'switch' ? val !== 'true' : !val.trim())) er[f.key] = f.type === 'switch' ? 'You must accept this to continue.' : `${f.label} is required.`; if (f.key === 'password' && val && val.length < 12) er[f.key] = 'Use at least 12 characters.'; } return er; },
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
        const list = plans;
        return (
          <div className="grid gap-4">
            <SegmentedControl<BillingCycle> aria-label="Billing cycle" value={values.cycle} onValueChange={(c) => patch({ cycle: c })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly · 2 months free' }]} />
            <RadioCardGroup legend="Plan" columns={2} value={values.planId} error={errors.planId} onValueChange={(p) => patch({ planId: p, regionId: '' })}
              options={list.map((p) => ({ value: p.id, label: p.name, description: `${mb(p.ramMb)} RAM · ${p.cpuPct / 100} vCPU · ${mb(p.diskMb)} NVMe${p.slots ? ` · ${p.slots} slots` : ''}`, meta: `${money(values.cycle === 'yearly' ? p.priceYearly : p.priceMonthly)}/${values.cycle === 'yearly' ? 'yr' : 'mo'}` }))} />
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
    { id: 'checkout', title: 'Secure checkout', label: 'Checkout', description: 'Fortless creates an authoritative quote, then redirects you to the configured payment provider.',
      validate: (x) => x.terms ? undefined : { terms: 'Accept the terms to place the order.' },
      content: ({ values, errors }) => (
        <div className="grid max-w-xl gap-4">
          <div className="grid gap-1"><Checkbox label="I agree to the Terms of Service and acknowledge the cancellation policy" checked={values.terms} onCheckedChange={(c) => patch({ terms: c })} />{errors.terms ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors.terms}</p> : null}</div>
          <Notice tone="info" title="Secure payment">Your payment details are collected by Stripe Checkout. Fortless provisions only after the backend confirms payment.</Notice>
        </div>
      ) },
  ];

  const submit = async (x: V) => {
    if (!x.workload || submitting.current) return;
    submitting.current = true; setCheckoutNotice(undefined);
    const spec = specFor(x); const currentFingerprint = JSON.stringify(spec);
    try {
      let active = intention.current?.fingerprint === currentFingerprint ? intention.current : undefined;
      if (active?.result) { location.assign(active.result.checkoutUrl); return; }
      if (active) {
        const authoritative = await api.checkoutStatus(active.key);
        if (authoritative.status === 'COMPLETED' && authoritative.result) {
          active.result = authoritative.result; location.assign(authoritative.result.checkoutUrl); return;
        }
        if (authoritative.status === 'IN_PROGRESS') {
          setCheckoutNotice('Checkout is still being created. No duplicate order was submitted; try again shortly to reconcile it.'); return;
        }
        // FAILED or NOT_FOUND is an authoritative safe point for a same-key retry.
      } else {
        const quote = await api.quote(spec);
        active = { fingerprint: currentFingerprint, key: `checkout-intent-${crypto.randomUUID()}`, quoteId: quote.id };
        intention.current = active;
      }
      const result = await api.checkout({ quoteId: active.quoteId, regionId: x.regionId, deploymentSpec: spec, acceptedTerms: x.terms, idempotencyKey: active.key });
      active.result = result;
      location.assign(result.checkoutUrl);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 422)) intention.current = undefined;
      setCheckoutNotice(error instanceof Error ? `${error.message} No second order will be created automatically.` : 'Checkout outcome is unknown. No second order will be created automatically.');
    } finally { submitting.current = false; }
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="Deploy a new server" description="Configure the server, review the authoritative price, then continue to secure checkout." crumbs={[{ label: 'Servers & instances', to: '/app/services' }, { label: 'Deploy' }]} />
      {checkoutNotice ? <Notice tone="warn" title="Checkout not completed">{checkoutNotice}</Notice> : null}
      {
        plansRes.status === 'loading' || regionsRes.status === 'loading' || catalogRes.status === 'loading' ? <p role="status" className="text-ink3">Loading deployment catalog…</p> :
        plansRes.status === 'error' ? <Notice tone="bad" title="Could not load plans" action={<Button size="sm" variant="secondary" onClick={plansRes.reload}>Retry</Button>}>{plansRes.error}</Notice> :
        catalogRes.status === 'error' ? <Notice tone="bad" title="Could not load deployment catalog" action={<Button size="sm" variant="secondary" onClick={catalogRes.reload}>Retry</Button>}>{catalogRes.error}</Notice> :
        <FormWizard<V> steps={steps} values={v} onChange={setV} onSubmit={submit} submitLabel="Continue to secure checkout" onCancel={() => nav('/app/services')} aside={(x) => <Summary v={x} plans={plans} catalog={catalog} />} persistKey="customer-deploy" persistExclude={['secrets', 'terms']} />
      }
    </div>
  );
}

function QuickPick({ text, onCustom }: { text: string; onCustom: () => void }) {
  return <div className="grid max-w-xl justify-items-start gap-3 rounded-lg bg-s1 p-5"><p className="font-semibold">{text}</p><p className="text-ink2">Quick setup chose this for you.</p><Button variant="secondary" size="sm" onClick={onCustom}>Customise this</Button></div>;
}
