/** Customer command center. Every value is loaded from an account-scoped API. */
import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { money } from '../../../core/utils/formatting.js';
import { hero, renderEmptyState } from '../../../petal/index.js';

export async function renderHome(): Promise<void> {
  const host = document.getElementById('dashboardOverview');
  if (!host) return;
  host.innerHTML = `<div class="state-message">${hero('refresh')}<span>Loading workspace overview…</span></div>`;
  const [serviceResult, ticketResult, invoiceResult, auditResult] = await Promise.allSettled([
    api<{ services: any[] }>('/api/v1/services'), api<{ tickets: any[] }>('/api/v1/tickets'), api<{ invoices: any[] }>('/api/v1/invoices'), api<{ logs: any[] }>('/api/v1/audit'),
  ]);
  const services = serviceResult.status === 'fulfilled' ? serviceResult.value.services : [];
  const tickets = ticketResult.status === 'fulfilled' ? ticketResult.value.tickets : [];
  const invoices = invoiceResult.status === 'fulfilled' ? invoiceResult.value.invoices : [];
  const logs = auditResult.status === 'fulfilled' ? auditResult.value.logs : [];
  const openTickets = tickets.filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status));
  const outstanding = invoices.filter((item) => ['DRAFT', 'OPEN', 'PENDING', 'OVERDUE'].includes(item.status));
  const currency = invoices[0]?.currency || 'EUR';
  const outstandingTotal = outstanding.reduce((sum, item) => sum + Number(item.total_minor_units || 0), 0);
  const failures = [serviceResult, ticketResult, invoiceResult, auditResult].filter((item) => item.status === 'rejected').length;

  host.innerHTML = `${failures ? `<div class="state-message warn">${hero('warning')}<span>${failures} dashboard source${failures === 1 ? '' : 's'} could not be loaded. Available records are shown below.</span></div>` : ''}
    <div class="dashboard-welcome"><div><span class="badge accent s">Workspace overview</span><h2>Your infrastructure at a glance.</h2><p>Real account, service, billing and support records—without simulated telemetry.</p></div><div class="row wrap"><a class="btn sec s" href="/app/support/new" data-app-route="ticket-new">${hero('support', 's')}Open ticket</a><a class="btn s" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}Deploy service</a></div></div>
    <div class="grid g4 keep2 dashboard-metrics">
      ${metric('Active services', services.filter((item) => item.contract_status === 'ACTIVE').length, 'servers', 'good')}
      ${metric('Total services', services.length, 'cube', 'accent')}
      ${metric('Open tickets', openTickets.length, 'support', openTickets.length ? 'warn' : 'good')}
      ${metric('Outstanding', money(outstandingTotal, currency), 'credit', outstandingTotal ? 'warn' : 'good')}
    </div>
    ${!services.length ? `<div class="card dashboard-onboarding">${renderEmptyState({ icon: 'servers', title: 'Start with your first service', message: 'Browse the real catalog. Checkout remains unavailable until payment and provider verification pass.', actionHtml: `<a class="btn s tint" href="/app/deploy" data-app-route="deploy">${hero('plus', 's')}View catalog</a>` })}</div>` : ''}
    <div class="dashboard-columns">
      ${panel('My services', 'Provider-observed contract and runtime state.', '/app/services', 'View all services', services.slice(0, 4).map((item) => `<a class="li card s2" href="/app/services/${esc(item.id)}" data-app-route="service-detail"><span class="ico-b ${item.runtime_state === 'RUNNING' ? 'good' : 'info'}">${hero('servers')}</span><span class="tx"><b>${esc(item.plan_name || 'Hosting service')}</b><span>${esc(item.node_name || item.node_id || 'No node assigned')}</span></span><span class="badge s">${esc(item.contract_status)}</span>${hero('chevron', 's')}</a>`).join('') || emptyLine('No services yet'))}
      ${panel('Support', 'Recent account conversations.', '/app/support', 'View support', tickets.slice(0, 4).map((item) => `<a class="li card s2" href="/app/support/${esc(item.id)}" data-app-route="ticket-detail"><span class="ico-b accent">${hero('support')}</span><span class="tx"><b>${esc(item.subject)}</b><span>${esc(formatDate(item.updated_at || item.created_at))}</span></span><span class="badge s">${esc(item.status)}</span></a>`).join('') || emptyLine('No support conversations'))}
      ${panel('Billing', 'Latest issued account records.', '/app/billing', 'View billing', invoices.slice(0, 4).map((item) => `<div class="li card s2"><span class="ico-b">${hero('document')}</span><span class="tx"><b>${esc(item.invoice_number || 'Draft invoice')}</b><span>${esc(formatDate(item.created_at))}</span></span><b>${money(item.total_minor_units, item.currency)}</b><span class="badge s">${esc(item.status)}</span></div>`).join('') || emptyLine('No billing records'))}
      ${panel('Recent activity', 'Security-relevant account events.', '/app/activity', 'View activity', logs.slice(0, 4).map((item) => `<div class="li card s2"><span class="ico-b">${hero('shield')}</span><span class="tx"><b>${esc(String(item.action || '').replaceAll('.', ' · '))}</b><span>${esc(formatDate(item.created_at))}</span></span></div>`).join('') || emptyLine('No recent activity'))}
    </div>`;
}

function metric(label: string, value: string | number, icon: string, tone: string): string {
  return `<div class="card metric-card"><div><span class="metric-label">${esc(label)}</span><strong class="metric-value">${esc(String(value))}</strong></div><span class="ico-b ${tone}">${hero(icon)}</span></div>`;
}
function emptyLine(text: string): string { return `<div class="state-message"><span>${esc(text)}</span></div>`; }
function panel(title: string, description: string, href: string, action: string, body: string): string {
  return `<section class="card dashboard-panel"><div class="section-card-head"><div class="tx"><h3>${esc(title)}</h3><p>${esc(description)}</p></div><a class="btn sec xs" href="${href}" data-app-route>${esc(action)}</a></div><div class="col" style="gap:7px">${body}</div></section>`;
}
