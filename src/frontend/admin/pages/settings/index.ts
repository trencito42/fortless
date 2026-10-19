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

interface EmailTemplateItem { template: string; name: string; subject: string; text: string; html: string; overridden: boolean; updatedAt: string | null }
interface EmailSettingsData { templates: EmailTemplateItem[]; failedDeliveries: Array<{ id: string; recipient: string; template: string; status: string; attempts: number; last_error: string | null }> }
let emailTemplates: EmailTemplateItem[] = [];

function showTemplate(templateId: string): void {
  const template = emailTemplates.find((item) => item.template === templateId);
  if (!template) return;
  (document.getElementById('emailTemplateSubject') as HTMLInputElement).value = template.subject;
  (document.getElementById('emailTemplateText') as HTMLTextAreaElement).value = template.text;
  (document.getElementById('emailTemplateHtml') as HTMLTextAreaElement).value = template.html;
  const state = document.getElementById('emailTemplateState');
  if (state) { state.className = `pill ${template.overridden ? 'warn d' : 'good d'}`; state.textContent = template.overridden ? 'Custom override' : 'Canonical'; }
}

export async function renderEmailSettings(): Promise<void> {
  const data = await api<EmailSettingsData>('/api/v1/admin/settings/email-templates');
  emailTemplates = data.templates;
  const select = document.getElementById('emailTemplateSelect') as HTMLSelectElement | null;
  if (select) {
    const selected = select.value || emailTemplates[0]?.template || '';
    select.innerHTML = emailTemplates.map((item) => `<option value="${esc(item.template)}">${esc(item.name)} · ${esc(item.template)}</option>`).join('');
    select.value = emailTemplates.some((item) => item.template === selected) ? selected : emailTemplates[0]?.template || '';
    showTemplate(select.value);
  }
  const tokenTemplates = new Set(['email_verification', 'password_reset', 'account_invitation', 'service_invitation']);
  const tbody = document.getElementById('failedEmailDeliveries');
  if (tbody) tbody.innerHTML = data.failedDeliveries.length ? data.failedDeliveries.map((item) => `<tr>
    <td>${esc(item.recipient)}</td><td><span class="mono">${esc(item.template)}</span></td><td><span class="pill bad d">${esc(item.status)}</span></td>
    <td class="muted" title="${esc(item.last_error || '')}">${esc((item.last_error || 'Unknown delivery error').slice(0, 80))}</td>
    <td>${tokenTemplates.has(item.template) ? '<span class="muted">Regenerate from workflow</span>' : `<button class="btn xs" type="button" data-resend-email="${esc(item.id)}">Resend safely</button>`}</td>
  </tr>`).join('') : '<tr><td colspan="5"><div class="empty"><b>No failed deliveries</b><span>The transactional outbox is clear.</span></div></td></tr>';
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
    await renderEmailSettings();
  } catch (err: any) {
    const testResult = document.getElementById('providerTestResult');
    if (testResult) {
      testResult.hidden = false;
      testResult.className = 'alert bad';
      testResult.innerHTML = `<div><b>Error loading settings</b><span>${esc(err.message)}</span></div>`;
    }
  }
}

export function selectEmailTemplate(): void {
  const select = document.getElementById('emailTemplateSelect') as HTMLSelectElement | null;
  if (select) showTemplate(select.value);
}

export async function saveEmailTemplate(): Promise<void> {
  const template = (document.getElementById('emailTemplateSelect') as HTMLSelectElement).value;
  await api(`/api/v1/admin/settings/email-templates/${encodeURIComponent(template)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    subject: (document.getElementById('emailTemplateSubject') as HTMLInputElement).value,
    text: (document.getElementById('emailTemplateText') as HTMLTextAreaElement).value,
    html: (document.getElementById('emailTemplateHtml') as HTMLTextAreaElement).value,
  }) });
  await renderEmailSettings();
}

export async function resetEmailTemplate(): Promise<void> {
  const template = (document.getElementById('emailTemplateSelect') as HTMLSelectElement).value;
  await api.delete(`/api/v1/admin/settings/email-templates/${encodeURIComponent(template)}`);
  await renderEmailSettings();
}

export async function resendEmail(id: string): Promise<void> {
  await api.post(`/api/v1/admin/settings/email-deliveries/${encodeURIComponent(id)}/resend`, { reason: 'Manual safe resend after delivery review' });
  await renderEmailSettings();
}

async function testIntegration(kind: 'smtp' | 'stripe'): Promise<void> {
  const button = document.getElementById(kind === 'smtp' ? 'testSmtpBtn' : 'testStripeBtn') as HTMLButtonElement | null;
  const result = document.getElementById(kind === 'smtp' ? 'smtpTestResult' : 'stripeTestResult');
  if (!button || !result) return;
  button.disabled = true; result.hidden = true;
  try {
    const response = await api<{ latencyMs: number; livemode?: boolean }>(`/api/v1/admin/settings/test-${kind}`, { method: 'POST' });
    result.hidden = false; result.className = 'alert good';
    result.innerHTML = `<div><b>${kind === 'smtp' ? 'SMTP authentication succeeded' : `Stripe ${response.livemode ? 'live' : 'test'} API connected`}</b><span>Read-only validation completed in ${response.latencyMs}ms.</span></div>`;
  } catch (error: any) {
    result.hidden = false; result.className = 'alert bad'; result.innerHTML = `<div><b>Validation failed</b><span>${esc(error.message)}</span></div>`;
  } finally { button.disabled = false; }
}

export const testSmtpConnection = () => testIntegration('smtp');
export const testStripeConnection = () => testIntegration('stripe');

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
