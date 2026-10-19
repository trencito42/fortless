/**
 * Staff Control Plane — Settings & Infrastructure Integrations
 * Route: /admin/settings
 */

import { api } from '../../../core/api/client.js';
import { esc } from '../../../core/utils/dom.js';
import { hero } from '../../../petal/index.js';

interface SettingsData {
  general: { platformName: string; appOrigin: string; nodeEnv: string; currency: string; currencyMinorUnits: string };
  provider: { configured: boolean; type: string; mode: string; panelUrl: string | null; verificationTier: string };
  payments: { mode: string; configured: boolean; webhookSecretConfigured: boolean; currency: string };
  email: { mode: string; configured: boolean; host: string | null; port: number | null; user: string | null; from: string | null };
  security: { staffMfaMandatory: boolean; sessionTtlHours: number; stepUpTtlMinutes: number; antiSsrBlacklistActive: boolean };
  counts: { accounts: number; services: number; staff: number; products: number };
}

export async function renderSettings(): Promise<void> {
  try {
    const data = await api<SettingsData>('/api/v1/admin/settings');
    const setText = (id: string, value: string) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const setPill = (id: string, active: boolean, yes: string, no: string) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.className = `pill ${active ? 'good d' : 'warn d'}`;
      element.textContent = active ? yes : no;
    };

    setPill('settingsProviderPill', data.provider.configured, 'Configured', 'Not configured');
    setText('settingsProviderMode', data.provider.mode.toUpperCase());
    setText('settingsProviderUrl', data.provider.panelUrl || 'Not configured');
    setText('settingsProviderTier', data.provider.verificationTier || 'Not configured');
    setText('settingsProviderCreds', data.provider.configured ? 'Present (masked)' : 'Missing');

    setPill('settingsPaymentsPill', data.payments.configured, 'Configured', 'Not configured');
    setText('settingsPaymentsMode', data.payments.mode.toUpperCase());
    setText('settingsPaymentsCurrency', `${data.payments.currency} (minor units: cents)`);
    setText('settingsWebhookStatus', data.payments.webhookSecretConfigured ? 'Configured (masked)' : 'Missing');

    setPill('settingsEmailPill', data.email.configured, 'Configured', 'Not configured');
    setText('settingsEmailMode', data.email.mode.toUpperCase());
    setText('settingsEmailHost', data.email.host ? `${data.email.host}${data.email.port ? `:${data.email.port}` : ''}` : 'Not configured');
    setText('settingsEmailFrom', data.email.from || 'Not configured');

    setPill('settingsSecurityPill', data.security.staffMfaMandatory, 'Enforced', 'Not enforced');
    setText('settingsStaffMfa', data.security.staffMfaMandatory ? 'Required for staff operations' : 'Not required');
    setText('settingsSessionTtl', `${data.security.sessionTtlHours} hours`);
    setText('settingsStepUpTtl', `${data.security.stepUpTtlMinutes} minutes`);
    setText('settingsSsrf', data.security.antiSsrBlacklistActive ? 'Private and metadata networks blocked' : 'Not active');
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
    btn.innerHTML = `${hero('activity', 'xs')} Test API connection`;
  }
}
