import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const SECRET = 'test-oidc-client-secret-0123456789abcdef';
const REDIRECT = 'https://panel.example.test/auth/callback';
vi.hoisted(() => {
  process.env['OIDC_PANEL_CLIENT_SECRET'] = 'test-oidc-client-secret-0123456789abcdef';
  process.env['OIDC_PANEL_REDIRECT_URIS'] = 'https://panel.example.test/auth/callback';
  process.env['OIDC_PANEL_CLIENT_ID'] = 'fortless-panel';
  process.env['PTERODACTYL_PANEL_URL'] = 'https://panel.example.test';
  process.env['PTERODACTYL_SSO_LOGIN_URL'] = 'https://panel.example.test/auth/login/oidc';
  process.env['OIDC_SIGNING_KEY_FILE'] = '/tmp/fortless-oidc-test-key.pem';
});

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  authenticateClient, exchangeCode, issueAuthorizationCode, jwks, resolvePanelIdentity,
  userInfo, panelLoginUrl, validateAuthorizeClient, validateAuthorizeRequest, OidcError,
} from '../src/modules/oidc/oidc.js';

let db: Database.Database;

function seed(role = 'OWNER', linked = true, verified = true) {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('usr_1','owner@example.test','x','Test Owner','ACTIVE', ?)`)
    .run(verified ? '2026-01-01 00:00:00' : null);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES ('acc_1','Acc','usr_1','owner@example.test')`).run();
  db.prepare(`INSERT INTO memberships (id, account_id, user_id, role) VALUES ('mem_1','acc_1','usr_1',?)`).run(role);
  if (linked) {
    db.prepare(`INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES ('acc_1', 7, 'fl_test', 'owner@example.test', 'fortless_acc_acc_1')`).run();
  }
}

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

function decodeJwt(token: string) {
  const [h, p, s] = token.split('.');
  return { header: JSON.parse(Buffer.from(h!, 'base64url').toString()), payload: JSON.parse(Buffer.from(p!, 'base64url').toString()), signed: `${h}.${p}`, signature: Buffer.from(s!, 'base64url') };
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
});
afterEach(() => db.close());

describe('OIDC provider for the hosting panel', () => {
  it('OIDC-01: full code flow returns a verifiable RS256 id_token and matching userinfo', () => {
    seed();
    const { verifier, challenge } = pkce();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid profile email', nonce: 'n-1', codeChallenge: challenge, authTime: 1 }, db);
    const tokens = exchangeCode({ code, redirectUri: REDIRECT, codeVerifier: verifier }, db);

    const jwt = decodeJwt(tokens.id_token);
    const key = jwks().keys[0]!;
    expect(jwt.header.kid).toBe(key.kid);
    const publicKey = crypto.createPublicKey({ key: key as crypto.JsonWebKey, format: 'jwk' });
    expect(crypto.verify('RSA-SHA256', Buffer.from(jwt.signed), publicKey, jwt.signature)).toBe(true);
    expect(jwt.payload).toMatchObject({ aud: 'fortless-panel', nonce: 'n-1', sub: 'acc_1', email: 'owner@example.test', email_verified: true, preferred_username: 'fl_test' });
    expect(jwt.payload.exp).toBeGreaterThan(jwt.payload.iat);

    expect(userInfo(tokens.access_token, db)).toMatchObject({ sub: 'acc_1', email: 'owner@example.test' });
  });

  it('OIDC-02: authorization code is single-use and replay revokes issued tokens', () => {
    seed();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', authTime: 1 }, db);
    const tokens = exchangeCode({ code, redirectUri: REDIRECT }, db);
    expect(() => exchangeCode({ code, redirectUri: REDIRECT }, db)).toThrow(OidcError);
    expect(() => userInfo(tokens.access_token, db)).toThrow(/invalid or expired/);
  });

  it('OIDC-03: expired code is rejected', () => {
    seed();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', authTime: 1 }, db);
    db.prepare("UPDATE oidc_authorization_codes SET expires_at = datetime('now', 'utc', '-1 seconds')").run();
    expect(() => exchangeCode({ code, redirectUri: REDIRECT }, db)).toThrow(/expired or already used/);
  });

  it('OIDC-04: PKCE verifier mismatch and redirect_uri mismatch are rejected', () => {
    seed();
    const { challenge } = pkce();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', codeChallenge: challenge, authTime: 1 }, db);
    expect(() => exchangeCode({ code, redirectUri: REDIRECT, codeVerifier: 'wrong' }, db)).toThrow(/PKCE/);

    const code2 = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', authTime: 1 }, db);
    expect(() => exchangeCode({ code: code2, redirectUri: 'https://evil.test/cb' }, db)).toThrow(/does not match/);
  });

  it('OIDC-05: unregistered redirect_uri and unknown client never reach the redirect step', () => {
    expect(() => validateAuthorizeClient({ clientId: 'fortless-panel', redirectUri: 'https://evil.test/cb' })).toThrow(/not registered/);
    expect(() => validateAuthorizeClient({ clientId: 'other', redirectUri: REDIRECT })).toThrow(/Unknown client/);
    expect(validateAuthorizeClient({ clientId: 'fortless-panel', redirectUri: REDIRECT }).redirectUri).toBe(REDIRECT);
  });

  it('OIDC-06: client authentication requires the exact secret', () => {
    expect(() => authenticateClient('fortless-panel', 'wrong')).toThrow(/authentication failed/);
    expect(() => authenticateClient('fortless-panel', undefined)).toThrow(OidcError);
    expect(() => authenticateClient('fortless-panel', SECRET)).not.toThrow();
  });

  it('OIDC-07: scope and PKCE method validation', () => {
    expect(() => validateAuthorizeRequest({ responseType: 'token', scope: 'openid' })).toThrow(/response_type/);
    expect(() => validateAuthorizeRequest({ responseType: 'code', scope: 'profile' })).toThrow(/openid/);
    expect(() => validateAuthorizeRequest({ responseType: 'code', scope: 'openid admin' })).toThrow(/Unsupported scope/);
    expect(() => validateAuthorizeRequest({ responseType: 'code', scope: 'openid', codeChallenge: 'x'.repeat(43), codeChallengeMethod: 'plain' })).toThrow(/S256/);
  });

  it('OIDC-08: only verified OWNER/TECH_ADMIN of a linked, active account may assume the panel user', () => {
    seed('VIEWER');
    expect(() => resolvePanelIdentity('acc_1', 'usr_1', db)).toThrow(/role/);
    db.prepare("UPDATE memberships SET role = 'BILLING_MANAGER'").run();
    expect(() => resolvePanelIdentity('acc_1', 'usr_1', db)).toThrow(/role/);
    db.prepare("UPDATE memberships SET role = 'TECH_ADMIN'").run();
    expect(resolvePanelIdentity('acc_1', 'usr_1', db).panelEmail).toBe('owner@example.test');
    db.prepare("UPDATE accounts SET status = 'LOCKED'").run();
    expect(() => resolvePanelIdentity('acc_1', 'usr_1', db)).toThrow(/cannot access/);
  });

  it('OIDC-09: unlinked account and unverified email are denied with typed errors', () => {
    seed('OWNER', false);
    expect(() => resolvePanelIdentity('acc_1', 'usr_1', db)).toThrow(/No hosting panel account/);
    db.prepare("INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES ('acc_1', 7, 'fl_t', 'owner@example.test', 'tag')").run();
    db.prepare('UPDATE users SET email_verified_at = NULL').run();
    expect(() => resolvePanelIdentity('acc_1', 'usr_1', db)).toThrow(/Verify your email/);
  });

  it('OIDC-10: access is re-checked at exchange time (role revoked after code issued)', () => {
    seed();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', authTime: 1 }, db);
    db.prepare("UPDATE memberships SET role = 'VIEWER'").run();
    expect(() => exchangeCode({ code, redirectUri: REDIRECT }, db)).toThrow(/role/);
  });

  it('OIDC-11: scopes limit userinfo claims', () => {
    seed();
    const code = issueAuthorizationCode({ accountId: 'acc_1', userId: 'usr_1', redirectUri: REDIRECT, scope: 'openid', authTime: 1 }, db);
    const info = userInfo(exchangeCode({ code, redirectUri: REDIRECT }, db).access_token, db);
    expect(info).toEqual({ sub: 'acc_1' });
  });

  it('OIDC-12: panel login URL is exposed only when it is https and on the panel origin', () => {
    expect(panelLoginUrl()).toBe('https://panel.example.test/auth/login/oidc');
  });
});

describe('NEW-387: shared servers are attached to the workspace\'s single panel user', () => {
  it('lets only the workspace owner open the panel while servers are shared with that workspace', () => {
    seed('OWNER');
    db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('usr_2', 'tech@example.test', 'x', 'Tech', 'ACTIVE', '2026-01-01 00:00:00')").run();
    db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('mem_2', 'acc_1', 'usr_2', 'TECH_ADMIN')").run();
    expect(resolvePanelIdentity('acc_1', 'usr_2', db).panelUsername).toBeTruthy(); // nothing is shared yet: a technical admin may open the panel
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO service_members (id, service_id, user_id, preset, panel_subuser_uuid) VALUES ('sm1', 'svc_other', 'usr_1', 'viewer', 'uuid-1')").run();
    expect(() => resolvePanelIdentity('acc_1', 'usr_2', db)).toThrow(/Only the workspace owner/);
    expect(resolvePanelIdentity('acc_1', 'usr_1', db).panelUsername).toBeTruthy();
  });
});
