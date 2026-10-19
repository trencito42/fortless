import net from 'node:net';
import dns from 'node:dns/promises';

const ipv4Octets = (ip: string): number[] | null => {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null;
};

/** Expands any IPv6 text form into its 16 bytes (null when it is not valid IPv6). */
function ipv6Bytes(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0]!;
  if (!net.isIPv6(text)) return null;
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = ipv4Octets(tail[1]!);
    if (!v4) return null;
    text = text.slice(0, -tail[1]!.length) + ((v4[0]! << 8) | v4[1]!).toString(16) + ':' + ((v4[2]! << 8) | v4[3]!).toString(16);
  }
  const [head, rest] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = rest !== undefined && rest ? rest.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (rest === undefined ? left.length !== 8 : missing < 0) return null;
  const groups = rest === undefined ? left : [...left, ...Array(missing).fill('0'), ...right];
  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group || '0', 16);
    if (Number.isNaN(value) || value > 0xffff) return null;
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

/**
 * Checks whether an IP address belongs to a private, loopback, link-local, shared, documentation, multicast or
 * otherwise non-public range (SEC-08). IPv6 is parsed to bytes, so mapped, NAT64 and 6to4 forms are judged by the
 * IPv4 address inside them.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ipv4Octets(ip);
    if (!p) return true;
    const [a, b, c] = p as [number, number, number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)            // 100.64.0.0/10 carrier-grade NAT
      || (a === 169 && b === 254)                       // link-local, cloud metadata
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) // 192.0.0.0/24, 192.0.2.0/24
      || (a === 198 && (b === 18 || b === 19))          // 198.18.0.0/15 benchmarking
      || (a === 198 && b === 51 && c === 100)           // 198.51.100.0/24
      || (a === 203 && b === 0 && c === 113);           // 203.0.113.0/24
  }
  if (net.isIPv6(ip)) {
    const b = ipv6Bytes(ip);
    if (!b) return true;
    const allZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    const embedded = (offset: number) => isPrivateOrReservedIp(`${b[offset]}.${b[offset + 1]}.${b[offset + 2]}.${b[offset + 3]}`);
    if (allZero(0, 15) && (b[15] === 0 || b[15] === 1)) return true;                 // :: and ::1
    if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return embedded(12);     // ::ffff:a.b.c.d
    if (allZero(0, 12)) return embedded(12);                                          // ::a.b.c.d (deprecated)
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && allZero(4, 12)) return embedded(12); // 64:ff9b::/96 NAT64
    if (b[0] === 0x20 && b[1] === 0x02) return embedded(2);                           // 2002::/16 6to4
    if ((b[0]! & 0xfe) === 0xfc) return true;                                         // fc00::/7 unique local
    if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true;                        // fe80::/10 link-local
    if (b[0] === 0xff) return true;                                                   // ff00::/8 multicast
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 documentation
    return false;
  }
  return true;
}

/**
 * Validates an outbound URL to prevent SSRF against loopback, private RFC1918 subnets,
 * link-local AWS/cloud metadata, and IPv6 equivalents.
 */
export async function validateSafeOutboundUrl(targetUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname;

  // Direct IP check
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`SSRF blocked: ${hostname} is a private or reserved IP address.`);
    }
    return parsed;
  }

  // Domain DNS resolution
  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    for (const entry of lookupResults) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new Error(`SSRF blocked: Domain ${hostname} resolves to restricted IP ${entry.address}.`);
      }
    }
  } catch (err: unknown) {
    if ((err as Error).message.includes('SSRF blocked')) throw err;
    throw new Error(`DNS resolution failed for outbound URL host: ${hostname}`);
  }

  return parsed;
}

/**
 * A fetch whose destination cannot change between the check and the connection (SEC-08): the host is resolved once,
 * every address is validated, the connection is pinned to a validated address, and each redirect is validated again.
 * Intended for any Fortless-side request to an address that a user supplied.
 */
export async function pinnedFetch(
  targetUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Buffer; timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {}
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; finalUrl: string }> {
  const https = await import('node:https');
  const http = await import('node:http');
  const maxRedirects = init.maxRedirects ?? 3;
  let current = targetUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = await validateSafeOutboundUrl(current);
    const addresses = net.isIP(parsed.hostname) ? [parsed.hostname] : (await dns.lookup(parsed.hostname, { all: true })).map((a) => a.address);
    const pinned = addresses.find((a) => !isPrivateOrReservedIp(a));
    if (!pinned || addresses.some((a) => isPrivateOrReservedIp(a))) throw new Error(`SSRF blocked: ${parsed.hostname} has no public address.`);
    const lib = parsed.protocol === 'https:' ? https : http;
    const result = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
      const req = lib.request(parsed, {
        method: init.method ?? 'GET',
        headers: init.headers,
        timeout: init.timeoutMs ?? 10_000,
        // The connection goes to the address that was validated, not to whatever the name resolves to now.
        lookup: (_host, _opts, cb) => (_opts as { all?: boolean })?.all ? (cb as unknown as (e: null, a: unknown) => void)(null, [{ address: pinned, family: net.isIPv6(pinned) ? 6 : 4 }]) : cb(null, pinned, net.isIPv6(pinned) ? 6 : 4),
      }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > (init.maxBytes ?? 5 * 1024 * 1024)) { req.destroy(new Error('Response too large')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('Request timed out')));
      req.on('error', reject);
      if (init.body) req.write(init.body);
      req.end();
    });
    if (result.status >= 300 && result.status < 400 && result.headers['location']) {
      current = new URL(String(result.headers['location']), parsed).toString();
      continue;
    }
    return { ...result, finalUrl: current };
  }
  throw new Error('Too many redirects');
}
