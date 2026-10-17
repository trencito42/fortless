import net from 'node:net';
import dns from 'node:dns/promises';

/**
 * Checks whether an IP address belongs to private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;

    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (RFC1918)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (RFC1918)
    if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
    // 192.168.0.0/16 (RFC1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // Broadcast / reserved
    if (parts[0]! >= 224) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback ::1
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // Unspecified ::
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
    // Unique local address fc00::/7
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-local address fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    if (normalized.includes('::ffff:')) {
      const v4Part = normalized.split('::ffff:')[1];
      if (v4Part && net.isIPv4(v4Part)) {
        return isPrivateOrReservedIp(v4Part);
      }
    }
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
