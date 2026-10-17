/**
 * Staff Control Plane — Global Audit Trail Page Module
 * Route: /admin/audit
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { row } from '../../shell/admin-shell.js';

export async function renderAudit(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#auditList');
  if (!host) return;

  try {
    const d = await api<{ logs: any[] }>(`/api/v1/admin/audit?q=${encodeURIComponent(q)}`);
    if (!d.logs.length) {
      host.innerHTML = `<div class="empty"><b>No matching audit events.</b></div>`;
      return;
    }

    host.innerHTML = d.logs
      .map((x) =>
        row({
          symbol: 'shield',
          title: x.action,
          sub: `${x.actor_name || x.actor_type} · ${x.account_name || 'Platform'} · ${x.resource_type} ${x.resource_id}`,
          status: x.actor_type,
          meta: formatDate(x.created_at),
        })
      )
      .join('');
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}
