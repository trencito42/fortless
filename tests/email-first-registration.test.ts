import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

const register = (email: string, extra: object = {}) => h.call('POST', '/api/v1/auth/register', null, { email, acceptTerms: true, ...extra });
const mails = (email: string) => h.db.prepare("SELECT payload_json FROM email_outbox WHERE recipient = ? AND template = 'email_verification' ORDER BY created_at").all(email) as { payload_json: string }[];
const tokenFor = (email: string) => {
  const list = mails(email);
  const url = JSON.parse(list[list.length - 1]!.payload_json).verifyUrl as string;
  expect(url).toContain('/complete-registration?token=');
  return new URL(url).searchParams.get('token')!;
};
const users = (email: string) => h.db.prepare('SELECT * FROM users WHERE email = ?').all(email) as any[];

describe('email-first registration', () => {
  it('needs an email address and explicit acceptance of the Terms and Privacy Policy, and nothing else', async () => {
    expect((await h.call('POST', '/api/v1/auth/register', null, { email: 'terms-missing@example.com' })).statusCode).toBe(400);
    expect((await h.call('POST', '/api/v1/auth/register', null, { email: 'terms-false@example.com', acceptTerms: false })).statusCode).toBe(400);
    expect((await h.call('POST', '/api/v1/auth/register', null, { email: 'not-an-email', acceptTerms: true })).statusCode).toBe(400);
    // The old shape is refused outright: a password chosen before the mailbox is proven is exactly what this flow removes.
    expect((await register('legacy@example.com', { name: 'Someone', password: 'Password12345!' })).statusCode).toBe(400);
    expect(users('legacy@example.com')).toHaveLength(0);
    expect(mails('legacy@example.com')).toHaveLength(0);
  });

  it('creates no account until the link is used, mails a one-time link and stores only a digest of its token', async () => {
    const res = await register('Fresh.Person@Example.com');
    expect(res.statusCode).toBe(202);
    expect(res.json().requiresEmailVerification).toBe(true);
    expect(users('fresh.person@example.com')).toHaveLength(0);
    const token = tokenFor('fresh.person@example.com');
    const rows = h.db.prepare('SELECT id, terms_accepted_at FROM registration_requests WHERE email = ?').all('fresh.person@example.com') as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].terms_accepted_at).toBeTruthy();
  });

  it('answers an address that already has an account identically and sends it nothing', async () => {
    h.db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('usr_has', 'has@example.com', 'x', 'Has', 'ACTIVE', datetime('now','utc'))").run();
    const fresh = await register('brand-new@example.com');
    const dup = await register('has@example.com');
    expect(dup.statusCode).toBe(fresh.statusCode);
    expect(dup.json()).toEqual(fresh.json());
    expect(mails('has@example.com')).toHaveLength(0);
  });

  it('sends at most one link a minute to an address', async () => {
    await register('cool@example.com');
    await register('cool@example.com');
    expect(mails('cool@example.com')).toHaveLength(1);
  });

  it('inspects a link without consuming it, and rejects bad or expired ones', async () => {
    await register('inspect@example.com');
    const token = tokenFor('inspect@example.com');
    for (let i = 0; i < 2; i++) {
      const ok = await h.call('POST', '/api/v1/auth/register/inspect', null, { token });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toEqual({ email: 'inspect@example.com' });
    }
    expect((await h.call('POST', '/api/v1/auth/register/inspect', null, { token: 'x'.repeat(43) })).statusCode).toBe(400);
    h.db.prepare("UPDATE registration_requests SET expires_at = datetime('now', '-1 minute') WHERE email = 'inspect@example.com'").run();
    expect((await h.call('POST', '/api/v1/auth/register/inspect', null, { token })).statusCode).toBe(400);
  });

  it('creates a verified account, owner membership and session once the person chooses a name and password', async () => {
    await register('complete@example.com');
    const token = tokenFor('complete@example.com');

    const weak = await h.call('POST', '/api/v1/auth/register/complete', null, { token, name: 'Dana Pop', password: 'short' });
    expect(weak.statusCode).toBe(400);
    expect(users('complete@example.com')).toHaveLength(0); // a rejected attempt neither creates nor burns the link
    expect((await h.call('POST', '/api/v1/auth/register/complete', null, { token, name: 'D', password: 'Password12345!' })).statusCode).toBe(400);

    const done = await h.call('POST', '/api/v1/auth/register/complete', null, { token, name: '  Dana Pop ', password: 'Password12345!' });
    expect(done.statusCode).toBe(201);
    expect(done.json().next).toBe('/app/onboarding');
    expect(String(done.headers['set-cookie'])).toContain('fortless_session');

    const [user] = users('complete@example.com');
    expect(user.status).toBe('ACTIVE');
    expect(user.email_verified_at).toBeTruthy();
    expect(user.name).toBe('Dana Pop');
    expect(h.db.prepare("SELECT role FROM memberships WHERE user_id = ?").get(user.id)).toEqual({ role: 'OWNER' });
    const audit = h.db.prepare("SELECT metadata FROM audit_events WHERE action = 'user.registered' AND actor_user_id = ?").get(user.id) as { metadata: string };
    expect(JSON.parse(audit.metadata).termsAcceptedAt).toBeTruthy();

    const cookie = String(done.headers['set-cookie']).match(/fortless_session=([^;]+)/)![1]!;
    const me = await h.call('GET', '/api/v1/auth/me', decodeURIComponent(cookie));
    expect(me.statusCode).toBe(200);
    expect(me.json().user.name).toBe('Dana Pop');

    // Single use.
    expect((await h.call('POST', '/api/v1/auth/register/complete', null, { token, name: 'Dana Pop', password: 'Password12345!' })).statusCode).toBe(400);
  });

  it('refuses to complete a link for an address that registered another way in the meantime', async () => {
    await register('race@example.com');
    const token = tokenFor('race@example.com');
    h.db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('usr_race', 'race@example.com', 'x', 'Race', 'ACTIVE', datetime('now','utc'))").run();
    expect((await h.call('POST', '/api/v1/auth/register/complete', null, { token, name: 'Eve', password: 'Password12345!' })).statusCode).toBe(400);
    expect(users('race@example.com')).toHaveLength(1);
  });
});
