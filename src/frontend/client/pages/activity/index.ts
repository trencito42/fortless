/**
 * Customer Portal — Account Activity / Audit Log Page Module
 * Route: /app/activity
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { compactId } from '../../../core/utils/formatting.js';
import { hero, renderEmptyState, renderSkeleton } from '../../../petal/index.js';

function actionIcon(action: string): [string, string] {
  const a = String(action || '').toLowerCase();
  if (/password|recovery|key/.test(a)) return ['key-01', ''];
  if (/mfa|totp|otp|two.step|finger/.test(a)) return ['finger-print-scan', 'good'];
  if (/login|logout|session|auth/.test(a)) return ['lock', 'good'];
  if (/ticket|support|message/.test(a)) return ['message-01', 'info'];
  if (/provision|deploy|service|server/.test(a)) return ['rocket-01', 'violet'];
  if (/invoice|billing|payment|subscription|order/.test(a)) return ['invoice-01', 'warn'];
  return ['shield', ''];
}

function dayLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStr = now.toDateString();
  const dStr = d.toDateString();
  if (dStr === todayStr) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dStr === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByDay(logs: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const item of logs) {
    const label = item.created_at ? dayLabel(item.created_at) : 'Unknown';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return groups;
}

function renderTimeline(items: any[]): string {
  return '<div class="tl2">' + items.map((item) => {
    const [icon, tone] = actionIcon(item.action);
    const time = item.created_at ? new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="ev"><span class="tile ${tone} sm">${hero(icon, 's')}</span><div><b>${esc(item.actor_name || item.actor_type)} · ${esc(item.action.replaceAll('.', ' · '))}</b><small>${esc(item.resource_type || '')}${item.resource_id ? ' · ' + esc(compactId(item.resource_id)) : ''}${item.ip_address ? ' · ' + esc(item.ip_address) : ''}</small></div><small>${esc(time)}</small></div>`;
  }).join('') + '</div>';
}

let auditLogs: any[] = [];

export async function renderActivity(): Promise<void> {
  const host = document.getElementById('auditList');
  if (!host) return;

  host.innerHTML = renderSkeleton('list', 'Loading audit events');

  try {
    const { logs } = await api<{ logs: any[] }>('/api/v1/audit');
    auditLogs = logs;
    filterActivity();
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load activity</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export function filterActivity(): void {
  const host = document.getElementById('auditList');
  if (!host) return;

  const searchInput = document.getElementById('auditSearch') as HTMLInputElement | null;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const type = document.querySelector<HTMLInputElement>('input[name="auditType"]:checked')?.value || 'ALL';

  const logs = auditLogs.filter((item) => {
    const action = String(item.action || '').toUpperCase();
    const matchesType = type === 'ALL' || (type === 'AUTH' ? /LOGIN|LOGOUT|SESSION|PASSWORD|MFA|EMAIL/.test(action) : type === 'SUPPORT' ? /TICKET|SUPPORT/.test(action) : /BILL|INVOICE|PAYMENT|SUBSCRIPTION|ORDER|QUOTE/.test(action));
    return matchesType && [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id].some(
      (value) => String(value || '').toLowerCase().includes(query)
    );
  });

  const count = document.getElementById('auditResultCount');
  if (count) count.textContent = `${logs.length} of ${auditLogs.length} events`;

  if (!logs.length) {
    host.innerHTML = renderEmptyState({
      icon: 'history',
      title: query ? 'No matching activity' : 'No account activity yet',
      message: query
        ? 'Try a different actor, action or resource.'
        : 'Security-relevant account events will appear here.',
    });
    return;
  }

  const groups = groupByDay(logs);
  host.innerHTML = Array.from(groups.entries())
    .map(([day, items]) => `<div class="dh">${esc(day)}</div>${renderTimeline(items)}`)
    .join('');
}
