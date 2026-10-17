/**
 * Staff Control Plane — Admin Shell Module
 * Manages Staff Identity, RBAC Filtering, Step-Up Verification, and Command Palette.
 */

import { api, setStepUpInterceptor } from '../../core/api/client.js';
import { esc } from '../../core/utils/dom.js';
import { hero, CommandPaletteController } from '../../petal/index.js';

export class AdminShell {
  public permissions: Set<string> = new Set();
  public cmd: CommandPaletteController;
  private pendingStepUpAction: { onSuccess: () => void; onError?: (err: Error) => void } | null = null;

  constructor() {
    this.cmd = new CommandPaletteController('cmd', 'cmd-in', 'cmd-res');
  }

  public init(): void {
    this.installIcons();
    this.cmd.bindKeyboard();
    this.bindStepUp();
  }

  public installIcons(): void {
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach((x) => {
      x.outerHTML = hero(x.dataset.icon || 'home');
    });
  }

  public async loadIdentity(): Promise<void> {
    try {
      const [identity, access] = await Promise.all([
        api<{ user: any }>('/api/v1/auth/me'),
        api<{ staff: { role: string; permissions: string[] } }>('/api/v1/admin/me'),
      ]);

      const userName = document.querySelector('#userName');
      const userAvatar = document.querySelector('#userAvatar');
      const staffRole = document.querySelector('#staffRole');

      if (userName) userName.textContent = identity.user.name;
      if (userAvatar) userAvatar.textContent = identity.user.name.slice(0, 2).toUpperCase();
      if (staffRole) staffRole.textContent = `${access.staff.role.replaceAll('_', ' ')} · MFA`;

      this.permissions = new Set(access.staff.permissions);

      // Prune links without required permission
      const required: Record<string, string> = {
        accounts: 'accounts:read',
        services: 'services:read',
        tickets: 'tickets:read',
        audit: 'audit:read',
        staff: 'staff:read',
      };

      document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
        const route = link.dataset.route || '';
        const permission = required[route];
        if (permission && !this.permissions.has(permission)) {
          link.remove();
        }
      });
    } catch {
      // non-blocking
    }
  }

  public promptStepUp(onSuccess: () => void, onError?: (err: Error) => void): void {
    this.pendingStepUpAction = { onSuccess, onError };
    const modal = document.getElementById('modalStepUp');
    if (!modal) {
      if (onError) onError(new Error('Step-up verification modal not found.'));
      return;
    }

    const passInput = document.getElementById('stepUpPassword') as HTMLInputElement | null;
    const totpInput = document.getElementById('stepUpTotpCode') as HTMLInputElement | null;
    const errEl = document.getElementById('stepUpError');

    if (passInput) passInput.value = '';
    if (totpInput) totpInput.value = '';
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    modal.hidden = false;
    setTimeout(() => passInput?.focus(), 50);
  }

  private bindStepUp(): void {
    setStepUpInterceptor((onSuccess, onError) => {
      this.promptStepUp(onSuccess, onError);
    });

    const form = document.getElementById('adminStepUpForm');
    form?.addEventListener('submit', async (e: Event) => {
      e.preventDefault();
      const password = (document.getElementById('stepUpPassword') as HTMLInputElement).value;
      const code = (document.getElementById('stepUpTotpCode') as HTMLInputElement).value.trim();
      const btn = document.getElementById('stepUpSubmitBtn') as HTMLButtonElement;
      const errEl = document.getElementById('stepUpError');

      btn.disabled = true;
      if (errEl) errEl.style.display = 'none';

      try {
        await api('/api/v1/auth/step-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, code }),
        });

        const modal = document.getElementById('modalStepUp');
        if (modal) modal.hidden = true;

        if (this.pendingStepUpAction) {
          this.pendingStepUpAction.onSuccess();
          this.pendingStepUpAction = null;
        }
      } catch (err: any) {
        if (errEl) {
          errEl.textContent = err.message || 'Verification failed.';
          errEl.style.display = 'block';
        }
      } finally {
        btn.disabled = false;
      }
    });
  }
}

export function badge(v: string): string {
  const x = String(v || 'UNKNOWN');
  const c = /ACTIVE|RUNNING|RESOLVED|CLOSED|COMPLETED/.test(x)
    ? 'good'
    : /URGENT|ERROR|DEAD|OVERDUE|SUSPENDED|LOCKED/.test(x)
    ? 'bad'
    : /PENDING|WAITING|HIGH|MOCK|NOT_CONFIGURED/.test(x)
    ? 'warn'
    : 'info';
  return `<span class="badge ${c} s">${esc(x.replaceAll('_', ' '))}</span>`;
}

export function row({
  symbol = 'home',
  title,
  sub = '',
  status = '',
  meta = '',
  dataAttr = '',
}: {
  symbol?: string;
  title: string;
  sub?: string;
  status?: string;
  meta?: string;
  dataAttr?: string;
}): string {
  return `
    <article class="row" ${dataAttr} style="cursor:pointer;transition:background .15s">
      <span class="row-icon">${hero(symbol)}</span>
      <div class="row-copy">
        <b>${esc(title)}</b>
        <small>${esc(sub)}</small>
      </div>
      ${status ? badge(status) : ''}
      ${meta ? `<div class="row-meta">${esc(meta)}</div>` : ''}
    </article>
  `;
}
