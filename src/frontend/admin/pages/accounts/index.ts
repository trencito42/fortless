/**
 * Staff Control Plane — Customer Accounts Page Module
 * Route: /admin/accounts
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { row } from '../../shell/admin-shell.js';

let activeAccountId: string | null = null;

export function getActiveAccountId(): string | null {
  return activeAccountId;
}

export function setActiveAccountId(id: string | null): void {
  activeAccountId = id;
}

export async function renderAccounts(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#accountsList');
  if (!host) return;

  try {
    const d = await api<{ accounts: any[] }>(`/api/v1/admin/accounts?q=${encodeURIComponent(q)}`);
    if (!d.accounts.length) {
      host.innerHTML = `<div class="empty"><span class="row-icon"></span><b>No matching accounts.</b></div>`;
      return;
    }

    host.innerHTML = d.accounts
      .map((x) =>
        row({
          symbol: 'users',
          title: x.name,
          sub: `${x.owner_name} · ${x.owner_email}`,
          status: x.status,
          meta: `${x.member_count} members · ${x.service_count} services · ${x.open_ticket_count} tickets`,
          dataAttr: `data-account-id="${esc(x.id)}"`,
        })
      )
      .join('');
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}

export async function openAccountDetail(accountId: string): Promise<void> {
  activeAccountId = accountId;
  const modal = document.getElementById('modalAccountDetail');
  const content = document.getElementById('adminAccountContent');
  if (!modal || !content) return;

  content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink2)">Loading account profile…</div>';
  modal.hidden = false;

  try {
    const d = await api<{
      account: any;
      members: any[];
      services: any[];
      invoices: any[];
    }>(`/api/v1/admin/accounts/${encodeURIComponent(accountId)}`);

    const titleEl = document.getElementById('adminAccountTitle');
    const metaEl = document.getElementById('adminAccountMeta');
    const statusSelect = document.getElementById('adminAccountStatusSelect') as HTMLSelectElement | null;

    if (titleEl) titleEl.textContent = d.account.name;
    if (metaEl)
      metaEl.textContent = `Owner: ${d.account.owner_name} (${d.account.owner_email}) · Created ${formatDate(
        d.account.created_at
      )}`;
    if (statusSelect) statusSelect.value = d.account.status;

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        <div class="card s2" style="padding:12px">
          <b>Members (${d.members.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.members.map((m) => `${esc(m.name)} (${m.role})`).join(', ') || 'None'}
          </div>
        </div>
        <div class="card s2" style="padding:12px">
          <b>Active Services (${d.services.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.services.map((s) => `${esc(s.plan_name)} [${s.contract_status}]`).join(', ') || 'None'}
          </div>
        </div>
        <div class="card s2" style="padding:12px">
          <b>Invoices (${d.invoices.length})</b>
          <div style="font-size:12px;color:var(--ink2);margin-top:4px">
            ${d.invoices.slice(0, 3).map((i) => `${esc(i.invoice_number)} (${i.status})`).join(', ') || 'None'}
          </div>
        </div>
      </div>
    `;
  } catch (err: any) {
    content.innerHTML = `<div style="color:var(--bad);padding:20px">Error loading account: ${esc(err.message)}</div>`;
  }
}
