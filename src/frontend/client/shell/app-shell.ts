/**
 * Customer Portal — Application Shell Module
 * Manages Topbar, Navigation, User Identity, Responsive Rules, and Petal Chrome.
 */

import { api } from '../../core/api/client.js';
import { esc } from '../../core/utils/dom.js';
import { formatDate } from '../../core/utils/dates.js';
import { hero, CommandPaletteController } from '../../petal/index.js';
import { sessionStore } from '../../core/state/session.js';
import { capabilitiesStore } from '../../core/state/capabilities.js';

export class AppShell {
  public cmd: CommandPaletteController;

  constructor() {
    this.cmd = new CommandPaletteController('cmd', 'cmd-in', 'cmd-res');
  }

  public init(): void {
    this.initTheme();
    this.installHeroicons();
    this.installResponsiveComposition();
    this.rewriteTruthfulCopy();
    this.cmd.bindKeyboard();
  }

  public initTheme(): void {
    const theme = localStorage.getItem('fortless_theme');
    if (theme) document.documentElement.dataset.theme = theme;
  }

  public toggleTheme(): void {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('fortless_theme', next);
  }

  public installHeroicons(): void {
    const targets: [string, string][] = [
      ['#nav-dashboard .ic, #tab-dashboard .ic', 'home'],
      ['#nav-servers .ic, #tab-servers .ic', 'servers'],
      ['#nav-deploy .ic, #tab-deploy .ic', 'plus'],
      ['#nav-billing .ic, #tab-billing .ic', 'credit'],
      ['#nav-tickets .ic, #tab-tickets .ic', 'support'],
      ['#nav-audit .ic', 'shield'],
      ['#nav-settings .ic, #tab-settings .ic', 'settings'],
      ['#refreshServersBtn svg, #refreshInvoicesBtn svg, #refreshAuditBtn svg', 'refresh'],
      ['.app-top-actions > a.btn svg', 'plus'],
      ['#doDeployBtn svg', 'cube'],
    ];

    targets.forEach(([selector, icon]) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.outerHTML = hero(icon, node.classList.contains('s') ? 's' : '');
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

    const profileCard = document.querySelector('#section-settings .card:first-child');
    if (profileCard) {
      const h2 = profileCard.querySelector('h2');
      if (h2) h2.textContent = 'Account profile';
      if (!profileCard.querySelector('.settings-actions')) {
        profileCard.insertAdjacentHTML(
          'beforeend',
          `<div class="settings-actions"><a class="btn sec s" href="/app/activity" data-app-route="audit">${hero(
            'shield',
            's'
          )}View account activity</a></div>`
        );
      }
    }

    const securityCard = document.querySelector('#section-settings .card:nth-child(2)');
    if (securityCard && !securityCard.classList.contains('configured')) {
      securityCard.classList.add('configured');
      securityCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('shield')}</span>
          <div class="tx">
            <h2>Account protection</h2>
            <p>Security controls currently protecting this account.</p>
          </div>
        </div>
        <div class="col" style="gap:6px">
          <div class="li card s2">
            <span class="ico-b good">${hero('check')}</span>
            <span class="tx"><b>Verified identity</b><span>Email ownership is confirmed before dashboard access.</span></span>
          </div>
          <div class="li card s2">
            <span class="ico-b good">${hero('check')}</span>
            <span class="tx"><b>Protected sessions</b><span>Opaque session tokens are hashed at rest and browser mutations require CSRF validation.</span></span>
          </div>
        </div>
      `;
    }

    const settingsGrid = document.querySelector('#section-settings .grid');
    if (settingsGrid && !settingsGrid.querySelector('.mfa-card')) {
      const mfaCard = document.createElement('div');
      mfaCard.className = 'card mfa-card';
      mfaCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('shield')}</span>
          <div class="tx"><h2>Two-step verification</h2><p>Protect sign-in with a standards-based authenticator app.</p></div>
        </div>
        <div id="mfaControl" class="mfa-control">
          <div class="state-message">${hero('refresh')}<span>Loading two-step verification…</span></div>
        </div>
      `;
      settingsGrid.appendChild(mfaCard);

      const sessionsCard = document.createElement('div');
      sessionsCard.className = 'card sessions-card';
      sessionsCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('device')}</span>
          <div class="tx"><h2>Active devices</h2><p>Review every valid session and sign out devices you no longer use.</p></div>
          <div class="actions"><button id="revokeOtherSessionsBtn" class="btn sec s" type="button">Loading devices…</button></div>
        </div>
        <div id="sessionList" class="z-ss">
          <div class="state-message">${hero('refresh')}<span>Loading active devices…</span></div>
        </div>
      `;
      settingsGrid.appendChild(sessionsCard);

      const teamCard = document.createElement('div');
      teamCard.className = 'card team-card';
      teamCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('cube')}</span>
          <div class="tx"><h2>Workspace team</h2><p>Collaborators and administrators for this workspace.</p></div>
          <div class="actions"><button id="openInviteModalBtn" class="btn sec s" type="button">${hero(
            'plus',
            's'
          )}Invite member</button></div>
        </div>
        <div id="teamMemberList">
          <div class="state-message">${hero('refresh')}<span>Loading team members…</span></div>
        </div>
      `;
      settingsGrid.appendChild(teamCard);

      const passwordCard = document.createElement('div');
      passwordCard.className = 'card password-card';
      passwordCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('shield')}</span>
          <div class="tx"><h2>Change password</h2><p>Update your credentials. Revokes other active device sessions.</p></div>
        </div>
        <form id="changePasswordForm" class="col" style="gap:12px;margin-top:12px">
          <div class="field"><label for="curPass">Current password</label><div class="inp"><input id="curPass" name="currentPassword" type="password" required autocomplete="current-password"></div></div>
          <div class="field"><label for="newPass">New password</label><div class="inp"><input id="newPass" name="newPassword" type="password" required minlength="12" autocomplete="new-password"></div></div>
          <div class="row" style="justify-content:flex-end"><button class="btn s" type="submit">Update password</button></div>
        </form>
      `;
      settingsGrid.appendChild(passwordCard);

      const emailCard = document.createElement('div');
      emailCard.className = 'card email-card';
      emailCard.innerHTML = `
        <div class="section-card-head">
          <span class="ico-b accent">${hero('paper')}</span>
          <div class="tx"><h2>Email delivery</h2><p>Durable transactional email outbox status.</p></div>
        </div>
        <div id="emailDeliveryStatus" class="col" style="gap:8px;margin-top:8px">
          <div class="state-message">${hero('refresh')}<span>Checking delivery status…</span></div>
        </div>
      `;
      settingsGrid.appendChild(emailCard);
    }
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

    if (userName) userName.textContent = label;
    if (userRole) userRole.textContent = data.membership.role;
    if (userAvatar) userAvatar.textContent = label.slice(0, 2).toUpperCase();
    if (profName) profName.textContent = data.user.name || '—';
    if (profWorkspace) profWorkspace.textContent = data.account.name;
    if (profEmail) profEmail.textContent = data.user.email;
    if (profRole) profRole.innerHTML = `<span class="badge accent">${esc(data.membership.role)}</span>`;
  }

  public async loadCapabilities(): Promise<void> {
    const data = await api<any>('/api/v1/platform/capabilities');
    capabilitiesStore.set(data);

    const ready = data.payments.enabled && data.provisioning.enabled;
    const status = document.querySelector('.app-status span:last-child');
    if (status) status.textContent = ready ? 'Commerce available' : 'Preview mode';

    const button = document.getElementById('doDeployBtn') as HTMLButtonElement | null;
    if (button) {
      button.disabled = !ready;
      const span = button.querySelector('span');
      if (span) span.textContent = ready ? 'Continue to secure checkout' : 'Ordering unavailable';
    }

    const notice = document.querySelector('#doDeployBtn + p');
    if (notice) {
      notice.textContent = ready
        ? 'You will continue to the configured hosted payment provider.'
        : 'Payment and infrastructure integrations are disabled until sandbox verification is complete.';
    }
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
          list.innerHTML = '<div class="state-message">No notifications.</div>';
        } else {
          list.innerHTML = data.notifications
            .map(
              (n) => `
            <div class="card s2" style="padding:10px;border-radius:12px;opacity:${n.readAt ? '0.7' : '1'}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <b style="font-size:13px">${esc(n.title)}</b>
                <small class="faint" style="font-size:11px">${formatDate(n.createdAt)}</small>
              </div>
              <p style="font-size:12px;color:var(--ink2);margin:0 0 6px">${esc(n.message)}</p>
              ${
                n.linkUrl
                  ? `<a href="${esc(n.linkUrl)}" data-app-route="${
                      n.linkUrl.includes('services') ? 'service-detail' : 'dashboard'
                    }" style="font-size:11px;color:var(--accent);font-weight:600">View details →</a>`
                  : ''
              }
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
