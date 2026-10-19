import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from './helpers/harness.js';
import {
  createDomainZone, createDnsRecord, updateDnsRecord, verifyDomainOwnership, verifyDomainDelegation,
  startDomainClaim, completeDomainClaim, ownershipChallenge, validateDnsRecordPayload, MAX_RECORDS_PER_ZONE, type DnsLookup,
} from '../src/modules/domains/dns.js';

let h: Harness;
beforeAll(async () => { h = await makeHarness(); });
afterAll(async () => { await h.close(); });

const txtLookup = (map: Record<string, string[]>, ns: string[] = []): DnsLookup => ({
  resolveTxt: async (name) => { if (!map[name]) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); return map[name]!.map((v) => [v]); },
  resolveNs: async () => ns,
});

describe('NEW-369: DNS changes need a workspace role that may manage them', () => {
  it('rejects VIEWER and BILLING_MANAGER for zones and records, accepts TECH_ADMIN', async () => {
    const owner = h.user('u_dns_owner', { accountId: 'acc_dns' });
    const viewer = h.user('u_dns_viewer', { accountId: 'acc_dns', role: 'VIEWER' });
    const billing = h.user('u_dns_billing', { accountId: 'acc_dns', role: 'BILLING_MANAGER' });
    const tech = h.user('u_dns_tech', { accountId: 'acc_dns', role: 'TECH_ADMIN' });
    for (const who of [viewer, billing]) {
      expect((await h.call('POST', '/api/v1/domains/zones', who.token, { domainName: 'blocked-example.com' })).statusCode).toBe(403);
    }
    const created = await h.call('POST', '/api/v1/domains/zones', tech.token, { domainName: 'allowed-example.com' });
    expect(created.statusCode).toBe(201);
    const zoneId = created.json().zone.id as string;
    h.db.prepare("UPDATE domain_zones SET ownership_verified_at = datetime('now', 'utc') WHERE id = ?").run(zoneId);
    const body = { recordType: 'A', name: 'www', content: '203.0.113.5' };
    expect((await h.call('POST', `/api/v1/domains/zones/${zoneId}/records`, viewer.token, body)).statusCode).toBe(403);
    const ok = await h.call('POST', `/api/v1/domains/zones/${zoneId}/records`, owner.token, body);
    expect(ok.statusCode).toBe(201);
    const recId = ok.json().record.id as string;
    expect((await h.call('PUT', `/api/v1/domains/zones/${zoneId}/records/${recId}`, viewer.token, { content: '203.0.113.6' })).statusCode).toBe(403);
    expect((await h.call('DELETE', `/api/v1/domains/zones/${zoneId}/records/${recId}`, billing.token)).statusCode).toBe(403);
    expect((await h.call('GET', `/api/v1/domains/zones/${zoneId}/records`, viewer.token)).statusCode).toBe(200);
  });
});

describe('NEW-370: domain ownership needs proof and cannot be squatted', () => {
  it('records stay locked until the TXT challenge is published', async () => {
    const a = h.user('u_own_a', { accountId: 'acc_own_a' });
    const zone = createDomainZone(h.db, { accountId: a.accountId, domainName: 'proof-example.org' });
    expect(zone.status).toBe('PENDING_DELEGATION');
    expect(() => createDnsRecord(h.db, a.accountId, zone.id, { recordType: 'A', name: '@', content: '203.0.113.1' })).toThrow(/OWNERSHIP_NOT_VERIFIED/);
    const challenge = ownershipChallenge('proof-example.org', zone.ownership_token as string);
    expect((await verifyDomainOwnership(h.db, a.accountId, zone.id, txtLookup({}))).verified).toBe(false);
    expect((await verifyDomainOwnership(h.db, a.accountId, zone.id, txtLookup({ [challenge.recordName]: ['fortless-verify=wrong'] }))).verified).toBe(false);
    expect((await verifyDomainOwnership(h.db, a.accountId, zone.id, txtLookup({ [challenge.recordName]: [challenge.recordValue] }))).verified).toBe(true);
    expect(createDnsRecord(h.db, a.accountId, zone.id, { recordType: 'A', name: '@', content: '203.0.113.1' }).record_type).toBe('A');
  });

  it('delegation is only ACTIVE after proof and only when every name server is a Fortless one', async () => {
    const a = h.user('u_own_b', { accountId: 'acc_own_b' });
    const zone = createDomainZone(h.db, { accountId: a.accountId, domainName: 'delegate-example.org' });
    expect((await verifyDomainDelegation(h.db, a.accountId, zone.id, txtLookup({}, ['ns1.fortless.net', 'ns2.fortless.net']))).verified).toBe(false); // no ownership proof yet
    h.db.prepare("UPDATE domain_zones SET ownership_verified_at = datetime('now', 'utc') WHERE id = ?").run(zone.id);
    expect((await verifyDomainDelegation(h.db, a.accountId, zone.id, txtLookup({}, ['ns1.fortless.net', 'ns.elsewhere.example']))).verified).toBe(false);
    expect((h.db.prepare('SELECT status FROM domain_zones WHERE id = ?').get(zone.id) as any).status).toBe('PENDING_DELEGATION');
    expect((await verifyDomainDelegation(h.db, a.accountId, zone.id, txtLookup({}, ['NS1.fortless.net.', 'ns2.fortless.net']))).verified).toBe(true);
    expect((h.db.prepare('SELECT status FROM domain_zones WHERE id = ?').get(zone.id) as any).status).toBe('ACTIVE');
  });

  it('a squatter cannot lock out the real owner: an unproven zone is taken over by DNS proof, a proven one never is', async () => {
    const squatter = h.user('u_squat', { accountId: 'acc_squat' });
    const owner = h.user('u_real', { accountId: 'acc_real' });
    createDomainZone(h.db, { accountId: squatter.accountId, domainName: 'victim-brand.com' });
    expect(() => createDomainZone(h.db, { accountId: owner.accountId, domainName: 'victim-brand.com' })).toThrow(/DOMAIN_CLAIMED_UNVERIFIED/);
    const claim = startDomainClaim(h.db, { accountId: owner.accountId, domainName: 'victim-brand.com' });
    expect((await completeDomainClaim(h.db, { accountId: owner.accountId, domainName: 'victim-brand.com' }, txtLookup({}))).verified).toBe(false);
    const done = await completeDomainClaim(h.db, { accountId: owner.accountId, domainName: 'victim-brand.com' }, txtLookup({ [claim.recordName]: [claim.recordValue] }));
    expect(done.verified).toBe(true);
    expect(done.zone?.account_id).toBe(owner.accountId);
    expect(h.db.prepare("SELECT COUNT(*) c FROM domain_zones WHERE domain_name = 'victim-brand.com'").get()).toEqual({ c: 1 });
    expect(h.db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'DOMAIN_ZONE_CLAIMED_AWAY'").get()).toEqual({ c: 1 });
    // now proven: nobody can take it again
    expect(() => startDomainClaim(h.db, { accountId: squatter.accountId, domainName: 'victim-brand.com' })).toThrow(/DOMAIN_VERIFIED_ELSEWHERE/);
    expect(() => createDomainZone(h.db, { accountId: squatter.accountId, domainName: 'victim-brand.com' })).toThrow(/DOMAIN_VERIFIED_ELSEWHERE/);
  });
});

describe('NEW-383/NEW-384: DNS record hygiene', () => {
  const verifiedZone = (id: string) => {
    const u = h.user(`u_${id}`, { accountId: `acc_${id}` });
    const z = createDomainZone(h.db, { accountId: u.accountId, domainName: `${id}-hygiene.net` });
    h.db.prepare("UPDATE domain_zones SET ownership_verified_at = datetime('now', 'utc') WHERE id = ?").run(z.id);
    return { acc: u.accountId, zone: z.id };
  };

  it('treats names case-insensitively so a CNAME cannot coexist with another record', () => {
    const { acc, zone } = verifiedZone('case');
    createDnsRecord(h.db, acc, zone, { recordType: 'A', name: 'www', content: '203.0.113.7' });
    expect(() => createDnsRecord(h.db, acc, zone, { recordType: 'CNAME', name: 'WWW', content: 'target.example.net' })).toThrow(/CNAME_COLLISION/);
    const rec = createDnsRecord(h.db, acc, zone, { recordType: 'A', name: 'API', content: '203.0.113.8' });
    expect(rec.name).toBe('api');
    expect(() => updateDnsRecord(h.db, acc, zone, rec.id, { recordType: 'CNAME', name: 'WWW', content: 'x.example.net' })).toThrow(/CNAME_COLLISION/);
  });

  it('rejects duplicates, enforces the per-zone limit and whole numbers', () => {
    const { acc, zone } = verifiedZone('limits');
    createDnsRecord(h.db, acc, zone, { recordType: 'A', name: 'dup', content: '203.0.113.9' });
    expect(() => createDnsRecord(h.db, acc, zone, { recordType: 'A', name: 'dup', content: '203.0.113.9' })).toThrow(/DUPLICATE_RECORD/);
    const existing = (h.db.prepare('SELECT COUNT(*) c FROM dns_records WHERE zone_id = ?').get(zone) as { c: number }).c;
    for (let i = existing; i < MAX_RECORDS_PER_ZONE; i++) {
      h.db.prepare("INSERT INTO dns_records (id, zone_id, account_id, record_type, name, content, ttl) VALUES (?, ?, ?, 'TXT', ?, 'x', 300)").run(`dns_fill_${i}`, zone, acc, `fill${i}`);
    }
    expect(() => createDnsRecord(h.db, acc, zone, { recordType: 'A', name: 'over', content: '203.0.113.10' })).toThrow(/LIMIT_REACHED/);
    expect(validateDnsRecordPayload({ recordType: 'SRV', name: '_a._tcp', content: 'host.example.net', priority: 1, weight: 1.5, port: 80 }).valid).toBe(false);
    expect(validateDnsRecordPayload({ recordType: 'SRV', name: '_a._tcp', content: 'host.example.net', priority: 1, weight: 1, port: 80.5 }).valid).toBe(false);
  });
});
