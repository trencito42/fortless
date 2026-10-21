import { Badge, Button, EmptyState, Notice, NumberField, Select, Switch, TagInput, TextField, Textarea } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { Section, Split } from '../../components/Cards';
import { RelatedTable } from '../../components/RelatedTable';
import { Status, planStatus } from '../../components/status';
import { col } from '../../components/cols';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import { useToast } from '../../toast';
import { useForm, required, minLen, maxLen } from '../../hooks/useForm';
import { mb } from '../../lib/format';
import type { Plan } from '../../types';

export default function ProductEditor({ id }: { id: string }) {
  const { data, patch, add, audit } = useAdmin();
  const nav = useNav();
  const toast = useToast();
  const { can } = useSession();
  const isNew = id === 'new';
  const p = data.products.find((x) => x.id === id);
  const plans = data.plans.filter((x) => x.productId === id);
  const initial = { name: p?.name ?? '', slug: p?.slug ?? '', description: p?.description ?? '', categoryId: p?.categoryId ?? data.categories[0]!.id, providerType: p?.providerType ?? 'PTERODACTYL', countries: (p?.restrictions.allowedCountries ?? []).join(','), maxPerAccount: p?.restrictions.maxServicesPerAccount == null ? '' : String(p.restrictions.maxServicesPerAccount), verified: String(p?.restrictions.requiresVerifiedEmail ?? false) };
  const f = useForm(initial, {
    name: [required('Name'), minLen(3, 'Name'), maxLen(60, 'Name')],
    slug: [(v) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? undefined : 'Use lowercase letters, numbers and single dashes.'), (v) => (data.products.some((x) => x.slug === v && x.id !== id) ? 'Another product already uses this slug.' : undefined)],
    description: [required('Description'), maxLen(300, 'Description')],
  });
  if (!isNew && !p) return <AdminPage title="Product not found"><EmptyState title="No such product" action={<Button onClick={() => nav('/products')}>Back to catalog</Button>} /></AdminPage>;
  const manage = can('catalog:manage');
  const save = () => {
    if (!f.submit()) return;
    const v = f.values;
    const rec = { name: v.name.trim(), slug: v.slug, description: v.description.trim(), categoryId: v.categoryId, providerType: v.providerType as 'PTERODACTYL' | 'NONE', restrictions: { allowedCountries: v.countries.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean), maxServicesPerAccount: v.maxPerAccount ? Number(v.maxPerAccount) : null, requiresVerifiedEmail: v.verified === 'true' } };
    if (isNew) { const nid = `prd_${v.slug.replace(/-/g, '_')}`; add('products', { id: nid, isPublished: false, ...rec }, 'end'); audit('catalog.product_created', { type: 'product', id: nid, label: rec.name }); toast({ tone: 'good', title: `${rec.name} created as unpublished (preview)` }); nav(`/products/${nid}`); }
    else { patch('products', id, rec); audit('catalog.product_updated', { type: 'product', id, label: rec.name }); toast({ tone: 'good', title: 'Product saved (preview)' }); f.reset(f.values); }
  };
  return (
    <AdminPage detail title={isNew ? 'New product' : p!.name} crumbLabel={isNew ? 'New product' : p!.name} parents={[{ label: 'Catalog', to: '/products' }]} status={!isNew ? <Badge tone={p!.isPublished ? 'good' : 'neutral'}>{p!.isPublished ? 'Published' : 'Not published'}</Badge> : undefined}
      actions={<><Button variant="ghost" onClick={() => nav('/products')}>Cancel</Button><Button variant="primary" onClick={save} disabled={!manage || (!isNew && !f.dirty)}>{isNew ? 'Create product' : 'Save changes'}</Button></>}>
      {!manage ? <Notice tone="warn" title="Read-only">Your role lacks <code className="font-mono font-bold">catalog:manage</code>.</Notice> : null}
      <Split main={<>
        <Section title="Product">
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Name" required value={f.values.name} onChange={(e) => f.set('name', e.target.value)} onBlur={() => f.blur('name')} error={f.errors.name} disabled={!manage} />
              <TextField label="URL slug" required value={f.values.slug} onChange={(e) => f.set('slug', e.target.value.toLowerCase())} onBlur={() => f.blur('slug')} error={f.errors.slug} prefix="/" disabled={!manage} />
            </div>
            <Textarea label="Description" required value={f.values.description} onChange={(e) => f.set('description', e.target.value)} onBlur={() => f.blur('description')} error={f.errors.description} maxLength={300} counter disabled={!manage} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Category" value={f.values.categoryId} onValueChange={(v) => f.set('categoryId', v ?? '')} options={data.categories.map((c) => ({ value: c.id, label: c.name }))} disabled={!manage} />
              <Select label="Provider adapter" value={f.values.providerType} onValueChange={(v) => f.set('providerType', (v ?? 'NONE') as 'NONE')} description="Only Pterodactyl has an adapter today." options={[{ value: 'PTERODACTYL', label: 'Pterodactyl' }, { value: 'NONE', label: 'None (cannot be published)' }]} disabled={!manage || !isNew} />
            </div>
          </form>
        </Section>
        <Section title="Availability rules" description="Restrictions checked at checkout.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TagInput label="Allowed countries" description="ISO codes. Empty means everywhere." value={f.values.countries.split(',').filter(Boolean)} onValueChange={(v) => f.set('countries', v.join(','))} validate={(t) => (/^[A-Za-z]{2}$/.test(t) ? null : 'Use a 2-letter country code.')} disabled={!manage} />
            <NumberField label="Max services per account" description="Empty means unlimited." value={f.values.maxPerAccount ? Number(f.values.maxPerAccount) : null} onValueChange={(v) => f.set('maxPerAccount', v == null ? '' : String(v))} min={1} disabled={!manage} />
          </div>
          <div className="mt-2"><Switch label="Require a verified email to order" checked={f.values.verified === 'true'} onCheckedChange={(v) => f.set('verified', String(v))} disabled={!manage} /></div>
        </Section>
      </>} aside={!isNew ? <Section title="Plans" actions={<Button size="sm" variant="secondary" disabled={!manage} onClick={() => nav('/products/plans/new')}>New plan</Button>}>
        <RelatedTable rows={plans} getRowId={(x) => x.id} caption="Plans of this product" pageSize={8} empty="No plans yet." columns={[col<Plan>('n', 'Plan', (x) => <EntityLink to={`/products/plans/${x.id}`}>{x.name} <span className="font-mono text-[12px] font-semibold text-ink3">v{x.version}</span></EntityLink>, { primary: true }), col<Plan>('r', 'RAM', (x) => mb(x.resources.memoryMb)), col<Plan>('s', 'Status', (x) => <Status map={planStatus} value={x.status} />)]} />
      </Section> : <Section title="Next"><p className="text-ink2">After creating the product you can add plans. A product stays unpublished until it has an active plan.</p></Section>} />
      <PreviewNote />
    </AdminPage>
  );
}
