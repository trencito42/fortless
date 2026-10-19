import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';

const CODE_TTL_SECONDS = 60;
const ACCESS_TTL_SECONDS = 600;
const ID_TOKEN_TTL_SECONDS = 300;
const SUPPORTED_SCOPES = new Set(['openid', 'profile', 'email']);

export class OidcError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'OidcError';
  }
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

export function issuer(): string {
  return config.APP_ORIGIN.replace(/\/+$/, '');
}

export function panelLoginUrl(): string | null {
  if (!oidcEnabled() || !config.PTERODACTYL_SSO_LOGIN_URL || !config.PTERODACTYL_PANEL_URL) return null;
  try {
    const login = new URL(config.PTERODACTYL_SSO_LOGIN_URL);
    const panel = new URL(config.PTERODACTYL_PANEL_URL);
    return login.origin === panel.origin && login.protocol === 'https:' ? login.toString() : null;
  } catch {
    return null;
  }
}

export function oidcEnabled(): boolean {
  return Boolean(config.OIDC_PANEL_CLIENT_SECRET && config.OIDC_PANEL_REDIRECT_URIS && config.OIDC_PANEL_CLIENT_SECRET.length >= 32);
}

function redirectUris(): string[] {
  return config.OIDC_PANEL_REDIRECT_URIS.split(',').map((u) => u.trim()).filter(Boolean);
}

let signingKey: { privateKey: crypto.KeyObject; kid: string; jwk: crypto.JsonWebKey } | null = null;

export function getSigningKey() {
  if (signingKey) return signingKey;
  const keyPath = process.env['OIDC_SIGNING_KEY_FILE'] || path.resolve(process.cwd(), 'data/.oidc-signing-key.pem');
  let pem: string;
  try {
    pem = fs.readFileSync(keyPath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    try {
      fs.writeFileSync(keyPath, pem, { mode: 0o600, flag: 'wx' });
    } catch (writeError: unknown) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
      pem = fs.readFileSync(keyPath, 'utf8');
    }
  }
  const privateKey = crypto.createPrivateKey(pem);
  const jwk = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
  const kid = crypto.createHash('sha256').update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })).digest('base64url').slice(0, 16);
  signingKey = { privateKey, kid, jwk };
  return signingKey;
}

export function discoveryDocument() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oidc/authorize`,
    token_endpoint: `${base}/oidc/token`,
    userinfo_endpoint: `${base}/oidc/userinfo`,
    jwks_uri: `${base}/oidc/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'email', 'email_verified', 'preferred_username', 'name'],
  };
}

export function jwks() {
  const { jwk, kid } = getSigningKey();
  return { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };
}

export interface AuthorizeParams {
  clientId?: string;
  redirectUri?: string;
  responseType?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

/** Errors thrown here must NOT be redirected to the client: client_id / redirect_uri are untrusted. */
export function validateAuthorizeClient(params: AuthorizeParams): { redirectUri: string } {
  if (!oidcEnabled()) throw new OidcError('temporarily_unavailable', 'Single sign-on is not configured.', 503);
  if (params.clientId !== config.OIDC_PANEL_CLIENT_ID) throw new OidcError('invalid_client', 'Unknown client.');
  if (!params.redirectUri || !redirectUris().includes(params.redirectUri)) {
    throw new OidcError('invalid_request', 'redirect_uri is not registered for this client.');
  }
  return { redirectUri: params.redirectUri };
}

/** Errors from here on are safe to return to the validated redirect_uri. */
export function validateAuthorizeRequest(params: AuthorizeParams): { scope: string } {
  if (params.responseType !== 'code') throw new OidcError('unsupported_response_type', 'Only response_type=code is supported.');
  const scopes = (params.scope || '').split(/\s+/).filter(Boolean);
  if (!scopes.includes('openid')) throw new OidcError('invalid_scope', 'The openid scope is required.');
  if (scopes.some((s) => !SUPPORTED_SCOPES.has(s))) throw new OidcError('invalid_scope', 'Unsupported scope requested.');
  if (params.codeChallenge) {
    if (params.codeChallengeMethod !== 'S256') throw new OidcError('invalid_request', 'Only code_challenge_method=S256 is supported.');
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new OidcError('invalid_request', 'Malformed code_challenge.');
  }
  return { scope: scopes.join(' ') };
}

export interface PanelIdentity {
  accountId: string;
  userId: string;
  panelEmail: string;
  panelUsername: string;
  name: string;
  emailVerified: boolean;
}

/**
 * Resolve which panel identity a Fortless session may assume. Only OWNER and TECH_ADMIN
 * members may assume the account's panel user; the account must already be linked to one.
 */
export function resolvePanelIdentity(accountId: string, userId: string, db: Database.Database = getDatabase()): PanelIdentity {
  const row = db.prepare(`
    SELECT m.role, u.name, u.email_verified_at, u.status AS user_status, a.status AS account_status, a.owner_user_id,
           pu.panel_email, pu.panel_username
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN accounts a ON a.id = m.account_id
    LEFT JOIN panel_users pu ON pu.account_id = a.id AND pu.provider_type = 'PTERODACTYL'
    WHERE m.account_id = ? AND m.user_id = ?
  `).get(accountId, userId) as {
    role: string; name: string; email_verified_at: string | null; user_status: string; account_status: string;
    panel_email: string | null; panel_username: string | null; owner_user_id: string;
  } | undefined;

  if (!row || row.user_status !== 'ACTIVE' || row.account_status !== 'ACTIVE') {
    throw new OidcError('access_denied', 'This account cannot access the hosting panel.', 403);
  }
  if (!['OWNER', 'TECH_ADMIN'].includes(row.role)) {
    throw new OidcError('access_denied', 'Your role does not allow hosting panel access.', 403);
  }
  // NEW-387: the panel holds ONE user per workspace and a shared server is attached to that user. While servers are shared
  // with this workspace, only its owner may sign in to the panel, so another administrator of the workspace cannot reach a
  // server that was shared with a specific person.
  const receivesShares = db.prepare(`
    SELECT 1 FROM service_members sm JOIN memberships mm ON mm.user_id = sm.user_id WHERE mm.account_id = ? LIMIT 1
  `).get(accountId);
  if (receivesShares && row.owner_user_id !== userId) {
    throw new OidcError('access_denied', 'Only the workspace owner can open the hosting panel while servers are shared with this workspace.', 403);
  }
  if (!row.email_verified_at) {
    throw new OidcError('access_denied', 'Verify your email address before opening the hosting panel.', 403);
  }
  if (!row.panel_email || !row.panel_username) {
    throw new OidcError('access_denied', 'No hosting panel account exists yet. It is created when your first service is provisioned.', 403);
  }
  return { accountId, userId, panelEmail: row.panel_email, panelUsername: row.panel_username, name: row.name, emailVerified: true };
}

export function issueAuthorizationCode(
  input: { accountId: string; userId: string; redirectUri: string; scope: string; nonce?: string; codeChallenge?: string; authTime: number },
  db: Database.Database = getDatabase()
): string {
  const code = crypto.randomBytes(32).toString('base64url');
  db.prepare(`
    INSERT INTO oidc_authorization_codes
      (code_hash, client_id, account_id, user_id, redirect_uri, scope, nonce, code_challenge, auth_time, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'utc', '+' || ? || ' seconds'))
  `).run(sha256(code), config.OIDC_PANEL_CLIENT_ID, input.accountId, input.userId, input.redirectUri, input.scope,
    input.nonce ?? null, input.codeChallenge ?? null, input.authTime, CODE_TTL_SECONDS);
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', 'oidc.authorize', 'account', ?, ?, '{}')
  `).run(`aud_${crypto.randomUUID()}`, input.accountId, input.userId, input.accountId, `corr_${crypto.randomUUID()}`);
  return code;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function authenticateClient(clientId: string | undefined, clientSecret: string | undefined): void {
  if (!oidcEnabled()) throw new OidcError('temporarily_unavailable', 'Single sign-on is not configured.', 503);
  const idOk = typeof clientId === 'string' && safeEqual(clientId, config.OIDC_PANEL_CLIENT_ID);
  const secretOk = typeof clientSecret === 'string' && safeEqual(clientSecret, config.OIDC_PANEL_CLIENT_SECRET);
  if (!idOk || !secretOk) throw new OidcError('invalid_client', 'Client authentication failed.', 401);
}

function signJwt(claims: Record<string, unknown>): string {
  const { privateKey, kid } = getSigningKey();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64url(JSON.stringify(claims));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey);
  return `${header}.${body}.${b64url(signature)}`;
}

function claimsFor(identity: PanelIdentity, scope: string): Record<string, unknown> {
  const scopes = scope.split(' ');
  const claims: Record<string, unknown> = { sub: identity.accountId };
  if (scopes.includes('email')) {
    claims['email'] = identity.panelEmail;
    claims['email_verified'] = identity.emailVerified;
  }
  if (scopes.includes('profile')) {
    claims['preferred_username'] = identity.panelUsername;
    claims['name'] = identity.name;
  }
  return claims;
}

export function exchangeCode(
  input: { code?: string; redirectUri?: string; codeVerifier?: string },
  db: Database.Database = getDatabase()
) {
  if (!input.code || !input.redirectUri) throw new OidcError('invalid_request', 'code and redirect_uri are required.');
  const codeHash = sha256(input.code);

  const consumed = db.prepare(`
    UPDATE oidc_authorization_codes SET consumed_at = datetime('now', 'utc')
    WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now', 'utc')
  `).run(codeHash);

  const row = db.prepare('SELECT * FROM oidc_authorization_codes WHERE code_hash = ?').get(codeHash) as {
    client_id: string; account_id: string; user_id: string; redirect_uri: string; scope: string;
    nonce: string | null; code_challenge: string | null; auth_time: number; consumed_at: string | null;
  } | undefined;

  if (!row) throw new OidcError('invalid_grant', 'Authorization code is invalid.');
  if (consumed.changes !== 1) {
    // Replay or expiry: revoke anything already issued from this code.
    db.prepare('DELETE FROM oidc_access_tokens WHERE code_hash = ?').run(codeHash);
    throw new OidcError('invalid_grant', 'Authorization code is expired or already used.');
  }
  if (row.client_id !== config.OIDC_PANEL_CLIENT_ID || row.redirect_uri !== input.redirectUri) {
    throw new OidcError('invalid_grant', 'Authorization code does not match this request.');
  }
  if (row.code_challenge) {
    const expected = crypto.createHash('sha256').update(input.codeVerifier || '').digest('base64url');
    if (!input.codeVerifier || !safeEqual(expected, row.code_challenge)) {
      throw new OidcError('invalid_grant', 'PKCE verification failed.');
    }
  }

  const identity = resolvePanelIdentity(row.account_id, row.user_id, db);
  const accessToken = crypto.randomBytes(32).toString('base64url');
  db.prepare(`
    INSERT INTO oidc_access_tokens (token_hash, code_hash, client_id, account_id, user_id, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'utc', '+' || ? || ' seconds'))
  `).run(sha256(accessToken), codeHash, row.client_id, row.account_id, row.user_id, row.scope, ACCESS_TTL_SECONDS);

  const now = Math.floor(Date.now() / 1000);
  const idToken = signJwt({
    iss: issuer(),
    aud: row.client_id,
    iat: now,
    exp: now + ID_TOKEN_TTL_SECONDS,
    auth_time: row.auth_time,
    ...(row.nonce ? { nonce: row.nonce } : {}),
    ...claimsFor(identity, row.scope),
  });

  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS, id_token: idToken, scope: row.scope };
}

export function userInfo(accessToken: string, db: Database.Database = getDatabase()): Record<string, unknown> {
  const row = db.prepare(`
    SELECT account_id, user_id, scope FROM oidc_access_tokens
    WHERE token_hash = ? AND expires_at > datetime('now', 'utc')
  `).get(sha256(accessToken)) as { account_id: string; user_id: string; scope: string } | undefined;
  if (!row) throw new OidcError('invalid_token', 'Access token is invalid or expired.', 401);
  const identity = resolvePanelIdentity(row.account_id, row.user_id, db);
  return claimsFor(identity, row.scope);
}
