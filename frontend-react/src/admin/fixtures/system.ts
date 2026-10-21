import type { EmailDelivery, EmailTemplate, FeatureFlag } from '../types';
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
