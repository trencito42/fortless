/**
 * Staff Control Plane — Service Inventory Page Module
 * Route: /admin/services
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { row } from '../../shell/admin-shell.js';

export async function renderServices(q = ''): Promise<void> {
  const host = document.querySelector<HTMLElement>('#servicesList');
  if (!host) return;

  try {
    const d = await api<{ services: any[] }>(`/api/v1/admin/services?q=${encodeURIComponent(q)}`);
    if (!d.services.length) {
      host.innerHTML = `<div class="empty"><b>No matching services.</b></div>`;
      return;
    }

    host.innerHTML = d.services
      .map((x) =>
        row({
          symbol: 'server',
          title: x.plan_name || x.product_name,
          sub: `${x.account_name} · ${x.region_name} · ${x.node_name}`,
          status: x.runtime_state || x.contract_status,
          meta: `${x.provider_type} · ${x.identifier || x.id}`,
        })
      )
      .join('');
  } catch (e: any) {
    host.innerHTML = `<div class="empty"><b>${esc(e.message)}</b></div>`;
  }
}
