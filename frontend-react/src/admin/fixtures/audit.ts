import type { AuditEvent, Customer, SecurityEvent, Service, StaffMember } from '../types';
import { ADMIN_NOW, DAY, HOUR, MIN, iso } from '../lib/format';
import { makeRng, pad } from './rng';

export function buildAudit(customers: Customer[], services: Service[], staff: StaffMember[]): { audit: AuditEvent[]; security: SecurityEvent[] } {
  const r = makeRng(55);
  const active = staff.filter((s) => s.status === 'ACTIVE');
  const audit: AuditEvent[] = [];
  const kinds: Array<{ action: string; type: string; who: 'STAFF' | 'USER' | 'SYSTEM' | 'WEBHOOK'; res: AuditEvent['result']; w: number }> = [
    { action: 'service.suspended', type: 'service', who: 'STAFF', res: 'success', w: 5 }, { action: 'service.unsuspended', type: 'service', who: 'STAFF', res: 'success', w: 4 },
    { action: 'account.note_added', type: 'account', who: 'STAFF', res: 'success', w: 8 }, { action: 'account.status_changed', type: 'account', who: 'STAFF', res: 'success', w: 3 },
    { action: 'invoice.refunded', type: 'invoice', who: 'STAFF', res: 'success', w: 3 }, { action: 'ticket.replied', type: 'ticket', who: 'STAFF', res: 'success', w: 14 },
    { action: 'ticket.status_changed', type: 'ticket', who: 'STAFF', res: 'success', w: 8 }, { action: 'catalog.plan_status_changed', type: 'plan', who: 'STAFF', res: 'success', w: 2 },
    { action: 'staff.membership_changed', type: 'staff_membership', who: 'STAFF', res: 'success', w: 1 }, { action: 'service.power', type: 'service', who: 'STAFF', res: 'success', w: 7 },
    { action: 'service.terminated', type: 'service', who: 'STAFF', res: 'denied', w: 1 }, { action: 'infrastructure.reconcile', type: 'node', who: 'STAFF', res: 'success', w: 2 },
    { action: 'billing.profile_updated', type: 'account', who: 'USER', res: 'success', w: 7 }, { action: 'auth.login', type: 'user', who: 'USER', res: 'success', w: 14 },
    { action: 'auth.mfa_enabled', type: 'user', who: 'USER', res: 'success', w: 2 }, { action: 'payment.webhook_processed', type: 'payment', who: 'WEBHOOK', res: 'success', w: 14 },
    { action: 'payment.webhook_processed', type: 'payment', who: 'WEBHOOK', res: 'failed', w: 1 }, { action: 'provisioning.service_created', type: 'service', who: 'SYSTEM', res: 'success', w: 9 },
    { action: 'provisioning.service_create_failed', type: 'service', who: 'SYSTEM', res: 'failed', w: 2 }, { action: 'subscription.renewed', type: 'subscription', who: 'SYSTEM', res: 'success', w: 10 },
  ];
  const stepped = kinds.flatMap((k) => Array(k.w).fill(k) as typeof kinds);
  for (let i = 1; i <= 420; i++) {
    const k = r.pick(stepped);
    const c = r.pick(customers);
    const svc = r.pick(services);
    const staffer = r.pick(active);
    const at = ADMIN_NOW - Math.round(Math.pow(r.next(), 1.6) * 21 * DAY);
    const resourceId = k.type === 'service' ? svc.id : k.type === 'account' || k.type === 'user' ? c.id : k.type === 'staff_membership' ? staffer.id : `${k.type.slice(0, 3)}_${pad(r.int(1, 90))}`;
    const diff: { before?: Record<string, string>; after?: Record<string, string> } = k.action === 'account.status_changed' ? { before: { status: 'ACTIVE' }, after: { status: 'RESTRICTED' } } : k.action === 'catalog.plan_status_changed' ? { before: { status: 'DRAFT' }, after: { status: 'ACTIVE' } } : k.action === 'staff.membership_changed' ? { before: { role: 'SUPPORT' }, after: { role: 'ADMINISTRATOR' } } : k.action === 'billing.profile_updated' ? { before: { vatId: 'RO1••••' }, after: { vatId: 'RO9••••' } } : {};
    audit.push({
      id: `aud_${pad(i, 5)}`, at: new Date(at).toISOString(), actor: k.who === 'STAFF' ? { type: 'STAFF', id: staffer.id, name: staffer.name } : k.who === 'USER' ? { type: 'USER', id: c.members[0]!.id, name: c.members[0]!.name } : k.who === 'WEBHOOK' ? { type: 'WEBHOOK', id: 'stripe', name: 'Stripe webhook' } : { type: 'SYSTEM', id: 'worker', name: 'Fortless worker' },
      accountId: k.type === 'staff_membership' || k.type === 'plan' ? null : c.id, action: k.action, resource: { type: k.type, id: resourceId, label: k.type === 'service' ? svc.name : resourceId }, result: k.res,
      ip: k.who === 'STAFF' ? staffer.sessions[0]?.ip ?? '203.0.113.9' : k.who === 'USER' ? `198.51.100.${r.int(2, 250)}` : '—', correlationId: `cor_${r.hex(12)}`, ...diff,
      ...(k.action.startsWith('invoice.') || k.action.startsWith('service.') ? { reason: 'See ticket history' } : {}),
    });
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));

  const sec: SecurityEvent[] = [];
  const sk: Array<[SecurityEvent['kind'], SecurityEvent['severity'], string]> = [
    ['login_failed', 'info', 'Wrong password'], ['mfa_failed', 'warning', 'Invalid TOTP code'], ['step_up_denied', 'warning', 'Step-up window expired before confirm'], ['permission_denied', 'warning', 'Role lacks accounts:manage'],
    ['rate_limited', 'warning', 'Too many sign-in attempts'], ['session_revoked', 'info', 'Session revoked by owner'], ['suspicious_login', 'critical', 'Login from new country and ASN'], ['api_key_created', 'info', 'API key created for customer account'],
  ];
  for (let i = 1; i <= 70; i++) {
    const [kind, severity, detail] = r.pick(sk);
    sec.push({ id: `sec_${pad(i, 4)}`, at: new Date(ADMIN_NOW - Math.round(Math.pow(r.next(), 1.5) * 14 * DAY)).toISOString(), kind, severity, actor: kind === 'permission_denied' || kind === 'step_up_denied' || kind === 'session_revoked' ? r.pick(active).name : r.pick(customers).email, ip: `198.51.100.${r.int(2, 250)}`, detail, accountId: r.chance(0.7) ? r.pick(customers).id : null, correlationId: `cor_${r.hex(12)}` });
  }
  sec.push({ id: 'sec_0003', at: iso(-48 * MIN), kind: 'rate_limited', severity: 'warning', actor: 'andrei.popescu@example.test', ip: '198.51.100.77', detail: '14 failed sign-ins from 3 IPs in 10 minutes', accountId: 'acc_0002', correlationId: 'cor_burst00001' });
  sec.push({ id: 'sec_9001', at: iso(-6 * HOUR), kind: 'suspicious_login', severity: 'critical', actor: 'marcus.reed@example.test', ip: '192.0.2.44', detail: 'Login from new country (VN) and ASN; MFA not enabled on account', accountId: 'acc_0005', correlationId: 'cor_susp0000001' });
  sec.sort((a, b) => b.at.localeCompare(a.at));
  return { audit, security: sec };
}
