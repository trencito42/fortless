/** Staff Control Plane — Catalog and provider mapping. */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { money } from '../../../core/utils/formatting.js';
import { hero } from '../../../petal/index.js';

type Price = { currency: string; interval: string; priceMinorUnits: number; setupFeeMinorUnits: number };
type Plan = {
  id: string;
  version: number;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  resources: { memoryMb: number; cpuPct: number; diskMb: number; databases: number; backups: number; eggId?: number; dockerImage?: string };
  prices: Price[];
  options: Array<{ id: string; key: string; label: string; inputType: string; isRequired: boolean; config: Record<string, unknown>; priceDeltaMinorUnits: number }>;
};
type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  providerType: string;
  isPublished: boolean;
  category: { id: string; slug: string; name: string };
  restrictions: { allowedCountries: string[]; maxServicesPerAccount: number | null; availableFrom: string | null; availableUntil: string | null; requiresVerifiedEmail: boolean } | null;
  plans: Plan[];
};
type Inventory = {
  checkedAt: string;
  locations: Array<{ id: number; short: string; long: string | null }>;
  nodes: Array<{ id: number; name: string; locationId: number; fqdn: string; memoryMb: number; diskMb: number; allocatedMemoryMb: number; allocatedDiskMb: number; maintenanceMode: boolean }>;
  nests: Array<{ id: number; name: string; author: string }>;
  eggs: Array<{ id: number; nestId: number; name: string; dockerImage: string | null }>;
};

let products: Product[] = [];
let inventory: Inventory | null = null;
let cachedCategories: Array<{ id: string; name: string }> = [];
let currentSearch = '';
let currentTab: 'all' | 'products' | 'inventory' = 'all';

const statusTone = (status: string): string => (status === 'ACTIVE' ? 'good' : status === 'RETIRED' ? 'bad' : 'warn');

function planRow(plan: Plan, _product?: Product): string {
  const price = plan.prices[0];
  const egg = inventory?.eggs.find((item) => item.id === plan.resources.eggId);
  const mapping = plan.resources.eggId
    ? egg
      ? `<span class="pill good d">Egg #${egg.id}: ${esc(egg.name)}</span>`
      : `<span class="pill bad d">Egg #${plan.resources.eggId} missing</span>`
    : '<span class="pill warn d">No provider mapping</span>';

  const memoryStr = plan.resources.memoryMb >= 1024
    ? `${plan.resources.memoryMb / 1024} GB`
    : `${plan.resources.memoryMb} MB`;
  const diskStr = Math.round(plan.resources.diskMb / 1024) >= 1
    ? `${Math.round(plan.resources.diskMb / 1024)} GB`
    : `${plan.resources.diskMb} MB`;

  return `<tr class="h" data-plan-id="${esc(plan.id)}">
    <td data-l="Plan version">
      <b>${esc(plan.name)}</b>
      <div class="faint mono" style="font-size:12px">v${plan.version} · ${esc(plan.id)}</div>
    </td>
    <td data-l="Resources">
      <b>${memoryStr} RAM</b> · <span class="muted">${plan.resources.cpuPct}% CPU</span> · <span class="muted">${diskStr} NVMe</span>
      <div class="faint" style="font-size:12px">${plan.resources.databases} DB · ${plan.resources.backups} backups</div>
    </td>
    <td data-l="Monthly price">
      <b class="mono" style="font-size:14px">${price ? money(price.priceMinorUnits, price.currency) : '—'}</b>
      <div class="faint" style="font-size:12px">${price?.interval || 'No price set'}</div>
    </td>
    <td data-l="Provider egg mapping">
      ${mapping}
    </td>
    <td data-l="Status">
      <span class="pill ${statusTone(plan.status)}">${esc(plan.status)}</span>
    </td>
    <td class="r" data-l="Actions">
      <div class="row nw" style="justify-content:flex-end;gap:6px">
        ${plan.status !== 'ACTIVE' ? `<button class="btn xs good" data-plan-status="ACTIVE" data-plan-id="${esc(plan.id)}" data-permission="catalog:manage">Activate</button>` : ''}
        ${plan.status !== 'RETIRED' ? `<button class="btn xs bad" data-plan-status="RETIRED" data-plan-id="${esc(plan.id)}" data-permission="catalog:manage">Retire</button>` : ''}
        <button class="btn xs" data-edit-plan-options="${esc(plan.id)}" data-permission="catalog:manage">Options (${plan.options.length})</button>
      </div>
    </td>
  </tr>`;
}

function renderProducts(query = ''): void {
  const host = document.getElementById('catalogProducts');
  if (!host) return;

  const q = query.trim().toLowerCase();
  const visible = products.filter((p) => {
    if (!q) return true;
    const matchProduct = p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.category.name.toLowerCase().includes(q);
    const matchPlan = p.plans.some((pl) => pl.name.toLowerCase().includes(q) || pl.id.toLowerCase().includes(q));
    return matchProduct || matchPlan;
  });

  if (!visible.length) {
    host.innerHTML = products.length
      ? `<div class="card"><div class="empty">${hero('search')}<b style="margin-top:6px">No products or plans match "${esc(query)}"</b><p>Check spelling or search by product slug or category.</p></div></div>`
      : `<div class="card"><div class="empty">${hero('cube')}<b style="margin-top:6px">No catalog products configured</b><p>Create a product first, then configure verified plan versions before publishing.</p><button class="btn s pri" type="button" data-new-product style="margin-top:10px">${hero('plus', 'xs')}Create product</button></div></div>`;
    return;
  }

  host.innerHTML = visible.map((product) => {
    const plansToShow = q
      ? product.plans.filter((pl) => pl.name.toLowerCase().includes(q) || pl.id.toLowerCase().includes(q) || product.name.toLowerCase().includes(q))
      : product.plans;

    return `<article class="card catalog-product-card" id="product-${esc(product.id)}">
      <div class="card-head" style="margin-bottom:14px">
        <span class="tile ${product.providerType === 'PTERODACTYL' ? 'acc' : 'neu'}">${hero('server')}</span>
        <div>
          <h2>${esc(product.name)}</h2>
          <p>${esc(product.category.name)} · ${esc(product.providerType)} · <code class="mono">${esc(product.slug)}</code></p>
          ${product.description ? `<small>${esc(product.description)}</small>` : ''}
        </div>
        <span class="pill ${product.isPublished ? 'good' : 'warn'} d">${product.isPublished ? 'Published' : 'Draft (Private)'}</span>
        <div class="row nw" style="gap:6px">
          <button class="btn xs ${product.isPublished ? 'bad' : 'pri'}" data-product-publish="${product.isPublished ? 'false' : 'true'}" data-product-id="${esc(product.id)}" data-permission="catalog:manage">
            ${product.isPublished ? 'Unpublish' : 'Publish'}
          </button>
          <button class="btn xs" data-new-plan-product="${esc(product.id)}" data-permission="catalog:manage">
            ${hero('plus', 'xs')}New plan
          </button>
          <button class="btn xs" data-edit-product="${esc(product.id)}" data-permission="catalog:manage">Edit</button>
        </div>
      </div>
      ${plansToShow.length ? `
        <div class="table-scroll">
          <table class="tbl rsp" data-c="Catalog plans">
            <thead>
              <tr>
                <th>Plan version</th>
                <th>Resources</th>
                <th>Monthly price</th>
                <th>Provider egg mapping</th>
                <th>Status</th>
                <th class="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${plansToShow.map((plan) => planRow(plan, product)).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="es" style="padding:22px 14px">
          <span class="tile neu">${hero('server')}</span>
          <h4>No plan versions</h4>
          <p>Add at least one plan with RAM, CPU and disk specs to make this product orderable.</p>
          <button class="btn s" data-new-plan-product="${esc(product.id)}" data-permission="catalog:manage" style="margin-top:6px">
            ${hero('plus', 'xs')}Create first plan
          </button>
        </div>
      `}
    </article>`;
  }).join('');
}

function renderInventory(query = ''): void {
  const host = document.getElementById('providerInventory');
  const summary = document.getElementById('providerSummary');
  if (!host || !summary) return;

  if (!inventory) {
    summary.innerHTML = '<span class="pill bad d">Disconnected</span>';
    host.innerHTML = `<div class="alert bad">
      <span class="ic">${hero('shield')}</span>
      <div>
        <b>Provider inventory unavailable</b>
        <span>The catalog operates fail-closed. Real provider mappings cannot be validated without Application API connection.</span>
      </div>
    </div>`;
    return;
  }

  summary.innerHTML = `
    <span class="pill good d">Connected</span>
    <span class="pill info">${inventory.nodes.length} nodes</span>
    <span class="pill">${inventory.eggs.length} eggs</span>
  `;

  const q = query.trim().toLowerCase();
  const visibleNodes = q
    ? inventory.nodes.filter((n) => n.name.toLowerCase().includes(q) || n.fqdn.toLowerCase().includes(q))
    : inventory.nodes;

  const nodeCards = visibleNodes.map((node) => {
    const memoryPct = node.memoryMb ? Math.min(100, Math.round((node.allocatedMemoryMb / node.memoryMb) * 100)) : 0;
    const diskPct = node.diskMb ? Math.min(100, Math.round((node.allocatedDiskMb / node.diskMb) * 100)) : 0;
    return `<div class="card flat">
      <div class="ch" style="margin-bottom:12px">
        <span class="tile ${node.maintenanceMode ? 'warn' : 'good'} sm">${hero('server')}</span>
        <div class="tx">
          <h3 style="font-size:15px">${esc(node.name)}</h3>
          <p class="mono" style="font-size:12px">${esc(node.fqdn)} · Loc #${node.locationId}</p>
        </div>
        <span class="pill ${node.maintenanceMode ? 'warn' : 'good'} d">${node.maintenanceMode ? 'Maintenance' : 'Online'}</span>
      </div>
      <div class="col" style="gap:10px">
        <div>
          <div class="row nw" style="justify-content:space-between;font-weight:650;font-size:12px;margin-bottom:4px">
            <span class="muted">Allocated RAM</span>
            <span class="mono">${node.allocatedMemoryMb} / ${node.memoryMb} MB (${memoryPct}%)</span>
          </div>
          <div class="mtr ${memoryPct > 85 ? 'bad' : memoryPct > 65 ? 'warn' : 'good'}"><b style="width:${memoryPct}%"></b></div>
        </div>
        <div>
          <div class="row nw" style="justify-content:space-between;font-weight:650;font-size:12px;margin-bottom:4px">
            <span class="muted">Allocated Disk</span>
            <span class="mono">${node.allocatedDiskMb} / ${node.diskMb} MB (${diskPct}%)</span>
          </div>
          <div class="mtr ${diskPct > 85 ? 'bad' : diskPct > 65 ? 'warn' : 'good'}"><b style="width:${diskPct}%"></b></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const visibleEggs = q
    ? inventory.eggs.filter((e) => e.name.toLowerCase().includes(q) || String(e.id).includes(q) || (e.dockerImage && e.dockerImage.toLowerCase().includes(q)))
    : inventory.eggs;

  const eggRows = visibleEggs.map((egg) => {
    const nest = inventory?.nests.find((item) => item.id === egg.nestId);
    const used = products.some((product) => product.plans.some((plan) => plan.resources.eggId === egg.id));
    return `<tr class="h">
      <td data-l="Egg & Nest">
        <b>${esc(egg.name)}</b>
        <div class="faint" style="font-size:12px">${esc(nest?.name || `Nest #${egg.nestId}`)}</div>
      </td>
      <td data-l="Egg ID" class="mono"><code>#${egg.id}</code></td>
      <td data-l="Docker image" class="mono faint" style="font-size:12px;max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(egg.dockerImage || 'Provider default')}</td>
      <td class="r" data-l="Catalog mapping">
        <div class="row nw" style="justify-content:flex-end;gap:6px">
          <span class="pill ${used ? 'good d' : ''}">${used ? 'Mapped' : 'Unmapped'}</span>
          <button class="btn xs pri" data-create-from-egg="${egg.id}">Create product from egg</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div style="margin-bottom:18px">
      <div class="dh" style="margin-bottom:10px">PROVISIONING HYPERVISOR NODES</div>
      <div class="g g2">${nodeCards || '<div class="empty"><b>No nodes match filter.</b></div>'}</div>
    </div>
    <div>
      <div class="dh" style="margin-bottom:10px">DISCOVERED SERVICE EGGS & DOCKER ENVIRONMENTS</div>
      <div class="table-scroll">
        <table class="tbl rsp">
          <thead>
            <tr>
              <th>Egg & Nest</th>
              <th>Egg ID</th>
              <th>Docker default image</th>
              <th class="r">Catalog mapping</th>
            </tr>
          </thead>
          <tbody>
            ${eggRows.length ? eggRows : '<tr><td colspan="4"><div class="empty"><b>No provider eggs match filter.</b></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function hydrateForms(categories: Array<{ id: string; name: string }>): void {
  cachedCategories = categories;
  const categorySelect = document.getElementById('catalogProductCategory') as HTMLSelectElement | null;
  if (categorySelect) {
    categorySelect.innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }
  const eggCategorySelect = document.getElementById('eggProductCategory') as HTMLSelectElement | null;
  if (eggCategorySelect) {
    eggCategorySelect.innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }
  const existingProductSelect = document.getElementById('eggExistingProductSelect') as HTMLSelectElement | null;
  if (existingProductSelect) {
    existingProductSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.slug)})</option>`).join('');
  }
  const productSelect = document.getElementById('catalogPlanProduct') as HTMLSelectElement | null;
  if (productSelect) {
    productSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }
  const eggSelect = document.getElementById('catalogPlanEgg') as HTMLSelectElement | null;
  if (eggSelect) {
    eggSelect.innerHTML = '<option value="">Select a verified provider egg</option>' + (inventory?.eggs || []).map((egg) => {
      const nest = inventory?.nests.find((item) => item.id === egg.nestId);
      return `<option value="${egg.id}" data-image="${esc(egg.dockerImage || '')}">${esc(nest?.name || 'Nest')} · ${esc(egg.name)} (#${egg.id})</option>`;
    }).join('');
  }
}

export function filterCatalog(q = ''): void {
  currentSearch = q;
  renderProducts(currentSearch);
  renderInventory(currentSearch);
}

export function setCatalogTab(tab: 'all' | 'products' | 'inventory'): void {
  currentTab = tab;
  const prodSec = document.getElementById('catalogProductsSection');
  const invSec = document.getElementById('catalogInventorySection');
  if (prodSec) prodSec.hidden = tab === 'inventory';
  if (invSec) invSec.hidden = tab === 'products';
}

function initCatalogEvents(): void {
  const seg = document.getElementById('catalogViewSeg');
  if (seg && !seg.dataset.bound) {
    seg.dataset.bound = 'true';
    seg.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
      if (!btn) return;
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.remove('on');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('on');
      btn.setAttribute('aria-selected', 'true');
      setCatalogTab((btn.dataset.tab as any) || 'all');
    });
  }

  const searchInput = document.getElementById('catalogSearchInput') as HTMLInputElement | null;
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    let timer: number;
    searchInput.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => filterCatalog(searchInput.value), 180);
    });
  }
}

export async function renderCatalog(): Promise<void> {
  initCatalogEvents();
  const productHost = document.getElementById('catalogProducts');
  const inventoryHost = document.getElementById('providerInventory');
  if (productHost && !products.length) productHost.innerHTML = '<div class="sk"><i></i><i></i><i></i></div>';
  if (inventoryHost && !inventory) inventoryHost.innerHTML = '<div class="sk"><i></i><i></i></div>';

  const [catalogResult, categoriesResult, inventoryResult] = await Promise.allSettled([
    api<{ products: Product[] }>('/api/v1/admin/catalog/products'),
    api<{ categories: Array<{ id: string; name: string }> }>('/api/v1/catalog/categories'),
    api<{ inventory: Inventory }>('/api/v1/admin/providers/pterodactyl/inventory'),
  ]);

  if (catalogResult.status === 'fulfilled') {
    products = catalogResult.value.products;
  } else if (productHost) {
    productHost.innerHTML = `<div class="alert bad"><div><b>Catalog unavailable</b><span>${esc(catalogResult.reason?.message || 'Request failed')}</span></div></div>`;
  }

  inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value.inventory : null;

  renderProducts(currentSearch);
  renderInventory(currentSearch);
  setCatalogTab(currentTab);
  hydrateForms(categoriesResult.status === 'fulfilled' ? categoriesResult.value.categories : []);
}

export function openProductCreator(): void {
  const modal = document.getElementById('modalCatalogProduct');
  if (modal) modal.hidden = false;
}

export function openProductEditor(productId: string): void {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const form = document.getElementById('catalogProductEditForm') as HTMLFormElement | null;
  if (!form) return;
  (form.elements.namedItem('productId') as HTMLInputElement).value = product.id;
  (form.elements.namedItem('name') as HTMLInputElement).value = product.name;
  (form.elements.namedItem('description') as HTMLTextAreaElement).value = product.description || '';
  const category = form.elements.namedItem('categoryId') as HTMLSelectElement;
  category.innerHTML = cachedCategories.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join(''); category.value = product.category.id;
  (form.elements.namedItem('allowedCountries') as HTMLInputElement).value = product.restrictions?.allowedCountries.join(', ') || '';
  (form.elements.namedItem('maxServicesPerAccount') as HTMLInputElement).value = product.restrictions?.maxServicesPerAccount ? String(product.restrictions.maxServicesPerAccount) : '';
  (form.elements.namedItem('availableFrom') as HTMLInputElement).value = product.restrictions?.availableFrom?.slice(0, 16) || '';
  (form.elements.namedItem('availableUntil') as HTMLInputElement).value = product.restrictions?.availableUntil?.slice(0, 16) || '';
  (form.elements.namedItem('requiresVerifiedEmail') as HTMLInputElement).checked = product.restrictions?.requiresVerifiedEmail ?? true;
  const modal = document.getElementById('modalCatalogProductEdit'); if (modal) modal.hidden = false;
}

export function openPlanOptionsEditor(planId: string): void {
  const plan = products.flatMap((product) => product.plans).find((item) => item.id === planId);
  if (!plan) return;
  const id = document.getElementById('catalogOptionsPlanId') as HTMLInputElement | null;
  const text = document.getElementById('catalogOptionsJson') as HTMLTextAreaElement | null;
  if (id) id.value = plan.id;
  if (text) text.value = JSON.stringify(plan.options.map((option) => ({ key: option.key, label: option.label, inputType: option.inputType, isRequired: option.isRequired, config: option.config, priceDeltaMinorUnits: option.priceDeltaMinorUnits })), null, 2);
  const modal = document.getElementById('modalCatalogOptions'); if (modal) modal.hidden = false;
}

export async function submitProductEdit(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form); const productId = String(data.get('productId'));
  const date = (value: FormDataEntryValue | null) => value ? new Date(String(value)).toISOString() : null;
  await api(`/api/v1/admin/catalog/products/${encodeURIComponent(productId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    categoryId: data.get('categoryId'), name: data.get('name'), description: data.get('description'), restrictions: {
      allowedCountries: String(data.get('allowedCountries') || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
      maxServicesPerAccount: data.get('maxServicesPerAccount') ? Number(data.get('maxServicesPerAccount')) : null,
      availableFrom: date(data.get('availableFrom')), availableUntil: date(data.get('availableUntil')),
      requiresVerifiedEmail: data.get('requiresVerifiedEmail') === 'on',
    },
  }) });
  const modal = document.getElementById('modalCatalogProductEdit'); if (modal) modal.hidden = true; await renderCatalog();
}

export async function submitPlanOptions(_form: HTMLFormElement): Promise<void> {
  const planId = (document.getElementById('catalogOptionsPlanId') as HTMLInputElement).value;
  const raw = (document.getElementById('catalogOptionsJson') as HTMLTextAreaElement).value;
  let options: unknown;
  try { options = JSON.parse(raw); } catch { throw new Error('Options must be valid JSON.'); }
  await api(`/api/v1/admin/catalog/plans/${encodeURIComponent(planId)}/options`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ options }) });
  const modal = document.getElementById('modalCatalogOptions'); if (modal) modal.hidden = true; await renderCatalog();
}

export function openPlanCreator(productId?: string): void {
  const modal = document.getElementById('modalCatalogPlan');
  const select = document.getElementById('catalogPlanProduct') as HTMLSelectElement | null;
  if (select && productId) select.value = productId;
  if (modal) modal.hidden = false;
}

export async function setProductPublished(productId: string, isPublished: boolean): Promise<void> {
  await api(`/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished }),
  });
  await renderCatalog();
}

export async function setPlanStatus(planId: string, status: 'ACTIVE' | 'RETIRED'): Promise<void> {
  await api(`/api/v1/admin/catalog/plans/${encodeURIComponent(planId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  await renderCatalog();
}

export async function submitProduct(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  await api('/api/v1/admin/catalog/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      categoryId: data.get('categoryId'),
      slug: data.get('slug'),
      name: data.get('name'),
      description: data.get('description'),
      providerType: data.get('providerType'),
      isPublished: false,
    }),
  });
  form.reset();
  const modal = document.getElementById('modalCatalogProduct');
  if (modal) modal.hidden = true;
  await renderCatalog();
}

export async function submitPlan(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const eggSelect = document.getElementById('catalogPlanEgg') as HTMLSelectElement;
  const selectedEgg = eggSelect.selectedOptions[0];
  const price = Math.round(Number(data.get('monthlyPrice')) * 100);
  await api('/api/v1/admin/catalog/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: data.get('productId'),
      name: data.get('name'),
      resourceSpecs: {
        memoryMb: Number(data.get('memoryMb')),
        cpuPct: Number(data.get('cpuPct')),
        diskMb: Number(data.get('diskMb')),
        databases: Number(data.get('databases')),
        backups: Number(data.get('backups')),
        eggId: Number(data.get('eggId')),
        dockerImage: selectedEgg?.dataset.image || undefined,
      },
      prices: [{ currency: 'EUR', interval: 'MONTHLY', priceMinorUnits: price, setupFeeMinorUnits: 0 }],
    }),
  });
  form.reset();
  const modal = document.getElementById('modalCatalogPlan');
  if (modal) modal.hidden = true;
  await renderCatalog();
}

export function openCreateProductFromEgg(eggId: number): void {
  const egg = inventory?.eggs.find((e) => e.id === eggId);
  if (!egg) {
    alert(`Egg #${eggId} not found in inventory.`);
    return;
  }
  const nest = inventory?.nests.find((n) => n.id === egg.nestId);
  const modal = document.getElementById('modalCreateProductFromEgg');
  if (!modal) return;

  const idInput = document.getElementById('eggModalId') as HTMLInputElement | null;
  const imageInput = document.getElementById('eggModalDockerImage') as HTMLInputElement | null;
  const nameEl = document.getElementById('eggModalName');
  const metaEl = document.getElementById('eggModalMeta');
  const prodNameInput = document.getElementById('eggProductName') as HTMLInputElement | null;
  const prodSlugInput = document.getElementById('eggProductSlug') as HTMLInputElement | null;
  const planNameInput = document.getElementById('eggPlanName') as HTMLInputElement | null;
  const categorySelect = document.getElementById('eggProductCategory') as HTMLSelectElement | null;
  const existingSelect = document.getElementById('eggExistingProductSelect') as HTMLSelectElement | null;
  const modeSelect = document.getElementById('eggTargetProductMode') as HTMLSelectElement | null;
  const newFields = document.getElementById('eggNewProductFields');
  const existingFields = document.getElementById('eggExistingProductFields');

  if (idInput) idInput.value = String(egg.id);
  if (imageInput) imageInput.value = egg.dockerImage || '';
  if (nameEl) nameEl.textContent = egg.name;
  if (metaEl) metaEl.textContent = `Nest: ${nest?.name || 'Default'} · Egg #${egg.id}`;

  const cleanName = egg.name.replace(/[^\w\s-]/g, '').trim();
  const slugified = cleanName.toLowerCase().replace(/\s+/g, '-');

  if (prodNameInput) prodNameInput.value = `${cleanName} Hosting`;
  if (prodSlugInput) prodSlugInput.value = slugified;
  if (planNameInput) planNameInput.value = `${cleanName} 4GB Performance`;

  if (categorySelect && cachedCategories.length) {
    categorySelect.innerHTML = cachedCategories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }
  if (existingSelect) {
    existingSelect.innerHTML = products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.slug)})</option>`).join('');
  }

  if (modeSelect) {
    modeSelect.value = 'NEW';
    modeSelect.onchange = () => {
      const isNew = modeSelect.value === 'NEW';
      if (newFields) newFields.hidden = !isNew;
      if (existingFields) existingFields.hidden = isNew;
      if (prodNameInput) prodNameInput.required = isNew;
      if (prodSlugInput) prodSlugInput.required = isNew;
    };
  }
  if (newFields) newFields.hidden = false;
  if (existingFields) existingFields.hidden = true;

  modal.hidden = false;
}

export async function submitProductFromEgg(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const mode = data.get('productMode');
  const eggId = Number(data.get('eggId'));
  const dockerImage = (data.get('dockerImage') as string) || undefined;
  const planName = data.get('planName') as string;
  const memoryMb = Number(data.get('memoryMb'));
  const cpuPct = Number(data.get('cpuPct'));
  const diskMb = Number(data.get('diskMb'));
  const databases = Number(data.get('databases'));
  const backups = Number(data.get('backups'));
  const publishImmediate = data.get('publishImmediate') === 'on';

  let productId = data.get('existingProductId') as string;

  if (mode === 'NEW') {
    const createdProduct = await api<{ id: string; name: string }>('/api/v1/admin/catalog/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: data.get('categoryId'),
        slug: data.get('productSlug'),
        name: data.get('productName'),
        providerType: 'PTERODACTYL',
        isPublished: false,
      }),
    });
    productId = createdProduct.id;
  }

  const prices: Array<{ currency: string; interval: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'; priceMinorUnits: number; setupFeeMinorUnits: number }> = [];
  const monthlyPrice = Number(data.get('priceMonthly'));
  if (monthlyPrice >= 0) {
    prices.push({
      currency: 'EUR',
      interval: 'MONTHLY',
      priceMinorUnits: Math.round(monthlyPrice * 100),
      setupFeeMinorUnits: 0,
    });
  }

  const quarterlyPrice = Number(data.get('priceQuarterly'));
  if (quarterlyPrice > 0) {
    prices.push({
      currency: 'EUR',
      interval: 'QUARTERLY',
      priceMinorUnits: Math.round(quarterlyPrice * 100),
      setupFeeMinorUnits: 0,
    });
  }

  const annualPrice = Number(data.get('priceAnnual'));
  if (annualPrice > 0) {
    prices.push({
      currency: 'EUR',
      interval: 'ANNUAL',
      priceMinorUnits: Math.round(annualPrice * 100),
      setupFeeMinorUnits: 0,
    });
  }

  await api('/api/v1/admin/catalog/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId,
      name: planName,
      resourceSpecs: {
        memoryMb,
        cpuPct,
        diskMb,
        databases,
        backups,
        eggId,
        dockerImage,
      },
      prices,
    }),
  });

  if (publishImmediate) {
    try {
      await api(`/api/v1/admin/catalog/products/${encodeURIComponent(productId)}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      });
    } catch (err: any) {
      console.warn('Auto-publish failed, product left as draft:', err);
    }
  }

  form.reset();
  const modal = document.getElementById('modalCreateProductFromEgg');
  if (modal) modal.hidden = true;
  await renderCatalog();
}
