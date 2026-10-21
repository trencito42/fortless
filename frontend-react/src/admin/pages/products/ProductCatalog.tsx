import { useMemo } from 'react';
import { Badge, Button, Switch } from '@/design-system';
import { AdminPage } from '../../components/Page';
import { ResourceTable } from '../../components/ResourceTable';
import { Section } from '../../components/Cards';
import { col } from '../../components/cols';
import { EntityLink } from '../../components/entities';
import { PreviewNote } from '../../components/PreviewNote';
import { useActionDialog } from '../../components/ActionDialog';
import { useAdmin } from '../../store';
import { useNav } from '../../router';
import { useSession } from '../../session';
import type { Product } from '../../types';

export default function ProductCatalog() {
  const { data, patch, audit } = useAdmin();
  const nav = useNav();
  const { can } = useSession();
  const act = useActionDialog();
  const manage = can('catalog:manage');
  const stats = useMemo(() => new Map(data.products.map((p) => {
    const pl = data.plans.filter((x) => x.productId === p.id);
    return [p.id, { active: pl.filter((x) => x.status === 'ACTIVE').length, draft: pl.filter((x) => x.status === 'DRAFT').length, retired: pl.filter((x) => x.status === 'RETIRED').length, services: data.services.filter((s) => s.productId === p.id && (s.lifecycle === 'ACTIVE' || s.lifecycle === 'PAST_DUE')).length }];
  })), [data.products, data.plans, data.services]);
  const toggle = (p: Product, next: boolean) => act.run({
    title: next ? `Publish ${p.name}` : `Unpublish ${p.name}`, description: next ? 'Makes the product visible and orderable on the public site.' : 'Hides the product from new orders. Existing services keep running and renewing.', confirmLabel: next ? 'Publish' : 'Unpublish', permission: 'catalog:manage', stepUp: true, tone: next ? 'default' : 'danger', reasonRequired: !next,
    effects: next ? ['Product appears in the public catalog and checkout', 'Only active plan versions are sold'] : ['Product disappears from checkout', 'No effect on running services or invoices'],
    onConfirm: ({ reason }) => { patch('products', p.id, { isPublished: next }); audit('catalog.product_publish_changed', { type: 'product', id: p.id, label: p.name }, { reason, before: { published: String(p.isPublished) }, after: { published: String(next) } }); return `${p.name} ${next ? 'published' : 'unpublished'}`; },
  });
  return (
    <AdminPage title="Catalog" description="Categories, products and their publication state. Plans are versioned and immutable; products are what customers browse."
      actions={<Button variant="primary" leadingIcon="add-01" disabled={!manage} onClick={() => nav('/products/new')} title={!manage ? 'Requires catalog:manage' : undefined}>New product</Button>}>
      <Section title="Categories"><ul className="grid gap-2 sm:grid-cols-3">{data.categories.map((c) => <li key={c.id} className="rounded-lg bg-s2 p-3.5"><p className="font-bold">{c.name}</p><p className="text-[13px] text-ink3">/{c.slug} · {data.products.filter((p) => p.categoryId === c.id).length} products · order {c.order}</p></li>)}</ul></Section>
      <ResourceTable<Product>
        tableId="products" caption="Products" rows={data.products} getRowId={(p) => p.id} rowLabel={(p) => p.name}
        searchText={(p) => `${p.name} ${p.slug} ${p.description}`} searchPlaceholder="Search products"
        segments={[{ value: 'all', label: 'All', test: () => true }, { value: 'pub', label: 'Published', test: (p) => p.isPublished }, { value: 'unpub', label: 'Not published', test: (p) => !p.isPublished }]}
        filters={[{ id: 'cat', label: 'Category', options: data.categories.map((c) => ({ value: c.id, label: c.name })), test: (p, v) => p.categoryId === v }, { id: 'prov', label: 'Provider', options: [{ value: 'PTERODACTYL', label: 'Pterodactyl' }, { value: 'NONE', label: 'None' }], test: (p, v) => p.providerType === v }]}
        pageSize={10} onRowClick={(p) => nav(`/products/${p.id}`)}
        columns={[
          col<Product>('n', 'Product', (p) => <span className="grid md:min-w-[10rem]"><EntityLink to={`/products/${p.id}`}>{p.name}</EntityLink><span className="font-mono text-[12px] text-ink3">/{p.slug}</span></span>, { primary: true, sort: (p) => p.name }),
          col<Product>('c', 'Category', (p) => data.categories.find((c) => c.id === p.categoryId)?.name ?? '—', { sort: (p) => p.categoryId }),
          col<Product>('pv', 'Provider', (p) => <Badge tone={p.providerType === 'NONE' ? 'warn' : 'neutral'}>{p.providerType === 'NONE' ? 'No adapter' : p.providerType}</Badge>),
          col<Product>('pl', 'Plans', (p) => { const s = stats.get(p.id)!; return <span className="whitespace-nowrap text-[13.5px]">{s.active} active · {s.draft} draft · {s.retired} retired</span>; }, { sort: (p) => stats.get(p.id)!.active }),
          col<Product>('sv', 'Active services', (p) => stats.get(p.id)!.services, { sort: (p) => stats.get(p.id)!.services, numeric: true }),
          col<Product>('pub', 'Published', (p) => <Switch hideLabel label={`Published: ${p.name}`} checked={p.isPublished} disabled={!manage || (!p.isPublished && (p.providerType === 'NONE' || stats.get(p.id)!.active === 0))} onCheckedChange={(v) => toggle(p, v)} />, { sort: (p) => String(p.isPublished) }),
        ]}
        rowActions={(p) => [{ id: 'edit', label: 'Edit product', icon: 'edit-02', onSelect: () => nav(`/products/${p.id}`) }, { id: 'plans', label: 'View plans', icon: 'sliders-horizontal', onSelect: () => nav('/products/plans') }]}
        empty={{ title: 'No products' }}
      />
      <PreviewNote>A product cannot be published while it has no active plan or no provider adapter. The switch explains why when it is disabled.</PreviewNote>
      {act.node}
    </AdminPage>
  );
}
