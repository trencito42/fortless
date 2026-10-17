/**
 * Staff Control Plane — Operations Overview Page Module
 * Route: /admin
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
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

  const metrics = [
    ['Users', d.users],
    ['Accounts', d.accounts],
    ['Active services', d.activeServices],
    ['Open tickets', d.openTickets],
    ['Orders', d.orders],
    ['Overdue invoices', d.overdueInvoices],
    ['Pending events', d.pendingOutboxEvents],
    ['Dead letters', d.deadLetterEvents],
  ];

  const metricsBox = document.querySelector('#overviewMetrics');
  if (metricsBox) {
    metricsBox.innerHTML = metrics
      .map((x) => `<article class="metric"><span>${esc(x[0])}</span><strong>${Number(x[1] || 0)}</strong></article>`)
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
}
