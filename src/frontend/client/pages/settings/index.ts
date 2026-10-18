/**
 * Customer Portal — Account & Security Settings Page Module
 * Route: /app/settings
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { formatDate } from '../../../core/utils/dates.js';
import { hero, renderSkeleton, toast } from '../../../petal/index.js';
import { initTabs } from '../../../petal/components/tabs.js';
import { bindTabUrls } from '../../../core/router/tab-url.js';
import { formDialog } from '../services/dialog.js';

declare global {
  interface Window {
    PetalQR?: {
      make: (text: string, ecc?: number) => { size: number; m: boolean[][]; v: number };
      svg: (uri: string) => string;
    };
  }
}

let mfaEnrollmentState: any = null;

export async function renderSettings(tab?: string): Promise<void> {
  const tabsEl = document.getElementById('settingsTabs');
  if (tabsEl) {
    initTabs(tabsEl);
    bindTabUrls({
      tabs: tabsEl, base: '/app/settings', initial: tab, fallbackKey: 's',
      slugs: { p: 'profile', s: 'security', t: 'team', n: 'notifications', d: 'sessions' },
      keyOf: (b) => b.getAttribute('aria-controls')?.split('-')[1],
      select: (key) => tabsEl.querySelector<HTMLElement>(`[aria-controls="settings-${key}"]`)?.click(),
    });
  }
  bindEditProfile();
  await Promise.all([loadMfa(), loadPasskeys(), loadSessions(), loadTeamMembers(), loadEmailStatus(), loadNotificationPreferences()]);
}

type NotificationPreferences = { billingEmail: boolean; serviceEmail: boolean; supportEmail: boolean };

export async function loadNotificationPreferences(): Promise<void> {
  const host = document.getElementById('notificationPreferences');
  if (!host) return;
  try {
    const { preferences } = await api<{ preferences: NotificationPreferences }>('/api/v1/notification-preferences');
    const item = (key: keyof NotificationPreferences, title: string, description: string, icon: string, tone: string) => `
      <div class="li" style="padding:14px 16px">
        <span class="tile ${tone} sm">${hero(icon, 's')}</span>
        <span class="tx"><b>${title}</b><small>${description}</small></span>
        <button class="sw" type="button" role="switch" data-email-pref="${key}" aria-label="${title}" aria-checked="${preferences[key]}"></button>
      </div>`;
    host.innerHTML = item('billingEmail', 'Billing updates', 'Invoices, receipts, renewals and scheduled cancellations', 'invoice-01', 'warn')
      + item('serviceEmail', 'Service updates', 'Provisioning completed and service-ready messages', 'server', 'good')
      + item('supportEmail', 'Support replies', 'New staff replies in your support conversations', 'message-01', 'info');
    if (!host.dataset['bound']) {
      host.dataset['bound'] = '1';
      host.addEventListener('click', async (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-email-pref]');
        if (!button) return;
        const next = button.getAttribute('aria-checked') !== 'true';
        const body: NotificationPreferences = {
          billingEmail: host.querySelector<HTMLElement>('[data-email-pref="billingEmail"]')?.getAttribute('aria-checked') === 'true',
          serviceEmail: host.querySelector<HTMLElement>('[data-email-pref="serviceEmail"]')?.getAttribute('aria-checked') === 'true',
          supportEmail: host.querySelector<HTMLElement>('[data-email-pref="supportEmail"]')?.getAttribute('aria-checked') === 'true',
        };
        body[button.dataset['emailPref'] as keyof NotificationPreferences] = next;
        button.disabled = true;
        try {
          const result = await api<{ preferences: NotificationPreferences }>('/api/v1/notification-preferences', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          Object.entries(result.preferences).forEach(([key, enabled]) => host.querySelector(`[data-email-pref="${key}"]`)?.setAttribute('aria-checked', String(enabled)));
          toast('Notification preferences saved.', 'good');
        } catch (error: any) { toast(error?.message || 'Could not save notification preferences.', 'bad'); }
        finally { button.disabled = false; }
      });
    }
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load notification preferences</b><span>${esc(error.message)}</span></div></div>`;
  }
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function loadPasskeys(): Promise<void> {
  const host = document.getElementById('passkeyList');
  if (!host) return;

  try {
    const { passkeys } = await api<{ passkeys: any[] }>('/api/v1/auth/passkeys');
    if (!passkeys || !passkeys.length) {
      host.innerHTML = `
        <div class="li" style="padding:14px 16px">
          <span class="tx"><b class="muted">No passkeys registered yet</b><small>Add Touch ID, Face ID, Windows Hello or a security key.</small></span>
        </div>
      `;
      return;
    }

    host.innerHTML = passkeys
      .map(
        (pk) => `
        <div class="li" style="padding:11px 14px">
          <span class="tile sm">${hero('fingerprint', 's')}</span>
          <span class="tx">
            <b>${esc(pk.deviceLabel || 'Security Key')}</b>
            <small>Added ${formatDate(pk.createdAt)}${pk.lastUsedAt ? ` · Last used ${formatDate(pk.lastUsedAt)}` : ''}</small>
          </span>
          <button class="btn xs bad" type="button" data-remove-passkey="${esc(pk.id)}">Remove</button>
        </div>
      `
      )
      .join('');
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load passkeys</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export async function registerPasskey(): Promise<void> {
  if (!window.PublicKeyCredential) {
    toast('Passkeys (WebAuthn) are not supported by this browser.', 'bad');
    return;
  }

  const btn = document.getElementById('addPasskeyBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;

  try {
    const options = await api<any>('/api/v1/auth/passkeys/register-options', { method: 'POST' });

    const ua = navigator.userAgent;
    const defaultLabel = /Macintosh/.test(ua)
      ? 'MacBook Touch ID'
      : /iPhone|iPad/.test(ua)
      ? 'Apple Device'
      : /Windows/.test(ua)
      ? 'Windows Hello'
      : /Android/.test(ua)
      ? 'Android Biometrics'
      : 'Security Key';

    const challengeBuf = base64urlToBuffer(options.challenge);
    const userIdBuf = new TextEncoder().encode(options.user.id);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challengeBuf.buffer as ArrayBuffer,
        rp: options.rp,
        user: {
          id: userIdBuf.buffer as ArrayBuffer,
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        attestation: 'none',
      },
    })) as (PublicKeyCredential & { response: AuthenticatorAttestationResponse }) | null;

    if (!credential) throw new Error('Passkey creation returned empty.');

    const clientDataJSON = bufferToBase64url(credential.response.clientDataJSON);
    const attestationObject = bufferToBase64url(credential.response.attestationObject);
    const rawId = bufferToBase64url(credential.rawId);

    await api('/api/v1/auth/passkeys/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceLabel: defaultLabel,
        challenge: options.challenge,
        clientDataJSON,
        credentialId: rawId,
        publicKey: attestationObject,
      }),
    });

    toast('Passkey registered successfully.', 'good');
    await loadPasskeys();
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      toast('Passkey registration cancelled.', 'warn');
    } else {
      toast(err.message || 'Passkey registration failed.', 'bad');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function handleRemovePasskey(id: string): Promise<void> {
  if (!confirm('Are you sure you want to remove this passkey?')) return;
  try {
    await api(`/api/v1/auth/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Passkey removed.', 'good');
    await loadPasskeys();
  } catch (err: any) {
    toast(err.message || 'Failed to remove passkey.', 'bad');
  }
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
      revokeOthers.textContent = otherCount === 0 ? 'No other devices' : 'Sign out all other devices';
    }

    host.innerHTML = sessions
      .map(
        (session) => `<div class="li" style="padding:14px 16px">
          <span class="tile ${session.isCurrent ? 'good' : ''} sm"><svg class="ic" aria-hidden="true"><use href="#i-laptop"/></svg></span>
          <span class="tx">
            <b>${esc(describeDevice(session.userAgent))}${session.isCurrent ? ' <span class="pill good">This device</span>' : ''}</b>
            <small>${esc(describeAddress(session.ipAddress))} · last active ${esc(formatDate(session.lastActiveAt))}</small>
          </span>
          ${session.isCurrent ? '' : `<button class="btn xs bad" type="button" data-revoke-session="${esc(session.id)}">Sign out</button>`}
        </div>`
      )
      .join('');
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load sessions</b><span>${esc(error.message)}</span></div></div>`;
  }
}

let currentMfaStatus: { enabled: boolean; recoveryCodesRemaining: number } | null = null;
let lastRecoveryCodes: string[] = [];

export async function loadMfa(): Promise<void> {
  const switchEl = document.getElementById('mfaToggleSwitch');
  const countEl = document.getElementById('mfaRecoveryCount');
  const regenBtn = document.getElementById('regenerateMfaCodesBtn') as HTMLButtonElement | null;
  const alertEl = document.getElementById('mfaDisablingAlert');

  try {
    const status = await api<{ enabled: boolean; recoveryCodesRemaining: number }>('/api/v1/auth/mfa');
    currentMfaStatus = status;

    if (switchEl) switchEl.setAttribute('aria-checked', status.enabled ? 'true' : 'false');
    if (regenBtn) regenBtn.disabled = !status.enabled;
    if (alertEl) alertEl.hidden = !status.enabled;

    if (countEl) {
      const codeWord = status.recoveryCodesRemaining === 1 ? 'code' : 'codes';
      countEl.textContent = status.enabled
        ? `${status.recoveryCodesRemaining} recovery ${codeWord} remaining`
        : 'Disabled';
    }
  } catch (error: any) {
    if (countEl) countEl.textContent = 'Failed to load MFA status';
  }
}

export async function handleRegenerateRecoveryCodes(): Promise<void> {
  const btn = document.getElementById('regenerateMfaCodesBtn') as HTMLButtonElement | null;
  if (!confirm('Regenerating recovery codes will invalidate all your existing recovery codes. Continue?')) return;
  if (btn) btn.disabled = true;
  try {
    const { recoveryCodes } = await api<{ recoveryCodes: string[] }>('/api/v1/auth/mfa/recovery-codes/regenerate', {
      method: 'POST',
    });
    lastRecoveryCodes = recoveryCodes;
    const grid = document.getElementById('recoveryCodesGrid');
    if (grid) {
      grid.innerHTML = recoveryCodes
        .map((c) => `<code style="text-align:center;padding:10px;font-size:13px">${esc(c)}</code>`)
        .join('');
    }
    const recModal = document.getElementById('mfaRecoveryCodesModal');
    if (recModal) recModal.hidden = false;
    toast('Recovery codes regenerated successfully.', 'good');
    await loadMfa();
  } catch (err: any) {
    toast(err.message || 'Failed to regenerate recovery codes.', 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function openMfaSetupModal(): void {
  const modal = document.getElementById('mfaSetupModal');
  if (!modal) return;
  modal.hidden = false;

  const passwordStep = document.getElementById('mfaSetupPasswordStep');
  const enrollStep = document.getElementById('mfaSetupEnrollStep');
  const passwordInput = document.getElementById('mfaConfirmPasswordInput') as HTMLInputElement | null;
  const pwError = document.getElementById('mfaPasswordError');
  const setupError = document.getElementById('mfaSetupError');

  if (pwError) pwError.hidden = true;
  if (setupError) setupError.hidden = true;
  if (passwordInput) passwordInput.value = '';

  // Show password step first
  if (passwordStep) passwordStep.hidden = false;
  if (enrollStep) enrollStep.hidden = true;
  passwordInput?.focus();
}

export function closeMfaSetupModal(): void {
  const modal = document.getElementById('mfaSetupModal');
  if (modal) modal.hidden = true;
}

export async function handleMfaPasswordSubmit(event: Event): Promise<void> {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const password = (document.getElementById('mfaConfirmPasswordInput') as HTMLInputElement)?.value || '';
  const errorEl = document.getElementById('mfaPasswordError');
  const submitBtn = document.getElementById('submitMfaPasswordBtn') as HTMLButtonElement | null;

  if (!password) {
    if (errorEl) { errorEl.textContent = 'Enter your current password.'; errorEl.hidden = false; }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;

  try {
    const result = await api<{ uri: string; secret: string }>('/api/v1/auth/mfa/totp/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    form.reset();
    mfaEnrollmentState = result;

    const passwordStep = document.getElementById('mfaSetupPasswordStep');
    const enrollStep = document.getElementById('mfaSetupEnrollStep');
    if (passwordStep) passwordStep.hidden = true;
    if (enrollStep) enrollStep.hidden = false;

    // Render QR into #mfaQr
    const qrContainer = document.getElementById('mfaQr');
    if (qrContainer && window.PetalQR) {
      try {
        const qr = window.PetalQR.make(result.uri);
        let qHtml = '';
        for (let r = 0; r < qr.size; r++) {
          const row = qr.m[r];
          for (let c = 0; c < qr.size; c++) {
            qHtml += `<i class="${row && row[c] ? '' : 'o'}"></i>`;
          }
        }
        qrContainer.style.gridTemplateColumns = `repeat(${qr.size}, 1fr)`;
        qrContainer.innerHTML = qHtml;
      } catch {
        qrContainer.innerHTML = window.PetalQR.svg(result.uri);
      }
    }

    // Set Secret code
    const secretEl = document.getElementById('mfaSecret');
    if (secretEl) {
      secretEl.textContent = result.secret.replace(/(.{4})/g, '$1 ').trim();
    }
    const copyBtn = document.getElementById('copyMfaSecretBtn');
    if (copyBtn) {
      copyBtn.setAttribute('data-copy-secret', result.secret);
    }

    // Reset OTP inputs
    const otpInputs = document.querySelectorAll<HTMLInputElement>('#mfaOtpContainer input');
    otpInputs.forEach((inp) => (inp.value = ''));
    otpInputs[0]?.focus();
  } catch (err: any) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Password confirmation failed.';
      errorEl.hidden = false;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function verifyMfaSetup(): Promise<void> {
  const inputs = document.querySelectorAll<HTMLInputElement>('#mfaOtpContainer input');
  const code = Array.from(inputs).map((i) => i.value.trim()).join('');
  const errorEl = document.getElementById('mfaSetupError');
  const verifyBtn = document.getElementById('verifyMfaBtn') as HTMLButtonElement | null;

  if (code.length !== 6) {
    if (errorEl) { errorEl.textContent = 'Enter all 6 digits from your authenticator app.'; errorEl.hidden = false; }
    document.getElementById('mfaOtpContainer')?.classList.add('bad');
    return;
  }

  if (verifyBtn) verifyBtn.disabled = true;

  try {
    const result = await api<{ enabled: boolean; recoveryCodes: string[] }>('/api/v1/auth/mfa/totp/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    closeMfaSetupModal();
    lastRecoveryCodes = result.recoveryCodes || [];

    // Show Recovery Codes Modal
    const recGrid = document.getElementById('recoveryCodesGrid');
    if (recGrid) {
      recGrid.innerHTML = lastRecoveryCodes
        .map((c) => `<code style="text-align:center;padding:10px;font-size:13px">${esc(c)}</code>`)
        .join('');
    }

    const recModal = document.getElementById('mfaRecoveryCodesModal');
    if (recModal) recModal.hidden = false;

    toast('Two-step verification is now enabled.', 'good');
    await loadMfa();
  } catch (err: any) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Invalid verification code.';
      errorEl.hidden = false;
    }
    document.getElementById('mfaOtpContainer')?.classList.add('bad');
  } finally {
    if (verifyBtn) verifyBtn.disabled = false;
  }
}

export function openMfaDisableModal(): void {
  const modal = document.getElementById('mfaDisableModal');
  if (!modal) return;
  modal.hidden = false;
  const pw = document.getElementById('disableMfaPassword') as HTMLInputElement | null;
  const cd = document.getElementById('disableMfaCode') as HTMLInputElement | null;
  const err = document.getElementById('disableMfaError');
  if (pw) pw.value = '';
  if (cd) cd.value = '';
  if (err) err.hidden = true;
  pw?.focus();
}

export function closeMfaDisableModal(): void {
  const modal = document.getElementById('mfaDisableModal');
  if (modal) modal.hidden = true;
  // Re-sync toggle switch
  const switchEl = document.getElementById('mfaToggleSwitch');
  if (switchEl && currentMfaStatus) switchEl.setAttribute('aria-checked', currentMfaStatus.enabled ? 'true' : 'false');
}

export async function handleDisableMfaSubmit(event: Event): Promise<void> {
  event.preventDefault();
  const password = (document.getElementById('disableMfaPassword') as HTMLInputElement)?.value || '';
  const code = (document.getElementById('disableMfaCode') as HTMLInputElement)?.value.trim() || '';
  const errorEl = document.getElementById('disableMfaError');
  const btn = document.getElementById('confirmDisableMfaBtn') as HTMLButtonElement | null;

  if (!password || !code) {
    if (errorEl) { errorEl.textContent = 'Password and code are required.'; errorEl.hidden = false; }
    return;
  }

  if (btn) btn.disabled = true;

  try {
    await api('/api/v1/auth/mfa/totp', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, code }),
    });

    closeMfaDisableModal();
    toast('Two-step verification was disabled.', 'good');
    await loadMfa();
  } catch (err: any) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Failed to disable two-step verification.';
      errorEl.hidden = false;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function copyLastRecoveryCodes(): void {
  if (!lastRecoveryCodes.length) {
    toast('No recovery codes to copy.', 'warn');
    return;
  }
  const text = lastRecoveryCodes.join('\n');
  navigator.clipboard?.writeText(text)
    .then(() => toast('Recovery codes copied to clipboard.', 'good'))
    .catch(() => toast('Failed to copy codes.', 'warn'));
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
      host.innerHTML = `<div class="alert"><div><span>No team members found.</span></div></div>`;
      return;
    }

    host.innerHTML = `
      <div style="overflow-x:auto;margin-top:8px">
        <table class="tbl rsp">
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
                <td data-label="Role"><span class="pill ${m.role === 'OWNER' ? 'acc' : 'info'}">${esc(m.role)}</span></td>
                <td data-label="Joined" class="muted">${formatDate(m.createdAt)}</td>
                <td data-label="Action" class="r">
                  ${m.isOwner ? '<span class="pill good">Owner</span>' : `<button class="btn xs sec" style="color:var(--bad)" type="button" data-revoke-member="${esc(m.id)}">Remove</button>`}
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
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load team</b><span>${esc(error.message)}</span></div></div>`;
  }
}

export async function loadEmailStatus(): Promise<void> {
  const host = document.getElementById('emailDeliveryStatus');
  if (!host) return;

  try {
    const status = await api<{ mode: string; pendingCount: number; sentCount: number; failedCount: number }>(
      '/api/v1/email/status'
    );
    const modePills: Record<string, string> = {
      disabled: '<span class="pill warn">DISABLED</span>',
      sandbox: '<span class="pill info">SANDBOX</span>',
      live: '<span class="pill good">LIVE</span>',
    };

    host.innerHTML = `
      <div class="li"><span class="tile sm">${hero('paper', 's')}</span><span class="tx"><b>Transport mode</b><small>Current transactional email provider state</small></span>${modePills[status.mode] || `<span class="pill">${esc(status.mode)}</span>`}</div>
      <div class="li"><span class="tile sm">${hero('document', 's')}</span><span class="tx"><b>Outbox queue</b><small>${status.pendingCount} pending · ${status.sentCount} sent · ${status.failedCount} failed</small></span></div>
    `;
  } catch (error: any) {
    host.innerHTML = `<div class="alert bad"><div><b>Failed to load email status</b><span>${esc(error.message)}</span></div></div>`;
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

function bindEditProfile(): void {
  const btn = document.getElementById('editProfileBtn') as HTMLButtonElement | null;
  if (!btn || btn.dataset['bound']) return;
  btn.dataset['bound'] = '1';
  btn.addEventListener('click', async () => {
    try {
      const me = await api<{ user: { name: string }; account: { name: string }; membership: { role: string } }>('/api/v1/auth/me');
      const owner = me.membership.role === 'OWNER';
      const v = await formDialog({
        title: 'Edit profile', confirmLabel: 'Save',
        message: owner ? undefined : 'Only the workspace owner can rename the workspace.',
        fields: [
          { key: 'name', label: 'Your name', value: me.user.name },
          ...(owner ? [{ key: 'workspaceName', label: 'Workspace name', value: me.account.name }] : []),
        ],
      });
      if (!v) return;
      const body: Record<string, string> = { name: String(v['name']) };
      if (owner) body['workspaceName'] = String(v['workspaceName']);
      const res = await api<{ user: { name: string; email: string }; account: { name: string } }>('/api/v1/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const set = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
      set('profName', res.user.name); set('profWorkspace', res.account.name); set('userName', res.user.name);
      const initials = res.user.name.slice(0, 2).toUpperCase();
      set('userAvatar', initials); set('topUserAvatar', initials);
      toast('Profile updated', 'good');
    } catch (e: any) { toast(e?.message || 'Could not update the profile.', 'bad'); }
  });
}
