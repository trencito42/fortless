import type { EmailDelivery, EmailTemplate, FeatureFlag, ScheduledTask, SettingsSection } from '../types';
import { DAY, HOUR, MIN, iso } from '../lib/format';

export const featureFlags: FeatureFlag[] = [
  { key: 'react_admin', label: 'React admin UI', description: 'Serve the new React admin at /admin instead of the legacy HTML console.', enabled: false, scope: 'staff_only', rollout: 0, owner: 'Daniel Voss', updatedAt: iso(-2 * DAY), risk: 'high' },
  { key: 'checkout_sepa', label: 'SEPA Direct Debit at checkout', description: 'Offer SEPA in addition to cards for EUR customers.', enabled: true, scope: 'percentage', rollout: 25, owner: 'Ioana Marin', updatedAt: iso(-6 * DAY), risk: 'medium' },
  { key: 'auto_migrate', label: 'Automatic node rebalancing', description: 'Allow the scheduler to move services off nodes above 90% sold RAM. Not implemented in backend.', enabled: false, scope: 'global', rollout: 0, owner: 'Victor Lang', updatedAt: iso(-30 * DAY), risk: 'high' },
  { key: 'ai_ticket_assist', label: 'AI reply suggestions in tickets', description: 'Draft replies for agents using the ai-assist endpoint.', enabled: true, scope: 'staff_only', rollout: 100, owner: 'Cătălin Rusu', updatedAt: iso(-12 * DAY), risk: 'low' },
  { key: 'referrals', label: 'Referral programme', description: 'Credit referrers when a referee pays. No backend support yet.', enabled: false, scope: 'global', rollout: 0, owner: 'Maria Ilie', updatedAt: iso(-80 * DAY), risk: 'medium' },
  { key: 'public_status_v2', label: 'Public status page v2', description: 'Component-level uptime history on the public page.', enabled: true, scope: 'global', rollout: 100, owner: 'Victor Lang', updatedAt: iso(-45 * DAY), risk: 'low' },
  { key: 'vps_beta', label: 'VPS (KVM) beta', description: 'Show the VPS product to the beta group.', enabled: false, scope: 'staff_only', rollout: 0, owner: 'Daniel Voss', updatedAt: iso(-8 * DAY), risk: 'medium' },
];

export const emailTemplates: EmailTemplate[] = [
  { key: 'verify_email', name: 'Verify email', subject: 'Confirm your Fortless email', body: 'Hi {{name}},\n\nConfirm your address: {{link}}\n\nThe link expires in 24 hours.', updatedAt: iso(-100 * DAY), customized: false },
  { key: 'invoice_paid', name: 'Invoice paid', subject: 'Receipt {{invoice.number}}', body: 'Thanks. We received {{amount}} for {{invoice.number}}.', updatedAt: iso(-30 * DAY), customized: true },
  { key: 'payment_failed', name: 'Payment failed', subject: 'Action needed: payment failed', body: 'We could not charge your card for {{invoice.number}}. Update your payment method to keep your services.', updatedAt: iso(-30 * DAY), customized: true },
  { key: 'service_suspended', name: 'Service suspended', subject: 'Your service {{service.name}} is suspended', body: 'Your service has been suspended. Reason: {{reason}}.', updatedAt: iso(-200 * DAY), customized: false },
  { key: 'ticket_reply', name: 'Ticket reply', subject: '[{{ticket.id}}] {{ticket.subject}}', body: '{{reply}}\n\n— {{agent.name}}', updatedAt: iso(-200 * DAY), customized: false },
];

export const emailDeliveries: EmailDelivery[] = [
  { id: 'eml_1', template: 'invoice_paid', to: 'a***@pixelforge.example', status: 'sent', at: iso(-10 * MIN), error: null },
  { id: 'eml_2', template: 'payment_failed', to: 'f***@pixelforge.example', status: 'failed', at: iso(-3 * HOUR), error: '421 greylisted' },
  { id: 'eml_3', template: 'verify_email', to: 's***@example.test', status: 'bounced', at: iso(-30 * HOUR), error: '550 user unknown' },
  { id: 'eml_4', template: 'ticket_reply', to: 'm***@example.test', status: 'sent', at: iso(-2 * HOUR), error: null },
  { id: 'eml_5', template: 'invoice_paid', to: 'l***@kestrel-esports.example', status: 'queued', at: iso(-2 * MIN), error: null },
  { id: 'eml_6', template: 'service_suspended', to: 't***@example.test', status: 'sent', at: iso(-11 * DAY), error: null },
];

export const settings: SettingsSection[] = [
  { id: 'general', values: { company: 'Fortless Hosting (demo entity)', siteUrl: 'https://fortless.net', supportEmail: 'support@fortless.example', billingEmail: 'billing@fortless.example', timezone: 'UTC', defaultCurrency: 'EUR', statusUrl: 'https://fortless.net/status' } },
  { id: 'auth', values: { minPassword: '12', sessionHours: '12', stepUpMinutes: '5', lockoutAttempts: '10', staffMfaRequired: 'true', customerMfaOffered: 'true', allowedOrigins: 'https://fortless.net', oidcDiscord: 'true', oidcGithub: 'false', oidcGoogle: 'false' } },
  { id: 'payments', values: { mode: 'live', publishable: 'pk_live_••••••••••••••••Zq3m', secret: 'sk_live_••••••••••••••••Qx7p', webhookSecret: 'whsec_••••••••••••••••8Kd2', endpoint: 'https://fortless.net/api/v1/webhooks/stripe', descriptor: 'FORTLESS HOSTING', methodCard: 'true', methodSepa: 'true', threeDs: 'automatic', lastVerified: '' } },
  { id: 'email', values: { host: 'smtp.relay.example', port: '587', security: 'starttls', username: 'fortless-relay', password: '••••••••••••', fromName: 'Fortless', fromAddress: 'no-reply@fortless.example', replyTo: 'support@fortless.example' } },
  { id: 'notifications', values: { 'critical.email': 'true', 'critical.inapp': 'true', 'critical.push': 'false', 'payments.email': 'true', 'payments.inapp': 'true', 'payments.push': 'false', 'security.email': 'true', 'security.inapp': 'true', 'security.push': 'false', 'support.email': 'false', 'support.inapp': 'true', 'support.push': 'false', 'infra.email': 'true', 'infra.inapp': 'true', 'infra.push': 'false', quietHours: 'false', digest: 'daily' } },
  { id: 'localization', values: { defaultLanguage: 'en', langEn: 'true', langRo: 'true', langDe: 'false', dateFormat: 'dd MMM yyyy', timeFormat: '24h', firstDay: 'monday', currencyEur: 'true', currencyUsd: 'true', currencyRon: 'true', currencyGbp: 'false', roundRon: 'whole' } },
  { id: 'system', values: { maintenanceMode: 'false', maintenanceMessage: '', registrationOpen: 'true', checkoutOpen: 'true' } },
];

export const scheduledTasks: ScheduledTask[] = [
  { id: 'tsk_renew', name: 'Process renewals', schedule: 'Every 15 minutes', lastRunAt: new Date('2026-10-21T09:15:00Z').toISOString(), lastStatus: 'ok', durationMs: 4200, nextRunAt: new Date('2026-10-21T09:30:00Z').toISOString() },
  { id: 'tsk_sync', name: 'Runtime sync', schedule: 'Every 5 minutes', lastRunAt: new Date('2026-10-21T09:25:00Z').toISOString(), lastStatus: 'ok', durationMs: 1800, nextRunAt: new Date('2026-10-21T09:30:00Z').toISOString() },
  { id: 'tsk_dunning', name: 'Dunning and grace checks', schedule: 'Hourly', lastRunAt: new Date('2026-10-21T09:00:00Z').toISOString(), lastStatus: 'ok', durationMs: 900, nextRunAt: new Date('2026-10-21T10:00:00Z').toISOString() },
  { id: 'tsk_backup', name: 'Database backup', schedule: 'Daily 02:00 UTC', lastRunAt: new Date('2026-10-21T02:00:00Z').toISOString(), lastStatus: 'ok', durationMs: 61000, nextRunAt: new Date('2026-10-22T02:00:00Z').toISOString() },
  { id: 'tsk_email', name: 'Email retry sweep', schedule: 'Every 10 minutes', lastRunAt: new Date('2026-10-21T09:20:00Z').toISOString(), lastStatus: 'failed', durationMs: 30000, nextRunAt: new Date('2026-10-21T09:30:00Z').toISOString() },
  { id: 'tsk_capacity', name: 'Release expired capacity reservations', schedule: 'Every 5 minutes', lastRunAt: new Date('2026-10-21T09:25:00Z').toISOString(), lastStatus: 'ok', durationMs: 120, nextRunAt: new Date('2026-10-21T09:30:00Z').toISOString() },
];
