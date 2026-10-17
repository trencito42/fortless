/**
 * Customer Portal — Account & Security Settings Page Module
 * Route: /app/settings
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderSkeleton, toast } from '../../../petal/index.js';

declare global {
  interface Window {
    PetalQR?: { svg: (uri: string) => string };
  }
}

let mfaEnrollmentState: any = null;

export async function renderSettings(): Promise<void> {
  await Promise.all([loadMfa(), loadSessions(), loadTeamMembers(), loadEmailStatus()]);
}

export function describeDevice(userAgent: string): string {
  const ua = String(userAgent || 'Unknown client');
  const browser = ua.includes('Edg/')
    ? 'Microsoft Edge'
    : ua.includes('Firefox/')
    ? 'Firefox'
    : ua.includes('Chrome/')
    ? 'Chrome'
    : ua.includes('Safari/')
    ? 'Safari'
    : 'Browser';
  const androidModel = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/)?.[1]?.trim();
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
    ? 'iPad'
    : ua.includes('Android')
    ? androidModel
      ? `Android · ${androidModel}`
      : 'Android'
    : ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Mac OS')
    ? 'macOS'
    : ua.includes('Linux')
    ? 'Linux'
    : 'Unknown OS';
  return `${browser} · ${system}`;
}

export function describeAddress(address: string): string {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(address))
    ? 'Local proxy · legacy session'
    : String(address || 'IP unavailable');
}

export async function loadSessions(): Promise<void> {
  const host = document.getElementById('sessionList');
  if (!host) return;

  host.innerHTML = renderSkeleton('list', 'Loading active devices');

  try {
    const { sessions } = await api<{ sessions: any[] }>('/api/v1/auth/sessions');
    const otherCount = sessions.filter((session) => !session.isCurrent).length;
    const revokeOthers = document.getElementById('revokeOtherSessionsBtn') as HTMLButtonElement | null;
    if (revokeOthers) {
      revokeOthers.disabled = otherCount === 0;
      revokeOthers.textContent = otherCount
        ? `Sign out ${otherCount} other ${otherCount === 1 ? 'device' : 'devices'}`
        : 'No other devices';
    }

    host.innerHTML = sessions
      .map(
        (session) => `
      <div class="z-ssr">
        <span class="ico-b ${session.isCurrent ? 'good' : ''}">${hero('device')}</span>
        <div class="tx">
          <b>${esc(describeDevice(session.userAgent))}${
          session.isCurrent ? '<span class="badge good s">This device</span>' : ''
        }</b>
          <small>
            ${esc(describeAddress(session.ipAddress))} · Last active ${esc(formatDate(session.lastActiveAt))}<br>
            Signed in ${esc(formatDate(session.createdAt))} · Expires ${esc(formatDate(session.expiresAt))}
          </small>
        </div>
        ${
          session.isCurrent
            ? ''
            : `<button class="btn xs badt" data-revoke-session="${esc(session.id)}">Sign out</button>`
        }
      </div>
    `
      )
      .join('');
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
  }
}

export async function loadMfa(): Promise<void> {
  const host = document.getElementById('mfaControl');
  if (!host) return;

  host.innerHTML = renderSkeleton('profile', 'Loading two-step verification');

  try {
    const status = await api<{ enabled: boolean; recoveryCodesRemaining: number }>('/api/v1/auth/mfa');
    host.innerHTML = status.enabled
      ? `
      <div class="mfa-state">
        <span class="badge good">Enabled</span>
        <div><b>Authenticator app</b><small>${status.recoveryCodesRemaining} recovery ${
          status.recoveryCodesRemaining === 1 ? 'code' : 'codes'
        } remaining</small></div>
      </div>
      <button class="btn sec s" type="button" data-mfa-disable>Disable</button>
    `
      : `
      <div class="mfa-state">
        <span class="badge">Off</span>
        <div><b>Add an authenticator app</b><small>You’ll use a six-digit code when signing in.</small></div>
      </div>
      <button class="btn s" type="button" data-mfa-enable>Set up</button>
    `;
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad">${hero('warning')}<span>${esc(error.message)}</span></div>`;
  }
}

export function showMfaPasswordStep(): void {
  const host = document.getElementById('mfaControl');
  if (!host) return;
  host.innerHTML = `
    <form class="mfa-form" data-mfa-enroll-form>
      <div class="field">
        <label for="mfaPassword">Confirm your current password</label>
        <div class="inp"><input id="mfaPassword" name="password" type="password" autocomplete="current-password" required></div>
      </div>
      <div class="mfa-actions">
        <button class="btn sec s" type="button" data-mfa-cancel>Cancel</button>
        <button class="btn s" type="submit">Continue</button>
      </div>
    </form>
  `;
  host.querySelector<HTMLInputElement>('input')?.focus();
}

export async function beginMfaEnrollment(form: HTMLFormElement): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('[type=submit]');
  if (button) button.disabled = true;

  try {
    const result = await api<{ uri: string; secret: string }>('/api/v1/auth/mfa/totp/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: (form.elements.namedItem('password') as HTMLInputElement).value }),
    });

    const host = document.getElementById('mfaControl');
    if (!host) return;
    mfaEnrollmentState = result;
    const qrSvg = window.PetalQR ? window.PetalQR.svg(result.uri) : '<div class="mono" style="padding:10px">QR Engine</div>';

    host.innerHTML = `
      <div class="z-2f">
        <div class="steps">
          <div class="step cur"><i>1</i>Scan</div>
          <div class="step"><i>2</i>Verify</div>
          <div class="step"><i>3</i>Backup</div>
        </div>
        <div class="z-pane on">
          <div class="z-qr">
            <div class="z-qrb">${qrSvg}</div>
            <div class="tx">
              <b>Scan with your authenticator app</b>
              <small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small>
              <div class="z-sec">
                <span>${esc(result.secret.replace(/(.{4})/g, '$1 ').trim())}</span>
                <button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">
                  ${hero('copy', 'xs')}
                </button>
              </div>
              <a class="btn sec s mfa-app-link" href="${esc(result.uri)}">Open authenticator app</a>
            </div>
          </div>
          <div class="row" style="justify-content:space-between">
            <button class="btn sec" type="button" data-mfa-cancel>Cancel</button>
            <button class="btn" type="button" data-mfa-next>Continue</button>
          </div>
        </div>
      </div>
    `;
  } catch (error: any) {
    toast(error.message, 'bad');
    if (button) button.disabled = false;
  }
}

export function showMfaCodeStep(): void {
  const host = document.getElementById('mfaControl');
  if (!host) return;

  host.innerHTML = `
    <div class="z-2f">
      <div class="steps">
        <div class="step"><i>1</i>Scan</div>
        <div class="step cur"><i>2</i>Verify</div>
        <div class="step"><i>3</i>Backup</div>
      </div>
      <form class="z-pane on" data-mfa-confirm-form>
        <b>Enter the six-digit code from your app</b>
        <div class="otp">
          ${[1, 2, 3, 4, 5, 6]
            .map(
              (digit) =>
                `<input data-mfa-digit inputmode="numeric" maxlength="1" aria-label="Digit ${digit}" autocomplete="one-time-code" required>`
            )
            .join('')}
        </div>
        <div class="mfa-actions">
          <button class="btn sec" type="button" data-mfa-back>Back</button>
          <button class="btn" type="submit">Verify</button>
        </div>
      </form>
    </div>
  `;
  host.querySelector<HTMLInputElement>('[data-mfa-digit]')?.focus();
}

export async function confirmMfaEnrollment(form: HTMLFormElement): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('[type=submit]');
  if (button) button.disabled = true;

  try {
    const code = [...form.querySelectorAll<HTMLInputElement>('[data-mfa-digit]')]
      .map((input) => input.value)
      .join('');
    const result = await api<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/totp/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const host = document.getElementById('mfaControl');
    if (!host) return;

    host.innerHTML = `
      <div class="z-2f">
        <div class="steps">
          <div class="step"><i>1</i>Scan</div>
          <div class="step"><i>2</i>Verify</div>
          <div class="step cur"><i>3</i>Backup</div>
        </div>
        <div class="z-pane on">
          <div class="alert good">
            <span>${hero('check')}</span>
            <div><b>Two-step verification is on</b><p>Save these recovery codes somewhere safe. Each works once.</p></div>
          </div>
          <div class="z-bc">
            ${result.recoveryCodes.map((c) => `<code>${esc(c)}</code>`).join('')}
          </div>
          <div class="row">
            <button class="btn s sec" type="button" data-copy-recovery="${esc(result.recoveryCodes.join('\n'))}">
              Copy codes
            </button>
            <span class="sp"></span>
            <button class="btn s" type="button" data-mfa-done>Done</button>
          </div>
        </div>
      </div>
    `;
    toast('Two-step verification is now enabled.', 'good');
  } catch (error: any) {
    toast(error.message, 'bad');
    if (button) button.disabled = false;
  }
}

export function showMfaDisableStep(): void {
  const host = document.getElementById('mfaControl');
  if (!host) return;

  host.innerHTML = `
    <form class="mfa-form" data-mfa-disable-form>
      <div class="state-message warn">
        ${hero('warning')}<span>Disabling this removes the second sign-in step and every unused recovery code.</span>
      </div>
      <div class="field">
        <label for="mfaDisablePassword">Current password</label>
        <div class="inp"><input id="mfaDisablePassword" name="password" type="password" autocomplete="current-password" required></div>
      </div>
      <div class="field">
        <label for="mfaDisableCode">Authenticator code</label>
        <div class="inp"><input id="mfaDisableCode" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div>
      </div>
      <div class="mfa-actions">
        <button class="btn sec s" type="button" data-mfa-cancel>Cancel</button>
        <button class="btn badt s" type="submit">Disable</button>
      </div>
    </form>
  `;
  host.querySelector<HTMLInputElement>('input')?.focus();
}

export async function disableMfa(form: HTMLFormElement): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('[type=submit]');
  if (button) button.disabled = true;

  try {
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    await api('/api/v1/auth/mfa/totp', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, code }),
    });
    toast('Two-step verification was disabled.', 'good');
    await loadMfa();
  } catch (error: any) {
    toast(error.message, 'bad');
    if (button) button.disabled = false;
  }
}

export async function revokeDevice(sessionId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await api(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    toast('Device signed out.', 'good');
    await loadSessions();
  } catch (error: any) {
    button.disabled = false;
    toast(error.message, 'bad');
  }
}

export async function revokeOtherSessions(): Promise<void> {
  const button = document.getElementById('revokeOtherSessionsBtn') as HTMLButtonElement | null;
  if (button) button.disabled = true;

  try {
    const result = await api<{ revokedCount: number }>('/api/v1/auth/sessions/revoke-others', { method: 'POST' });
    toast(`${result.revokedCount} other ${result.revokedCount === 1 ? 'device was' : 'devices were'} signed out.`, 'good');
    await loadSessions();
  } catch (error: any) {
    if (button) button.disabled = false;
    toast(error.message, 'bad');
  }
}

export async function loadTeamMembers(): Promise<void> {
  const host = document.getElementById('teamMemberList');
  if (!host) return;

  host.innerHTML = renderSkeleton('table', 'Loading team members');

  try {
    const data = await api<{ members: any[] }>('/api/v1/account/members');
    if (!data.members || !data.members.length) {
      host.innerHTML = `<div class="state-message"><span>No team members found.</span></div>`;
      return;
    }

    host.innerHTML = `
      <div class="z-scroll" style="margin-top:8px">
        <table class="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Joined</th>
              <th class="r">Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.members
              .map(
                (m) => `
              <tr class="mobile-record">
                <td data-label="Member"><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td>
                <td data-label="Role"><span class="badge ${m.role === 'OWNER' ? 'accent' : 'info'} s">${esc(
                  m.role
                )}</span></td>
                <td data-label="Joined" class="muted">${formatDate(m.createdAt)}</td>
                <td data-label="Action" class="r">
                  ${
                    m.isOwner
                      ? '<span class="badge good s">Workspace Owner</span>'
                      : `<button class="btn badt xs" type="button" data-revoke-member="${esc(m.id)}">Remove</button>`
                  }
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad"><span>${esc(error.message)}</span></div>`;
  }
}

export async function loadEmailStatus(): Promise<void> {
  const host = document.getElementById('emailDeliveryStatus');
  if (!host) return;

  try {
    const status = await api<{ mode: string; pendingCount: number; sentCount: number; failedCount: number }>(
      '/api/v1/email/status'
    );
    const modeBadges: Record<string, string> = {
      disabled: '<span class="badge warn s">DISABLED (Zero fake delivery)</span>',
      sandbox: '<span class="badge info s">SANDBOX (Local receipts active)</span>',
      live: '<span class="badge good s">LIVE TRANSPORT</span>',
    };

    host.innerHTML = `
      <div class="li card s2"><span class="ico-b">${hero('paper')}</span><span class="tx"><b>Transport mode</b><span>Current transactional email provider state</span></span>${modeBadges[status.mode] || status.mode}</div>
      <div class="li card s2"><span class="ico-b">${hero('document')}</span><span class="tx"><b>Outbox queue</b><span>${status.pendingCount} pending · ${status.sentCount} sent · ${status.failedCount} failed</span></span></div>
    `;
  } catch (error: any) {
    host.innerHTML = `<div class="state-message bad"><span>${esc(error.message)}</span></div>`;
  }
}

export function restoreMfaScanStep(): void {
  if (!mfaEnrollmentState) return;
  const result = mfaEnrollmentState;
  const host = document.getElementById('mfaControl');
  if (!host) return;
  const qrSvg = window.PetalQR ? window.PetalQR.svg(result.uri) : '<div class="mono" style="padding:10px">QR Engine</div>';

  host.innerHTML = `
    <div class="z-2f">
      <div class="steps">
        <div class="step cur"><i>1</i>Scan</div>
        <div class="step"><i>2</i>Verify</div>
        <div class="step"><i>3</i>Backup</div>
      </div>
      <div class="z-pane on">
        <div class="z-qr">
          <div class="z-qrb">${qrSvg}</div>
          <div class="tx">
            <b>Scan with your authenticator app</b>
            <small class="muted">Works with Google Authenticator, 1Password, Authy and other TOTP apps.</small>
            <div class="z-sec">
              <span>${esc(result.secret.replace(/(.{4})/g, '$1 ').trim())}</span>
              <button class="btn xs sq sec" type="button" data-copy-secret="${esc(result.secret)}" aria-label="Copy setup key">
                ${hero('copy', 'xs')}
              </button>
            </div>
          </div>
        </div>
        <div class="row" style="justify-content:space-between">
          <button class="btn sec" type="button" data-mfa-cancel>Cancel</button>
          <button class="btn" type="button" data-mfa-next>Continue</button>
        </div>
      </div>
    </div>
  `;
}
