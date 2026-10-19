import { hashSync, verifySync } from '@node-rs/argon2';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { queueEmail } from '../email/outbox.js';
import { createNotification } from '../notifications/notifications.js';

export interface User {
  id: string;
  email: string;
  email_verified_at: string | null;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  is_staff: number;
  created_at: string;
  updated_at: string;
}
export interface Account {
  id: string;
  name: string;
  owner_user_id: string;
  billing_email: string;
  status: 'ACTIVE' | 'LOCKED' | 'FLAGGED_FRAUD';
  created_at: string;
  updated_at: string;
}
export interface Membership {
  id: string;
  account_id: string;
  user_id: string;
  role: 'OWNER' | 'BILLING_MANAGER' | 'TECH_ADMIN' | 'VIEWER';
  created_at: string;
}
export interface AuthContext {
  user: User;
  account: Account;
  membership: Membership;
  session: { id: string; mfaVerifiedAt: string | null; stepUpVerifiedAt: string | null; expiresAt: string };
}
export interface SessionResult { user: User; account: Account; token: string; requiresMfa?: boolean }
export interface MfaStatus { enabled: boolean; recoveryCodesRemaining: number }
export interface SessionDevice {
  id: string;
  deviceId?: string | null;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const DEVICE_COOKIE_NAME = 'fortless_device_id';

export function generateDeviceId(): string {
  return `dev_${crypto.randomBytes(16).toString('hex')}`;
}

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(id);
}

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const MAX_MFA_ATTEMPTS = 5;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function hashPassword(plain: string): string {
  return hashSync(plain, { memoryCost: 65536, timeCost: 3, outputLen: 32, parallelism: 4 });
}
export function verifyPassword(hash: string, plain: string): boolean {
  try { return verifySync(hash, plain); } catch { return false; }
}
export function validatePassword(password: string): string | null {
  if (password.length < 12) return 'Password must contain at least 12 characters.';
  if (password.length > 128) return 'Password cannot exceed 128 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include upper-case, lower-case, and numeric characters.';
  }
  return null;
}
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}
function generateOpaqueToken(): string { return crypto.randomBytes(32).toString('base64url'); }
function tokenDigest(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }
function mfaKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(config.SESSION_SECRET), Buffer.from('fortless-mfa-v1'), Buffer.from('totp-secret'), 32));
}
function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', mfaKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}
function decryptSecret(value: string): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('The authenticator configuration is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', mfaKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
function base32Encode(input: Buffer): string {
  let bits = 0; let value = 0; let output = '';
  for (const byte of input) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string): Buffer {
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const character of input.replace(/=+$/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function totpAt(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}
function validTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some((window) => crypto.timingSafeEqual(Buffer.from(totpAt(secret, counter + window)), Buffer.from(code)));
}
export function generateTotpCode(secret: string, now = Date.now()): string {
  return totpAt(secret, Math.floor(now / 30_000));
}
function recoveryDigest(userId: string, code: string): string {
  const normalized = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return crypto.createHmac('sha256', config.SESSION_SECRET).update(`${userId}:${normalized}`).digest('hex');
}

export class MfaConfigurationUnavailableError extends Error {
  readonly code = 'MFA_CONFIGURATION_UNAVAILABLE';
  constructor() { super('Authenticator data cannot be read. Use a recovery code or contact support to reset two-step verification.'); }
}
function confirmedMfa(userId: string, db: Database.Database): { id: string; secret_encrypted: string } | undefined {
  return db.prepare("SELECT id, secret_encrypted FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 1")
    .get(userId) as { id: string; secret_encrypted: string } | undefined;
}
function safeUser(row: User & { password_hash?: string }): User {
  const { password_hash: _passwordHash, ...user } = row;
  return user;
}
export function getPrimaryAccount(userId: string, db: Database.Database): Account {
  const account = db.prepare(`SELECT a.* FROM accounts a JOIN memberships m ON m.account_id = a.id
    WHERE m.user_id = ? AND a.status = 'ACTIVE' ORDER BY a.created_at ASC LIMIT 1`).get(userId) as Account | undefined;
  if (!account) throw new Error('No active account is associated with this identity.');
  return account;
}
export function createSessionForUser(
  userId: string,
  ipAddress: string,
  userAgent: string,
  mfaVerified: boolean = false,
  db: Database.Database = getDatabase(),
  deviceId?: string | null
): string {
  // Prune expired sessions for this identity
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now', 'utc')").run(userId);
  // Expire and clean up abandoned pending-MFA sessions older than 15 minutes
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND mfa_verified_at IS NULL AND created_at < datetime('now', '-15 minutes')").run(userId);

  const normalizedDeviceId = (deviceId && isValidDeviceId(deviceId)) ? deviceId : null;

  // If a valid deviceId is present:
  // - If this session is already verified, supersede any existing session on this device
  // - If this session is pending MFA, clean up any previous uncompleted pending-MFA sessions on this device
  //   WITHOUT touching any currently active, authenticated sessions
  if (normalizedDeviceId) {
    if (mfaVerified) {
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND device_id = ?").run(userId, normalizedDeviceId);
    } else {
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND device_id = ? AND mfa_verified_at IS NULL").run(userId, normalizedDeviceId);
    }
  }

  const rawToken = generateOpaqueToken();
  const mfaVerifiedAt = mfaVerified ? new Date().toISOString() : null;
  // Pending MFA sessions expire in 15 minutes; verified sessions live for full SESSION_TTL_MS (14 days)
  const expiresAt = mfaVerified
    ? new Date(Date.now() + SESSION_TTL_MS).toISOString()
    : new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO sessions (id, user_id, device_id, ip_address, user_agent, mfa_verified_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(tokenDigest(rawToken), userId, normalizedDeviceId, ipAddress, userAgent.slice(0, 512), mfaVerifiedAt, expiresAt);
  return rawToken;
}
function createPurposeToken(
  table: 'email_verification_tokens' | 'password_reset_tokens', userId: string, ttlMs: number, db: Database.Database
): string {
  const rawToken = generateOpaqueToken();
  db.prepare(`UPDATE ${table} SET consumed_at = datetime('now', 'utc') WHERE user_id = ? AND consumed_at IS NULL`).run(userId);
  db.prepare(`INSERT INTO ${table} (id, user_id, expires_at) VALUES (?, ?, ?)`).run(
    tokenDigest(rawToken), userId, new Date(Date.now() + ttlMs).toISOString()
  );
  return rawToken;
}

export function registerUser(
  data: { email: string; password: string; name: string; ipAddress: string; userAgent: string },
  db: Database.Database = getDatabase()
): { user: User; account: Account; verificationToken: string } {
  const normalizedEmail = data.email.trim().toLowerCase();
  const passwordError = validatePassword(data.password);
  if (passwordError) throw new Error(passwordError);
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) throw new Error('An account with this email address already exists.');
  const userId = generateId('usr');
  const accountId = generateId('acc');
  return runInTransaction((trx) => {
    trx.prepare(`INSERT INTO users (id, email, password_hash, name, status, is_staff)
      VALUES (?, ?, ?, ?, 'PENDING_VERIFICATION', 0)`).run(userId, normalizedEmail, hashPassword(data.password), data.name.trim());
    trx.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email, status) VALUES (?, ?, ?, ?, 'ACTIVE')`)
      .run(accountId, `${data.name.trim()}'s Workspace`, userId, normalizedEmail);
    trx.prepare(`INSERT INTO memberships (id, account_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`)
      .run(generateId('mem'), accountId, userId);
    const verificationToken = createPurposeToken('email_verification_tokens', userId, VERIFY_TTL_MS, trx);
    queueEmail(trx, {
      recipient: normalizedEmail,
      template: 'email_verification',
      payload: {
        name: data.name.trim(),
        verifyUrl: `${config.APP_ORIGIN}/verify-email?token=${verificationToken}`,
      },
    });
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.registration_pending', 'user', ?, ?, ?)`)
      .run(generateId('aud'), accountId, userId, userId, data.ipAddress, generateId('cor'));
    const user = trx.prepare('SELECT id, email, email_verified_at, name, status, is_staff, created_at, updated_at FROM users WHERE id = ?').get(userId) as User;
    const account = trx.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as Account;
    return { user, account, verificationToken };
  }, db);
}

export function verifyEmail(
  token: string, context: { ipAddress: string; userAgent: string; deviceId?: string; issueSession?: boolean }, db: Database.Database = getDatabase()
): SessionResult {
  return runInTransaction((trx) => {
    const row = trx.prepare(`SELECT evt.user_id, u.* FROM email_verification_tokens evt JOIN users u ON u.id = evt.user_id
      WHERE evt.id = ? AND evt.consumed_at IS NULL AND evt.expires_at > datetime('now', 'utc')`)
      .get(tokenDigest(token)) as (User & { user_id: string; password_hash: string }) | undefined;
    if (!row) throw new Error('This verification link is invalid or has expired.');
    if (row.status === 'SUSPENDED') throw new Error('This account cannot be activated.');
    trx.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now', 'utc'), updated_at = datetime('now', 'utc') WHERE id = ?").run(row.user_id);
    trx.prepare("UPDATE email_verification_tokens SET consumed_at = datetime('now', 'utc') WHERE user_id = ? AND consumed_at IS NULL").run(row.user_id);
    const account = getPrimaryAccount(row.user_id, trx);
    // NEW-363: following the link proves the mailbox, not who registered. Browsers call this with issueSession:false so the
    // person who clicks the link is never signed in to an account whose password someone else chose.
    const sessionToken = context.issueSession === false ? '' : createSessionForUser(row.user_id, context.ipAddress, context.userAgent, true, trx, context.deviceId);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.email_verified', 'user', ?, ?, ?)`)
      .run(generateId('aud'), account.id, row.user_id, row.user_id, context.ipAddress, generateId('cor'));
    const activeUser = trx.prepare('SELECT id, email, email_verified_at, name, status, is_staff, created_at, updated_at FROM users WHERE id = ?').get(row.user_id) as User;
    createNotification({
      accountId: account.id,
      userId: row.user_id,
      type: 'ACCOUNT_ACTIVATED',
      title: 'Account Activated',
      message: 'Welcome to Fortless! Your account has been verified successfully.',
      linkUrl: '/app',
    }, trx);
    queueEmail(trx, {
      recipient: activeUser.email,
      template: 'welcome',
      payload: { name: activeUser.name },
    });
    return { user: activeUser, account, token: sessionToken };
  }, db);
}

export function resendVerification(email: string, db: Database.Database = getDatabase()): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  return runInTransaction((trx) => {
    const user = trx.prepare("SELECT id, name FROM users WHERE email = ? AND status = 'PENDING_VERIFICATION'")
      .get(normalizedEmail) as { id: string; name: string } | undefined;
    if (!user) return null;
    const token = createPurposeToken('email_verification_tokens', user.id, VERIFY_TTL_MS, trx);
    queueEmail(trx, {
      recipient: normalizedEmail,
      template: 'email_verification',
      payload: {
        name: user.name,
        verifyUrl: `${config.APP_ORIGIN}/verify-email?token=${token}`,
      },
    });
    return token;
  }, db);
}
function identifierDigest(email: string): string { return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex'); }
function recordLoginAttempt(email: string, ipAddress: string, succeeded: boolean, db: Database.Database): void {
  db.prepare('INSERT INTO auth_login_attempts (id, identifier_hash, ip_address, succeeded) VALUES (?, ?, ?, ?)')
    .run(generateId('lat'), identifierDigest(email), ipAddress, succeeded ? 1 : 0);
}
function isLoginThrottled(email: string, ipAddress: string, db: Database.Database): boolean {
  const row = db.prepare(`SELECT count(*) AS failures FROM auth_login_attempts WHERE identifier_hash = ? AND ip_address = ?
    AND succeeded = 0 AND attempted_at >= datetime('now', '-15 minutes')`).get(identifierDigest(email), ipAddress) as { failures: number };
  if (row.failures >= MAX_FAILED_LOGINS) return true;
  const globalRow = db.prepare(`SELECT count(*) AS failures FROM auth_login_attempts WHERE identifier_hash = ?
    AND succeeded = 0 AND attempted_at >= datetime('now', '-15 minutes')`).get(identifierDigest(email)) as { failures: number };
  return globalRow.failures >= 10;
}
export function loginUser(
  data: { email: string; password: string; ipAddress: string; userAgent: string; deviceId?: string }, db: Database.Database = getDatabase()
): SessionResult {
  const normalizedEmail = data.email.trim().toLowerCase();
  if (isLoginThrottled(normalizedEmail, data.ipAddress, db)) throw new Error('Too many sign-in attempts. Try again after 15 minutes.');
  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as (User & { password_hash: string }) | undefined;
  if (!userRow || userRow.status !== 'ACTIVE' || !verifyPassword(userRow.password_hash, data.password)) {
    recordLoginAttempt(normalizedEmail, data.ipAddress, false, db);
    throw new Error('Invalid email or password.');
  }
  if (!userRow.email_verified_at) {
    recordLoginAttempt(normalizedEmail, data.ipAddress, false, db);
    throw new Error('Verify your email before signing in.');
  }
  const account = getPrimaryAccount(userRow.id, db);
  const requiresMfa = Boolean(confirmedMfa(userRow.id, db));
  const sessionToken = createSessionForUser(
    userRow.id,
    data.ipAddress,
    data.userAgent,
    !requiresMfa,
    db,
    data.deviceId
  );
  if (!requiresMfa) {
    db.prepare('DELETE FROM auth_login_attempts WHERE identifier_hash = ? AND ip_address = ? AND succeeded = 0')
      .run(identifierDigest(normalizedEmail), data.ipAddress);
  }
  recordLoginAttempt(normalizedEmail, data.ipAddress, true, db);
  db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
    VALUES (?, ?, ?, 'USER', 'user.login', 'session', ?, ?, ?)`)
    .run(generateId('aud'), account.id, userRow.id, tokenDigest(sessionToken), data.ipAddress, generateId('cor'));
  return { user: safeUser(userRow), account, token: sessionToken, requiresMfa };
}

export function requestPasswordReset(email: string, db: Database.Database = getDatabase()): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  return runInTransaction((trx) => {
    const user = trx.prepare("SELECT id, name FROM users WHERE email = ? AND status != 'SUSPENDED'")
      .get(normalizedEmail) as { id: string; name: string } | undefined;
    if (!user) return null;
    const token = createPurposeToken('password_reset_tokens', user.id, RESET_TTL_MS, trx);
    queueEmail(trx, {
      recipient: normalizedEmail,
      template: 'password_reset',
      payload: {
        resetUrl: `${config.APP_ORIGIN}/reset-password?token=${token}`,
      },
    });
    return token;
  }, db);
}
export function resetPassword(token: string, password: string, db: Database.Database = getDatabase()): void {
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  runInTransaction((trx) => {
    const row = trx.prepare(`SELECT prt.user_id, u.email FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id
      WHERE prt.id = ? AND prt.consumed_at IS NULL AND prt.expires_at > datetime('now', 'utc') AND u.status != 'SUSPENDED'`)
      .get(tokenDigest(token)) as { user_id: string; email: string } | undefined;
    if (!row) throw new Error('This password reset link is invalid or has expired.');
    trx.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now', 'utc') WHERE id = ?").run(hashPassword(password), row.user_id);
    trx.prepare("UPDATE password_reset_tokens SET consumed_at = datetime('now', 'utc') WHERE user_id = ? AND consumed_at IS NULL").run(row.user_id);
    trx.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    queueEmail(trx, {
      recipient: row.email,
      template: 'password_changed',
      payload: {},
    });
    const userAcc = trx.prepare(`
      SELECT account_id FROM memberships WHERE user_id = ? AND role = 'OWNER' LIMIT 1
    `).get(row.user_id) as { account_id: string } | undefined;
    if (userAcc) {
      createNotification({
        accountId: userAcc.account_id,
        userId: row.user_id,
        type: 'SECURITY_ALERT',
        title: 'Password Reset',
        message: 'Your account password was reset and all existing device sessions were revoked.',
        linkUrl: '/app/settings',
      }, trx);
    }
  }, db);
}

export function changePassword(
  data: {
    userId: string;
    accountId: string;
    currentPassword: string;
    newPassword: string;
    currentSessionId: string;
    ipAddress: string;
  },
  db: Database.Database = getDatabase()
): void {
  const passwordError = validatePassword(data.newPassword);
  if (passwordError) throw new Error(passwordError);

  runInTransaction((trx) => {
    const user = trx.prepare('SELECT password_hash, email FROM users WHERE id = ?').get(data.userId) as
      | { password_hash: string; email: string }
      | undefined;
    if (!user || !verifyPassword(user.password_hash, data.currentPassword)) {
      throw new Error('Current password is incorrect.');
    }

    trx.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now', 'utc') WHERE id = ?")
      .run(hashPassword(data.newPassword), data.userId);

    // Revoke all other sessions except the current one
    trx.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(data.userId, data.currentSessionId);

    // Queue security notification email
    queueEmail(trx, {
      recipient: user.email,
      template: 'password_changed',
      payload: {},
    });

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.password_changed', 'user', ?, ?, ?)
    `).run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'));

    createNotification({
      accountId: data.accountId,
      userId: data.userId,
      type: 'SECURITY_ALERT',
      title: 'Password Changed',
      message: 'Your account password was updated from account settings.',
      linkUrl: '/app/settings',
    }, trx);
  }, db);
}

export function authenticateSession(token: string, db: Database.Database = getDatabase(), clientIp?: string): AuthContext | null {
  const session = db.prepare(`SELECT s.id, s.ip_address, s.expires_at, s.mfa_verified_at, s.step_up_verified_at, s.account_id AS pinned_account_id, u.id AS user_id, u.email, u.email_verified_at,
    u.name AS user_name, u.status AS user_status, u.is_staff, u.created_at, u.updated_at FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now', 'utc')`).get(tokenDigest(token)) as ({
      id: string; ip_address: string; expires_at: string; mfa_verified_at: string | null; step_up_verified_at: string | null; pinned_account_id: string | null; user_id: string; email: string; email_verified_at: string | null;
      user_name: string; user_status: User['status']; is_staff: number; created_at: string; updated_at: string;
    }) | undefined;
  if (!session || session.user_status !== 'ACTIVE' || !session.email_verified_at) return null;
  if (confirmedMfa(session.user_id, db) && !session.mfa_verified_at) return null;
  // NEW-368: the workspace belongs to the session. It is the one chosen at sign-in or through switchWorkspace(); joining
  // another workspace never changes it. A session without a pin (or whose workspace is no longer usable) is pinned to
  // the user's oldest active workspace, which keeps the earlier behaviour for existing sessions.
  const membershipSql = `SELECT a.*, m.id AS membership_id, m.role, m.created_at AS membership_created_at
    FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.user_id = ? AND a.status = 'ACTIVE'`;
  type AccountAndRole = Account & { membership_id: string; role: Membership['role']; membership_created_at: string };
  let accountAndRole = session.pinned_account_id
    ? db.prepare(`${membershipSql} AND a.id = ? LIMIT 1`).get(session.user_id, session.pinned_account_id) as AccountAndRole | undefined
    : undefined;
  if (!accountAndRole) {
    accountAndRole = db.prepare(`${membershipSql} ORDER BY a.created_at ASC LIMIT 1`).get(session.user_id) as AccountAndRole | undefined;
    if (accountAndRole) db.prepare('UPDATE sessions SET account_id = ? WHERE id = ?').run(accountAndRole.id, session.id);
  }
  if (!accountAndRole) return null;
  if (clientIp && clientIp !== session.ip_address) {
    db.prepare("UPDATE sessions SET last_active_at = datetime('now', 'utc'), ip_address = ? WHERE id = ?").run(clientIp, session.id);
  } else {
    db.prepare("UPDATE sessions SET last_active_at = datetime('now', 'utc') WHERE id = ?").run(session.id);
  }
  return {
    user: { id: session.user_id, email: session.email, email_verified_at: session.email_verified_at, name: session.user_name,
      status: session.user_status, is_staff: session.is_staff, created_at: session.created_at, updated_at: session.updated_at },
    account: { id: accountAndRole.id, name: accountAndRole.name, owner_user_id: accountAndRole.owner_user_id,
      billing_email: accountAndRole.billing_email, status: accountAndRole.status, created_at: accountAndRole.created_at, updated_at: accountAndRole.updated_at },
    membership: { id: accountAndRole.membership_id, account_id: accountAndRole.id, user_id: session.user_id,
      role: accountAndRole.role, created_at: accountAndRole.membership_created_at },
    session: { id: session.id, mfaVerifiedAt: session.mfa_verified_at, stepUpVerifiedAt: session.step_up_verified_at, expiresAt: session.expires_at },
  };
}

export interface WorkspaceChoice { accountId: string; name: string; role: string; current: boolean }

export function listUserWorkspaces(userId: string, currentAccountId: string, db: Database.Database = getDatabase()): WorkspaceChoice[] {
  const rows = db.prepare(`SELECT a.id, a.name, m.role FROM memberships m JOIN accounts a ON a.id = m.account_id
    WHERE m.user_id = ? AND a.status = 'ACTIVE' ORDER BY a.created_at ASC`).all(userId) as Array<{ id: string; name: string; role: string }>;
  return rows.map((r) => ({ accountId: r.id, name: r.name, role: r.role, current: r.id === currentAccountId }));
}

/** NEW-368: an explicit, audited switch of the session's workspace. Only workspaces the user belongs to can be chosen. */
export function switchWorkspace(
  data: { userId: string; sessionId: string; accountId: string; ipAddress: string },
  db: Database.Database = getDatabase()
): boolean {
  return runInTransaction((trx) => {
    const member = trx.prepare("SELECT 1 FROM memberships m JOIN accounts a ON a.id = m.account_id WHERE m.user_id = ? AND m.account_id = ? AND a.status = 'ACTIVE'").get(data.userId, data.accountId);
    if (!member) return false;
    const updated = trx.prepare('UPDATE sessions SET account_id = ?, step_up_verified_at = NULL WHERE id = ? AND user_id = ?').run(data.accountId, data.sessionId, data.userId);
    if (!updated.changes) return false;
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'session.workspace_switched', 'session', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.sessionId, data.ipAddress, generateId('cor'));
    return true;
  }, db);
}

export function completeStepUp(
  data: { userId: string; accountId: string; sessionId: string; password: string; code: string; ipAddress: string },
  db: Database.Database = getDatabase()
): { verifiedAt: string; validForSeconds: number } {
  return runInTransaction((trx) => {
    const user = trx.prepare('SELECT password_hash FROM users WHERE id = ?').get(data.userId) as { password_hash: string } | undefined;
    const factor = confirmedMfa(data.userId, trx);
    if (!user || !verifyPassword(user.password_hash, data.password)) throw new Error('The current password is incorrect.');
    if (!factor) throw new Error('An authenticator must be enabled before completing step-up verification.');
    let valid = false;
    try { valid = validTotp(decryptSecret(factor.secret_encrypted), data.code.trim()); }
    catch { throw new MfaConfigurationUnavailableError(); }
    if (!valid) throw new Error('The authenticator code is invalid.');
    const session = trx.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ? AND expires_at > datetime(\'now\', \'utc\')')
      .get(data.sessionId, data.userId) as { id: string } | undefined;
    if (!session) throw new Error('This session has expired.');
    const verifiedAt = new Date().toISOString();
    trx.prepare('UPDATE sessions SET step_up_verified_at = ? WHERE id = ?').run(verifiedAt, data.sessionId);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.step_up_completed', 'session', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.sessionId, data.ipAddress, generateId('cor'));
    return { verifiedAt, validForSeconds: 600 };
  }, db);
}

export function hasPendingMfaSession(token: string, db: Database.Database = getDatabase()): boolean {
  const row = db.prepare(`SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now', 'utc') AND u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL`)
    .get(tokenDigest(token)) as { user_id: string } | undefined;
  return Boolean(row && confirmedMfa(row.user_id, db));
}

export function completeMfaChallenge(token: string, code: string, ipAddress: string, db: Database.Database = getDatabase()): { recoveryCodeUsed: boolean } {
  const outcome = runInTransaction((trx): { recoveryCodeUsed: boolean; error?: string } => {
    const sessionId = tokenDigest(token);
    const session = trx.prepare(`SELECT s.user_id, s.device_id FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now', 'utc') AND u.status = 'ACTIVE'`)
      .get(sessionId) as { user_id: string; device_id: string | null } | undefined;
    if (!session) throw new Error('This sign-in session has expired.');
    const attempts = trx.prepare(`SELECT count(*) AS total FROM mfa_attempts WHERE session_id = ? AND succeeded = 0
      AND attempted_at >= datetime('now', '-15 minutes')`).get(sessionId) as { total: number };
    const userAttempts = trx.prepare(`
      SELECT count(*) AS total FROM mfa_attempts
      WHERE user_id = ? AND succeeded = 0 AND attempted_at >= datetime('now', '-15 minutes')
    `).get(session.user_id) as { total: number };
    if (attempts.total >= MAX_MFA_ATTEMPTS || userAttempts.total >= MAX_MFA_ATTEMPTS) {
      throw new Error('Too many verification attempts. Try again after 15 minutes.');
    }
    const factor = confirmedMfa(session.user_id, trx);
    if (!factor) throw new Error('No authenticator is configured for this account.');
    const normalizedCode = code.trim().toUpperCase();
    let recovery = trx.prepare(`SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND consumed_at IS NULL`)
      .get(session.user_id, recoveryDigest(session.user_id, normalizedCode)) as { id: string } | undefined;
    if (!recovery) {
      const legacyHash = crypto.createHash('sha256').update(`${session.user_id}:${normalizedCode.replace(/[^A-Z0-9]/gi, '')}`).digest('hex');
      recovery = trx.prepare(`SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND consumed_at IS NULL`)
        .get(session.user_id, legacyHash) as { id: string } | undefined;
    }
    let valid = Boolean(recovery);
    if (!valid) {
      try { valid = validTotp(decryptSecret(factor.secret_encrypted), normalizedCode); }
      catch { throw new MfaConfigurationUnavailableError(); }
    }
    trx.prepare('INSERT INTO mfa_attempts (id, user_id, session_id, succeeded) VALUES (?, ?, ?, ?)')
      .run(generateId('mfa'), session.user_id, sessionId, valid ? 1 : 0);
    if (!valid) return { recoveryCodeUsed: false, error: 'The verification code is invalid.' };
    if (recovery) trx.prepare("UPDATE mfa_recovery_codes SET consumed_at = datetime('now', 'utc') WHERE id = ?").run(recovery.id);

    // Extend session TTL to full 14 days and mark verified
    const fullExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    trx.prepare("UPDATE sessions SET mfa_verified_at = datetime('now', 'utc'), expires_at = ? WHERE id = ?")
      .run(fullExpiry, sessionId);

    // Only now that MFA has succeeded, supersede any previous session for this browser installation
    if (session.device_id) {
      trx.prepare("DELETE FROM sessions WHERE user_id = ? AND device_id = ? AND id != ?")
        .run(session.user_id, session.device_id, sessionId);
    }

    trx.prepare("UPDATE mfa_factors SET last_used_at = datetime('now', 'utc') WHERE id = ?").run(factor.id);
    const userRow = trx.prepare('SELECT email FROM users WHERE id = ?').get(session.user_id) as { email: string } | undefined;
    if (userRow?.email) {
      trx.prepare('DELETE FROM auth_login_attempts WHERE identifier_hash = ? AND succeeded = 0')
        .run(identifierDigest(userRow.email));
    }
    const account = getPrimaryAccount(session.user_id, trx);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.mfa_challenge_completed', 'session', ?, ?, ?)`)
      .run(generateId('aud'), account.id, session.user_id, sessionId, ipAddress, generateId('cor'));
    return { recoveryCodeUsed: Boolean(recovery) };
  }, db);
  if (outcome.error) throw new Error(outcome.error);
  return { recoveryCodeUsed: outcome.recoveryCodeUsed };
}

export function getMfaStatus(userId: string, db: Database.Database = getDatabase()): MfaStatus {
  const enabled = Boolean(confirmedMfa(userId, db));
  const row = db.prepare('SELECT count(*) AS total FROM mfa_recovery_codes WHERE user_id = ? AND consumed_at IS NULL').get(userId) as { total: number };
  return { enabled, recoveryCodesRemaining: row.total };
}

export function beginTotpEnrollment(userId: string, password: string, email: string, db: Database.Database = getDatabase()): { secret: string; uri: string } {
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!user || !verifyPassword(user.password_hash, password)) throw new Error('The current password is incorrect.');
  if (confirmedMfa(userId, db)) {
    throw new Error('Multi-factor authentication is already enabled on this account. To replace your authenticator, use the factor replacement flow with step-up verification.');
  }
  const secret = base32Encode(crypto.randomBytes(20));
  db.prepare(`INSERT INTO mfa_factors (id, user_id, type, secret_encrypted, pending_secret_encrypted, is_confirmed)
    VALUES (?, ?, 'TOTP', ?, NULL, 0) ON CONFLICT(user_id, type) DO UPDATE SET secret_encrypted = excluded.secret_encrypted,
    pending_secret_encrypted = NULL, is_confirmed = 0, last_used_at = NULL, created_at = datetime('now', 'utc')`)
    .run(generateId('mff'), userId, encryptSecret(secret));
  const label = encodeURIComponent(`Fortless:${email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Fortless&algorithm=SHA1&digits=6&period=30` };
}

export function beginTotpReplacement(userId: string, email: string, db: Database.Database = getDatabase()): { secret: string; uri: string } {
  const factor = confirmedMfa(userId, db);
  if (!factor) {
    throw new Error('Multi-factor authentication is not yet enabled.');
  }
  const secret = base32Encode(crypto.randomBytes(20));
  // Preserve confirmed active factor! Store the replacement secret in pending_secret_encrypted
  db.prepare('UPDATE mfa_factors SET pending_secret_encrypted = ? WHERE id = ?')
    .run(encryptSecret(secret), factor.id);
  const label = encodeURIComponent(`Fortless:${email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Fortless&algorithm=SHA1&digits=6&period=30` };
}

export function regenerateRecoveryCodes(
  data: { userId: string; accountId: string; ipAddress: string },
  db: Database.Database = getDatabase()
): string[] {
  return runInTransaction((trx) => {
    const factor = confirmedMfa(data.userId, db);
    if (!factor) throw new Error('Multi-factor authentication is not enabled.');
    // 128-bit uniformly random recovery codes (16 random bytes formatted as 32 hex chars with hyphens)
    const codes = Array.from({ length: 10 }, () => (crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g) || []).join('-'));
    trx.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(data.userId);
    const insert = trx.prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)');
    for (const code of codes) {
      insert.run(generateId('mrc'), data.userId, recoveryDigest(data.userId, code));
    }
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.mfa_recovery_codes_regenerated', 'user', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'));
    const user = trx.prepare('SELECT email FROM users WHERE id = ?').get(data.userId) as { email: string } | undefined;
    if (user?.email) {
      queueEmail(trx, { recipient: user.email, template: 'security_alert', payload: { action: 'MFA recovery codes were regenerated' } });
    }
    return codes;
  }, db);
}

export function confirmTotpEnrollment(data: { userId: string; accountId: string; sessionId: string; code: string; ipAddress: string }, db: Database.Database = getDatabase()): string[] {
  return runInTransaction((trx) => {
    // Check if confirming a replacement factor
    const confirmedFactor = trx.prepare("SELECT id, secret_encrypted, pending_secret_encrypted FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 1")
      .get(data.userId) as { id: string; secret_encrypted: string; pending_secret_encrypted?: string | null } | undefined;

    if (confirmedFactor && confirmedFactor.pending_secret_encrypted) {
      if (!validTotp(decryptSecret(confirmedFactor.pending_secret_encrypted), data.code.trim())) {
        throw new Error('The verification code is invalid.');
      }
      trx.prepare("UPDATE mfa_factors SET secret_encrypted = pending_secret_encrypted, pending_secret_encrypted = NULL, last_used_at = datetime('now', 'utc') WHERE id = ?")
        .run(confirmedFactor.id);
      const codes = Array.from({ length: 10 }, () => (crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g) || []).join('-'));
      trx.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(data.userId);
      const insert = trx.prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)');
      for (const code of codes) insert.run(generateId('mrc'), data.userId, recoveryDigest(data.userId, code));
      trx.prepare("UPDATE sessions SET mfa_verified_at = CASE WHEN id = ? THEN datetime('now', 'utc') ELSE NULL END WHERE user_id = ?")
        .run(data.sessionId, data.userId);
      trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
        VALUES (?, ?, ?, 'USER', 'user.mfa_factor_replaced', 'user', ?, ?, ?)`)
        .run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'));
      const user = trx.prepare('SELECT email FROM users WHERE id = ?').get(data.userId) as { email: string };
      queueEmail(trx, { recipient: user.email, template: 'mfa_changed', payload: { enabled: true } });
      return codes;
    }

    const factor = trx.prepare("SELECT id, secret_encrypted FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 0")
      .get(data.userId) as { id: string; secret_encrypted: string } | undefined;
    if (!factor || !validTotp(decryptSecret(factor.secret_encrypted), data.code.trim())) throw new Error('The verification code is invalid.');
    const codes = Array.from({ length: 10 }, () => (crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g) || []).join('-'));
    trx.prepare("UPDATE mfa_factors SET is_confirmed = 1, last_used_at = datetime('now', 'utc') WHERE id = ?").run(factor.id);
    trx.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(data.userId);
    const insert = trx.prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)');
    for (const code of codes) insert.run(generateId('mrc'), data.userId, recoveryDigest(data.userId, code));
    trx.prepare("UPDATE sessions SET mfa_verified_at = CASE WHEN id = ? THEN datetime('now', 'utc') ELSE NULL END WHERE user_id = ?")
      .run(data.sessionId, data.userId);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.mfa_enabled', 'user', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'));
    const user = trx.prepare('SELECT email FROM users WHERE id = ?').get(data.userId) as { email: string };
    queueEmail(trx, { recipient: user.email, template: 'mfa_changed', payload: { enabled: true } });
    return codes;
  }, db);
}

export function disableTotp(data: { userId: string; accountId: string; password: string; code: string; ipAddress: string }, db: Database.Database = getDatabase()): void {
  runInTransaction((trx) => {
    const user = trx.prepare('SELECT password_hash FROM users WHERE id = ?').get(data.userId) as { password_hash: string } | undefined;
    const factor = confirmedMfa(data.userId, trx);
    if (!user || !verifyPassword(user.password_hash, data.password)) throw new Error('The current password is incorrect.');
    if (!factor || !validTotp(decryptSecret(factor.secret_encrypted), data.code.trim())) throw new Error('The authenticator code is invalid.');
    trx.prepare('DELETE FROM mfa_factors WHERE user_id = ?').run(data.userId);
    trx.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(data.userId);
    trx.prepare('UPDATE sessions SET mfa_verified_at = NULL WHERE user_id = ?').run(data.userId);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'user.mfa_disabled', 'user', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'));
    const email = (trx.prepare('SELECT email FROM users WHERE id = ?').get(data.userId) as { email: string }).email;
    queueEmail(trx, { recipient: email, template: 'mfa_changed', payload: { enabled: false } });
  }, db);
}
export function revokeSession(token: string, db: Database.Database = getDatabase()): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(tokenDigest(token));
}

export function listUserSessions(
  userId: string, currentSessionId: string, db: Database.Database = getDatabase()
): SessionDevice[] {
  const mfaEnabled = Boolean(confirmedMfa(userId, db));
  const rows = db.prepare(`SELECT id, device_id, ip_address, user_agent, created_at, last_active_at, expires_at
    FROM sessions WHERE user_id = ? AND expires_at > datetime('now', 'utc')
    ${mfaEnabled ? 'AND mfa_verified_at IS NOT NULL' : ''}
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, last_active_at DESC`).all(userId, currentSessionId) as Array<{
      id: string; device_id: string | null; ip_address: string; user_agent: string; created_at: string; last_active_at: string; expires_at: string;
    }>;
  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
    isCurrent: row.id === currentSessionId,
  }));
}

export function cleanupExpiredSessions(db: Database.Database = getDatabase()): { expiredCount: number; pendingMfaCount: number } {
  return runInTransaction((trx) => {
    const expired = trx.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now', 'utc')").run();
    const pending = trx.prepare("DELETE FROM sessions WHERE mfa_verified_at IS NULL AND created_at < datetime('now', '-15 minutes')").run();
    return { expiredCount: expired.changes, pendingMfaCount: pending.changes };
  }, db);
}

export function revokeUserSession(
  data: { userId: string; accountId: string; sessionId: string; ipAddress: string },
  db: Database.Database = getDatabase()
): boolean {
  return runInTransaction((trx) => {
    const result = trx.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(data.sessionId, data.userId);
    if (result.changes === 0) return false;
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'session.revoked', 'session', ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.userId, data.sessionId, data.ipAddress, generateId('cor'));
    return true;
  }, db);
}

export function revokeOtherUserSessions(
  data: { userId: string; accountId: string; currentSessionId: string; ipAddress: string },
  db: Database.Database = getDatabase()
): number {
  return runInTransaction((trx) => {
    const result = trx.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(data.userId, data.currentSessionId);
    if (result.changes > 0) {
      trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, ?, ?, 'USER', 'session.others_revoked', 'user', ?, ?, ?, ?)`)
        .run(generateId('aud'), data.accountId, data.userId, data.userId, data.ipAddress, generateId('cor'), JSON.stringify({ revokedCount: result.changes }));
    }
    return result.changes;
  }, db);
}
