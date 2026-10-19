/**
 * Staff Control Plane — Global Audit Trail Page Module
 * Route: /admin/audit
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { badge } from '../../shell/admin-shell.js';
import { renderPager } from '../../../petal/index.js';

let cachedLogs: any[] = [];
let adminAuditPage = 1;
let adminAuditQuery = '';
let adminAuditTotal = 0;
const adminAuditPageSize = 20;
let adminAuditListenersBound = false;

function metadata(value: unknown): string {
  if (!value) return '—';
  try {
    return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2);
  } catch {
    return String(value);
  }
}

function paintAuditList(): void {
  const host = document.querySelector<HTMLElement>('#auditList');
  const paginationRow = document.getElementById('adminAuditPaginationRow');
  const infoEl = document.getElementById('adminAuditPageInfo');
  const pagerEl = document.getElementById('adminAuditPager');
  if (!host) return;

  if (!cachedLogs.length) {
    if (paginationRow) paginationRow.style.display = 'none';
    host.innerHTML = `<tr><td colspan="7"><div class="empty"><b>No matching audit events.</b></div></td></tr>`;
    return;
  }

  const pages = Math.max(1, Math.ceil(adminAuditTotal / adminAuditPageSize));
  const start = (adminAuditPage - 1) * adminAuditPageSize;
  if (paginationRow) paginationRow.style.display = adminAuditTotal > adminAuditPageSize ? 'flex' : 'none';
  if (infoEl) infoEl.textContent = `Showing ${start + 1}–${start + cachedLogs.length} of ${adminAuditTotal}`;
  if (pagerEl) pagerEl.innerHTML = renderPager(adminAuditPage, pages);

  host.innerHTML = cachedLogs.map((x) => `<tr class="h"><td data-l="Time" class="muted mono">${formatDate(x.created_at)}</td><td data-l="Actor"><b>${esc(x.actor_name || x.actor_type)}</b><small>${esc(x.actor_email || x.account_name || 'Platform')}</small></td><td data-l="Action">${badge(x.action)}</td><td data-l="Target" class="mono">${esc(x.resource_type)} ${esc(x.resource_id)}</td><td data-l="IP" class="mono muted">${esc(x.ip_address || '—')}</td><td data-l="Correlation" class="mono muted">${esc(x.correlation_id || '—')}</td><td data-l="Context"><details><summary class="btn xs">View</summary><pre class="mono" style="white-space:pre-wrap;max-width:420px;margin-top:8px">${esc(metadata(x.metadata))}</pre></details></td></tr>`).join('');
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
        void renderAudit(adminAuditQuery, p);
      }
    }
  });
}

export async function renderAudit(q = '', page = 1): Promise<void> {
  const host = document.querySelector<HTMLElement>('#auditList');
  if (!host) return;

  try {
    adminAuditQuery = q;
    adminAuditPage = Math.max(1, page);
    const params = new URLSearchParams({ q, limit: String(adminAuditPageSize), offset: String((adminAuditPage - 1) * adminAuditPageSize) });
    const d = await api<{ logs: any[]; total: number }>(`/api/v1/admin/audit?${params}`);
    cachedLogs = d.logs || [];
    adminAuditTotal = Number(d.total || 0);
    paintAuditList();
    bindAdminAuditListeners();
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="7"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}
