import crypto from 'node:crypto';

/**
 * The parts of WebAuthn the server needs: a small CBOR reader, the attestation object parser that extracts the credential's
 * public key, and the authenticatorData checks (rpIdHash and flags). No attestation statement is trusted ("none").
 */

type Cbor = number | bigint | string | boolean | null | Buffer | Cbor[] | Map<Cbor, Cbor>;

function readUInt(buf: Buffer, offset: number, info: number): [number, number] {
  if (info < 24) return [info, offset];
  if (info === 24) return [buf.readUInt8(offset), offset + 1];
  if (info === 25) return [buf.readUInt16BE(offset), offset + 2];
  if (info === 26) return [buf.readUInt32BE(offset), offset + 4];
  if (info === 27) {
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR integer is too large.');
    return [Number(big), offset + 8];
  }
  throw new Error('Unsupported CBOR length.');
}

export function decodeCbor(buf: Buffer, start = 0, depth = 0): [Cbor, number] {
  if (depth > 8) throw new Error('CBOR is nested too deeply.');
  if (start >= buf.length) throw new Error('Unexpected end of CBOR.');
  const head = buf[start]!;
  const major = head >> 5;
  const info = head & 0x1f;
  let [n, off] = readUInt(buf, start + 1, info);
  switch (major) {
    case 0: return [n, off];
    case 1: return [-1 - n, off];
    case 2: case 3: {
      if (off + n > buf.length) throw new Error('CBOR string is truncated.');
      const slice = buf.subarray(off, off + n);
      return [major === 2 ? Buffer.from(slice) : slice.toString('utf8'), off + n];
    }
    case 4: {
      if (n > 1024) throw new Error('CBOR array is too large.');
      const out: Cbor[] = [];
      for (let i = 0; i < n; i++) { const [v, next] = decodeCbor(buf, off, depth + 1); out.push(v); off = next; }
      return [out, off];
    }
    case 5: {
      if (n > 1024) throw new Error('CBOR map is too large.');
      const out = new Map<Cbor, Cbor>();
      for (let i = 0; i < n; i++) {
        const [k, afterKey] = decodeCbor(buf, off, depth + 1);
        const [v, afterValue] = decodeCbor(buf, afterKey, depth + 1);
        out.set(k, v); off = afterValue;
      }
      return [out, off];
    }
    case 7: {
      if (info === 20) return [false, start + 1];
      if (info === 21) return [true, start + 1];
      if (info === 22 || info === 23) return [null, start + 1];
      throw new Error('Unsupported CBOR simple value.');
    }
    default: throw new Error('Unsupported CBOR type.');
  }
}

export const b64u = (b: Buffer) => b.toString('base64url');

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_AT = 0x40;

export interface ParsedAttestation { credentialId: Buffer; publicKeyPem: string; alg: number; rpIdHash: Buffer; flags: number; signCount: number }

/** COSE public key to PEM. Supports ES256 (-7), RS256 (-257) and EdDSA (-8), the algorithms browsers offer for passkeys. */
export function coseToPem(cose: Map<Cbor, Cbor>): { pem: string; alg: number } {
  const kty = cose.get(1);
  const alg = Number(cose.get(3));
  let jwk: crypto.JsonWebKey;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    jwk = { kty: 'EC', crv: 'P-256', x: b64u(cose.get(-2) as Buffer), y: b64u(cose.get(-3) as Buffer) };
  } else if (kty === 3 && alg === -257) {
    jwk = { kty: 'RSA', n: b64u(cose.get(-1) as Buffer), e: b64u(cose.get(-2) as Buffer) };
  } else if (kty === 1 && alg === -8 && cose.get(-1) === 6) {
    jwk = { kty: 'OKP', crv: 'Ed25519', x: b64u(cose.get(-2) as Buffer) };
  } else {
    throw new Error('This passkey uses an unsupported key type.');
  }
  return { pem: crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }) as string, alg };
}

/** Parses an attestation object (base64url CBOR) and returns the credential id and its public key. */
export function parseAttestationObject(attestationB64u: string): ParsedAttestation {
  const [obj] = decodeCbor(Buffer.from(attestationB64u, 'base64url'));
  if (!(obj instanceof Map)) throw new Error('Malformed attestation object.');
  const authData = obj.get('authData');
  if (!Buffer.isBuffer(authData) || authData.length < 55) throw new Error('Malformed authenticator data.');
  const flags = authData[32]!;
  if (!(flags & FLAG_AT)) throw new Error('The authenticator did not return a credential.');
  const idLength = authData.readUInt16BE(53);
  if (idLength < 16 || idLength > 1023 || 55 + idLength >= authData.length) throw new Error('Malformed credential id.');
  const credentialId = Buffer.from(authData.subarray(55, 55 + idLength));
  const [cose] = decodeCbor(authData, 55 + idLength);
  if (!(cose instanceof Map)) throw new Error('Malformed credential public key.');
  const { pem, alg } = coseToPem(cose);
  return { credentialId, publicKeyPem: pem, alg, rpIdHash: Buffer.from(authData.subarray(0, 32)), flags, signCount: authData.readUInt32BE(33) };
}

/** The assertion must be for this site (rpIdHash) and the user must have been present. */
export function checkAssertionAuthData(authData: Buffer, rpId: string): void {
  if (authData.length < 37) throw new Error('Malformed authenticator data.');
  const expected = crypto.createHash('sha256').update(rpId).digest();
  if (!crypto.timingSafeEqual(authData.subarray(0, 32), expected)) throw new Error('The passkey was not created for this site.');
  if (!(authData[32]! & FLAG_UP)) throw new Error('The passkey did not confirm the user was present.');
}
