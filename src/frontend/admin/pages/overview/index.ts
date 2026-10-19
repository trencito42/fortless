/** Staff operations center backed only by authoritative persisted records. */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { money } from '../../../core/utils/formatting.js';
import { hero } from '../../../petal/index.js';
import { badge, row } from '../../shell/admin-shell.js';

function linkRow(path: string, route: string, icon: string, title: string, sub: string, state = '', meta = ''): string {
  return `<a class="li" href="${path}" data-route="${route}"><span class="tile neu sm">${hero(icon)}</span><span class="tx"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${state ? badge(state) : ''}${meta ? `<span class="faint hide-n">${esc(meta)}</span>` : ''}</a>`;
}

function empty(message: string): string {
  return `<div class="es" style="padding:24px 12px"><span class="tile good sm">${hero('check')}</span><h4>${esc(message)}</h4></div>`;
}

export async function renderOverview(): Promise<void> {
  const d = await api<any>('/api/v1/admin/overview');
  const metrics: Array<[string, number, string, string]> = [
    ['Active services', d.activeServices, 'server', 'good'],
    ['Suspended', d.suspendedServices, 'warning', d.suspendedServices ? 'bad' : 'good'],
    ['Provisioning', d.provisioningServices, 'refresh', d.provisioningServices ? 'warn' : 'good'],
    ['Failed jobs', d.failedProvisioningJobs, 'warning', d.failedProvisioningJobs ? 'bad' : 'good'],
    ['Pending orders', d.pendingOrders, 'cube', d.pendingOrders ? 'warn' : 'good'],
    ['Overdue invoices', d.overdueInvoices, 'document', d.overdueInvoices ? 'bad' : 'good'],
    ['Waiting for staff', d.waitingStaffTickets, 'support', d.waitingStaffTickets ? 'warn' : 'good'],
    ['Capacity alerts', d.capacityAlerts, 'servers', d.capacityAlerts ? 'bad' : 'good'],
  ];
  const metricsBox = document.querySelector('#overviewMetrics');
  if (metricsBox) metricsBox.innerHTML = metrics.map(([label, value, icon, tone]) => `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${Number(value || 0)}</b></div><span class="tile ${tone}">${hero(icon)}</span></article>`).join('');

  const capabilityList = document.querySelector('#capabilityList');
  if (capabilityList) capabilityList.innerHTML = Object.entries(d.capabilities || {}).map(([key, value]) => row({ symbol: 'shield', title: key.replace(/([A-Z])/g, ' $1'), sub: 'Server environment and verification state', status: String(value) })).join('');

  const collections = document.querySelector('#collectionsSummary');
  if (collections) collections.innerHTML = d.collections?.length
    ? d.collections.map((item: any) => row({ symbol: 'credit', title: item.currency, sub: 'Settled invoice collections', meta: money(item.amount_minor_units, item.currency), status: 'COLLECTED' })).join('')
    : empty('No settled collections in this period');

  const attention = [
    ...(d.attention?.invoices || []).map((item: any) => linkRow(`/admin/billing/${encodeURIComponent(item.id)}`, 'invoice-detail', 'document', item.invoice_number || item.id, `Overdue since ${formatDate(item.due_date)}`, item.status, money(item.balance_minor_units, item.currency))),
    ...(d.attention?.provisioning || []).map((item: any) => linkRow(`/admin/services/${encodeURIComponent(item.service_id)}`, 'admin-service-detail', 'server', item.identifier || item.service_id, item.last_error || `${item.account_name} requires review`, item.status)),
    ...(d.attention?.tickets || []).map((item: any) => linkRow(`/admin/tickets/${encodeURIComponent(item.id)}`, 'admin-ticket-detail', 'support', item.subject, `${item.account_name} · waiting since ${formatDate(item.updated_at)}`, item.priority)),
  ];
  const attentionList = document.querySelector('#attentionList');
  if (attentionList) attentionList.innerHTML = attention.join('') || empty('No records currently need attention');

  const outboxHealth = document.querySelector('#outboxHealth');
  if (outboxHealth) outboxHealth.innerHTML = [
    row({ symbol: 'refresh', title: 'Pending worker events', sub: 'Awaiting background dispatch', status: d.pendingOutboxEvents ? 'PENDING' : 'CLEAR', meta: String(d.pendingOutboxEvents) }),
    row({ symbol: 'warning', title: 'Dead-letter events', sub: 'Manual engineering review required', status: d.deadLetterEvents ? 'ATTENTION' : 'CLEAR', meta: String(d.deadLetterEvents) }),
    row({ symbol: 'support', title: 'Failed email deliveries', sub: 'Failed or dead-letter transactional messages', status: d.failedEmails ? 'ATTENTION' : 'CLEAR', meta: String(d.failedEmails) }),
    row({ symbol: 'credit', title: 'Webhook failures or anomalies', sub: 'Persisted PSP inbox records', status: d.webhookFailures ? 'ATTENTION' : 'CLEAR', meta: String(d.webhookFailures) }),
  ].join('');

  const commercial = document.querySelector('#recentCommercial');
  if (commercial) {
    const records = [
      ...(d.recent?.accounts || []).map((item: any) => ({ at: item.created_at, html: linkRow(`/admin/accounts/${encodeURIComponent(item.id)}`, 'account-detail', 'users', item.name, `Customer created ${formatDate(item.created_at)}`, item.status) })),
      ...(d.recent?.orders || []).map((item: any) => ({ at: item.created_at, html: linkRow(`/admin/orders/${encodeURIComponent(item.id)}`, 'order-detail', 'cube', item.account_name, `Order ${item.id} · ${formatDate(item.created_at)}`, item.status, money(item.total_minor_units, item.currency)) })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    commercial.innerHTML = records.map((record) => record.html).join('') || empty('No customer or order records');
  }

  const operations = document.querySelector('#recentOperations');
  if (operations) operations.innerHTML = (d.recent?.operations || []).map((event: any) => {
    const target = event.resource_type === 'service' ? `/admin/services/${encodeURIComponent(event.resource_id)}` : event.resource_type === 'ticket' ? `/admin/tickets/${encodeURIComponent(event.resource_id)}` : event.resource_type === 'account' ? `/admin/accounts/${encodeURIComponent(event.resource_id)}` : '/admin/audit';
    const route = event.resource_type === 'service' ? 'admin-service-detail' : event.resource_type === 'ticket' ? 'admin-ticket-detail' : event.resource_type === 'account' ? 'account-detail' : 'audit';
    return linkRow(target, route, 'shield', event.action, `${event.actor_type} · ${formatDate(event.created_at)}`, '', event.correlation_id);
  }).join('') || empty('No administrative operations recorded');
}
