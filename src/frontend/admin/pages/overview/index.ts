/**
 * Staff Control Plane — Operations Overview Page Module
 * Route: /admin
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero } from '../../../petal/index.js';
import { row } from '../../shell/admin-shell.js';

export async function renderOverview(): Promise<void> {
  const d = await api<{
    users: number;
    accounts: number;
    activeServices: number;
    openTickets: number;
    orders: number;
    overdueInvoices: number;
    pendingOutboxEvents: number;
    deadLetterEvents: number;
    capabilities: Record<string, string>;
  }>('/api/v1/admin/overview');

  const metrics: Array<[string, number, string, string]> = [
    ['Users', d.users, 'users', ''],
    ['Accounts', d.accounts, 'users', ''],
    ['Active services', d.activeServices, 'server', 'good'],
    ['Open tickets', d.openTickets, 'support', d.openTickets ? 'warn' : 'good'],
    ['Orders', d.orders, 'cube', ''],
    ['Overdue invoices', d.overdueInvoices, 'document', d.overdueInvoices ? 'warn' : 'good'],
    ['Pending events', d.pendingOutboxEvents, 'refresh', d.pendingOutboxEvents ? 'warn' : 'good'],
    ['Dead letters', d.deadLetterEvents, 'warning', d.deadLetterEvents ? 'bad' : 'good'],
  ];

  const metricsBox = document.querySelector('#overviewMetrics');
  if (metricsBox) {
    metricsBox.innerHTML = metrics
      .map(([label, value, icon, tone]) => `<article class="card mt"><div><span class="l">${esc(label)}</span><b class="v">${Number(value || 0)}</b></div><span class="tile ${tone}">${hero(icon)}</span></article>`)
      .join('');
  }

  const capabilityList = document.querySelector('#capabilityList');
  if (capabilityList) {
    capabilityList.innerHTML = Object.entries(d.capabilities)
      .map(([k, v]) =>
        row({
          symbol: 'shield',
          title: k.replace(/([A-Z])/g, ' $1'),
          sub: 'Release gate from server configuration',
          status: v,
        })
      )
      .join('');
  }

  const attentionList = document.querySelector('#attentionList');
  if (attentionList) {
    attentionList.innerHTML = [
      row({
        symbol: 'support',
        title: 'Open support tickets',
        sub: 'Unresolved customer conversations',
        meta: `${d.openTickets} open`,
      }),
      row({
        symbol: 'server',
        title: 'Pending outbox events',
        sub: 'Async work awaiting worker dispatch',
        meta: `${d.pendingOutboxEvents} pending`,
      }),
      row({
        symbol: 'warning',
        title: 'Dead-letter events',
        sub: 'Events requiring engineering review',
        status: d.deadLetterEvents ? 'ATTENTION' : 'CLEAR',
        meta: `${d.deadLetterEvents} dead`,
      }),
    ].join('');
  }

  const outboxHealth = document.querySelector('#outboxHealth');
  if (outboxHealth) {
    outboxHealth.innerHTML = [
      row({ symbol: 'refresh', title: 'Retries pending', sub: 'Events awaiting worker dispatch', status: d.pendingOutboxEvents ? 'PENDING' : 'CLEAR', meta: String(d.pendingOutboxEvents) }),
      row({ symbol: 'warning', title: 'Dead-letter events', sub: 'Manual review required', status: d.deadLetterEvents ? 'ATTENTION' : 'CLEAR', meta: String(d.deadLetterEvents) }),
    ].join('');
  }

  const supportSummary = document.querySelector('#supportSummary');
  if (supportSummary) {
    supportSummary.innerHTML = row({ symbol: 'support', title: 'Open support tickets', sub: 'Inspect priority and recent activity in the support queue', status: d.openTickets ? 'OPEN' : 'CLEAR', meta: String(d.openTickets) });
  }
}
