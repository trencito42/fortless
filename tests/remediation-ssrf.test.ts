import { describe, it, expect, vi } from 'vitest';

const lookup = vi.hoisted(() => ({ map: {} as Record<string, string[]> }));
vi.mock('node:dns/promises', () => ({
  default: { lookup: async (host: string) => { const a = lookup.map[host]; if (!a) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); } },
  lookup: async (host: string) => { const a = lookup.map[host]; if (!a) throw new Error('ENOTFOUND'); return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); },
}));

import { isPrivateOrReservedIp, validateSafeOutboundUrl, pinnedFetch } from '../src/utils/ssrf.js';

describe('SEC-08: non-public addresses are recognised in every notation', () => {
  const blocked = [
    '0.0.0.0', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.254',
    '192.0.0.8', '192.0.2.10', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a00:1', '::127.0.0.1', '64:ff9b::7f00:1', '64:ff9b::10.0.0.1', '2002:7f00:1::1', '2002:c0a8:101::1',
  ];
  const allowed = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:0808:0808::1', '172.32.0.1', '100.128.0.1'];

  it.each(blocked)('blocks %s', (ip) => { expect(isPrivateOrReservedIp(ip)).toBe(true); });
  it.each(allowed)('allows %s', (ip) => { expect(isPrivateOrReservedIp(ip)).toBe(false); });
  it('treats anything that is not an IP as restricted', () => { expect(isPrivateOrReservedIp('not-an-ip')).toBe(true); });
});

describe('SEC-08: names and the pinned fetch', () => {
  it('rejects a name that resolves to any restricted address, even next to a public one', async () => {
    lookup.map['rebind.example.test'] = ['93.184.216.34', '10.0.0.5'];
    await expect(validateSafeOutboundUrl('https://rebind.example.test/x')).rejects.toThrow(/restricted IP/);
    lookup.map['ok.example.test'] = ['93.184.216.34'];
    await expect(validateSafeOutboundUrl('https://ok.example.test/x')).resolves.toBeInstanceOf(URL);
  });

  it('pinnedFetch refuses loopback, metadata and private literals without connecting', async () => {
    for (const url of ['http://127.0.0.1:1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[::ffff:7f00:1]/', 'ftp://example.com/']) {
      await expect(pinnedFetch(url, { timeoutMs: 500 })).rejects.toThrow();
    }
    lookup.map['internal.example.test'] = ['192.168.0.9'];
    await expect(pinnedFetch('http://internal.example.test/', { timeoutMs: 500 })).rejects.toThrow(/SSRF blocked/);
  });
});
