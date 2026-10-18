import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { decodeCbor } from '../src/modules/identity/webauthn.js';
import {
  generateWebAuthnChallenge, verifyAndRegisterPasskey, verifyAndAuthenticatePasskey, listPasskeysForUser,
} from '../src/modules/identity/passkeys.js';

let db: Database.Database;
const b64u = (b: Buffer) => b.toString('base64url');

// ---- a tiny CBOR encoder, just enough to build real attestation objects ----
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
function enc(v: unknown): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const s = Buffer.from(v); return Buffer.concat([head(3, s.length), s]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [enc(k), enc(x)])]);
  throw new Error('unsupported');
}

function newPasskey(origin = 'https://fortless.net', rpId = 'fortless.net') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const credentialId = crypto.randomBytes(32);
  const cose = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  const authData = Buffer.concat([
    crypto.createHash('sha256').update(rpId).digest(), Buffer.from([0x45]), Buffer.from([0, 0, 0, 0]), Buffer.alloc(16),
    Buffer.from([0, credentialId.length]), credentialId, enc(cose),
  ]);
  const attestation = enc(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  return { privateKey, credentialId: b64u(credentialId), attestationObject: b64u(attestation), origin, rpId };
}

function register(userId: string, pk: ReturnType<typeof newPasskey>) {
  const ch = generateWebAuthnChallenge('REGISTRATION', userId, db);
  return verifyAndRegisterPasskey({
    userId, deviceLabel: 'Test key', challenge: ch.challenge, credentialId: pk.credentialId, publicKey: pk.attestationObject,
    clientDataJSON: JSON.stringify({ type: 'webauthn.create', challenge: ch.challenge, origin: pk.origin }),
  }, db);
}

function assertion(pk: ReturnType<typeof newPasskey>, opts: { rpId?: string; flags?: number; counter?: number; origin?: string } = {}) {
  const ch = generateWebAuthnChallenge('AUTHENTICATION', null, db);
  const clientData = JSON.stringify({ type: 'webauthn.get', challenge: ch.challenge, origin: opts.origin ?? pk.origin });
  const authData = Buffer.alloc(37);
  crypto.createHash('sha256').update(opts.rpId ?? pk.rpId).digest().copy(authData, 0);
  authData[32] = opts.flags ?? 0x05;
  authData.writeUInt32BE(opts.counter ?? 1, 33);
  const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]), pk.privateKey);
  return { credentialId: pk.credentialId, challenge: ch.challenge, clientDataJSON: b64u(Buffer.from(clientData)), authenticatorData: b64u(authData), signature: b64u(signature) };
}

function seedUser(id = 'usr_1') {
  db.prepare(`INSERT INTO users (id, email, password_hash, name, status) VALUES (?, ?, 'x', 'T', 'ACTIVE')`).run(id, `${id}@example.test`);
  db.prepare(`INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES (?, 'A', ?, 'b@example.test')`).run(`acc_${id}`, id);
  db.prepare(`INSERT INTO memberships (id, account_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`).run(`mem_${id}`, `acc_${id}`, id);
  return id;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
});
afterEach(() => db.close());

describe('WebAuthn with real attestation objects', () => {
  it('WAN-01: a browser-style registration stores the real public key and the passkey can sign in', () => {
    const user = seedUser();
    const pk = newPasskey();
    const rec = register(user, pk);
    expect(rec.publicKey).toContain('BEGIN PUBLIC KEY');
    const res = verifyAndAuthenticatePasskey(assertion(pk), db);
    expect(res.user.id).toBe(user);
    expect(listPasskeysForUser(user, db)).toHaveLength(1);
  });

  it('WAN-02: registration refuses a credential id that is not the signed one, and a key made for another site', () => {
    const user = seedUser();
    const pk = newPasskey();
    const ch = generateWebAuthnChallenge('REGISTRATION', user, db);
    const clientDataJSON = JSON.stringify({ type: 'webauthn.create', challenge: ch.challenge, origin: pk.origin });
    expect(() => verifyAndRegisterPasskey({ userId: user, deviceLabel: 'x', challenge: ch.challenge, credentialId: b64u(crypto.randomBytes(32)), publicKey: pk.attestationObject, clientDataJSON }, db)).toThrow(/does not match/);
    const other = newPasskey('https://fortless.net', 'evil.example');
    expect(() => register(user, other)).toThrow(/not created for this site/);
    expect(() => verifyAndRegisterPasskey({ userId: user, deviceLabel: 'x', challenge: generateWebAuthnChallenge('REGISTRATION', user, db).challenge, credentialId: pk.credentialId, publicKey: 'garbage', clientDataJSON: '{}' }, db)).toThrow();
    expect(listPasskeysForUser(user, db)).toHaveLength(0);
  });

  it('WAN-03: an assertion for another site, without user presence or with a bad signature is rejected', () => {
    const user = seedUser();
    const pk = newPasskey();
    register(user, pk);
    expect(() => verifyAndAuthenticatePasskey(assertion(pk, { rpId: 'evil.example' }), db)).toThrow(/not created for this site/);
    expect(() => verifyAndAuthenticatePasskey(assertion(pk, { flags: 0x04 }), db)).toThrow(/present/);
    const a = assertion(pk);
    expect(() => verifyAndAuthenticatePasskey({ ...a, signature: b64u(crypto.randomBytes(70)) }, db)).toThrow(/signature/);
    expect(() => verifyAndAuthenticatePasskey(assertion(pk, { origin: 'https://evil.example' }), db)).toThrow(/origin/);
  });

  it('WAN-04: a passkey registered before key extraction (raw attestation object) is converted on first use', () => {
    const user = seedUser();
    const pk = newPasskey();
    db.prepare("INSERT INTO passkey_credentials (id, user_id, credential_id, public_key, counter, device_label) VALUES ('pk_legacy', ?, ?, ?, 0, 'Legacy')").run(user, pk.credentialId, pk.attestationObject);
    expect(verifyAndAuthenticatePasskey(assertion(pk), db).user.id).toBe(user);
    expect((db.prepare("SELECT public_key k FROM passkey_credentials WHERE id = 'pk_legacy'").get() as { k: string }).k).toContain('BEGIN PUBLIC KEY');
    db.prepare("UPDATE passkey_credentials SET public_key = 'AAAA' WHERE id = 'pk_legacy'").run();
    expect(() => verifyAndAuthenticatePasskey(assertion(pk, { counter: 2 }), db)).toThrow(/registered again/);
  });

  it('WAN-05: the CBOR reader rejects truncated and over-nested input', () => {
    expect(() => decodeCbor(Buffer.from([0x45, 1, 2]))).toThrow();
    expect(() => decodeCbor(Buffer.alloc(40, 0x81))).toThrow(/nested/);
    expect(() => decodeCbor(Buffer.from([0x99, 0xff, 0xff]))).toThrow();
  });
});
