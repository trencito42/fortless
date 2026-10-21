import { Badge, Button, DescriptionList, EmptyState, Notice, NumberField, Select, TextField, Textarea } from '@/design-system';
import { Section } from '../components/Cards';
import { useSession } from '../session';
import { LiveMutation, type MutationSpec } from './LiveMutation';
import { fromMinor, rowsOf, text, toMinor, isRow, type Row } from './helpers';
import { CURRENCIES, INTERVALS, OPTION_HELP, PRICE_KEYS, couponBody, parseOptions, planCreateBody, productCreateBody, productEditBody } from './bodies';

const slugOk = (v = '') => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const categoriesOf = (payload: Row) => { const seen = new Map<string, string>(); for (const p of rowsOf(payload['products'])) { const c = p['category']; if (isRow(c)) seen.set(text(c['id']), text(c['name'])); } return [...seen].map(([value, label]) => ({ value, label })); };

export function LiveProductCreate({ payload, reload }: { payload: Row; reload: () => void }) {
  const { can } = useSession();
  const categories = categoriesOf(payload);
  if (!can('catalog:manage')) return null;
  const spec: MutationSpec = {
    title: 'New product', confirmLabel: 'Create product (unpublished)', endpoint: '/catalog/products', description: 'The product is created unpublished. Publishing is a separate, step-up protected action and requires an active plan.',
    initial: { name: '', slug: '', categoryId: categories[0]?.value ?? '', providerType: 'PTERODACTYL', description: '' },
    fields: ({ values, set, errors }) => <div className="grid gap-3">
      <TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} maxLength={100} />
      <TextField label="Slug" value={values['slug']} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} error={errors['slug']} maxLength={64} />
      <Select label="Category" value={values['categoryId']} onValueChange={(v) => set('categoryId', v ?? '')} error={errors['categoryId']} options={categories} />
      <Select label="Provider" value={values['providerType']} onValueChange={(v) => set('providerType', v ?? 'PTERODACTYL')} options={['PTERODACTYL', 'CPANEL', 'REGISTRAR', 'VPS'].map((v) => ({ value: v, label: v }))} description="Only Pterodactyl has a working provisioning adapter today." />
      <Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} maxLength={2000} counter />
    </div>,
    validate: (v) => ({ ...((v['name']?.trim().length ?? 0) < 2 ? { name: 'Name must be at least 2 characters.' } : {}), ...(!slugOk(v['slug']) || (v['slug']?.length ?? 0) < 2 ? { slug: 'Use 2–64 lowercase letters, numbers and hyphens.' } : {}), ...(!v['categoryId'] ? { categoryId: 'Choose a category.' } : {}) }),
    body: (_r, v) => productCreateBody(v),
  };
  return <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="primary">New product</Button>} />;
}

export function LiveCouponCreate({ reload }: { reload: () => void }) {
  const { can } = useSession();
  if (!can('catalog:manage')) return null;
  const spec: MutationSpec = {
    title: 'New coupon', confirmLabel: 'Create coupon', endpoint: '/catalog/coupons', description: 'Validated again by the backend when a quote is created. Fixed amounts are in minor units of the order currency.',
    initial: { code: '', type: 'PERCENTAGE', value: '10', max: '100', expires: '' },
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Code" value={values['code']} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} error={errors['code']} maxLength={32} />
      <Select label="Discount type" value={values['type']} onValueChange={(v) => set('type', v ?? 'PERCENTAGE')} options={[{ value: 'PERCENTAGE', label: 'Percentage' }, { value: 'FIXED_AMOUNT', label: 'Fixed amount (minor units)' }]} />
      <NumberField label={values['type'] === 'PERCENTAGE' ? 'Percent off' : 'Amount off (minor units)'} value={Number(values['value'])} onValueChange={(v) => set('value', String(v ?? ''))} min={1} max={values['type'] === 'PERCENTAGE' ? 100 : 100000000} error={errors['value']} />
      <NumberField label="Max redemptions" value={Number(values['max'])} onValueChange={(v) => set('max', String(v ?? ''))} min={1} error={errors['max']} />
      <TextField label="Expires (UTC date)" type="date" value={values['expires']} onChange={(e) => set('expires', e.target.value)} error={errors['expires']} className="sm:col-span-2" />
    </div>,
    validate: (v) => ({ ...((v['code']?.length ?? 0) < 3 ? { code: 'Code must be at least 3 characters.' } : {}), ...(!(Number(v['value']) >= 1) || (v['type'] === 'PERCENTAGE' && Number(v['value']) > 100) ? { value: v['type'] === 'PERCENTAGE' ? 'Percent must be 1–100.' : 'Enter a positive whole number.' } : {}), ...(!(Number(v['max']) >= 1) ? { max: 'At least 1.' } : {}), ...(!v['expires'] || Date.parse(`${v['expires']}T23:59:59Z`) <= Date.now() ? { expires: 'Choose a future date.' } : {}) }),
    body: (_r, v) => couponBody(v),
  };
  return <LiveMutation spec={spec} onDone={reload} trigger={<Button size="sm" variant="primary">New coupon</Button>} />;
}

/** Header actions of a product page: edit, publish/unpublish, new plan version. */
export function LiveProductActions({ product, categories, reload }: { product: Row; categories: Array<{ value: string; label: string }>; reload: () => void }) {
  const { can } = useSession();
  if (!can('catalog:manage')) return null;
  const id = text(product['id']);
  const published = Boolean(product['isPublished']);
  const r = isRow(product['restrictions']) ? product['restrictions'] : {};
  const countries = Array.isArray(r['allowedCountries']) ? (r['allowedCountries'] as unknown[]).join(', ') : '';
  const category = isRow(product['category']) ? text(product['category']['id']) : categories[0]?.value ?? '';
  const edit: MutationSpec = {
    title: 'Edit product', confirmLabel: 'Save product', endpoint: `/catalog/products/${encodeURIComponent(id)}`, method: 'PUT', description: 'Name, description and sales restrictions. Requires recent step-up.',
    initial: { name: text(product['name']), description: text(product['description']), categoryId: category, countries, max: r['maxServicesPerAccount'] == null ? '' : text(r['maxServicesPerAccount']), from: text(r['availableFrom']).slice(0, 10), until: text(r['availableUntil']).slice(0, 10), verified: r['requiresVerifiedEmail'] === false ? 'no' : 'yes' },
    fields: ({ values, set, errors }) => <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} maxLength={100} className="sm:col-span-2" />
      <Textarea label="Description" value={values['description']} onChange={(e) => set('description', e.target.value)} maxLength={2000} counter className="sm:col-span-2" />
      <Select label="Category" value={values['categoryId']} onValueChange={(v) => set('categoryId', v ?? '')} options={categories} />
      <TextField label="Allowed countries" value={values['countries']} onChange={(e) => set('countries', e.target.value.toUpperCase())} error={errors['countries']} description="Comma-separated ISO codes. Empty = everywhere." />
      <TextField label="Max services per account" inputMode="numeric" value={values['max']} onChange={(e) => set('max', e.target.value.replace(/\D/g, ''))} error={errors['max']} description="Empty = unlimited." />
      <Select label="Verified email required" value={values['verified']} onValueChange={(v) => set('verified', v ?? 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
      <TextField label="On sale from" type="date" value={values['from']} onChange={(e) => set('from', e.target.value)} />
      <TextField label="On sale until" type="date" value={values['until']} onChange={(e) => set('until', e.target.value)} error={errors['until']} />
    </div>,
    validate: (v) => ({ ...((v['name']?.trim().length ?? 0) < 2 ? { name: 'Name must be at least 2 characters.' } : {}), ...((v['countries'] ?? '').split(',').map((c) => c.trim()).filter(Boolean).some((c) => !/^[A-Z]{2}$/.test(c)) ? { countries: 'Use two-letter codes, e.g. DE, RO.' } : {}), ...(v['max'] && Number(v['max']) < 1 ? { max: 'At least 1.' } : {}), ...(v['from'] && v['until'] && v['from'] >= v['until'] ? { until: 'Sale end must be after sale start.' } : {}) }),
    body: (_r, v) => productEditBody(v),
  };
  const publish: MutationSpec = {
    title: published ? 'Unpublish product' : 'Publish product', confirmLabel: published ? 'Unpublish' : 'Publish', endpoint: `/catalog/products/${encodeURIComponent(id)}/publish`, method: 'PATCH', tone: published ? 'danger' : 'default',
    description: published ? 'Hides the product from new orders. Running services keep renewing.' : 'The backend refuses to publish without an active plan and a valid provider mapping.',
    body: () => ({ isPublished: !published }),
  };
  return <div className="flex flex-wrap gap-2">
    <LiveMutation spec={edit} onDone={reload} trigger={<Button size="sm" variant="secondary">Edit product</Button>} />
    <LiveMutation spec={publish} onDone={reload} trigger={<Button size="sm" variant={published ? 'danger-subtle' : 'primary'}>{published ? 'Unpublish' : 'Publish'}</Button>} />
    <LiveMutation spec={planSpec(id)} onDone={reload} trigger={<Button size="sm" variant="secondary">New plan version</Button>} />
  </div>;
}

function planSpec(productId: string): MutationSpec {
  const priceFields = PRICE_KEYS;
  return {
    title: 'New plan version', confirmLabel: 'Create plan (active)', endpoint: '/catalog/plans', description: 'The backend creates the version as ACTIVE immediately; there is no draft step. It is only sold once its product is published. Change its status afterwards if needed. Prices are net of tax.',
    initial: { name: '', memoryMb: '1024', cpuPct: '100', diskMb: '10240', databases: '0', backups: '1', eggId: '', ...Object.fromEntries(priceFields.map((k) => [k, ''])) },
    fields: ({ values, set, errors }) => <div className="grid gap-3">
      <TextField label="Plan name" value={values['name']} onChange={(e) => set('name', e.target.value)} error={errors['name']} maxLength={100} />
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label="RAM (MB)" value={Number(values['memoryMb'])} onValueChange={(v) => set('memoryMb', String(v ?? ''))} min={64} step={128} error={errors['memoryMb']} />
        <NumberField label="CPU (%)" value={Number(values['cpuPct'])} onValueChange={(v) => set('cpuPct', String(v ?? ''))} min={10} step={10} error={errors['cpuPct']} />
        <NumberField label="Disk (MB)" value={Number(values['diskMb'])} onValueChange={(v) => set('diskMb', String(v ?? ''))} min={256} step={1024} error={errors['diskMb']} />
        <NumberField label="Databases" value={Number(values['databases'])} onValueChange={(v) => set('databases', String(v ?? 0))} min={0} />
        <NumberField label="Backups" value={Number(values['backups'])} onValueChange={(v) => set('backups', String(v ?? 0))} min={0} />
        <TextField label="Provider egg id" inputMode="numeric" value={values['eggId']} onChange={(e) => set('eggId', e.target.value.replace(/\D/g, ''))} error={errors['eggId']} description="See Provider inventory." />
      </div>
      <fieldset className="grid gap-2"><legend className="text-[13px] font-bold text-ink2">Prices (major units, e.g. 8.99)</legend>
        {errors['prices'] ? <p role="alert" className="text-[13px] font-semibold text-bad">{errors['prices']}</p> : null}
        <div className="grid gap-2 sm:grid-cols-3">{CURRENCIES.flatMap((c) => INTERVALS.map(([i, l]) => <TextField key={`${c}_${i}`} label={`${c} ${l.toLowerCase()}`} inputMode="decimal" value={values[`${c}_${i}`]} onChange={(e) => set(`${c}_${i}`, e.target.value)} error={errors[`${c}_${i}`]} />))}</div>
      </fieldset>
    </div>,
    validate: (v) => {
      const e: Record<string, string> = {};
      if ((v['name']?.trim().length ?? 0) < 2) e['name'] = 'Name must be at least 2 characters.';
      if (!(Number(v['memoryMb']) >= 64)) e['memoryMb'] = 'At least 64 MB.'; if (!(Number(v['cpuPct']) >= 1)) e['cpuPct'] = 'At least 1%.'; if (!(Number(v['diskMb']) >= 256)) e['diskMb'] = 'At least 256 MB.';
      if (!v['eggId']) e['eggId'] = 'Pterodactyl plans need an egg.';
      let any = false;
      for (const k of priceFields) { const val = v[k]?.trim(); if (!val) continue; const minor = toMinor(val); if (minor == null || minor <= 0) e[k] = 'Invalid amount.'; else any = true; }
      if (!any) e['prices'] = 'Enter at least one price.';
      return e;
    },
    body: (_r, v) => planCreateBody(productId, v),
  };
}

const optionLine = (o: Row) => { const c = isRow(o['config']) ? o['config'] : {}; const extra = o['inputType'] === 'SELECT' && Array.isArray(c['choices']) ? (c['choices'] as unknown[]).join('; ') : o['inputType'] === 'INTEGER' && c['min'] !== undefined ? `${c['min']}..${c['max']}` : ''; return [o['key'], o['label'], o['inputType'], o['isRequired'] ? 'yes' : 'no', o['priceDeltaMinorUnits'] ?? 0, extra].join(' | '); };

function PlanActions({ plan, reload }: { plan: Row; reload: () => void }) {
  const id = text(plan['id']); const status = text(plan['status']);
  const options = rowsOf(plan['options']);
  const statusSpec: MutationSpec = { title: 'Change plan status', confirmLabel: 'Change status', endpoint: `/catalog/plans/${encodeURIComponent(id)}/status`, method: 'PATCH', tone: status === 'ACTIVE' ? 'danger' : 'default', description: 'ACTIVE versions are sold immediately; RETIRED versions stay valid for the services already sold on them.', initial: { status }, fields: ({ values, set, errors }) => <Select label="Status" value={values['status']} onValueChange={(v) => set('status', v ?? status)} error={errors['status']} options={['DRAFT', 'ACTIVE', 'RETIRED'].map((v) => ({ value: v, label: v }))} />, validate: (v) => (v['status'] === status ? { status: 'Choose a different status.' } : {}), body: (_r, v) => ({ status: v['status'] }) };
  const optionsSpec: MutationSpec = { title: 'Edit configurable options', confirmLabel: 'Save options', endpoint: `/catalog/plans/${encodeURIComponent(id)}/options`, method: 'PUT', description: 'Fails with 409 if the plan version is already contracted: create a new version instead.', initial: { lines: options.map(optionLine).join('\n') }, fields: ({ values, set, errors }) => <Textarea label="Options" value={values['lines']} onChange={(e) => set('lines', e.target.value)} rows={8} error={errors['lines']} description={OPTION_HELP} />, validate: (v) => { const p = parseOptions(v['lines'] ?? ''); return p.error ? { lines: p.error } : {}; }, body: (_r, v) => ({ options: parseOptions(v['lines'] ?? '').options ?? [] }) };
  return <div className="flex flex-wrap gap-1.5">
    <LiveMutation spec={statusSpec} onDone={reload} trigger={<Button size="sm" variant="secondary">Status</Button>} />
    <LiveMutation spec={optionsSpec} onDone={reload} trigger={<Button size="sm" variant="ghost">Options</Button>} />
  </div>;
}

const priceText = (prices: unknown) => rowsOf(prices).map((p) => `${text(p['currency'])} ${fromMinor(p['priceMinorUnits'])}/${text(p['interval']).toLowerCase()}`).join(' · ') || '—';

/** Product detail body: facts, restrictions and every plan version with its prices and actions. */
export function LiveProductDetail({ payload, productId, reload }: { payload: Row; productId: string; reload: () => void }) {
  const { can } = useSession();
  const product = rowsOf(payload['products']).find((p) => p['id'] === productId);
  if (!product) return <EmptyState tone="error" title="Product not found" description={`The catalog has no product ${productId}.`} />;
  const plans = rowsOf(product['plans']);
  const r = isRow(product['restrictions']) ? product['restrictions'] : null;
  return <div className="grid gap-5">
    {!can('catalog:manage') ? <Notice tone="info" title="Read-only">Your role lacks catalog:manage, so catalog changes are hidden.</Notice> : null}
    <Section title="Product"><DescriptionList columns={2} items={[{ label: 'Name', value: text(product['name']) }, { label: 'Slug', value: `/${text(product['slug'])}`, mono: true }, { label: 'Category', value: isRow(product['category']) ? text(product['category']['name']) : '—' }, { label: 'Provider', value: text(product['providerType']) }, { label: 'Published', value: <Badge tone={product['isPublished'] ? 'good' : 'neutral'}>{product['isPublished'] ? 'Published' : 'Not published'}</Badge> }, { label: 'Description', value: text(product['description'], '—') }]} /></Section>
    <Section title="Sales restrictions">{r ? <DescriptionList columns={2} items={[{ label: 'Allowed countries', value: Array.isArray(r['allowedCountries']) && r['allowedCountries'].length ? (r['allowedCountries'] as unknown[]).join(', ') : 'Everywhere' }, { label: 'Max services per account', value: r['maxServicesPerAccount'] == null ? 'Unlimited' : text(r['maxServicesPerAccount']) }, { label: 'On sale from', value: text(r['availableFrom'], 'Always') }, { label: 'On sale until', value: text(r['availableUntil'], 'No end') }, { label: 'Verified email', value: r['requiresVerifiedEmail'] === false ? 'Not required' : 'Required' }]} /> : <p className="text-ink3">No restrictions configured.</p>}</Section>
    <Section title="Plan versions" description="Versions are immutable once sold. Change status or create a new version.">
      {plans.length ? <ul className="grid gap-2">{plans.map((plan) => { const res = isRow(plan['resources']) ? plan['resources'] : {}; return <li key={text(plan['id'])} className="grid gap-2 rounded-lg bg-s2 p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><b>{text(plan['name'])}</b><span className="font-mono text-[12.5px] text-ink3">v{text(plan['version'])}</span><Badge tone={plan['status'] === 'ACTIVE' ? 'good' : plan['status'] === 'RETIRED' ? 'neutral' : 'warn'}>{text(plan['status'])}</Badge></span>{can('catalog:manage') ? <PlanActions plan={plan} reload={reload} /> : null}</div><p className="text-[13.5px] text-ink2">{text(res['memoryMb'])} MB RAM · {text(res['cpuPct'])}% CPU · {text(res['diskMb'])} MB disk · {text(res['databases'], '0')} DB · {text(res['backups'], '0')} backups · egg {text(res['eggId'], '—')}</p><p className="text-[13.5px] font-semibold">{priceText(plan['prices'])}</p><p className="text-[12.5px] text-ink3">{rowsOf(plan['options']).length} configurable option(s)</p></li>; })}</ul> : <p className="text-ink3">No plan versions yet.</p>}
    </Section>
  </div>;
}

export { categoriesOf };
