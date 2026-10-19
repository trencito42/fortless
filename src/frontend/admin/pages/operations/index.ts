import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderPager } from '../../../petal/index.js';
import { badge } from '../../shell/admin-shell.js';

function money(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value || 0) / 100);
}

function moneySummary(rows: any[], field: string): string {
  return rows.length
    ? rows.map((row) => money(Number(row[field] || 0), row.currency)).join(' · ')
    : '—';
}

function empty(message: string): string {
  return `<div class="es"><h4>${esc(message)}</h4><p>No persisted records match the current filter.</p></div>`;
}

function metric(label: string, value: string | number, icon: string, tone = '', detail = ''): string {
  return `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</div><span class="tile ${tone}">${hero(icon)}</span></article>`;
}

let cachedOrders: any[] = [];
let ordersTotal = 0;
let ordersQuery = '';
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

  const pages = Math.max(1, Math.ceil(ordersTotal / ordersPageSize));
  const start = (ordersPage - 1) * ordersPageSize;
  if (paginationRow) paginationRow.style.display = ordersTotal > ordersPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedOrders.length} of ${ordersTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(ordersPage, pages);

  host.innerHTML = cachedOrders.map((x) => `<tr class="h" data-order-id="${esc(x.id)}" style="cursor:pointer">
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
        renderOrders(ordersQuery, p);
      }
    }
  });
}

export async function renderOrders(q = '', page = 1): Promise<void> {
  const host = document.querySelector<HTMLElement>('#ordersList');
  if (!host) return;
  try {
    ordersQuery = q;
    ordersPage = Math.max(1, page);
    const offset = (ordersPage - 1) * ordersPageSize;
    const data = await api<{ orders: any[]; total: number; summary: Array<{ status: string; count: number }> }>(`/api/v1/admin/orders?q=${encodeURIComponent(q)}&limit=${ordersPageSize}&offset=${offset}`);
    const orders = data.orders || [];
    const metrics = document.querySelector<HTMLElement>('#orderMetrics');
    if (metrics) {
      const count = (pattern: RegExp) => (data.summary || []).filter((item) => pattern.test(item.status)).reduce((sum, item) => sum + Number(item.count), 0);
      const pending = count(/DRAFT|AWAITING_PAYMENT|FULFILLING/);
      const settled = count(/PAID|COMPLETED/);
      const attention = count(/FAILED|CANCELED|PARTIALLY_FULFILLED/);
      metrics.innerHTML = metric('Orders', data.total, 'cube') + metric('Settled', settled, 'check', 'good') + metric('In progress', pending, 'refresh', pending ? 'warn' : 'good') + metric('Needs attention', attention, 'warning', attention ? 'bad' : 'good');
    }
    cachedOrders = orders || [];
    ordersTotal = Number(data.total || 0);
    paintOrdersList();
    bindOrdersListeners();
  } catch (error: any) { host.innerHTML = `<tr><td colspan="5">${empty(error.message)}</td></tr>`; }
}

let cachedInvoices: any[] = [];
let cachedCreditNotes: any[] = [];
let invoicesTotal = 0;
let creditsTotal = 0;
let billingQuery = '';
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

  const pages = Math.max(1, Math.ceil(invoicesTotal / adminBillingPageSize));
  const start = (invoicesPage - 1) * adminBillingPageSize;
  if (paginationRow) paginationRow.style.display = invoicesTotal > adminBillingPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedInvoices.length} of ${invoicesTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(invoicesPage, pages);

  invoiceHost.innerHTML = cachedInvoices.map((x) => `<tr class="h" data-invoice-id="${esc(x.id)}" style="cursor:pointer">
    <td data-l="Invoice"><b>${esc(x.invoice_number || x.id)}</b><small>${esc(x.id)}</small></td>
    <td data-l="Account">${esc(x.account_name)}<small>${esc(x.customer_email)}</small></td>
    <td data-l="Due">${x.due_date ? formatDate(x.due_date) : '—'}</td>
    <td data-l="Paid">${money(x.amount_paid_minor_units, x.currency)} / <b>${money(x.total_minor_units, x.currency)}</b></td>
    <td data-l="Status">${badge(x.status)}</td>
    <td data-l="Action">${x.status === 'PAID' ? `<button class="btn xs" data-refund-invoice="${esc(x.id)}" data-refund-max="${Number(x.amount_paid_minor_units)}" data-refund-currency="${esc(x.currency)}" data-permission="accounts:manage">Refund</button>` : ''}</td></tr>`).join('');
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

  const pages = Math.max(1, Math.ceil(creditsTotal / adminBillingPageSize));
  const start = (creditsPage - 1) * adminBillingPageSize;
  if (paginationRow) paginationRow.style.display = creditsTotal > adminBillingPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedCreditNotes.length} of ${creditsTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(creditsPage, pages);

  creditHost.innerHTML = cachedCreditNotes.map((x) => `<tr>
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
        renderBilling(billingQuery, p, creditsPage);
      }
    }
  });

  document.getElementById('adminCreditsPager')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== creditsPage) {
        creditsPage = p;
        renderBilling(billingQuery, invoicesPage, p);
      }
    }
  });
}

export async function renderBilling(q = '', invoicePage = 1, creditPage = 1): Promise<void> {
  const invoiceHost = document.querySelector<HTMLElement>('#invoicesList');
  const creditHost = document.querySelector<HTMLElement>('#creditNotesList');
  if (!invoiceHost || !creditHost) return;
  try {
    billingQuery = q;
    invoicesPage = Math.max(1, invoicePage);
    creditsPage = Math.max(1, creditPage);
    const [invoiceData, creditData] = await Promise.all([
      api<{ invoices: any[]; total: number; summary: any[] }>(`/api/v1/admin/invoices?q=${encodeURIComponent(q)}&limit=${adminBillingPageSize}&offset=${(invoicesPage - 1) * adminBillingPageSize}`),
      api<{ creditNotes: any[]; total: number; summary: any[] }>(`/api/v1/admin/credit-notes?q=${encodeURIComponent(q)}&limit=${adminBillingPageSize}&offset=${(creditsPage - 1) * adminBillingPageSize}`),
    ]);
    const metrics = document.querySelector<HTMLElement>('#billingMetrics');
    if (metrics) {
      const overdue = invoiceData.summary.reduce((sum, row) => sum + Number(row.overdue_count || 0), 0);
      metrics.innerHTML = metric('Invoices', invoiceData.total, 'document')
        + metric('Collected', moneySummary(invoiceData.summary, 'paid_minor_units'), 'check', 'good')
        + metric('Outstanding', moneySummary(invoiceData.summary, 'outstanding_minor_units'), 'warning', overdue ? 'warn' : 'good', `${overdue} overdue`)
        + metric('Credits issued', moneySummary(creditData.summary, 'credited_minor_units'), 'credit', creditData.total ? 'info' : '');
    }
    cachedInvoices = invoiceData.invoices || [];
    cachedCreditNotes = creditData.creditNotes || [];
    invoicesTotal = Number(invoiceData.total || 0);
    creditsTotal = Number(creditData.total || 0);
    paintAdminInvoicesList();
    paintAdminCreditsList();
    bindBillingOpsListeners();
  } catch (error: any) { invoiceHost.innerHTML = `<tr><td colspan="6">${empty(error.message)}</td></tr>`; }
}

export async function renderOrderDetail(orderId: string): Promise<void> {
  const host = document.getElementById('adminOrderDetailBody');
  if (!host) return;
  host.innerHTML = '<div class="sk" role="status" aria-label="Loading order"><i></i><i></i><i></i></div>';
  try {
    const data = await api<{ order: any; items: any[]; invoices: any[]; audit: any[] }>(`/api/v1/admin/orders/${encodeURIComponent(orderId)}`);
    const order = data.order;
    const title = document.getElementById('adminOrderTitle');
    const meta = document.getElementById('adminOrderMeta');
    if (title) title.textContent = `Order ${order.id}`;
    if (meta) meta.textContent = `${order.account_name} · ${order.customer_email} · created ${formatDate(order.created_at)}`;
    host.innerHTML = `
      <div class="g g4 k2">
        ${metric('Order state', order.status, 'cube')}
        ${metric('Total', money(order.total_minor_units, order.currency), 'credit')}
        ${metric('Items', data.items.length, 'server')}
        ${metric('Invoices', data.invoices.length, 'document')}
      </div>
      <div class="row wrap"><a class="btn s" href="/admin/accounts/${encodeURIComponent(order.account_id)}" data-route="account-detail">Customer account</a>${badge(order.status)}<span class="pill mono">${esc(order.currency)}</span></div>
      <article class="card table-card"><div class="ch"><div class="tx"><h3>Fulfillment</h3><p>Payment, item fulfillment and provisioning are shown as separate states.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Product</th><th>Region</th><th>Price</th><th>Fulfillment</th><th>Provisioning</th><th>Service</th></tr></thead><tbody>
        ${data.items.map((item) => `<tr><td><b>${esc(item.product_name)}</b><small>${esc(item.plan_name)}</small></td><td>${esc(item.region_name)}</td><td>${item.unit_price_minor_units == null ? '—' : money(item.unit_price_minor_units, order.currency)}</td><td>${badge(item.fulfillment_status)}</td><td>${item.provision_status ? badge(item.provision_status) : '<span class="muted">Not queued</span>'}${item.last_error ? `<small class="bad">${esc(item.last_error)}</small>` : ''}</td><td>${item.service_id ? `<a class="btn xs" href="/admin/services/${encodeURIComponent(item.service_id)}" data-route="admin-service-detail">Manage</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">No order items.</td></tr>'}
      </tbody></table></div></article>
      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Related invoices</h3><p>Authoritative accounting state.</p></div></div><div class="col">${data.invoices.map((invoice) => `<a class="li" href="/admin/billing/${encodeURIComponent(invoice.id)}" data-route="invoice-detail"><span class="tx"><b>${esc(invoice.invoice_number || invoice.id)}</b><small>Due ${formatDate(invoice.due_date)}</small></span><b>${money(invoice.total_minor_units, invoice.currency)}</b>${badge(invoice.status)}</a>`).join('') || empty('No invoice linked')}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Order audit</h3><p>Correlation-aware lifecycle evidence.</p></div></div><div class="col">${data.audit.map((event) => `<div class="li h"><span class="tx"><b>${esc(event.action)}</b><small>${esc(event.correlation_id || 'No correlation id')} · ${formatDate(event.created_at)}</small></span></div>`).join('') || empty('No order audit events')}</div></article>
      </div>`;
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Order unavailable</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export async function renderInvoiceDetail(invoiceId: string): Promise<void> {
  const host = document.getElementById('adminInvoiceDetailBody');
  if (!host) return;
  host.innerHTML = '<div class="sk" role="status" aria-label="Loading invoice"><i></i><i></i><i></i></div>';
  try {
    const data = await api<{ invoice: any; lines: any[]; payments: any[]; refunds: any[]; creditNotes: any[]; services: any[]; audit: any[] }>(`/api/v1/admin/invoices/${encodeURIComponent(invoiceId)}`);
    const invoice = data.invoice;
    const balance = Math.max(0, Number(invoice.total_minor_units) - Number(invoice.amount_paid_minor_units));
    const title = document.getElementById('adminInvoiceTitle');
    const meta = document.getElementById('adminInvoiceMeta');
    if (title) title.textContent = invoice.invoice_number || invoice.id;
    if (meta) meta.textContent = `${invoice.account_name} · ${invoice.customer_email} · issued ${formatDate(invoice.created_at)}`;
    host.innerHTML = `
      <div class="g g4 k2">
        ${metric('Invoice state', invoice.status, 'document')}
        ${metric('Total', money(invoice.total_minor_units, invoice.currency), 'credit')}
        ${metric('Paid', money(invoice.amount_paid_minor_units, invoice.currency), 'check', invoice.amount_paid_minor_units ? 'good' : '')}
        ${metric('Balance', money(balance, invoice.currency), 'warning', balance ? 'warn' : 'good')}
      </div>
      <div class="row wrap"><a class="btn s" href="/admin/accounts/${encodeURIComponent(invoice.account_id)}" data-route="account-detail">Customer account</a>${invoice.order_id ? `<a class="btn s" href="/admin/orders/${encodeURIComponent(invoice.order_id)}" data-route="order-detail">Related order</a>` : ''}${badge(invoice.status)}${invoice.status === 'PAID' && Number(invoice.amount_paid_minor_units) > 0 ? `<button class="btn s" data-refund-invoice="${esc(invoice.id)}" data-refund-max="${Number(invoice.amount_paid_minor_units)}" data-refund-currency="${esc(invoice.currency)}" data-permission="accounts:manage">Refund</button>` : ''}</div>
      <article class="card table-card"><div class="ch"><div class="tx"><h3>Invoice lines</h3><p>Persisted fiscal line items and tax basis points.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Tax</th><th>Total</th></tr></thead><tbody>${data.lines.map((line) => `<tr><td><b>${esc(line.description)}</b></td><td>${Number(line.quantity)}</td><td>${money(line.unit_price_minor_units, invoice.currency)}</td><td>${(Number(line.tax_rate_basis_points) / 100).toFixed(2)}%</td><td><b>${money(line.total_minor_units, invoice.currency)}</b></td></tr>`).join('') || '<tr><td colspan="5">No invoice lines.</td></tr>'}</tbody></table></div></article>
      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Payments</h3><p>PSP attempts remain distinct from invoice settlement.</p></div></div><div class="col">${data.payments.map((payment) => `<div class="li h"><span class="tx"><b>${money(payment.amount_minor_units, payment.currency)} via ${esc(payment.psp_name)}</b><small>${esc(payment.psp_payment_intent_id || payment.id)} · ${formatDate(payment.created_at)}</small></span>${badge(payment.status)}</div>`).join('') || empty('No payment attempts')}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Credits & refunds</h3><p>PSP refund state and fiscal credit notes.</p></div></div><div class="col">${data.refunds.map((refund) => `<div class="li h"><span class="tx"><b>${money(refund.amount_minor_units, invoice.currency)}</b><small>${esc(refund.reason)} · ${esc(refund.psp_refund_id || 'PSP reference pending')}</small></span>${badge(refund.status)}</div>`).join('')}${data.creditNotes.map((note) => `<div class="li h"><span class="tx"><b>${esc(note.credit_note_number)}</b><small>${esc(note.reason)}</small></span><b>${money(note.amount_minor_units, invoice.currency)}</b></div>`).join('') || (!data.refunds.length ? empty('No credits or refunds') : '')}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Related services</h3><p>Services fulfilled by the linked order.</p></div></div><div class="col">${data.services.map((service) => `<a class="li" href="/admin/services/${encodeURIComponent(service.id)}" data-route="admin-service-detail"><span class="tx"><b>${esc(service.plan_name || service.product_name)}</b><small>${esc(service.identifier || service.id)}</small></span>${badge(service.contract_status)}</a>`).join('') || empty('No related services')}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Invoice audit</h3><p>Security and accounting mutations.</p></div></div><div class="col">${data.audit.map((event) => `<div class="li h"><span class="tx"><b>${esc(event.action)}</b><small>${esc(event.correlation_id || 'No correlation id')} · ${formatDate(event.created_at)}</small></span></div>`).join('') || empty('No invoice audit events')}</div></article>
      </div>`;
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Invoice unavailable</b><span>${esc(error.message)}</span></div></div>`;
  }
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
    componentsHost.innerHTML = data.components.map((x) => `<article class="li"><span class="tx"><b>${esc(x.name)}</b><small>${esc(x.groupName)} · updated ${formatDate(x.updatedAt)}</small></span>${badge(x.status)}<button class="btn xs" data-component-id="${esc(x.id)}" data-component-status="${esc(x.status)}" data-permission="services:manage">Change</button></article>`).join('') || empty('No status components');
    const incidents = [...data.activeIncidents, ...data.pastIncidents];
    incidentsHost.innerHTML = incidents.map((x) => `<article class="li"><span class="tx"><b>${esc(x.title)}</b><small>${x.updates.length} updates · ${formatDate(x.updatedAt)}</small></span>${badge(x.impact)}${badge(x.status)}${x.status !== 'RESOLVED' ? `<button class="btn xs" data-incident-id="${esc(x.id)}" data-permission="services:manage">Update</button>` : ''}</article>`).join('') || empty('No incidents recorded');
  } catch (error: any) { componentsHost.innerHTML = empty(error.message); }
}
