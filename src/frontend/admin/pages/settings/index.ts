/**
 * Staff Control Plane — Settings & Infrastructure Integrations
 * Route: /admin/settings
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero } from '../../../petal/index.js';

interface SettingsData {
  environment: { nodeEnv: string; providerMode: string; maintenanceMode: boolean };
  provider: { configured: boolean; type: string; panelUrl: string | null };
  payments: { mode: string; stripeConfigured: boolean; webhookSecretConfigured: boolean };
  email: { transport: string; configured: boolean; fromAddress: string | null };
  security: { stepUpRequired: boolean; antiFraudEnabled: boolean; sessionTtlSeconds: number };
  resources: { accounts: number; services: number; products: number; nodes: number };
}

export async function renderSettings(): Promise<void> {
  const panelStatus = document.getElementById('settingsPanelStatus');
  const panelUrl = document.getElementById('settingsPanelUrl');
  const stripeStatus = document.getElementById('settingsStripeStatus');
  const stripeMode = document.getElementById('settingsStripeMode');
  const mailStatus = document.getElementById('settingsMailStatus');
  const mailSender = document.getElementById('settingsMailSender');
  const mfaPolicy = document.getElementById('settingsMfaPolicy');
  const sessionTtl = document.getElementById('settingsSessionTtl');

  try {
    const data = await api<SettingsData>('/api/v1/admin/settings');

    if (panelStatus) {
      panelStatus.className = `pill ${data.provider.configured ? 'good d' : 'bad d'}`;
      panelStatus.textContent = data.provider.configured ? 'Configured & Active' : 'Not Configured';
    }
    if (panelUrl) panelUrl.textContent = data.provider.panelUrl || 'No panel URL configured';

    if (stripeStatus) {
      stripeStatus.className = `pill ${data.payments.stripeConfigured ? 'good d' : 'warn d'}`;
      stripeStatus.textContent = data.payments.stripeConfigured ? 'Connected (Live)' : 'Mock / Inactive';
    }
    if (stripeMode) stripeMode.textContent = data.payments.mode.toUpperCase();

    if (mailStatus) {
      mailStatus.className = `pill ${data.email.configured ? 'good d' : 'neu d'}`;
      mailStatus.textContent = data.email.configured ? `${data.email.transport.toUpperCase()} Active` : 'Disabled';
    }
    if (mailSender) mailSender.textContent = data.email.fromAddress || 'system-mailer@fortless.net';

    if (mfaPolicy) {
      mfaPolicy.className = `pill ${data.security.stepUpRequired ? 'good d' : 'warn d'}`;
      mfaPolicy.textContent = data.security.stepUpRequired ? 'Enforced (Fresh MFA)' : 'Standard';
    }
    if (sessionTtl) {
      const hours = Math.round(data.security.sessionTtlSeconds / 3600);
      sessionTtl.textContent = `${hours} hours`;
    }
  } catch (err: any) {
    const testResult = document.getElementById('providerTestResult');
    if (testResult) {
      testResult.hidden = false;
      testResult.className = 'alert bad';
      testResult.innerHTML = `<div><b>Error loading settings</b><span>${esc(err.message)}</span></div>`;
    }
  }
}

export async function testProviderConnection(): Promise<void> {
  const btn = document.getElementById('testProviderBtn') as HTMLButtonElement | null;
  const resultDiv = document.getElementById('providerTestResult');
  if (!btn || !resultDiv) return;

  btn.disabled = true;
  btn.innerHTML = 'Testing live connectivity…';
  resultDiv.hidden = true;

  try {
    const res = await api<{
      success: boolean;
      provider: string;
      panelUrl: string;
      latencyMs: number;
      nodesCount: number;
      eggsCount: number;
      nestsCount: number;
    }>('/api/v1/admin/settings/test-provider', { method: 'POST' });

    resultDiv.hidden = false;
    resultDiv.className = 'alert good';
    resultDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span class="tile sm good">${hero('shield')}</span>
        <div>
          <b>Pterodactyl Application API Connected (${res.latencyMs}ms)</b>
          <p style="margin:2px 0 0 0;font-size:12px">
            Discovered <b>${res.nodesCount}</b> nodes, <b>${res.nestsCount}</b> nests, and <b>${res.eggsCount}</b> eggs available for catalog assignment.
          </p>
        </div>
      </div>
    `;
  } catch (err: any) {
    resultDiv.hidden = false;
    resultDiv.className = 'alert bad';
    resultDiv.innerHTML = `
      <div>
        <b>Provider Ping Failed</b>
        <p style="margin:2px 0 0 0;font-size:12px">${esc(err.message)}</p>
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${hero('activity', 'xs')} Test Live Connection`;
  }
}
