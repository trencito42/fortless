import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, paginateItems, renderPager } from '../../../petal/index.js';
import { badge } from '../../shell/admin-shell.js';

function money(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value || 0) / 100);
}

function empty(message: string): string {
  return `<div class="es"><h4>${esc(message)}</h4><p>No persisted records match the current filter.</p></div>`;
}

function metric(label: string, value: string | number, icon: string, tone = '', detail = ''): string {
  return `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div><span class="tile ${tone}">${hero(icon)}</span></article>`;
}

let cachedOrders: any[] = [];
let ordersPage = 1;
const ordersPageSize = 10;
let ordersListenersBound = false;

function paintOrdersList(): void {
  const host = document.querySelector<HTMLElement>('#ordersList');
  const paginationRow = document.getElementById('adminOrdersPaginationRow');
  const infoEl = document.getElementById('adminOrdersPageInfo');
  const pagerEl = document.getElementById('adminOrdersPager');
  if (!host) return;

  if (!cachedOrders.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    host.innerHTML = `<tr><td colspan="5">${empty('No orders')}</td></tr>`;
    return;
  }

  const pagination = paginateItems(cachedOrders, ordersPage, ordersPageSize);
  ordersPage = pagination.page;

  if (paginationRow) paginationRow.style.display = cachedOrders.length > ordersPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  host.innerHTML = pagination.items.map((x) => `<tr>
    <td data-l="Order"><b>${esc(x.id)}</b><small>${formatDate(x.created_at)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Items">${Number(x.item_count)}</td><td data-l="Total"><b>${money(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td></tr>`).join('');
}

function bindOrdersListeners(): void {
  if (ordersListenersBound) return;
  ordersListenersBound = true;
  const pagerEl = document.getElementById('adminOrdersPager');
  pagerEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== ordersPage) {
        ordersPage = p;
        paintOrdersList();
      }
    }
  });
}

export async function renderOrders(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#ordersList');
  if (!host) return;
  try {
    const { orders } = await api<{ orders: any[] }>(`/api/v1/admin/orders?q=${encodeURIComponent(q)}`);
    const metrics = document.querySelector<HTMLElement>('#orderMetrics');
    if (metrics) {
      const pending = orders.filter((x) => /PENDING|CREATED|AWAITING|PROCESSING/.test(String(x.status))).length;
      const settled = orders.filter((x) => /PAID|FULFILLED|COMPLETED/.test(String(x.status))).length;
      const attention = orders.filter((x) => /FAILED|ANOMALY|CANCELLED/.test(String(x.status))).length;
      metrics.innerHTML = metric('Loaded orders', orders.length, 'cube') + metric('Settled', settled, 'check', 'good') + metric('In progress', pending, 'refresh', pending ? 'warn' : 'good') + metric('Needs attention', attention, 'warning', attention ? 'bad' : 'good');
    }
    cachedOrders = orders || [];
    ordersPage = 1;
    paintOrdersList();
    bindOrdersListeners();
  } catch (error: any) { host.innerHTML = `<tr><td colspan="5">${empty(error.message)}</td></tr>`; }
}

let cachedInvoices: any[] = [];
let cachedCreditNotes: any[] = [];
let invoicesPage = 1;
let creditsPage = 1;
const adminBillingPageSize = 10;
let billingOpsListenersBound = false;

function paintAdminInvoicesList(): void {
  const invoiceHost = document.querySelector<HTMLElement>('#invoicesList');
  const paginationRow = document.getElementById('adminInvoicesPaginationRow');
  const infoEl = document.getElementById('adminInvoicesPageInfo');
  const pagerEl = document.getElementById('adminInvoicesPager');
  if (!invoiceHost) return;

  if (!cachedInvoices.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    invoiceHost.innerHTML = `<tr><td colspan="6">${empty('No invoices')}</td></tr>`;
    return;
  }

  const pagination = paginateItems(cachedInvoices, invoicesPage, adminBillingPageSize);
  invoicesPage = pagination.page;

  if (paginationRow) paginationRow.style.display = cachedInvoices.length > adminBillingPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  invoiceHost.innerHTML = pagination.items.map((x) => `<tr>
    <td data-l="Invoice"><b>${esc(x.invoice_number || x.id)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Due">${x.due_date ? formatDate(x.due_date) : '—'}</td>
    <td data-l="Paid">${money(x.amount_paid_minor_units, x.currency)} / <b>${money(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td>
    <td data-l="Action">${x.status === 'PAID' ? `<button class="btn xs" data-refund-invoice="${esc(x.id)}" data-refund-max="${Number(x.amount_paid_minor_units)}" data-refund-currency="${esc(x.currency)}">Refund</button>` : ''}</td></tr>`).join('');
}

function paintAdminCreditsList(): void {
  const creditHost = document.querySelector<HTMLElement>('#creditNotesList');
  const paginationRow = document.getElementById('adminCreditsPaginationRow');
  const infoEl = document.getElementById('adminCreditsPageInfo');
  const pagerEl = document.getElementById('adminCreditsPager');
  if (!creditHost) return;

  if (!cachedCreditNotes.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    creditHost.innerHTML = `<tr><td colspan="6">${empty('No credit notes')}</td></tr>`;
    return;
  }

  const pagination = paginateItems(cachedCreditNotes, creditsPage, adminBillingPageSize);
  creditsPage = pagination.page;

  if (paginationRow) paginationRow.style.display = cachedCreditNotes.length > adminBillingPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  creditHost.innerHTML = pagination.items.map((x) => `<tr>
    <td data-l="Credit note"><b>${esc(x.credit_note_number)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Invoice">${esc(x.invoice_number)}</td><td data-l="Account">${esc(x.account_name)}</td>
    <td data-l="Amount"><b>${money(x.amount_minor_units, x.currency)}</b></td><td data-l="Reason">${esc(x.reason)}</td>
    <td data-l="Created">${formatDate(x.created_at)}</td></tr>`).join('');
}

function bindBillingOpsListeners(): void {
  if (billingOpsListenersBound) return;
  billingOpsListenersBound = true;

  document.getElementById('adminInvoicesPager')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== invoicesPage) {
        invoicesPage = p;
        paintAdminInvoicesList();
      }
    }
  });

  document.getElementById('adminCreditsPager')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== creditsPage) {
        creditsPage = p;
        paintAdminCreditsList();
      }
    }
  });
}

export async function renderBilling(q = ''): Promise<void> {
  const invoiceHost = document.querySelector<HTMLElement>('#invoicesList');
  const creditHost = document.querySelector<HTMLElement>('#creditNotesList');
  if (!invoiceHost || !creditHost) return;
  try {
    const [invoiceData, creditData] = await Promise.all([
      api<{ invoices: any[] }>(`/api/v1/admin/invoices?q=${encodeURIComponent(q)}`),
      api<{ creditNotes: any[] }>(`/api/v1/admin/credit-notes?q=${encodeURIComponent(q)}`),
    ]);
    const metrics = document.querySelector<HTMLElement>('#billingMetrics');
    if (metrics) {
      const paid = invoiceData.invoices.reduce((sum, x) => sum + Number(x.amount_paid_minor_units || 0), 0);
      const outstanding = invoiceData.invoices.reduce((sum, x) => sum + Math.max(0, Number(x.total_minor_units || 0) - Number(x.amount_paid_minor_units || 0)), 0);
      const credited = creditData.creditNotes.reduce((sum, x) => sum + Number(x.amount_minor_units || 0), 0);
      const currency = invoiceData.invoices[0]?.currency || creditData.creditNotes[0]?.currency || 'EUR';
      metrics.innerHTML = metric('Loaded invoices', invoiceData.invoices.length, 'document') + metric('Paid', money(paid, currency), 'check', 'good') + metric('Outstanding', money(outstanding, currency), 'warning', outstanding ? 'warn' : 'good') + metric('Credits issued', money(credited, currency), 'credit', credited ? 'info' : '');
    }
    cachedInvoices = invoiceData.invoices || [];
    cachedCreditNotes = creditData.creditNotes || [];
    invoicesPage = 1;
    creditsPage = 1;
    paintAdminInvoicesList();
    paintAdminCreditsList();
    bindBillingOpsListeners();
  } catch (error: any) { invoiceHost.innerHTML = `<tr><td colspan="6">${empty(error.message)}</td></tr>`; }
}


export async function renderInfrastructure(): Promise<void> {
  const regionsHost = document.querySelector<HTMLElement>('#capacityRegions');
  const nodesHost = document.querySelector<HTMLElement>('#capacityNodes');
  if (!regionsHost || !nodesHost) return;
  try {
    const data = await api<{ regions: any[]; nodes: any[] }>('/api/v1/admin/capacity');
    const metrics = document.querySelector<HTMLElement>('#infrastructureMetrics');
    if (metrics) {
      const services = data.nodes.reduce((sum, x) => sum + Number(x.active_service_count || 0), 0);
      const allocatedMemory = data.nodes.reduce((sum, x) => sum + Number(x.allocated_memory_mb || 0), 0);
      const maintenance = data.nodes.filter((x) => Boolean(x.maintenance_mode)).length;
      metrics.innerHTML = metric('Regions', data.regions.length, 'servers') + metric('Nodes', data.nodes.length, 'server') + metric('Active services', services, 'cube', 'good', `${Math.round(allocatedMemory / 1024)} GB allocated`) + metric('Maintenance', maintenance, 'warning', maintenance ? 'warn' : 'good');
    }
    regionsHost.innerHTML = data.regions.length ? data.regions.map((x) => {
      const used = x.total_memory_mb ? Math.round((x.allocated_memory_mb / x.total_memory_mb) * 100) : 0;
      return `<article class="cap"><div><b>${esc(x.name)}</b><small>${esc(x.code)} · ${esc(x.country)} · ${x.node_count} nodes</small></div>${badge(x.is_active ? 'ACTIVE' : 'INACTIVE')}<div class="meter"><i style="width:${Math.min(used, 100)}%"></i></div><small>${used}% memory allocated</small></article>`;
    }).join('') : empty('No configured capacity regions');
    nodesHost.innerHTML = data.nodes.length ? data.nodes.map((x) => `<tr><td data-l="Node"><b>${esc(x.name)}</b><small>${esc(x.fqdn)}</small></td><td data-l="Region">${esc(x.region_name)}</td><td data-l="Services">${Number(x.active_service_count)}</td><td data-l="Memory">${Math.round(x.allocated_memory_mb / 1024)} / ${Math.round(x.max_memory_mb / 1024)} GB</td><td data-l="Disk">${Math.round(x.allocated_disk_mb / 1024)} / ${Math.round(x.max_disk_mb / 1024)} GB</td><td data-l="Mode">${badge(x.maintenance_mode ? 'MAINTENANCE' : 'AVAILABLE')}</td></tr>`).join('') : `<tr><td colspan="6">${empty('No configured nodes')}</td></tr>`;
  } catch (error: any) { regionsHost.innerHTML = empty(error.message); }
}

export async function renderStatus(): Promise<void> {
  const componentsHost = document.querySelector<HTMLElement>('#statusComponents');
  const incidentsHost = document.querySelector<HTMLElement>('#statusIncidents');
  if (!componentsHost || !incidentsHost) return;
  try {
    const data = await api<{ headline: string; indicator: string; components: any[]; activeIncidents: any[]; pastIncidents: any[] }>('/api/v1/status');
    const metrics = document.querySelector<HTMLElement>('#statusMetrics');
    if (metrics) {
      const operational = data.components.filter((x) => x.status === 'OPERATIONAL').length;
      const degraded = data.components.length - operational;
      metrics.innerHTML = metric('Components', data.components.length, 'servers') + metric('Operational', operational, 'check', 'good') + metric('Degraded', degraded, 'warning', degraded ? 'warn' : 'good') + metric('Active incidents', data.activeIncidents.length, 'support', data.activeIncidents.length ? 'bad' : 'good');
    }
    const headline = document.querySelector('#statusHeadline');
    if (headline) headline.innerHTML = `<b>${esc(data.headline)}</b>${badge(data.indicator)}`;
    componentsHost.innerHTML = data.components.map((x) => `<article class="li"><span class="tx"><b>${esc(x.name)}</b><small>${esc(x.groupName)} · updated ${formatDate(x.updatedAt)}</small></span>${badge(x.status)}<button class="btn xs" data-component-id="${esc(x.id)}" data-component-status="${esc(x.status)}">Change</button></article>`).join('') || empty('No status components');
    const incidents = [...data.activeIncidents, ...data.pastIncidents];
    incidentsHost.innerHTML = incidents.map((x) => `<article class="li"><span class="tx"><b>${esc(x.title)}</b><small>${x.updates.length} updates · ${formatDate(x.updatedAt)}</small></span>${badge(x.impact)}${badge(x.status)}${x.status !== 'RESOLVED' ? `<button class="btn xs" data-incident-id="${esc(x.id)}">Update</button>` : ''}</article>`).join('') || empty('No incidents recorded');
  } catch (error: any) { componentsHost.innerHTML = empty(error.message); }
}
