/**
 * Customer Portal — Application Shell Module
 * Manages Topbar, Navigation, User Identity, Responsive Rules, and Petal Chrome.
 */

import { api } from '../../core/api/client.js';
import { esc } from '../../core/utils/dom.js';
import { formatDate } from '../../core/utils/dates.js';
import { hero, CommandPaletteController, initModalStacker } from '../../petal/index.js';
import { sessionStore } from '../../core/state/session.js';
import { capabilitiesStore } from '../../core/state/capabilities.js';

export class AppShell {
  public cmd: CommandPaletteController;

  constructor() {
    this.cmd = new CommandPaletteController('cmd', 'cmd-in', 'cmd-res');
  }

  public init(): void {
    initModalStacker();
    this.initTheme();
    this.installHeroicons();
    this.installResponsiveComposition();
    this.rewriteTruthfulCopy();
    this.cmd.bindKeyboard();
  }

  public syncDkAttribute(): void {
    const isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-dk', isDark ? '1' : '0');
  }

  public initTheme(): void {
    const theme = localStorage.getItem('fortless_theme') || localStorage.getItem('theme');
    if (theme) document.documentElement.dataset.theme = theme;
    this.syncDkAttribute();
    window.addEventListener('storage', (e) => {
      if ((e.key === 'fortless_theme' || e.key === 'theme') && e.newValue) {
        document.documentElement.dataset.theme = e.newValue;
        this.syncDkAttribute();
      }
    });
  }

  public toggleTheme(): void {
    const isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.setAttribute('data-dk', next === 'dark' ? '1' : '0');
    localStorage.setItem('fortless_theme', next);
    localStorage.setItem('theme', next);
  }

  public installHeroicons(): void {
    // Retain SVG symbols if present; only fallback for missing icon markup
    const targets: [string, string][] = [
      ['#nav-dashboard .ic:not(:has(use)), #tab-dashboard .ic:not(:has(use))', 'home'],
      ['#nav-servers .ic:not(:has(use)), #tab-servers .ic:not(:has(use))', 'servers'],
      ['#nav-deploy .ic:not(:has(use)), #tab-deploy .ic:not(:has(use))', 'plus'],
      ['#nav-billing .ic:not(:has(use)), #tab-billing .ic:not(:has(use))', 'credit'],
      ['#nav-tickets .ic:not(:has(use)), #tab-tickets .ic:not(:has(use))', 'support'],
      ['#nav-audit .ic:not(:has(use))', 'shield'],
      ['#nav-settings .ic:not(:has(use)), #tab-settings .ic:not(:has(use))', 'settings'],
    ];

    targets.forEach(([selector, icon]) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!node.querySelector('use')) {
          node.outerHTML = hero(icon, node.classList.contains('s') ? 's' : '');
        }
      });
    });
  }

  public installResponsiveComposition(): void {
    const deploy = document.querySelector<HTMLElement>('#section-deploy > div');
    if (deploy) {
      deploy.classList.add('deploy-layout');
      deploy.style.gridTemplateColumns = '';
      deploy.style.gap = '';
    }
    const regions = document.getElementById('regionSelector');
    if (regions) {
      regions.classList.add('region-grid');
      regions.style.gridTemplateColumns = '';
      regions.style.gap = '';
    }
    const summary = document.querySelector<HTMLElement>('#section-deploy .col:last-child .card');
    if (summary) {
      summary.classList.add('summary-card');
      summary.style.position = '';
      summary.style.top = '';
    }
  }

  public rewriteTruthfulCopy(): void {
    const sH2 = document.querySelector('#section-services .card.flat h2');
    if (sH2) sH2.textContent = 'Services';

    const tH2 = document.querySelector('#section-tickets h2');
    if (tH2) tH2.textContent = 'Support conversations';
    const tP = document.querySelector('#section-tickets h2 + p');
    if (tP) tP.textContent = 'Account-scoped ticket threads. No response-time or staffing claim is implied.';

    const bH2 = document.querySelector('#section-billing h2');
    if (bH2) bH2.textContent = 'Billing records';
    const bP = document.querySelector('#section-billing h2 + p');
    if (bP) bP.textContent = 'Draft and issued records returned by the current API.';

    const aH2 = document.querySelector('#section-audit h2');
    if (aH2) aH2.textContent = 'Account activity';
    const aP = document.querySelector('#section-audit h2 + p');
    if (aP) aP.textContent = 'Recorded audit events; this UI does not claim independent tamper-proof certification.';

    const newTicketBtn = document.getElementById('newTicketBtn');
    if (newTicketBtn) newTicketBtn.innerHTML = `${hero('plus', 's')}Open ticket`;
  }

  public async loadSession(): Promise<void> {
    const data = await api<{ user: any; account: any; membership: any }>('/api/v1/auth/me');
    sessionStore.set({
      user: data.user,
      account: data.account,
      membership: data.membership,
    });

    const label = data.user.name || data.user.email;
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const userAvatar = document.getElementById('userAvatar');
    const profName = document.getElementById('profName');
    const profWorkspace = document.getElementById('profWorkspace');
    const profEmail = document.getElementById('profEmail');
    const profRole = document.getElementById('profRole');

    const initials = label.slice(0, 2).toUpperCase();
    if (userName) userName.textContent = label;
    if (userRole) userRole.textContent = data.membership.role;
    if (userAvatar) userAvatar.textContent = initials;
    const topUserAvatar = document.getElementById('topUserAvatar');
    if (topUserAvatar) topUserAvatar.textContent = initials;
    if (profName) profName.textContent = data.user.name || '—';
    if (profWorkspace) profWorkspace.textContent = data.account.name;
    if (profEmail) profEmail.textContent = data.user.email;
    if (profRole) profRole.innerHTML = `<span class="pill acc">${esc(data.membership.role)}</span>`;
  }

  public async loadCapabilities(): Promise<void> {
    const data = await api<any>('/api/v1/platform/capabilities');
    capabilitiesStore.set(data);

    const ready = data.payments.enabled && data.provisioning.enabled;
    const status = document.getElementById('platformStatus');
    if (status) {
      status.innerHTML = `<span class="live" style="margin-right:4px;background:${ready ? 'var(--good)' : 'var(--warn)'}"></span><span>${ready ? 'Commerce available' : 'Commerce configuration required'}</span>`;
    }

    const button = document.getElementById('doDeployBtn') as HTMLButtonElement | null;
    if (button) {
      button.disabled = !ready || button.dataset.checkoutReady !== 'true';
      const span = button.querySelector('span');
      if (span && !ready) span.textContent = 'Ordering unavailable';
    }

    const notice = document.getElementById('deployCheckoutHint');
    if (notice) {
      if (!ready) notice.textContent = 'Payment and infrastructure integrations are disabled until sandbox verification is complete.';
    }
    window.dispatchEvent(new Event('fortless:capabilities'));
  }

  public async loadNotifications(): Promise<void> {
    try {
      const data = await api<{ unreadCount: number; notifications: any[] }>('/api/v1/notifications');
      const badge = document.getElementById('notifBadge');
      if (badge) {
        if (data.unreadCount > 0) {
          badge.textContent = String(data.unreadCount);
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }

      const list = document.getElementById('notifList');
      if (list) {
        if (!data.notifications.length) {
          list.innerHTML = `
            <div class="es" data-c="Empty state" style="padding:28px 16px">
              <span class="tile neu lg"><svg class="ic" aria-hidden="true"><use href="#i-notification-01"/></svg></span>
              <h4>No notifications</h4>
              <p>You are all caught up.</p>
            </div>
          `;
        } else {
          list.innerHTML = data.notifications
            .map(
              (n) => `
            <div class="li h" style="padding:12px 14px;opacity:${n.readAt ? '0.65' : '1'}">
              <span class="tile ${n.tone || 'neu'} sm"><svg class="ic" aria-hidden="true"><use href="#i-${n.icon || 'notification-01'}"/></svg></span>
              <span class="tx"><b>${esc(n.title)}</b><small>${esc(n.message)} · ${formatDate(n.createdAt)}</small></span>
              ${n.linkUrl ? `<a href="${esc(n.linkUrl)}" data-close-notif class="ib s" aria-label="Open"><svg class="ic s" aria-hidden="true"><use href="#i-arrow-right-01"/></svg></a>` : ''}
            </div>
          `
            )
            .join('');
        }
      }
    } catch {
      // non-blocking
    }
  }
}
