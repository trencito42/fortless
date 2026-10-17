/**
 * Customer Portal — Account Activity / Audit Log Page Module
 * Route: /app/activity
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { compactId } from '../../../core/utils/formatting.js';
import { hero, renderEmptyState } from '../../../petal/index.js';

let auditLogs: any[] = [];

export async function renderActivity(): Promise<void> {
  const host = document.getElementById('auditList');
  if (!host) return;

  host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading audit events…</span></div>`;

  try {
    const { logs } = await api<{ logs: any[] }>('/api/v1/audit');
    auditLogs = logs;
    filterActivity();
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
  }
}

export function filterActivity(): void {
  const host = document.getElementById('auditList');
  if (!host) return;

  const searchInput = document.getElementById('auditSearch') as HTMLInputElement | null;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const logs = auditLogs.filter((item) =>
    [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id].some(
      (value) => String(value || '').toLowerCase().includes(query)
    )
  );

  if (!logs.length) {
    host.innerHTML = renderEmptyState({
      icon: 'shield',
      title: query ? 'No matching activity' : 'No account activity yet',
      message: query
        ? 'Try a different actor, action or resource.'
        : 'Security-relevant account events will appear here.',
    });
    return;
  }

  host.innerHTML = logs
    .map(
      (item) => `
    <div class="z-aur">
      <button type="button" class="z-aut" aria-expanded="false">
        <span class="ico-b">${hero('shield')}</span>
        <span class="tx">
          <b>${esc(item.actor_name || item.actor_type)} · ${esc(item.action.replaceAll('.', ' · '))}</b>
          <small>${esc(item.resource_type)} · ${esc(compactId(item.resource_id))}</small>
        </span>
        <span class="t">${esc(formatDate(item.created_at))}</span>
        <span class="chv">${hero('chevron', 's')}</span>
      </button>
      <div class="z-aud">
        <div class="code">
          Reference: ${esc(item.correlation_id || '—')}<br>
          Origin: ${esc(item.ip_address || 'Unavailable')}
        </div>
      </div>
    </div>
  `
    )
    .join('');
}
