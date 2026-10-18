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
import { renderServices, powerService, filterServices } from './pages/dashboard/index.js';
import { renderServiceDetail } from './pages/services/index.js';
import { renderDeploy, deployState, updateSummary, beginCheckout } from './pages/deploy/index.js';
import { renderDomains } from './pages/domains/index.js';
import {
  renderBilling,
  filterBilling,
  openCancelSubModal,
  closeCancelSubModal,
  executeScheduledCancel,
} from './pages/billing/index.js';
import {
  renderTickets,
  renderNewTicket,
  renderTicketDetail,
  sendReply,
  createTicket,
  filterTickets,
  updateFileLabel,
  openTicketModal,
  closeTicketModal,
  submitModalTicket,
  resolveTicketAction,
} from './pages/support/index.js';
import { renderActivity, filterActivity } from './pages/activity/index.js';
import {
  renderSettings,
  openMfaSetupModal,
  closeMfaSetupModal,
  handleMfaPasswordSubmit,
  verifyMfaSetup,
  openMfaDisableModal,
  closeMfaDisableModal,
  handleDisableMfaSubmit,
  handleRegenerateRecoveryCodes,
  copyLastRecoveryCodes,
  revokeDevice,
  revokeOtherSessions,
  loadSessions,
  loadTeamMembers,
  registerPasskey,
  handleRemovePasskey,
} from './pages/settings/index.js';
import { installCustomSelects, installRichTextEditors } from '../petal/index.js';

const appShell = new AppShell();

async function copyText(value: string, label = 'value'): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const fallback = document.createElement('textarea');
      fallback.value = value;
      fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(fallback);
      fallback.select();
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
      fallback.remove();
    }
    toast(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied.`, 'good');
  } catch {
    toast('Could not copy automatically.', 'warn');
  }
}

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

  // Sync sidebar active link
  document.querySelectorAll<HTMLElement>('.sd .nv').forEach((link) => {
    const route = link.dataset.appRoute;
    const isMatch = route === routeName || (routeName === 'service-detail' && route === 'services') || (routeName.startsWith('ticket') && route === 'tickets');
    link.classList.toggle('on', isMatch);
    if (isMatch) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  // Sync mobile tabbar active link
  document.querySelectorAll<HTMLElement>('.tabbar a, .tabbar button').forEach((item) => {
    const route = item.dataset.appRoute;
    const isMatch = route === routeName || (routeName === 'service-detail' && route === 'services') || (routeName.startsWith('ticket') && route === 'tickets');
    item.classList.toggle('on', isMatch);
  });

  // Show only current section
  const sectionKeys = ['dashboard', 'services', 'service-detail', 'deploy', 'domains', 'billing', 'tickets', 'ticket-new', 'ticket-detail', 'audit', 'settings'];
  sectionKeys.forEach((key) => {
    const section = document.getElementById(`section-${key}`);
    if (section) section.style.display = key === routeName ? 'block' : 'none';
  });

  // Always reset scroll to top so headers never hide behind sticky topbar
  const mn = document.getElementById('mn');
  if (mn) mn.scrollTop = 0;
  window.scrollTo(0, 0);
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
  if (id) await renderServiceDetail(id, ctx.params.tab);
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

router.register('settings', async (ctx: RouteMatch) => {
  updateNavigationChrome('settings');
  await renderSettings(ctx.params.tab);
});

function bindDelegatedEvents() {
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
    if (target.closest('#mobileLogoutBtn')) {
      try {
        api('/api/v1/auth/logout', { method: 'POST' }).finally(() => {
          window.location.href = '/login';
        });
      } catch {
        window.location.href = '/login';
      }
      return;
    }

    // Command palette close
    if (target.matches('#cmd .ov, #cmd [data-close], [data-close]')) {
      appShell.cmd.close();
      const notifM = document.getElementById('notifModal');
      if (notifM) notifM.hidden = true;
      const navS = document.getElementById('mobileNavSheet');
      if (navS) navS.hidden = true;
      return;
    }

    // Search trigger (Ctrl+K or Top Bar Search Button)
    if (target.closest('[data-modal="cmd"], #quickSearchBtn, .sch, .srch, #globalSearchTrigger, #mobileSearchTrigger, [data-cmd]')) {
      appShell.cmd.open();
      return;
    }

    // Segmented controls handling
    const segBtn = target.closest<HTMLButtonElement>('.seg button');
    if (segBtn) {
      const segGroup = segBtn.closest<HTMLElement>('.seg');
      if (segGroup) {
        segGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === segBtn)));
        const val = segBtn.dataset.v;
        const radio = segBtn.parentElement?.querySelector<HTMLInputElement>('input[type="radio"]') || segGroup.querySelector<HTMLInputElement>(`input[value="${val}"]`);
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (segGroup.getAttribute('aria-label')?.includes('service state')) filterServices();
        if (segGroup.getAttribute('aria-label')?.includes('invoice status')) filterBilling();
        if (segGroup.getAttribute('aria-label')?.includes('ticket status')) filterTickets();
        if (segGroup.getAttribute('aria-label')?.includes('activity type')) filterActivity();
      }
      return;
    }

    // Service detail tabs
    const detailTab = target.closest<HTMLButtonElement>('#serviceDetailTabs button');
    if (detailTab) {
      document.querySelectorAll<HTMLButtonElement>('#serviceDetailTabs button').forEach((b) => {
        const isSel = b === detailTab;
        b.setAttribute('aria-selected', String(isSel));
        b.tabIndex = isSel ? 0 : -1;
      });
      const controls = detailTab.getAttribute('aria-controls');
      ['dtlPaneOverview', 'dtlPaneAllocation', 'dtlPaneActivity'].forEach((pId) => {
        const panel = document.getElementById(pId);
        if (panel) {
          const isMatch = pId === controls;
          panel.hidden = !isMatch;
          panel.classList.toggle('on', isMatch);
        }
      });
      return;
    }

    // Settings tabs
    const settingsTab = target.closest<HTMLButtonElement>('#settingsTabs button');
    if (settingsTab) {
      document.querySelectorAll<HTMLButtonElement>('#settingsTabs button').forEach((b) => {
        const isSel = b === settingsTab;
        b.setAttribute('aria-selected', String(isSel));
        b.tabIndex = isSel ? 0 : -1;
      });
      const controls = settingsTab.getAttribute('aria-controls');
      ['settings-p', 'settings-s', 'settings-t', 'settings-n', 'settings-d'].forEach((pId) => {
        const panel = document.getElementById(pId);
        if (panel) {
          const isMatch = pId === controls;
          panel.hidden = !isMatch;
          panel.classList.toggle('on', isMatch);
        }
      });
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

    // Notification Modal
    const notifBell = target.closest('[data-modal="notif"], #notifBellBtn');
    if (notifBell) {
      const modal = document.getElementById('notifModal');
      if (modal) {
        modal.hidden = false;
        appShell.loadNotifications();
      }
      return;
    }

    if (target.matches('#notifModal .ov, [data-close-notif]')) {
      const modal = document.getElementById('notifModal');
      if (modal) modal.hidden = true;
      return;
    }

    // Mobile More sheet trigger
    const moreBtn = target.closest('[data-modal="more"], #mobileMoreBtn');
    if (moreBtn) {
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet) {
        sheet.hidden = !sheet.hidden;
        moreBtn.setAttribute('aria-expanded', String(!sheet.hidden));
      }
      return;
    }

    if (target.matches('#mobileNavSheet .ov, [data-close-mobile-nav]')) {
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet) sheet.hidden = true;
      document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'false');
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
      openCancelSubModal(cancelSub.dataset.cancelSub!, cancelSub.dataset.subName, cancelSub.dataset.renewalDate);
      return;
    }
    if (target.closest('#confirmCancelSubBtn')) {
      executeScheduledCancel();
      return;
    }
    if (target.closest('[data-close-cancel-sub], #cancelSubModal .ov')) {
      closeCancelSubModal();
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

    // Support ticket modal
    if (target.closest('#openTicketModalBtn, #emptyOpenTicketBtn')) {
      openTicketModal();
      return;
    }
    if (target.closest('[data-close-ticket], #ticketModal .ov')) {
      closeTicketModal();
      return;
    }
    const resolveBtn = target.closest<HTMLButtonElement>('#markTicketResolvedBtn');
    if (resolveBtn && resolveBtn.dataset.ticketId) {
      resolveTicketAction(resolveBtn.dataset.ticketId);
      return;
    }

    // MFA triggers & Modals
    if (target.closest('#setupNewMfaBtn')) {
      openMfaSetupModal();
      return;
    }
    if (target.closest('#regenerateMfaCodesBtn')) {
      handleRegenerateRecoveryCodes();
      return;
    }
    if (target.closest('[data-close-mfa], #mfaSetupModal .ov')) {
      closeMfaSetupModal();
      return;
    }
    if (target.closest('#verifyMfaBtn')) {
      verifyMfaSetup();
      return;
    }
    if (target.closest('[data-close-rec], #mfaRecoveryCodesModal .ov')) {
      const recModal = document.getElementById('mfaRecoveryCodesModal');
      if (recModal) recModal.hidden = true;
      return;
    }
    if (target.closest('#copyRecoveryCodesBtn')) {
      copyLastRecoveryCodes();
      return;
    }
    if (target.closest('[data-close-disable-mfa], #mfaDisableModal .ov')) {
      closeMfaDisableModal();
      return;
    }
    const mfaSwitch = target.closest<HTMLElement>('#mfaToggleSwitch');
    if (mfaSwitch) {
      const isEnabled = mfaSwitch.getAttribute('aria-checked') === 'true';
      if (isEnabled) {
        openMfaDisableModal();
      } else {
        openMfaSetupModal();
      }
      return;
    }

    // Clipboard copies
    const copySecret = target.closest<HTMLElement>('[data-copy-secret]');
    if (copySecret) {
      copyText(copySecret.dataset.copySecret!, 'setup key');
      return;
    }
    const copyRecovery = target.closest<HTMLElement>('[data-copy-recovery]');
    if (copyRecovery) {
      copyText(copyRecovery.dataset.copyRecovery!, 'recovery codes');
      return;
    }
    const copy = target.closest<HTMLElement>('[data-copy]');
    if (copy) {
      copyText(copy.dataset.copy || '', copy.dataset.copyLabel || 'value');
      return;
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
      return;
    }

    // Add passkey button
    const addPasskeyBtn = target.closest<HTMLButtonElement>('#addPasskeyBtn');
    if (addPasskeyBtn) {
      registerPasskey();
      return;
    }

    // Remove passkey button
    const removePasskey = target.closest<HTMLButtonElement>('[data-remove-passkey]');
    if (removePasskey) {
      handleRemovePasskey(removePasskey.dataset.removePasskey!);
      return;
    }
  });

  // Global Submit Handler
  document.addEventListener('submit', (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.id === 'createTicketPageForm') {
      createTicket(event, (path) => router.navigate(path));
      return;
    }
    if (target.id === 'newTicketModalForm') {
      submitModalTicket(event, (path) => router.navigate(path));
      return;
    }
    if (target.id === 'ticketReplyForm') {
      sendReply(event);
      return;
    }
    if (target.id === 'mfaPasswordConfirmForm') {
      handleMfaPasswordSubmit(event);
      return;
    }
    if (target.id === 'disableMfaForm') {
      handleDisableMfaSubmit(event);
      return;
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
    if (target.id === 'invoiceSearch') {
      filterBilling();
      return;
    }
    if (target.id === 'serviceSearch') {
      filterServices();
      return;
    }
    if (target.id === 'newTicketFileInput' || target.id === 'ticketReplyFileInput') {
      updateFileLabel(target);
      return;
    }
    const o = target.closest<HTMLElement>('[data-otp]');
    if (o && target.tagName === 'INPUT') {
      target.value = target.value.replace(/\D/g, '').slice(-1);
      if (target.value) {
        const next = target.nextElementSibling as HTMLInputElement | null;
        if (next) next.focus();
      }
      o.classList.remove('bad');
    }
  });

  // Global Paste Handler for OTP
  document.addEventListener('paste', (event: ClipboardEvent) => {
    const target = event.target as HTMLElement;
    const o = target.closest<HTMLElement>('[data-otp]');
    if (!o) return;
    const d = (event.clipboardData || (window as any).clipboardData)?.getData('text').replace(/\D/g, '').slice(0, 6) || '';
    if (!d) return;
    event.preventDefault();
    const inputs = Array.from(o.querySelectorAll('input'));
    inputs.forEach((inp, idx) => {
      inp.value = d[idx] || '';
    });
    const last = inputs[Math.min(d.length, 5)];
    last?.focus();
    o.classList.remove('bad');
  });

  // Global Keydown Handler
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      const sheet = document.getElementById('mobileNavSheet');
      if (sheet && !sheet.hidden) {
        sheet.hidden = true;
        document.getElementById('mobileMoreBtn')?.setAttribute('aria-expanded', 'false');
        document.getElementById('mobileMoreBtn')?.focus();
      }
      closeTicketModal();
      closeCancelSubModal();
      closeMfaSetupModal();
      closeMfaDisableModal();
      const recModal = document.getElementById('mfaRecoveryCodesModal');
      if (recModal) recModal.hidden = true;
    }

    if (event.key === 'Backspace') {
      const target = event.target as HTMLElement;
      const o = target.closest<HTMLElement>('[data-otp]');
      const inp = target as HTMLInputElement;
      if (o && inp && !inp.value && inp.previousElementSibling) {
        (inp.previousElementSibling as HTMLInputElement).focus();
      }
    }
  });

  document.addEventListener('change', (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.id === 'newTicketFileInput' || target.id === 'ticketReplyFileInput') updateFileLabel(target);
    if (target.name === 'ticketStatus') filterTickets();
    if (target.name === 'invoiceStatus') filterBilling();
    if (target.name === 'auditType') filterActivity();
    if (target.name === 'serviceState' || target.id === 'serviceTypeFilter') filterServices();
  });
}

// Bootstrap Client Portal
async function init() {
  appShell.init();
  installRichTextEditors(document);
  installCustomSelects(document);
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
