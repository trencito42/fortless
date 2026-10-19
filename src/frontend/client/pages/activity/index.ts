/**
 * Customer Portal — Account Activity / Audit Log Page Module
 * Route: /app/activity
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { renderEmptyState, renderSkeleton, paginateItems, renderPager } from '../../../petal/index.js';

function metadata(item: any): Record<string, any> {
  try { return typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata || {}; } catch { return {}; }
}

function resourceContext(item: any): { label: string; href?: string } | null {
  if (item.resource_type === 'service' && item.service_name) {
    return { label: `${item.service_name}${item.service_plan && item.service_plan !== item.service_name ? ` · ${item.service_plan}` : ''}`, href: `/app/services/${encodeURIComponent(item.resource_id)}` };
  }
  if ((item.resource_type === 'ticket' || item.resource_type === 'ticket_attachment') && item.ticket_id) {
    return { label: item.ticket_subject ? `Ticket: ${item.ticket_subject}` : item.ticket_id, href: `/app/support/${encodeURIComponent(item.ticket_id)}` };
  }
  if (item.resource_type === 'order' && item.resource_id) return { label: `Order ${item.resource_id}` };
  return null;
}

function friendlyAction(item: any): { title: string; detail: string } {
  const action = String(item.action || '');
  const meta = metadata(item);
  const ip = item.ip_address ? ` · from ${item.ip_address}` : '';
  const service = item.resource_type === 'service' ? ' this service' : '';
  const exact: Record<string, [string, string]> = {
    'user.login': ['Signed in to Fortless', `A new account session was started${ip}.`],
    'user.logout': ['Signed out of Fortless', `The current account session was ended${ip}.`],
    'oidc.authorize': ['Signed in to the server panel with SSO', 'Fortless securely approved access to the hosting panel.'],
    'auth.passkey_authenticated': ['Signed in with a passkey', `A passkey was used to access the account${ip}.`],
    'auth.passkey_registered': ['Added a passkey', 'A new passkey was added to account security.'],
    'user.mfa_challenge_completed': ['Completed sign-in verification', `The extra security check was completed${ip}.`],
    'user.step_up_completed': ['Confirmed a sensitive action', 'Password and authenticator verification succeeded.'],
    'user.mfa_enabled': ['Turned on two-step verification', 'The account now requires an authenticator at sign-in.'],
    'user.mfa_disabled': ['Turned off two-step verification', 'Authenticator protection was removed from the account.'],
    'user.password_changed': ['Changed the account password', `Other signed-in devices were disconnected${ip}.`],
    'session.revoked': ['Signed out a device', 'One saved account session was removed.'],
    'session.others_revoked': ['Signed out other devices', `${Number(meta.revokedCount || 0)} other session${Number(meta.revokedCount || 0) === 1 ? '' : 's'} removed.`],
    'service.game.eula_accepted': ['Accepted the Minecraft EULA', 'Minecraft was approved to start and the server was restarted.'],
    'service.settings.reinstall': ['Started a server reinstall', 'Fortless sent the reinstall request to the hosting platform.'],
    'service.settings.reinstall_completed': ['Server reinstall finished', 'The fresh installation is ready to use.'],
    'service.created': ['Created a service', 'A new service was added to this account.'],
    'service.provisioned': ['Service became ready', 'The hosting platform finished preparing the service.'],
    'service.provider_missing': ['Server connection needs attention', 'Fortless could no longer find this server on the hosting platform.'],
    'ticket.created': ['Opened a support ticket', 'A new conversation with Fortless Support was started.'],
    'ticket.customer_replied': ['Replied to a support ticket', 'Your reply was added to the conversation.'],
    'ticket.staff_reply_added': ['Support replied to a ticket', 'A Fortless team member added a reply.'],
    'ticket.resolved': ['Marked a support ticket resolved', 'The support conversation was marked as solved.'],
    'billing.profile_updated': ['Updated billing details', 'The information used on invoices was changed.'],
    'order.paid': ['Payment confirmed', 'The order was paid successfully.'],
  };
  if (action === 'user.notification_preferences_updated') {
    const state = (value: unknown) => value === true ? 'on' : 'off';
    return { title: 'Updated email notifications', detail: `Billing ${state(meta.billingEmail)} · service ${state(meta.serviceEmail)} · support ${state(meta.supportEmail)}.` };
  }
  if (exact[action]) return { title: exact[action][0], detail: exact[action][1] };
  if (action === 'service.power') {
    const verb = String(meta.action || 'power command').toLowerCase();
    return { title: `${verb[0]?.toUpperCase() || ''}${verb.slice(1)} requested`, detail: `Fortless sent the ${verb} command to${service || ' the server'}.` };
  }
  if (action.startsWith('service.file.')) return { title: 'Changed server files', detail: `A file operation was completed${meta.path ? ` for ${meta.path}` : ''}.` };
  if (action.startsWith('service.backup.')) return { title: 'Changed server backups', detail: 'A backup action was completed.' };
  if (action.startsWith('service.database.')) return { title: 'Changed a server database', detail: 'A database setting or credential was updated.' };
  if (action.startsWith('service.network.')) return { title: 'Changed a server address', detail: 'A network address setting was updated.' };
  if (action.startsWith('service.schedule.')) return { title: 'Changed an automatic task', detail: 'A server schedule or task was updated.' };
  if (action.startsWith('service.startup.')) return { title: 'Changed startup settings', detail: 'A server startup option was updated.' };
  if (action.startsWith('service.member.')) return { title: 'Changed server access', detail: 'Sharing permissions for this server were updated.' };
  if (action.startsWith('team.')) return { title: 'Changed workspace members', detail: 'Team access to this workspace was updated.' };
  if (action.startsWith('ticket.')) return { title: 'Updated a support ticket', detail: 'The support conversation changed.' };
  if (/invoice|billing|payment|subscription|order|quote/.test(action)) return { title: 'Updated billing', detail: 'A billing or subscription record changed.' };
  if (action === 'service.console_token') return { title: 'Opened the server console', detail: 'A temporary secure console connection was created.' };
  if (action === 'panel_client_key.minted') return { title: 'Connected to the hosting panel', detail: 'Fortless created secure panel access for this account.' };
  const words = action.replaceAll(/[._-]+/g, ' ').trim();
  return { title: words ? words[0]!.toUpperCase() + words.slice(1) : 'Account updated', detail: 'An action was completed on this account.' };
}

function actionIcon(action: string): [string, string] {
  const a = String(action || '').toLowerCase();
  if (/password|recovery|key/.test(a)) return ['key-01', ''];
  if (/mfa|totp|otp|two.step|finger/.test(a)) return ['finger-print-scan', 'good'];
  if (/login|logout|session|auth/.test(a)) return ['lock', 'good'];
  if (/ticket|support|message/.test(a)) return ['message-01', 'info'];
  if (/provision|deploy|service|server/.test(a)) return ['rocket-01', 'violet'];
  if (/invoice|billing|payment|subscription|order/.test(a)) return ['invoice-01', 'warn'];
  return ['shield-01', ''];
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

function renderEventRow(item: any): string {
  const [icon, tone] = actionIcon(item.action);
  const friendly = friendlyAction(item);
  const time = item.created_at ? new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  const actor = item.actor_name || (item.actor_type === 'SYSTEM' ? 'Fortless' : 'You');
  const context = resourceContext(item);
  const contextHtml = context ? ` · ${context.href ? `<a class="lk" href="${esc(context.href)}" data-app-route>${esc(context.label)}</a>` : `<span>${esc(context.label)}</span>`}` : '';
  const meta = metadata(item);
  const codePayload = {
    action: item.action,
    actor: actor,
    actor_id: item.actor_user_id || item.actor_type,
    ip_address: item.ip_address || '—',
    correlation_id: item.correlation_id || '—',
    resource_type: item.resource_type || null,
    resource_id: item.resource_id || null,
    timestamp: item.created_at,
    ...meta,
  };

  return `<div class="z-aur" data-event-id="${esc(item.id || '')}">
    <button type="button" class="z-aut" aria-expanded="false">
      <span class="tile ${tone} sm"><svg class="ic s" aria-hidden="true"><use href="/assets/petal-icons.svg#i-${icon}"/></svg></span>
      <span class="tx">
        <b>${esc(friendly.title)}</b>
        <small>${esc(friendly.detail)}${contextHtml} · ${esc(actor)}</small>
      </span>
      <span class="t">${esc(time)}</span>
      <svg class="ic s chv" aria-hidden="true"><use href="/assets/petal-icons.svg#i-arrow-right-01"/></svg>
    </button>
    <div class="z-aud">
      <code class="code">${esc(JSON.stringify(codePayload, null, 2))}</code>
    </div>
  </div>`;
}

let auditLogs: any[] = [];
let auditPage = 1;
const auditPageSize = 10;
let listenersBound = false;

export async function renderActivity(): Promise<void> {
  const host = document.getElementById('auditList');
  if (!host) return;

  host.innerHTML = renderSkeleton('list', 'Loading audit events');

  try {
    const { logs } = await api<{ logs: any[] }>('/api/v1/audit');
    auditLogs = logs || [];
    auditPage = 1;
    filterActivity();
    bindActivityListeners();
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
  const range = document.querySelector<HTMLInputElement>('input[name="auditRange"]:checked')?.value || 'ALL';

  const now = Date.now();
  const maxAgeMs = range === '1' ? 24 * 3600 * 1000 : range === '7' ? 7 * 24 * 3600 * 1000 : range === '30' ? 30 * 24 * 3600 * 1000 : Infinity;

  const logs = auditLogs.filter((item) => {
    // Time range filter
    if (maxAgeMs !== Infinity && item.created_at) {
      const age = now - new Date(item.created_at).getTime();
      if (age > maxAgeMs) return false;
    }

    // Type filter
    const action = String(item.action || '').toUpperCase();
    const matchesType = type === 'ALL' || (type === 'AUTH' ? /LOGIN|LOGOUT|SESSION|PASSWORD|MFA|EMAIL|OIDC|PASSKEY|STEP_UP/.test(action) : type === 'SUPPORT' ? /TICKET|SUPPORT/.test(action) : /BILL|INVOICE|PAYMENT|SUBSCRIPTION|ORDER|QUOTE/.test(action));
    if (!matchesType) return false;

    // Search query
    const friendly = friendlyAction(item);
    const context = resourceContext(item);
    return !query || [item.actor_name, item.actor_type, item.action, item.resource_type, item.resource_id, item.correlation_id, item.service_name, item.service_plan, item.ticket_subject, context?.label, friendly.title, friendly.detail].some(
      (value) => String(value || '').toLowerCase().includes(query)
    );
  });

  const count = document.getElementById('auditResultCount');
  if (count) count.textContent = `${logs.length} of ${auditLogs.length} events`;

  const infoEl = document.getElementById('auditPageInfo');
  const pagerEl = document.getElementById('auditPager');

  if (!logs.length) {
    host.innerHTML = renderEmptyState({
      icon: 'history',
      title: 'No recent activity',
      message: auditLogs.length ? 'No events matched your search or filters.' : 'Events appear as you use the account.',
    });
    if (infoEl) infoEl.textContent = '0 events';
    if (pagerEl) pagerEl.innerHTML = '';
    return;
  }

  const pagination = paginateItems(logs, auditPage, auditPageSize);
  auditPage = pagination.page;

  if (infoEl) infoEl.textContent = pagination.info;
  if (pagerEl) pagerEl.innerHTML = renderPager(pagination.page, pagination.pages);

  // Group current page items by day
  const groups = new Map<string, any[]>();
  for (const item of pagination.items) {
    const label = item.created_at ? dayLabel(item.created_at) : 'Unknown';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }

  host.innerHTML = Array.from(groups.entries())
    .map(([day, items]) => `<div class="dh" style="font-size:12px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:0.04em;padding:10px 4px 6px">${esc(day)}</div>${items.map(renderEventRow).join('')}`)
    .join('');
}

function bindActivityListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  const section = document.getElementById('section-audit');
  if (!section) return;

  // Toggle Petal drawer on .z-aut click
  section.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const toggleBtn = target.closest<HTMLButtonElement>('.z-aut');
    if (toggleBtn) {
      const row = toggleBtn.closest<HTMLElement>('.z-aur');
      if (row) {
        row.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', String(row.classList.contains('open')));
      }
      return;
    }

    // Pager page button clicks
    const pageBtn = target.closest<HTMLButtonElement>('#auditPager button[data-pg]');
    if (pageBtn && !pageBtn.disabled) {
      const newPage = Number(pageBtn.dataset.pg);
      if (newPage && newPage !== auditPage) {
        auditPage = newPage;
        filterActivity();
        const card = section.querySelector('.card');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    // Refresh activity button
    if (target.closest('#refreshAuditBtn')) {
      void renderActivity();
    }
  });

  // Reset page to 1 when search or filters change
  const search = document.getElementById('auditSearch');
  if (search) {
    search.addEventListener('input', () => {
      auditPage = 1;
      filterActivity();
    });
  }

  section.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'auditType' || target.name === 'auditRange') {
      auditPage = 1;
      filterActivity();
    }
  });
}
