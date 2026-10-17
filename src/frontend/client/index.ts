/**
 * Customer Portal — Main Entrypoint
 * Bundles to public/assets/app-ui.js
 */

import { Router, RouteMatch } from '../core/router/router.js';
import { CLIENT_ROUTES } from '../core/router/routes.js';
import { api } from '../core/api/client.js';
import { toast } from '../petal/index.js';
import { AppShell } from './shell/app-shell.js';

// Feature Pages
import { renderHome } from './pages/home/index.js';
import { renderServices, powerService } from './pages/dashboard/index.js';
import { renderServiceDetail } from './pages/services/index.js';
import { renderDeploy, deployState, updateSummary, beginCheckout } from './pages/deploy/index.js';
import { renderDomains } from './pages/domains/index.js';
import { renderBilling, cancelSubscription } from './pages/billing/index.js';
import {
  renderTickets,
  renderNewTicket,
  renderTicketDetail,
  sendReply,
  createTicket,
  filterTickets,
  updateFileLabel,
} from './pages/support/index.js';
import { renderActivity, filterActivity } from './pages/activity/index.js';
import {
  renderSettings,
  loadMfa,
  showMfaPasswordStep,
  beginMfaEnrollment,
  showMfaCodeStep,
  confirmMfaEnrollment,
  showMfaDisableStep,
  disableMfa,
  revokeDevice,
  revokeOtherSessions,
  loadSessions,
  loadTeamMembers,
  restoreMfaScanStep,
} from './pages/settings/index.js';
import { installRichTextEditors } from '../petal/index.js';

const appShell = new AppShell();

function updateNavigationChrome(routeName: string) {
  const titles: Record<string, [string, string]> = {
    dashboard: ['Dashboard', 'Workspace, infrastructure, billing and support at a glance.'],
    services: ['Servers & Instances', 'Actual service records and provider-observed runtime state for this account.'],
    'service-detail': ['Service Detail', 'Detailed configuration, provider allocation, and operational logs.'],
    deploy: ['Configure a service', 'Catalog preview; ordering remains disabled until payment and infrastructure providers are verified.'],
    domains: ['Domains & DNS', 'Authoritative domain zones, registrar search, and RFC compliant DNS records.'],
    billing: ['Billing', 'Draft and issued documents recorded for this account.'],
    tickets: ['Support', 'Open and review account-scoped support conversations.'],
    'ticket-new': ['Open support ticket', 'Start an account-scoped support conversation.'],
    'ticket-detail': ['Support conversation', 'Review the full thread and send a secure reply.'],
    audit: ['Activity', 'Account-scoped audit events recorded by the current implementation.'],
    settings: ['Account & security', 'Identity, tenant and implementation status.'],
  };

  const titleEntry = titles[routeName] ?? titles.dashboard!;
  const viewTitle = document.getElementById('viewTitle');
  const viewSubtitle = document.getElementById('viewSubtitle');
  if (viewTitle) viewTitle.textContent = titleEntry[0];
  if (viewSubtitle) viewSubtitle.textContent = titleEntry[1];

  const catalogAction = document.querySelector<HTMLElement>('.app-top-actions .btn');
  if (catalogAction) {
    catalogAction.hidden = routeName === 'deploy' || routeName === 'service-detail';
  }

  // Show only current section
  const sectionKeys = ['dashboard', 'services', 'service-detail', 'deploy', 'domains', 'billing', 'tickets', 'ticket-new', 'ticket-detail', 'audit', 'settings'];
  sectionKeys.forEach((key) => {
    const section = document.getElementById(`section-${key}`);
    if (section) section.style.display = key === routeName ? 'block' : 'none';
  });
}

const router = new Router(CLIENT_ROUTES);

// Register Route Handlers
router.register('dashboard', async () => {
  updateNavigationChrome('dashboard');
  await renderHome();
});

router.register('services', async () => {
  updateNavigationChrome('services');
  await renderServices();
});

router.register('service-detail', async (ctx: RouteMatch) => {
  updateNavigationChrome('service-detail');
  const id = ctx.params.id;
  if (id) await renderServiceDetail(id);
});

router.register('deploy', async () => {
  updateNavigationChrome('deploy');
  await renderDeploy();
});

router.register('domains', async () => {
  updateNavigationChrome('domains');
  await renderDomains();
});

router.register('billing', async () => {
  updateNavigationChrome('billing');
  await renderBilling();
});

router.register('tickets', async () => {
  updateNavigationChrome('tickets');
  await renderTickets();
});

router.register('ticket-new', async () => {
  updateNavigationChrome('ticket-new');
  renderNewTicket();
});

router.register('ticket-detail', async (ctx: RouteMatch) => {
  updateNavigationChrome('ticket-detail');
  if (ctx.params.id) await renderTicketDetail(ctx.params.id);
});

router.register('audit', async () => {
  updateNavigationChrome('audit');
  await renderActivity();
});

router.register('settings', async () => {
  updateNavigationChrome('settings');
  await renderSettings();
});

function bindDelegatedEvents() {
  document.getElementById('refreshServersBtn')?.addEventListener('click', renderServices);
  document.getElementById('refreshInvoicesBtn')?.addEventListener('click', renderBilling);
  document.getElementById('refreshAuditBtn')?.addEventListener('click', renderActivity);
  document.getElementById('doDeployBtn')?.addEventListener('click', beginCheckout);

  document.getElementById('revokeOtherSessionsBtn')?.addEventListener('click', revokeOtherSessions);

  // Theme & Logout
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => appShell.toggleTheme());
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
      await api('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  });

  // Global Document Clicks
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    if (target.closest('#mobileMoreBtn')) {
      const sheet = document.getElementById('mobileNavSheet');
      const trigger = document.getElementById('mobileMoreBtn');
      if (sheet) sheet.hidden = false;
      trigger?.setAttribute('aria-expanded', 'true');
      return;
    }
    if (target.closest('[data-close-mobile-nav]') || target.id === 'mobileNavSheet') {
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet) sheet.hidden = true;
      document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (target.closest('#mobileThemeBtn')) {
      appShell.toggleTheme();
      return;
    }

    // Search trigger
    if (target.closest('#globalSearchTrigger, [data-cmd]')) {
      appShell.cmd.open();
      return;
    }

    // App Navigation links
    const routeLink = target.closest<HTMLElement>('[data-app-route]');
    if (routeLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      const href = routeLink.getAttribute('href') || '/app';
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet) sheet.hidden = true;
      document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'false');
      router.navigate(href);
      return;
    }

    // Service Detail Tabs
    const detailTab = target.closest<HTMLElement>('[data-detail-tab]');
    if (detailTab) {
      const tabKey = detailTab.dataset.detailTab || '';
      document.querySelectorAll<HTMLElement>('[data-detail-tab]').forEach((btn) => {
        const isCurrent = btn === detailTab;
        btn.style.borderBottom = isCurrent ? '2px solid var(--accent)' : '2px solid transparent';
        btn.style.color = isCurrent ? 'var(--ink)' : 'var(--ink2)';
      });
      document.querySelectorAll<HTMLElement>('.detail-pane').forEach((p) => (p.style.display = 'none'));
      const activePane = document.getElementById(`detailTab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
      if (activePane) activePane.style.display = 'block';
      return;
    }

    // Notification Popover
    const notifBell = target.closest('#notifBellBtn');
    if (notifBell) {
      const popover = document.getElementById('notifPopover');
      if (popover) {
        const isClosed = popover.style.display === 'none' || !popover.style.display;
        popover.style.display = isClosed ? 'block' : 'none';
        if (isClosed) appShell.loadNotifications();
      }
      return;
    }

    const markAllNotifs = target.closest('#markAllNotifsReadBtn');
    if (markAllNotifs) {
      api('/api/v1/notifications/read-all', { method: 'POST' }).then(() => appShell.loadNotifications());
      return;
    }

    // Subscriptions
    const cancelSub = target.closest<HTMLButtonElement>('[data-cancel-sub]');
    if (cancelSub) {
      cancelSubscription(cancelSub.dataset.cancelSub!, cancelSub);
      return;
    }

    // Power actions
    const power = target.closest<HTMLButtonElement>('[data-power]');
    if (power) {
      powerService(power.dataset.service!, power.dataset.power!, power);
      return;
    }

    // Plan selection
    const plan = target.closest<HTMLElement>('[data-plan-id]');
    if (plan) {
      deployState.selectedPlanId = plan.dataset.planId!;
      document
        .querySelectorAll('[data-plan-id]')
        .forEach((item) => item.setAttribute('aria-pressed', String(item === plan)));
      updateSummary();
      return;
    }

    // Region selection
    const region = target.closest<HTMLButtonElement>('[data-region-id]');
    if (region && !region.disabled) {
      deployState.selectedRegionId = region.dataset.regionId!;
      document
        .querySelectorAll('[data-region-id]')
        .forEach((item) => item.setAttribute('aria-pressed', String(item === region)));
      updateSummary();
      return;
    }

    // Coupon validation
    const applyCoupon = target.closest<HTMLButtonElement>('#applyCouponBtn');
    if (applyCoupon) {
      const input = document.getElementById('couponInput') as HTMLInputElement | null;
      const code = input ? input.value.trim() : '';
      if (!code) {
        deployState.activeCoupon = null;
        updateSummary();
        return;
      }
      applyCoupon.disabled = true;
      applyCoupon.textContent = '…';
      const selectedPlan = deployState.plans.find((item) => item.planVersionId === deployState.selectedPlanId);
      const subtotal = selectedPlan ? selectedPlan.prices[0]?.priceMinorUnits || 0 : 0;

      api<{ coupon: { code: string }; discountMinorUnits: number }>('/api/v1/catalog/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalMinorUnits: subtotal }),
      })
        .then((res) => {
          deployState.activeCoupon = { code: res.coupon.code, discountMinorUnits: res.discountMinorUnits };
          toast(`Coupon ${res.coupon.code} applied!`, 'good');
          updateSummary();
        })
        .catch((err) => toast(err.message, 'bad'))
        .finally(() => {
          applyCoupon.disabled = false;
          applyCoupon.textContent = 'Apply';
        });
      return;
    }

    // Audit expand
    const auditRow = target.closest<HTMLElement>('.z-aut');
    if (auditRow) {
      const row = auditRow.closest<HTMLElement>('.z-aur');
      if (row) {
        const open = row.classList.toggle('open');
        auditRow.setAttribute('aria-expanded', String(open));
      }
      return;
    }

    // Session Revoke
    const session = target.closest<HTMLButtonElement>('[data-revoke-session]');
    if (session) {
      revokeDevice(session.dataset.revokeSession!, session);
      return;
    }

    // MFA steps
    if (target.closest('[data-mfa-enable]')) showMfaPasswordStep();
    if (target.closest('[data-mfa-disable]')) showMfaDisableStep();
    if (target.closest('[data-mfa-next]')) showMfaCodeStep();
    if (target.closest('[data-mfa-back]')) restoreMfaScanStep();
    if (target.closest('[data-mfa-cancel], [data-mfa-done]')) loadMfa();

    // Clipboard copies
    const copySecret = target.closest<HTMLElement>('[data-copy-secret]');
    if (copySecret) {
      navigator.clipboard.writeText(copySecret.dataset.copySecret!).then(() => toast('Setup key copied.', 'good'));
    }
    const copyRecovery = target.closest<HTMLElement>('[data-copy-recovery]');
    if (copyRecovery) {
      navigator.clipboard
        .writeText(copyRecovery.dataset.copyRecovery!)
        .then(() => toast('Recovery codes copied.', 'good'));
    }

    if (target.closest('#openInviteModalBtn')) {
      const m = document.getElementById('inviteMemberModal');
      if (m) m.hidden = false;
    }
    if (target.closest('[data-close-invite]')) {
      const m = document.getElementById('inviteMemberModal');
      if (m) m.hidden = true;
    }

    // Revoke team member
    const revokeMember = target.closest<HTMLButtonElement>('[data-revoke-member]');
    if (revokeMember) {
      const membershipId = revokeMember.dataset.revokeMember!;
      if (confirm('Are you sure you want to remove this team member?')) {
        revokeMember.disabled = true;
        api(`/api/v1/account/members/${encodeURIComponent(membershipId)}`, { method: 'DELETE' })
          .then(() => {
            toast('Team member removed.', 'good');
            loadTeamMembers();
          })
          .catch((err) => {
            revokeMember.disabled = false;
            toast(err.message, 'bad');
          });
      }
    }
  });

  // Global Submit Handler
  document.addEventListener('submit', (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.id === 'createTicketPageForm') {
      createTicket(event, (path) => router.navigate(path));
      return;
    }
    if (target.id === 'ticketReplyForm') {
      sendReply(event);
      return;
    }
    if (target.matches('[data-mfa-enroll-form]')) {
      event.preventDefault();
      beginMfaEnrollment(target as HTMLFormElement);
    }
    if (target.matches('[data-mfa-confirm-form]')) {
      event.preventDefault();
      confirmMfaEnrollment(target as HTMLFormElement);
    }
    if (target.matches('[data-mfa-disable-form]')) {
      event.preventDefault();
      disableMfa(target as HTMLFormElement);
    }
    if (target.id === 'inviteMemberForm') {
      event.preventDefault();
      const form = target as HTMLFormElement;
      const email = (document.getElementById('inviteEmail') as HTMLInputElement).value;
      const role = (document.getElementById('inviteRole') as HTMLSelectElement).value;
      const btn = document.getElementById('sendInviteBtn') as HTMLButtonElement;
      btn.disabled = true;
      api('/api/v1/account/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
        .then(() => {
          toast('Invitation sent.', 'good');
          const m = document.getElementById('inviteMemberModal');
          if (m) m.hidden = true;
          form.reset();
          loadTeamMembers();
        })
        .catch((err) => toast(err.message, 'bad'))
        .finally(() => {
          btn.disabled = false;
        });
    }
    if (target.id === 'changePasswordForm') {
      event.preventDefault();
      const form = target as HTMLFormElement;
      const curPass = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
      const newPass = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
      const btn = form.querySelector<HTMLButtonElement>('[type=submit]');
      if (btn) btn.disabled = true;
      api<{ message?: string }>('/api/v1/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
      })
        .then((res) => {
          toast(res.message || 'Password updated. Other sessions revoked.', 'good');
          form.reset();
          loadSessions();
        })
        .catch((err) => toast(err.message, 'bad'))
        .finally(() => {
          if (btn) btn.disabled = false;
        });
    }
  });

  // Global Input Handler (for search / MFA digits)
  document.addEventListener('input', (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.id === 'auditSearch') {
      filterActivity();
      return;
    }
    if (target.id === 'ticketSearch') {
      filterTickets();
      return;
    }
    if (target.id === 'newTicketFileInput' || target.id === 'ticketReplyFileInput') {
      updateFileLabel(target);
      return;
    }
    if (target.matches('[data-mfa-digit]')) {
      target.value = target.value.replace(/\D/g, '').slice(-1);
      if (target.value) {
        const next = target.nextElementSibling as HTMLInputElement | null;
        if (next) next.focus();
      }
    }
  });

  // Global Escape & Modal Close Keybinding
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet && !sheet.hidden) {
        sheet.hidden = true;
        document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'false');
        document.getElementById('mobileMoreBtn')?.focus();
      }
    }
  });

  document.addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.id === 'newTicketFileInput' || target.id === 'ticketReplyFileInput') updateFileLabel(target);
    if (target.name === 'ticketStatus') filterTickets();
  });
}

// Bootstrap Client Portal
async function init() {
  appShell.init();
  installRichTextEditors(document);
  bindDelegatedEvents();

  // Support legacy hash-based route migration
  const legacyRoute = window.location.hash.slice(1);
  if (legacyRoute) {
    const routePaths: Record<string, string> = {
      servers: '/app/services',
      deploy: '/app/deploy',
      billing: '/app/billing',
      tickets: '/app/support',
      audit: '/app/activity',
      settings: '/app/settings',
    };
    if (routePaths[legacyRoute]) {
      history.replaceState({ route: legacyRoute }, '', routePaths[legacyRoute]);
    }
  }

  try {
    await appShell.loadSession();
    await appShell.loadCapabilities();
    appShell.loadNotifications();
    router.init();
  } catch (error: any) {
    if (error.message !== 'Session expired') {
      toast(error.message, 'bad');
    }
  }
}

// Auto-run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
