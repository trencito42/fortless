/**
 * Staff Control Plane — Global Audit Trail Page Module
 * Route: /admin/audit
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { badge } from '../../shell/admin-shell.js';

export async function renderAudit(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#auditList');
  if (!host) return;

  try {
    const d = await api<{ logs: any[] }>(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
    if (!d.logs.length) {
      host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>No matching audit events.</b></div></td></tr>`;
      return;
    }

    host.innerHTML = d.logs.map((x) => `<tr class="h"><td data-l="Time" class="muted mono">${formatDate(x.created_at)}</td><td data-l="Actor"><b>${esc(x.actor_name || x.actor_type)}</b><small>${esc(x.actor_email || x.account_name || 'Platform')}</small></td><td data-l="Action">${badge(x.action)}</td><td data-l="Target" class="mono">${esc(x.resource_type)} ${esc(x.resource_id)}</td><td data-l="IP" class="mono muted">${esc(x.ip_address || '—')}</td></tr>`).join('');
  } catch (e: any) {
    host.innerHTML = `<tr><td colspan="5"><div class="empty"><b>${esc(e.message)}</b></div></td></tr>`;
  }
}
