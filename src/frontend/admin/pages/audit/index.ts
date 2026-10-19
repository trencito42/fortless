/**
 * Staff Control Plane — Global Audit Trail Page Module
 * Route: /admin/audit
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { badge } from '../../shell/admin-shell.js';
import { paginateItems, renderPager } from '../../../petal/index.js';

let cachedLogs: any[] = [];
let adminAuditPage = 1;
const adminAuditPageSize = 10;
let adminAuditListenersBound = false;

function paintAuditList(): void {
  const host = document.querySelector<HTMLElement>('#auditList');
  const paginationRow = document.getElementById('adminAuditPaginationRow');
  const infoEl = document.getElementById('adminAuditPageInfo');
  const pagerEl = document.getElementById('adminAuditPager');
  if (!host) return;

  if (!cachedLogs.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching audit events.</b></div></td></tr>`;
    return;
  }

  const pagination = paginateItems(cachedLogs, adminAuditPage, adminAuditPageSize);
  adminAuditPage = pagination.page;

  if (paginationRow) paginationRow.style.display = cachedLogs.length > adminAuditPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  host.innerHTML = pagination.items.map((x) => `<tr class="h"><td data-l="Time" class="muted mono">${formatDate(x.created_at)}</td><td data-l="Actor"><b>${esc(x.actor_name || x.actor_type)}</b><small>${esc(x.actor_email || x.account_name || 'Platform')}</small></td><td data-l="Action">${badge(x.action)}</td><td data-l="Target" class="mono">${esc(x.resource_type)} ${esc(x.resource_id)}</td><td data-l="IP" class="mono muted">${esc(x.ip_address || '—')}</td></tr>`).join('');
}

function bindAdminAuditListeners(): void {
  if (adminAuditListenersBound) return;
  adminAuditListenersBound = true;

  const pagerEl = document.getElementById('adminAuditPager');
  pagerEl?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pg]');
    if (btn && !btn.disabled) {
      const p = Number(btn.dataset.pg);
      if (p && p !== adminAuditPage) {
        adminAuditPage = p;
        paintAuditList();
      }
    }
  });
}

export async function renderAudit(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#auditList');
  if (!host) return;

  try {
    const d = await api<{ logs: any[] }>(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
    cachedLogs = d.logs || [];
    adminAuditPage = 1;
    paintAuditList();
    bindAdminAuditListeners();
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}
