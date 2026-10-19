/**
 * Staff Control Plane — Customer Accounts Page Module
 * Route: /admin/accounts
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { money } from '../../../core/utils/formatting.js';
import { badge } from '../../shell/admin-shell.js';
import { hero, renderPager } from '../../../petal/index.js';

let activeAccountId: string | null = null;
let cachedAccounts: any[] = [];
let adminAccountsTotal = 0;
let adminAccountsQuery = '';
let adminAccountsPage = 1;
const adminAccountsPageSize = 10;
let adminAccountsListenersBound = false;

export function getActiveAccountId(): string | null {
  return activeAccountId;
}

export function setActiveAccountId(id: string | null): void {
  activeAccountId = id;
}

function paintAccountsList(): void {
  const host = document.querySelector<HTMLElement>('#accountsList');
  const paginationRow = document.getElementById('adminAccountsPaginationRow');
  const infoEl = document.getElementById('adminAccountsPageInfo');
  const pagerEl = document.getElementById('adminAccountsPager');
  if (!host) return;

  if (!cachedAccounts.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    host.innerHTML = `<div class="empty"><span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="/assets/petal-icons.svg#i-search-01"></use></svg></span><b>No matching accounts.</b></div>`;
    return;
  }

  const pages = Math.max(1, Math.ceil(adminAccountsTotal / adminAccountsPageSize));
  const start = (adminAccountsPage - 1) * adminAccountsPageSize;
  if (paginationRow) paginationRow.style.display = adminAccountsTotal > adminAccountsPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedAccounts.length} of ${adminAccountsTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(adminAccountsPage, pages);

  host.innerHTML = cachedAccounts.map((x) => `<button class="li" data-account-id="${esc(x.id)}">
    <span class="tile sm ${x.status === 'LOCKED' ? 'bad' : x.status === 'FLAGGED_FRAUD' ? 'warn' : ''}">${hero('users')}</span>
    <span class="tx"><b>${esc(x.name)}</b><small>${esc(x.owner_name)} · ${esc(x.owner_email)}</small></span>
    <span class="faint hide-n">${Number(x.member_count)} members · ${Number(x.service_count)} services · ${Number(x.open_ticket_count)} tickets</span>${badge(x.status)}
  </button>`).join('');
}

function bindAdminAccountsListeners(): void {
  if (adminAccountsListenersBound) return;
  adminAccountsListenersBound = true;

  const pagerEl = document.getElementById('adminAccountsPager');
  pagerEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== adminAccountsPage) {
        adminAccountsPage = p;
        renderAccounts(adminAccountsQuery, p);
      }
    }
  });
}

export async function renderAccounts(q = '', page = 1): Promise<void> {
  const host = document.querySelector<HTMLElement>('#accountsList');
  if (!host) return;

  try {
    adminAccountsQuery = q;
    adminAccountsPage = Math.max(1, page);
    const offset = (adminAccountsPage - 1) * adminAccountsPageSize;
    const d = await api<{ accounts: any[]; total: number }>(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}&limit=${adminAccountsPageSize}&offset=${offset}`);
    cachedAccounts = d.accounts || [];
    adminAccountsTotal = Number(d.total || 0);
    paintAccountsList();
    bindAdminAccountsListeners();
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}

export function openAccountDetail(accountId: string): void {
  const path = `/admin/accounts/${encodeURIComponent(accountId)}`;
  if (window.location.pathname !== path) window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function renderAccountDetail(accountId: string): Promise<void> {
  activeAccountId = accountId;
  const content = document.getElementById('adminAccountContent');
  if (!content) return;

  content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';

  try {
    const d = await api<{
      account: any;
      members: any[];
      services: any[];
      invoices: any[];
      tickets: any[];
      orders: any[];
      subscriptions: any[];
      audit: any[];
      notes: any[];
      billingProfile: any | null;
      summary: Record<string, number>;
    }>(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);

    const titleEl = document.getElementById('adminAccountTitle');
    const metaEl = document.getElementById('adminAccountMeta');
    const statusSelect = document.getElementById('adminAccountStatusSelect') as HTMLSelectElement | null;

    if (titleEl) titleEl.textContent = d.account.name;
    if (metaEl) {
      metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) · Created ${formatDate(
        d.account.created_at
      )} · Billing: ${d.account.billing_email}`;
    }
    if (statusSelect) statusSelect.value = d.account.status;

    content.innerHTML = `
      <div class="g g4" style="margin-bottom:6px">
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">MEMBERS</small>
          <div style="font-size:18px;font-weight:700">${d.members.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">ACTIVE SERVICES</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.services)}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TOTAL INVOICES</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.invoices)}</div>
          <small class="faint">${Number(d.summary.unpaid_invoices)} unpaid</small>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TICKETS</small>
          <div style="font-size:18px;font-weight:700">${Number(d.summary.tickets)}</div>
        </div>
      </div>

      <!-- Account Members -->
      <div>
        <div class="dh" style="margin-bottom:6px">ORGANIZATION MEMBERS (${d.members.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th class="r">Joined</th>
              </tr>
            </thead>
            <tbody>
              ${d.members.length ? d.members.map((m) => `<tr>
                <td><b>${esc(m.name)}</b><small class="faint">${esc(m.email)}</small></td>
                <td><span class="pill ${m.role === 'OWNER' ? 'pri' : m.role === 'ADMIN' ? 'info' : ''}">${esc(m.role)}</span></td>
                <td>${badge(m.status)}</td>
                <td class="r faint" style="font-size:12px">${formatDate(m.created_at)}</td>
              </tr>`).join('') : '<tr><td colspan="4"><div class="empty"><b>No members found.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Account Services -->
      <div>
        <div class="dh" style="margin-bottom:6px">HOSTED SERVICES & INSTANCES (${d.services.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Service / Plan</th>
                <th>Node</th>
                <th>Contract</th>
                <th>Runtime</th>
                <th class="r">Action</th>
              </tr>
            </thead>
            <tbody>
              ${d.services.length ? d.services.map((s) => `<tr>
                <td><b>${esc(s.plan_name || s.product_name)}</b><small class="mono faint">${esc(s.identifier || s.id)}</small></td>
                <td><span class="mono" style="font-size:12px">${esc(s.node_name || 'Assigned node')}</span></td>
                <td>${badge(s.contract_status)}</td>
                <td>${badge(s.runtime_state || 'UNKNOWN')}</td>
                <td class="r"><button type="button" class="btn xs" data-service-id="${esc(s.id)}">Manage</button></td>
              </tr>`).join('') : '<tr><td colspan="5"><div class="empty"><b>No active services in this account.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Account Invoices -->
      <div>
        <div class="dh" style="margin-bottom:6px">RECENT INVOICES (${d.invoices.length})</div>
        <div class="table-scroll">
          <table class="tbl rsp">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Total</th>
                <th class="r">Status</th>
              </tr>
            </thead>
            <tbody>
              ${d.invoices.length ? d.invoices.map((i) => `<tr>
                <td><a class="btn xs" href="/admin/billing/${encodeURIComponent(i.id)}" data-route="invoice-detail">${esc(i.invoice_number || i.id)}</a></td>
                <td class="faint" style="font-size:12px">${formatDate(i.created_at)}</td>
                <td><b>${money(i.total_minor_units, i.currency)}</b></td>
                <td class="r">${badge(i.status)}</td>
              </tr>`).join('') : '<tr><td colspan="4"><div class="empty"><b>No invoices recorded.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="g g2">
        <article class="card"><div class="ch"><div class="tx"><h3>Recent orders</h3><p>Commercial state remains separate from provisioning.</p></div></div><div class="col">${d.orders.map((order) => `<a class="li" href="/admin/orders/${encodeURIComponent(order.id)}" data-route="order-detail"><span class="tx"><b>${esc(order.id)}</b><small>${formatDate(order.created_at)}</small></span><b>${money(order.total_minor_units, order.currency)}</b>${badge(order.status)}</a>`).join('') || '<div class="empty"><b>No orders recorded.</b></div>'}</div></article>
        <article class="card"><div class="ch"><div class="tx"><h3>Subscriptions & renewals</h3><p>Persisted renewal state and next billing date.</p></div></div><div class="col">${d.subscriptions.map((sub) => `<a class="li" href="/admin/services/${encodeURIComponent(sub.service_id)}" data-route="admin-service-detail"><span class="tx"><b>${esc(sub.plan_name || sub.product_name)}</b><small>${esc(sub.billing_interval)} · renews ${formatDate(sub.next_renewal_date)}</small></span><b>${money(sub.renewal_price_minor_units, sub.currency)}</b>${badge(sub.status)}</a>`).join('') || '<div class="empty"><b>No subscriptions recorded.</b></div>'}</div></article>
      </div>

      <div class="g g2">
        <article class="card">
          <div class="ch"><div class="tx"><h3>Administrative notes</h3><p>Private staff context with immutable author and timestamp.</p></div></div>
          <div class="col" style="gap:8px">${d.notes.map((note) => `<div class="li h"><span class="tx"><b>${esc(note.author_name)}</b><small>${formatDate(note.created_at)} · ${esc(note.author_email)}</small><span style="margin-top:6px;white-space:pre-wrap">${esc(note.body)}</span></span></div>`).join('') || '<div class="empty"><b>No administrative notes.</b></div>'}</div>
          <form id="adminAccountNoteForm" class="col" style="gap:8px;margin-top:12px" data-permission="accounts:manage">
            <label class="field"><span>Add private note</span><div class="inp ta"><textarea name="body" required minlength="2" maxlength="4000" placeholder="Operational context visible only to authorized staff"></textarea></div></label>
            <div class="row" style="justify-content:flex-end"><button class="btn s pri" type="submit">Save note</button></div>
          </form>
        </article>
        <article class="card">
          <div class="ch"><div class="tx"><h3>Billing profile & tax identity</h3><p>Updates are validated, MFA-gated and audited.</p></div></div>
          <form id="adminBillingProfileForm" class="col" style="gap:10px" data-permission="accounts:manage">
            <div class="g g2">
              <label class="field"><span>Company name</span><div class="inp"><input name="companyName" maxlength="120" value="${esc(d.billingProfile?.company_name || '')}"></div></label>
              <label class="field"><span>Country code</span><div class="inp"><input name="country" required minlength="2" maxlength="2" value="${esc(d.billingProfile?.country || '')}" placeholder="RO"></div></label>
              <label class="field"><span>Tax ID</span><div class="inp"><input name="taxId" maxlength="30" value="${esc(d.billingProfile?.tax_id || '')}"></div></label>
              <label class="field"><span>Tax ID type</span><div class="inp"><input name="taxIdType" maxlength="30" value="${esc(d.billingProfile?.tax_id_type || '')}" placeholder="VAT, EIN…"></div></label>
            </div>
            <label class="field"><span>Address</span><div class="inp"><input name="addressLine1" required maxlength="150" value="${esc(d.billingProfile?.address_line1 || '')}"></div></label>
            <label class="field"><span>Address line 2</span><div class="inp"><input name="addressLine2" maxlength="150" value="${esc(d.billingProfile?.address_line2 || '')}"></div></label>
            <div class="g g2"><label class="field"><span>City</span><div class="inp"><input name="city" required maxlength="80" value="${esc(d.billingProfile?.city || '')}"></div></label><label class="field"><span>Postal code</span><div class="inp"><input name="postalCode" required maxlength="20" value="${esc(d.billingProfile?.postal_code || '')}"></div></label></div>
            <div class="row" style="justify-content:flex-end"><button class="btn s pri" type="submit">Save billing profile</button></div>
          </form>
        </article>
      </div>

      <div>
        <div class="dh" style="margin-bottom:6px">SUPPORT CONTEXT (${d.tickets.length})</div>
        <div class="col" style="gap:8px">
          ${d.tickets.length ? d.tickets.map((t) => `<a class="li" href="/admin/tickets/${encodeURIComponent(t.id)}" data-route="admin-ticket-detail"><span class="tx"><b>${esc(t.subject)}</b><small>${esc(t.id)} · updated ${formatDate(t.updated_at)}</small></span>${badge(t.priority)}${badge(t.status)}</a>`).join('') : '<div class="empty"><b>No support conversations recorded.</b></div>'}
        </div>
      </div>

      <article class="card"><div class="ch"><div class="tx"><h3>Security & lifecycle history</h3><p>Latest account-scoped audit events with correlation identifiers.</p></div></div><div class="table-scroll"><table class="tbl rsp"><thead><tr><th>Action</th><th>Actor</th><th>Resource</th><th>Correlation</th><th>Time</th></tr></thead><tbody>${d.audit.map((event) => `<tr><td><b>${esc(event.action)}</b></td><td>${badge(event.actor_type)}</td><td><span class="mono">${esc(event.resource_type)} · ${esc(event.resource_id)}</span></td><td><span class="mono">${esc(event.correlation_id)}</span></td><td>${formatDate(event.created_at)}</td></tr>`).join('') || '<tr><td colspan="5">No audit events recorded.</td></tr>'}</tbody></table></div></article>
    `;
  } catch (err: any) {
    content.innerHTML = `<div class="alert bad"><div><b>Error loading account</b><span>${esc(err.message)}</span></div></div>`;
  }
}
