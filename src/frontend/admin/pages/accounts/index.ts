/**
 * Staff Control Plane — Customer Accounts Page Module
 * Route: /admin/accounts
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { money } from '../../../core/utils/formatting.js';
import { badge } from '../../shell/admin-shell.js';
import { hero, paginateItems, renderPager } from '../../../petal/index.js';

let activeAccountId: string | null = null;
let cachedAccounts: any[] = [];
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

  const pagination = paginateItems(cachedAccounts, adminAccountsPage, adminAccountsPageSize);
  adminAccountsPage = pagination.page;

  if (paginationRow) paginationRow.style.display = cachedAccounts.length > adminAccountsPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  host.innerHTML = pagination.items.map((x) => `<button class="li" data-account-id="${esc(x.id)}">
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
        paintAccountsList();
      }
    }
  });
}

export async function renderAccounts(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#accountsList');
  if (!host) return;

  try {
    const d = await api<{ accounts: any[] }>(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}`);
    cachedAccounts = d.accounts || [];
    adminAccountsPage = 1;
    paintAccountsList();
    bindAdminAccountsListeners();
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}

export async function openAccountDetail(accountId: string): Promise<void> {
  activeAccountId = accountId;
  const modal = document.getElementById('modalAccountDetail');
  const content = document.getElementById('adminAccountContent');
  if (!modal || !content) return;

  content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink2)"><div class="sk"><i></i><i></i><i></i></div></div>';
  modal.hidden = false;

  try {
    const d = await api<{
      account: any;
      members: any[];
      services: any[];
      invoices: any[];
      tickets: any[];
    }>(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);

    const titleEl = document.getElementById('adminAccountTitle');
    const metaEl = document.getElementById('adminAccountMeta');
    const statusSelect = document.getElementById('adminAccountStatusSelect') as HTMLSelectElement | null;

    if (titleEl) titleEl.textContent = d.account.name;
    if (metaEl) {
      metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) · Created ${formatDate(
        d.account.created_at
      )}`;
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
          <div style="font-size:18px;font-weight:700">${d.services.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TOTAL INVOICES</small>
          <div style="font-size:18px;font-weight:700">${d.invoices.length}</div>
        </div>
        <div class="card flat" style="padding:10px 12px">
          <small class="muted" style="font-size:11px;font-weight:700">TICKETS</small>
          <div style="font-size:18px;font-weight:700">${(d.tickets || []).length}</div>
        </div>
      </div>

      <!-- Account Members -->
      <div>
        <div class="dh" style="margin-bottom:6px">ORGANIZATION MEMBERS (${d.members.length})</div>
        <div class="table-scroll" style="max-height:160px">
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
        <div class="table-scroll" style="max-height:180px">
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
        <div class="table-scroll" style="max-height:160px">
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
                <td><b class="mono">${esc(i.invoice_number)}</b></td>
                <td class="faint" style="font-size:12px">${formatDate(i.created_at)}</td>
                <td><b>${money(i.total_minor_units, i.currency)}</b></td>
                <td class="r">${badge(i.status)}</td>
              </tr>`).join('') : '<tr><td colspan="4"><div class="empty"><b>No invoices recorded.</b></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err: any) {
    content.innerHTML = `<div class="alert bad"><div><b>Error loading account</b><span>${esc(err.message)}</span></div></div>`;
  }
}
