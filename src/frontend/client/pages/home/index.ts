/** Customer workspace overview. Data sources are account-scoped APIs; no layout changes touch API calls, authz, or money logic. */
import { api } from '../../../core/api/client.js';
import { serviceState } from '../services/status.js';
import { isTerminated, visibleServices } from '../services/filters.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { money } from '../../../core/utils/formatting.js';
import { hero } from '../../../petal/index.js';
import { capabilitiesStore } from '../../../core/state/capabilities.js';

// ── Petal primitives ──────────────────────────────────────────────────────────

function tile(iconName: string, tone: string, size = 'sm'): string {
  const cls = ['tile', tone, size].filter(Boolean).join(' ');
  return `<span class="${cls}"><svg class="ic" aria-hidden="true"><use href="#i-${iconName}"/></svg></span>`;
}

function pill(text: string, tone: string, dot = false): string {
  return `<span class="pill ${tone}${dot ? ' d' : ''}">${esc(text)}</span>`;
}

function metricCard(label: string, value: string | number, iconName: string, tone: string): string {
  return `<div class="card mt" data-c="Metric tile"><div><span class="l">${esc(label)}</span><b class="v">${esc(String(value))}</b></div><span class="tile ${tone}"><svg class="ic" aria-hidden="true"><use href="#i-${iconName}"/></svg></span></div>`;
}

function emptyState(iconName: string, title: string, message: string, action = ''): string {
  return `<div class="es" data-c="Empty state">${tile(iconName, 'neu', 'lg')}<h4>${esc(title)}</h4><p>${esc(message)}</p>${action}</div>`;
}

function skeleton(n = 5): string {
  return `<div class="sk" role="status" aria-label="Loading">${Array(n).fill('<i></i>').join('')}</div>`;
}

function panel(title: string, sub: string, body: string, actionHref: string, actionLabel: string): string {
  const action = `<a class="btn xs" href="${actionHref}" data-app-route>${esc(actionLabel)}</a>`;
  return `<section class="card"><div class="ch"><div class="tx"><h3>${esc(title)}</h3><p>${esc(sub)}</p></div>${action}</div><div class="col">${body}</div></section>`;
}

// ── Runtime / status helpers ──────────────────────────────────────────────────

const TIX_TONE: Record<string, string> = {
  OPEN: 'info', WAITING_STAFF: 'warn', WAITING_CUSTOMER: 'violet', RESOLVED: 'good', CLOSED: '',
};

function niceName(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

// ── Render ────────────────────────────────────────────────────────────────────

export async function renderHome(): Promise<void> {
  const host = document.getElementById('dashboardOverview');
  if (!host) return;

  host.innerHTML = skeleton();

  const [serviceResult, ticketResult, invoiceResult, auditResult] = await Promise.allSettled([
    api<{ services: any[] }>('/api/v1/services'),
    api<{ tickets: any[] }>('/api/v1/tickets'),
    api<{ invoices: any[] }>('/api/v1/invoices'),
    api<{ logs: any[] }>('/api/v1/audit'),
  ]);

  const services = visibleServices(serviceResult.status === 'fulfilled' ? serviceResult.value.services : []);
  const tickets = ticketResult.status === 'fulfilled' ? ticketResult.value.tickets : [];
  const invoices = invoiceResult.status === 'fulfilled' ? invoiceResult.value.invoices : [];
  const logs = auditResult.status === 'fulfilled' ? auditResult.value.logs : [];

  const openTickets = tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status));
  const outstanding = invoices.filter((i) => ['DRAFT', 'OPEN', 'PENDING', 'OVERDUE'].includes(i.status));
  const currency = invoices[0]?.currency || 'EUR';
  const outstandingTotal = outstanding.reduce((sum, i) => sum + Number(i.total_minor_units || 0), 0);

  const caps = capabilitiesStore.get();
  const providerOk = Boolean(caps?.provisioning.enabled && caps?.payments.enabled);

  const failCount = [serviceResult, ticketResult, invoiceResult, auditResult].filter(
    (r) => r.status === 'rejected',
  ).length;

  // Fleet bar
  const running = services.filter((s) => serviceState(s).running).length;
  const installing = services.filter((s) => serviceState(s).label === 'INSTALLING').length;
  const stopped = services.filter((s) => !serviceState(s).running && serviceState(s).label !== 'INSTALLING').length;
  const totalSvcs = services.length;

  const fleetBar = totalSvcs > 0
    ? `<div style="display:flex;height:12px;border-radius:12px;overflow:hidden;gap:3px;margin:4px 0 12px">
        ${running > 0 ? `<b style="flex:${running};background:var(--good);border-radius:12px"></b>` : ''}
        ${installing > 0 ? `<b style="flex:${installing};background:var(--warn);border-radius:12px"></b>` : ''}
        ${stopped > 0 ? `<b style="flex:${stopped};background:var(--info);border-radius:12px"></b>` : ''}
       </div>
       <div class="row" style="gap:14px;flex-wrap:nowrap">
         ${running > 0 ? pill(`${running} running`, 'good', true) : ''}
         ${installing > 0 ? pill(`${installing} installing`, 'warn', true) : ''}
         ${stopped > 0 ? pill(`${stopped} stopped`, 'info', true) : ''}
       </div>`
    : emptyState('server', 'No services yet', 'Browse the catalog to start.',
        '<a class="btn s tint" href="/app/deploy" data-app-route="deploy">View catalog</a>');

  // Panel body builders
  const servicesBody = services.slice(0, 3).map((s) => {
    const st = serviceState(s);
    const rt = st.label;
    const tone = st.tone;
    const tag = isTerminated(s) ? 'div' : 'a';
    const attrs = isTerminated(s) ? 'class="li h"' : `class="li" href="/app/services/${esc(s.id)}" data-app-route="service-detail"`;
    return `<${tag} ${attrs}>${tile('server', tone)}<span class="tx"><b>${esc(s.plan_name || 'Hosting service')}</b><small>${esc(s.node_name || s.node_id || 'No node assigned')}</small></span>${pill(rt, tone)}</${tag}>`;
  }).join('') || emptyState('server', 'No services yet', 'Ordering stays unavailable until providers are verified.');

  const supportBody = tickets.slice(0, 3).map((t) => {
    const tone = TIX_TONE[t.status] || '';
    return `<button class="li" data-app-route-btn="support">${tile('support', tone)}<span class="tx"><b>${esc(t.subject)}</b><small>${esc(t.id)} · ${esc(formatDate(t.updated_at || t.created_at))}</small></span>${pill(niceName(t.status), tone)}</button>`;
  }).join('') || emptyState('support', 'No support conversations', 'Open a ticket when you need help.');

  const billingBody = invoices.slice(0, 3).map((r) => {
    const tone = r.status === 'PAID' ? 'good' : r.status === 'OPEN' ? 'info' : '';
    return `<div class="li h">${tile('document', '')}<span class="tx"><b>${esc(r.invoice_number || 'Draft invoice')}</b><small>${esc(formatDate(r.created_at))}</small></span><b class="num">${money(r.total_minor_units, r.currency)}</b>${pill(r.status, tone)}</div>`;
  }).join('') || emptyState('document', 'No billing records', 'Issued invoices appear here.');

  const activityBody = logs.slice(0, 4).map((l) =>
    `<div class="li h">${tile('shield', '')}<span class="tx"><b>${esc(String(l.action || '').replace(/\./g, ' · '))}</b><small>${esc(formatDate(l.created_at))}</small></span></div>`,
  ).join('') || emptyState('shield', 'No recent activity', 'Events appear as you use the account.');

  host.innerHTML = `
    ${failCount ? `<div style="margin-bottom:12px"><div class="alert warn">${hero('warning', 's')}<div><b>${failCount} dashboard source${failCount === 1 ? '' : 's'} unavailable</b><span>Available records are shown below.</span></div></div></div>` : ''}
    ${!providerOk ? `<div style="margin-bottom:12px"><div class="alert warn">${hero('warning', 's')}<div><b>Commerce configuration required</b><span>Ordering stays unavailable until payment and infrastructure providers pass verification.</span></div></div></div>` : ''}

    <div class="hd">
      <div class="tx">
        ${pill('Workspace overview', 'acc')}
        <h2>Your workspace, at a glance.</h2>
        <p>Services, billing, support and security activity from your account.</p>
      </div>
      <div class="row act" style="gap:8px">
        <a class="btn" href="/app/support/new" data-app-route="ticket-new"><svg class="ic s" aria-hidden="true"><use href="#i-message-01"/></svg>Open ticket</a>
        <a class="btn pri" href="/app/deploy" data-app-route="deploy"><svg class="ic s" aria-hidden="true"><use href="#i-add-01"/></svg>Deploy service</a>
      </div>
    </div>

    <div class="g g4 k2" style="margin-bottom:12px">
      ${metricCard('Active services', services.filter((s) => s.contract_status === 'ACTIVE').length, 'server', 'good')}
      ${metricCard('Total services', services.length, 'package', '')}
      ${metricCard('Open tickets', openTickets.length, 'message-01', openTickets.length ? 'warn' : '')}
      ${metricCard('Outstanding', money(outstandingTotal, currency), 'credit-card', outstandingTotal ? 'warn' : '')}
    </div>

    <div style="margin-bottom:12px">
      <section class="card" data-c="Fleet bar">
        <div class="ch"><div class="tx"><h3>Fleet</h3><p>Runtime state across your services</p></div></div>
        ${fleetBar}
      </section>
    </div>

    <div class="g g2">
      ${panel('My services', 'Provider-observed contract and runtime state.', servicesBody, '/app/services', 'View all')}
      ${panel('Support', 'Recent account conversations.', supportBody, '/app/support', 'View support')}
      ${panel('Billing', 'Latest issued account records.', billingBody, '/app/billing', 'View billing')}
      ${panel('Recent activity', 'Security-relevant account events.', activityBody, '/app/activity', 'View activity')}
    </div>`;

  // Bind support row buttons (tickets don't have per-ticket routes from home; route to list)
  host.querySelectorAll<HTMLButtonElement>('[data-app-route-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.appRouteBtn;
      if (target) window.history.pushState({}, '', `/app/${target}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  });
}
