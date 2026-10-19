import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { seedInitialCatalog } from '../src/modules/catalog/catalog.js';
import {
  registerUser, verifyEmail, loginUser, beginTotpEnrollment, confirmTotpEnrollment, completeMfaChallenge, completeStepUp,
  disableTotp, changePassword, generateTotpCode, createSessionForUser,
} from '../src/modules/identity/auth.js';
import { generateWebAuthnChallenge } from '../src/modules/identity/passkeys.js';
import { queueEmail, processEmailOutbox, SandboxEmailTransportAdapter } from '../src/modules/email/outbox.js';
import { runMaintenance } from '../src/modules/maintenance/maintenance.js';
import { getServiceAccess } from '../src/modules/provisioning/service-access.js';

let db: Database.Database;
beforeEach(() => { db = new Database(':memory:'); db.pragma('foreign_keys = ON'); db.exec(SCHEMA_SQL); runMigrations(db); seedInitialCatalog(db); });
afterEach(() => db.close());

const PASSWORD = 'Password12345!';
function mfaUser(email: string) {
  const pending = registerUser({ email, password: PASSWORD, name: 'Mfa User', ipAddress: '127.0.0.1', userAgent: 't' }, db);
  const session = verifyEmail(pending.verificationToken, { ipAddress: '127.0.0.1', userAgent: 't' }, db);
  const enrollment = beginTotpEnrollment(pending.user.id, PASSWORD, email, db);
  const sessionId = (db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(pending.user.id) as { id: string }).id;
  confirmTotpEnrollment({ userId: pending.user.id, accountId: pending.account.id, sessionId, code: generateTotpCode(enrollment.secret), ipAddress: '127.0.0.1' }, db);
  return { user: pending.user, account: pending.account, secret: enrollment.secret, session, email };
}

describe('NEW-366: a TOTP code works once', () => {
  it('rejects a replayed code at the sign-in challenge and requires a newer time step', () => {
    const u = mfaUser('replay@example.com');
    const login1 = loginUser({ email: u.email, password: PASSWORD, ipAddress: '127.0.0.1', userAgent: 't' }, db) as any;
    const code = generateTotpCode(u.secret, Date.now() + 30_000);
    expect(completeMfaChallenge(login1.token, code, '127.0.0.1', db).recoveryCodeUsed).toBe(false);
    const login2 = loginUser({ email: u.email, password: PASSWORD, ipAddress: '127.0.0.1', userAgent: 't2' }, db) as any;
    expect(() => completeMfaChallenge(login2.token, code, '127.0.0.1', db)).toThrow(/invalid/i);
    expect(() => completeMfaChallenge(login2.token, generateTotpCode(u.secret, Date.now() - 30_000), '127.0.0.1', db)).toThrow(/invalid/i); // older step than the accepted one
  });

  it('rejects a replayed code for step-up', () => {
    const u = mfaUser('stepup@example.com');
    const sessionId = (db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(u.user.id) as any).id as string;
    const code = generateTotpCode(u.secret, Date.now() + 30_000);
    const args = { userId: u.user.id, accountId: u.account.id, sessionId, password: PASSWORD, code, ipAddress: '127.0.0.1' };
    expect(completeStepUp(args, db).validForSeconds).toBe(600);
    expect(() => completeStepUp(args, db)).toThrow(/invalid/i);
  });
});

describe('NEW-367: sensitive account actions lock after repeated failures', () => {
  it('locks step-up, MFA removal and password change after five wrong secrets, even with the right one afterwards', () => {
    const u = mfaUser('lockout@example.com');
    const sessionId = (db.prepare('SELECT id FROM sessions WHERE user_id = ?').get(u.user.id) as any).id as string;
    for (let i = 0; i < 5; i++) {
      expect(() => completeStepUp({ userId: u.user.id, accountId: u.account.id, sessionId, password: PASSWORD, code: '000000', ipAddress: '127.0.0.1' }, db)).toThrow(/invalid/i);
    }
    expect(() => completeStepUp({ userId: u.user.id, accountId: u.account.id, sessionId, password: PASSWORD, code: generateTotpCode(u.secret, Date.now() + 30_000), ipAddress: '127.0.0.1' }, db)).toThrow(/Too many failed attempts/);
    expect(() => disableTotp({ userId: u.user.id, accountId: u.account.id, password: PASSWORD, code: generateTotpCode(u.secret, Date.now() + 30_000), ipAddress: '127.0.0.1' }, db)).toThrow(/Too many failed attempts/);
    expect(() => changePassword({ userId: u.user.id, accountId: u.account.id, currentPassword: PASSWORD, newPassword: 'AnotherPassword123!', currentSessionId: sessionId, ipAddress: '127.0.0.1' }, db)).toThrow(/Too many failed attempts/);
    expect((db.prepare('SELECT COUNT(*) c FROM sensitive_action_attempts WHERE user_id = ?').get(u.user.id) as any).c).toBe(5);
  });
});

describe('NEW-359: a missing role is least privilege', () => {
  it('does not grant full service access when the caller omits the role', () => {
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, contract_status, node_id) VALUES ('svc_r', 'acc_r', 'oi_r', 'PTERODACTYL', 'p', 'ACTIVE', 'n')").run();
    db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES ('acc_r', 'R', 'u', 'r@example.test')").run();
    const access = getServiceAccess(db, { serviceId: 'svc_r', accountId: 'acc_r', userId: 'u' });
    expect(access?.permissions).not.toBe('ALL');
    expect(getServiceAccess(db, { serviceId: 'svc_r', accountId: 'acc_r', userId: 'u', role: 'OWNER' })?.permissions).toBe('ALL');
  });
});

describe('NEW-377/NEW-360/NEW-398: maintenance and one-time links', () => {
  it('purges expired sessions, stale WebAuthn challenges and delivered links, but keeps what is still needed', async () => {
    const u = registerUser({ email: 'maint@example.com', password: PASSWORD, name: 'M', ipAddress: '127.0.0.1', userAgent: 't' }, db);
    db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now','utc') WHERE id = ?").run(u.user.id);
    createSessionForUser(u.user.id, '127.0.0.1', 't', true, db);
    db.prepare("INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at, mfa_verified_at) VALUES ('old', ?, '127.0.0.1', 't', datetime('now', '-1 day'), datetime('now'))").run(u.user.id);
    generateWebAuthnChallenge('AUTHENTICATION', null, db);
    db.prepare("INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at) VALUES ('wch_old', NULL, 'oldchallenge', 'AUTHENTICATION', ?)").run(new Date(Date.now() - 60_000).toISOString());

    const id = queueEmail(db, { recipient: 'maint@example.com', template: 'password_reset', payload: { resetUrl: 'https://fortless.net/reset-password?token=SECRETTOKEN', name: 'M' } });
    expect(db.prepare('SELECT payload_json p FROM email_outbox WHERE id = ?').get(id)).toMatchObject({ p: expect.stringContaining('SECRETTOKEN') });
    await processEmailOutbox(db, new SandboxEmailTransportAdapter());
    const delivered = db.prepare('SELECT status, payload_json p FROM email_outbox WHERE id = ?').get(id) as { status: string; p: string };
    expect(delivered.status).toBe('SENT');
    expect(delivered.p).not.toContain('SECRETTOKEN');

    db.prepare("UPDATE email_outbox SET payload_json = ? WHERE id = ?").run(JSON.stringify({ inviteUrl: 'https://x/?invitation=LEGACYSECRET' }), id);
    const result = runMaintenance(db);
    expect(result.expiredSessions).toBeGreaterThanOrEqual(1);
    expect(result.webauthnChallenges).toBe(1);
    expect(result.scrubbedEmails).toBeGreaterThanOrEqual(1);
    expect((db.prepare('SELECT payload_json p FROM email_outbox WHERE id = ?').get(id) as any).p).not.toContain('LEGACYSECRET');
    expect((db.prepare('SELECT COUNT(*) c FROM webauthn_challenges').get() as any).c).toBe(1);
    expect((db.prepare("SELECT COUNT(*) c FROM sessions WHERE id = 'old'").get() as any).c).toBe(0);
  });
});

describe('NEW-401/NEW-402: email rendering and delivery lease', () => {
  it('fills the template in one pass: values are not rewritten by later samples or expanded as placeholders', async () => {
    const { renderEmail } = await import('../src/modules/email/outbox.js');
    const rendered = renderEmail('service_ready', { serviceName: 'Frankfurt €27.90 {{name}}', address: 'host:25565', region: 'Elsewhere', name: 'Alex Morgan' });
    expect(rendered.text).toContain('Frankfurt €27.90 {{name}}');
    expect(rendered.html).toContain('Frankfurt €27.90 {{name}}');
    expect(rendered.text).not.toContain('Frankfurt €27.90 Alex Morgan');
    expect(rendered.html).not.toMatch(/<script/i);
    const escaped = renderEmail('service_ready', { serviceName: '<b>x</b>', address: 'a', region: 'b' });
    expect(escaped.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('keeps a message leased longer than the slowest SMTP timeout', () => {
    const source = fs.readFileSync(path.resolve('src/modules/email/outbox.ts'), 'utf8');
    expect(source).toContain('leaseDurationMs || 300_000');
    expect(source).toContain('socketTimeout: 45_000');
  });
});

describe('SEC-01 / SEC-02: mail transport never weakens TLS or falls back silently', () => {
  it('validates certificates, requires STARTTLS on plain ports and has no sandbox fallback for live mode', async () => {
    const source = fs.readFileSync(path.resolve('src/modules/email/outbox.ts'), 'utf8');
    expect(source).not.toMatch(/rejectUnauthorized\s*:\s*false/);
    expect(source).toContain('requireTLS: !this.secure');
    expect(source).toContain("minVersion: 'TLSv1.2'");
    const { SmtpEmailTransportAdapter, getEmailTransport } = await import('../src/modules/email/outbox.js');
    const { config } = await import('../src/config/index.js');
    const before = { mode: config.EMAIL_MODE, pass: config.SMTP_PASSWORD };
    (config as any).EMAIL_MODE = 'live'; (config as any).SMTP_PASSWORD = '';
    try {
      const transport = getEmailTransport();
      expect(transport).toBeInstanceOf(SmtpEmailTransportAdapter);
      await expect(transport.send({ id: 'e', recipient: 'a@example.test', subject: 's', text: 't', html: 'h', template: 'welcome' })).rejects.toThrow(/credentials/);
    } finally { (config as any).EMAIL_MODE = before.mode; (config as any).SMTP_PASSWORD = before.pass; }
  });
});

describe('NEW-364: guessing from elsewhere cannot lock the owner\'s own browser out', () => {
  it('keeps a previously used device signed in while an unknown device is locked by the account-wide ceiling', () => {
    const reg = registerUser({ email: 'dos-target@example.com', password: PASSWORD, name: 'D', ipAddress: '127.0.0.1', userAgent: 't' }, db);
    db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now', 'utc') WHERE id = ?").run(reg.user.id);
    const device = 'dev_' + 'a'.repeat(32);
    expect(loginUser({ email: 'dos-target@example.com', password: PASSWORD, ipAddress: '203.0.113.1', userAgent: 't', deviceId: device }, db).token).toBeTruthy();
    for (let i = 0; i < 10; i++) {
      expect(() => loginUser({ email: 'dos-target@example.com', password: 'wrong-password-123', ipAddress: `198.51.100.${i + 1}`, userAgent: 'bot' }, db)).toThrow();
    }
    expect(() => loginUser({ email: 'dos-target@example.com', password: PASSWORD, ipAddress: '198.51.100.99', userAgent: 'new-laptop', deviceId: 'dev_' + 'b'.repeat(32) }, db)).toThrow(/Too many sign-in attempts/);
    expect(loginUser({ email: 'dos-target@example.com', password: PASSWORD, ipAddress: '203.0.113.1', userAgent: 't', deviceId: device }, db).token).toBeTruthy();
  });
});
