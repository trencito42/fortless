import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { checkAssertionAuthData, parseAttestationObject } from './webauthn.js';
import { generateId, getPrimaryAccount, createSessionForUser, type User, type Account } from './auth.js';

export interface PasskeyRecord {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceLabel: string;
  aaguid?: string | null;
  transports?: string[] | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface WebAuthnChallengeRecord {
  id: string;
  userId: string | null;
  challenge: string;
  purpose: 'REGISTRATION' | 'AUTHENTICATION' | 'STEP_UP';
  expiresAt: string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

export function getAllowedOrigins(): string[] {
  const host = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
  const configuredPort = config.PORT ? `:${config.PORT}` : '';
  return [
    `http://${host}${configuredPort}`,
    `http://127.0.0.1${configuredPort}`,
    `http://localhost${configuredPort}`,
    config.APP_ORIGIN,
    ...config.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    `http://127.0.0.1:3021`,
    `http://localhost:3021`,
  ];
}

export function generateWebAuthnChallenge(
  purpose: 'REGISTRATION' | 'AUTHENTICATION' | 'STEP_UP',
  userId: string | null = null,
  db: Database.Database = getDatabase()
): { challenge: string; expiresAt: string } {
  const challenge = base64urlEncode(crypto.randomBytes(32));
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const id = generateId('wch');

  db.prepare(`
    INSERT INTO webauthn_challenges (id, user_id, challenge, purpose, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, challenge, purpose, expiresAt);

  return { challenge, expiresAt };
}

export function consumeWebAuthnChallenge(
  challenge: string,
  expectedPurpose: 'REGISTRATION' | 'AUTHENTICATION' | 'STEP_UP',
  expectedUserId: string | null = null,
  db: Database.Database = getDatabase()
): boolean {
  return runInTransaction((trx) => {
    const record = trx.prepare(`
      SELECT * FROM webauthn_challenges
      WHERE challenge = ? AND purpose = ? AND expires_at > datetime('now', 'utc')
    `).get(challenge, expectedPurpose) as { id: string; user_id: string | null; expires_at: string } | undefined;

    if (!record) {
      return false;
    }

    if (expectedUserId && record.user_id && record.user_id !== expectedUserId) {
      return false;
    }

    // Single-use: delete immediately to prevent replay
    trx.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(record.id);
    return true;
  }, db);
}

export interface RegisterPasskeyParams {
  userId: string;
  deviceLabel: string;
  challenge: string;
  clientDataJSON: string; // base64url or raw JSON string
  credentialId: string;
  publicKey: string; // PEM or SPKI format
  aaguid?: string;
  transports?: string[];
  ipAddress?: string;
}

export function verifyAndRegisterPasskey(
  params: RegisterPasskeyParams,
  db: Database.Database = getDatabase()
): PasskeyRecord {
  const consumed = consumeWebAuthnChallenge(params.challenge, 'REGISTRATION', params.userId, db);
  if (!consumed) {
    throw new Error('WebAuthn registration challenge is invalid, expired or already consumed.');
  }

  // Parse clientDataJSON
  let clientData: { type: string; challenge: string; origin: string };
  try {
    const rawJson = params.clientDataJSON.startsWith('{')
      ? params.clientDataJSON
      : base64urlDecode(params.clientDataJSON).toString('utf8');
    clientData = JSON.parse(rawJson);
  } catch {
    throw new Error('Malformed clientDataJSON payload.');
  }

  if (clientData.type !== 'webauthn.create') {
    throw new Error(`Invalid WebAuthn clientData type: expected "webauthn.create", got "${clientData.type}".`);
  }

  if (clientData.challenge !== params.challenge) {
    throw new Error('WebAuthn challenge mismatch between clientData and expected registration challenge.');
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(clientData.origin)) {
    throw new Error(`WebAuthn origin mismatch: origin "${clientData.origin}" is not authorized.`);
  }

  // Browsers send the attestation object. Extract and store the real public key (PEM), and make sure the
  // credential id in the signed data is the one being registered. A PEM is accepted as-is (tests, imports).
  let publicKey = params.publicKey;
  if (!publicKey.startsWith('-----BEGIN')) {
    let parsed;
    try { parsed = parseAttestationObject(publicKey); } catch (err) { throw new Error(`The passkey could not be read: ${(err as Error).message}`); }
    if (parsed.credentialId.toString('base64url') !== params.credentialId) throw new Error('The passkey credential id does not match.');
    if (!parsed.rpIdHash.equals(crypto.createHash('sha256').update(relyingPartyId(new URL(clientData.origin).hostname)).digest())) throw new Error('The passkey was not created for this site.');
    publicKey = parsed.publicKeyPem;
  }

  const id = generateId('pk');
  const transportsJson = params.transports ? JSON.stringify(params.transports) : null;

  runInTransaction((trx) => {
    trx.prepare(`
      INSERT INTO passkey_credentials (
        id, user_id, credential_id, public_key, counter, device_label, aaguid, transports
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      params.userId,
      params.credentialId,
      publicKey,
      params.deviceLabel.trim() || 'Security Key',
      params.aaguid || null,
      transportsJson
    );

    const account = getPrimaryAccount(params.userId, trx);
    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id
      ) VALUES (?, ?, ?, 'USER', 'auth.passkey_registered', 'passkey', ?, ?, ?)
    `).run(
      generateId('aud'),
      account.id,
      params.userId,
      id,
      params.ipAddress || '127.0.0.1',
      generateId('cor')
    );
  }, db);

  const row = db.prepare('SELECT * FROM passkey_credentials WHERE id = ?').get(id) as {
    id: string;
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    device_label: string;
    aaguid: string | null;
    transports: string | null;
    created_at: string;
    last_used_at: string | null;
  };

  return {
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    deviceLabel: row.device_label,
    aaguid: row.aaguid,
    transports: row.transports ? JSON.parse(row.transports) : null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export interface AuthenticatePasskeyParams {
  credentialId: string;
  challenge: string;
  clientDataJSON: string;
  authenticatorData: string; // base64url or hex
  signature: string; // base64url or hex
  clientCounter?: number;
  ipAddress?: string;
  userAgent?: string;
}

export function verifyAndAuthenticatePasskey(
  params: AuthenticatePasskeyParams,
  db: Database.Database = getDatabase()
): { user: User; account: Account; token: string } {
  // 1. Consume challenge
  const consumed = consumeWebAuthnChallenge(params.challenge, 'AUTHENTICATION', null, db);
  if (!consumed) {
    throw new Error('WebAuthn authentication challenge is invalid, expired, or already used.');
  }

  // 2. Validate clientDataJSON
  let clientData: { type: string; challenge: string; origin: string };
  try {
    const rawJson = params.clientDataJSON.startsWith('{')
      ? params.clientDataJSON
      : base64urlDecode(params.clientDataJSON).toString('utf8');
    clientData = JSON.parse(rawJson);
  } catch {
    throw new Error('Malformed clientDataJSON payload.');
  }

  if (clientData.type !== 'webauthn.get') {
    throw new Error(`Invalid WebAuthn clientData type: expected "webauthn.get", got "${clientData.type}".`);
  }

  if (clientData.challenge !== params.challenge) {
    throw new Error('WebAuthn challenge mismatch.');
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(clientData.origin)) {
    throw new Error(`WebAuthn origin mismatch: origin "${clientData.origin}" is not authorized.`);
  }

  // 3. Look up registered passkey credential
  const credential = db.prepare(`
    SELECT * FROM passkey_credentials WHERE credential_id = ?
  `).get(params.credentialId) as {
    id: string;
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    device_label: string;
  } | undefined;

  if (!credential) {
    throw new Error('Unrecognized passkey credential identifier.');
  }

  // 4. Verify cryptographic signature
  // Passkeys registered before the key was extracted hold the raw attestation object; convert and persist on first use.
  if (!credential.public_key.startsWith('-----BEGIN')) {
    try {
      credential.public_key = parseAttestationObject(credential.public_key).publicKeyPem;
      db.prepare('UPDATE passkey_credentials SET public_key = ? WHERE id = ?').run(credential.public_key, credential.id);
    } catch {
      throw new Error('This passkey must be registered again.');
    }
  }
  const clientDataHash = crypto.createHash('sha256').update(
    params.clientDataJSON.startsWith('{')
      ? Buffer.from(params.clientDataJSON, 'utf8')
      : base64urlDecode(params.clientDataJSON)
  ).digest();

  const authDataBuffer = params.authenticatorData.length % 2 === 0 && !/[^0-9a-fA-F]/.test(params.authenticatorData)
    ? Buffer.from(params.authenticatorData, 'hex')
    : base64urlDecode(params.authenticatorData);

  checkAssertionAuthData(authDataBuffer, relyingPartyId(new URL(clientData.origin).hostname));
  const signedData = Buffer.concat([authDataBuffer, clientDataHash]);

  const signatureBuffer = params.signature.length % 2 === 0 && !/[^0-9a-fA-F]/.test(params.signature)
    ? Buffer.from(params.signature, 'hex')
    : base64urlDecode(params.signature);

  let verified = false;
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(signedData);
    verified = verify.verify(credential.public_key, signatureBuffer);
  } catch {
    // If format issues with raw public key vs PEM, try verifying directly with crypto.verify
    try {
      verified = crypto.verify(
        'sha256',
        signedData,
        credential.public_key,
        signatureBuffer
      );
    } catch {
      verified = false;
    }
  }

  if (!verified) {
    throw new Error('Passkey cryptographic signature verification failed.');
  }

  // 5. Anti-replay counter check
  const newCounter = params.clientCounter ?? (authDataBuffer.length >= 37 ? authDataBuffer.readUInt32BE(33) : 0);
  if (newCounter > 0 && newCounter <= credential.counter) {
    throw new Error('WebAuthn anti-replay check failed: authenticator signature counter did not advance.');
  }

  // 6. Update counter & record audit
  db.prepare(`
    UPDATE passkey_credentials
    SET counter = ?, last_used_at = datetime('now', 'utc')
    WHERE id = ?
  `).run(newCounter, credential.id);

  // 7. Fetch user and account
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(credential.user_id) as User | undefined;
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('The user associated with this passkey is inactive or not found.');
  }

  const account = getPrimaryAccount(user.id, db);

  // 8. Issue session with mfaVerified = true
  const token = createSessionForUser(
    user.id,
    params.ipAddress || '127.0.0.1',
    params.userAgent || 'WebAuthn-Client',
    true,
    db
  );

  db.prepare(`
    INSERT INTO audit_events (
      id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id
    ) VALUES (?, ?, ?, 'USER', 'auth.passkey_authenticated', 'session', ?, ?, ?)
  `).run(
    generateId('aud'),
    account.id,
    user.id,
    credential.id,
    params.ipAddress || '127.0.0.1',
    generateId('cor')
  );

  return { user, account, token };
}

export function listPasskeysForUser(userId: string, db: Database.Database = getDatabase()): PasskeyRecord[] {
  const rows = db.prepare(`
    SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as {
    id: string;
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    device_label: string;
    aaguid: string | null;
    transports: string | null;
    created_at: string;
    last_used_at: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    deviceLabel: row.device_label,
    aaguid: row.aaguid,
    transports: row.transports ? JSON.parse(row.transports) : null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export function revokePasskey(userId: string, passkeyId: string, db: Database.Database = getDatabase()): void {
  const info = db.prepare(`
    DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?
  `).run(passkeyId, userId);

  if (info.changes === 0) {
    throw new Error('Passkey credential not found or not owned by caller.');
  }
}

/** The WebAuthn relying party id is the hostname of the configured public origin (localhost stays usable in development). */
export function relyingPartyId(requestHost?: string): string {
  const host = (requestHost || '').split(':')[0];
  if (host === '127.0.0.1' || host === 'localhost') return host;
  return new URL(config.APP_ORIGIN).hostname;
}
