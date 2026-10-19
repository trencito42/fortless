import net from 'node:net';
import crypto from 'node:crypto';
import dnsPromises from 'node:dns/promises';
import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'NS';

export interface TldPriceInfo {
  tld: string;
  currency: 'EUR';
  annualPriceMinorUnits: number;
  renewalPriceMinorUnits: number;
  transferPriceMinorUnits: number;
  popular?: boolean;
}

export const TLD_CATALOG: Record<string, TldPriceInfo> = {
  '.com': { tld: '.com', currency: 'EUR', annualPriceMinorUnits: 1250, renewalPriceMinorUnits: 1250, transferPriceMinorUnits: 1250, popular: true },
  '.net': { tld: '.net', currency: 'EUR', annualPriceMinorUnits: 1400, renewalPriceMinorUnits: 1400, transferPriceMinorUnits: 1400, popular: true },
  '.org': { tld: '.org', currency: 'EUR', annualPriceMinorUnits: 1350, renewalPriceMinorUnits: 1350, transferPriceMinorUnits: 1350 },
  '.io': { tld: '.io', currency: 'EUR', annualPriceMinorUnits: 3900, renewalPriceMinorUnits: 3900, transferPriceMinorUnits: 3900, popular: true },
  '.de': { tld: '.de', currency: 'EUR', annualPriceMinorUnits: 850, renewalPriceMinorUnits: 850, transferPriceMinorUnits: 850 },
  '.ro': { tld: '.ro', currency: 'EUR', annualPriceMinorUnits: 950, renewalPriceMinorUnits: 950, transferPriceMinorUnits: 950 },
  '.eu': { tld: '.eu', currency: 'EUR', annualPriceMinorUnits: 700, renewalPriceMinorUnits: 700, transferPriceMinorUnits: 700 },
};

export interface DomainSearchResult {
  domain: string;
  tld: string;
  available: boolean;
  // NOT_CLAIMED: no Fortless workspace holds a zone for the name. Availability at a registrar is never checked (FTL-DNS-201).
  status: 'NOT_CLAIMED' | 'TAKEN' | 'UNSUPPORTED_TLD' | 'INVALID_SYNTAX';
  annualPriceMinorUnits: number | null;
  currency: string | null;
  reason?: string;
  availabilityTier?: 'LOCAL_ZONE_AVAILABLE' | 'REGISTRAR_AVAILABLE';
  isExternalRegistrarVerified?: boolean;
}

export interface DomainZoneRecord {
  id: string;
  account_id: string;
  domain_name: string;
  status: 'PENDING' | 'PENDING_DELEGATION' | 'ACTIVE' | 'SUSPENDED' | 'TRANSFERRED_OUT';
  auto_renew: number;
  nameservers: string;
  whois_privacy: number;
  delegation_verified?: number;
  ownership_token?: string | null;
  ownership_verified_at?: string | null;
  created_at: string;
  expires_at: string;
}

export const OWNERSHIP_LABEL = '_fortless-challenge';
export const MAX_ZONES_PER_ACCOUNT = 25;
export const MAX_RECORDS_PER_ZONE = 200;
export const FORTLESS_NAMESERVERS = ['ns1.fortless.net', 'ns2.fortless.net'];

/** The public DNS lookups used to prove control of a domain. Injected in tests; the system resolver in production. */
export interface DnsLookup {
  resolveTxt(name: string): Promise<string[][]>;
  resolveNs(name: string): Promise<string[]>;
}
const systemLookup: DnsLookup = {
  resolveTxt: (name) => dnsPromises.resolveTxt(name),
  resolveNs: (name) => dnsPromises.resolveNs(name),
};

export const ownershipChallenge = (domain: string, token: string) => ({ recordName: `${OWNERSHIP_LABEL}.${domain}`, recordType: 'TXT' as const, recordValue: `fortless-verify=${token}` });

export interface DnsRecordEntry {
  id: string;
  zone_id: string;
  account_id: string;
  record_type: DnsRecordType;
  name: string;
  content: string;
  ttl: number;
  priority: number | null;
  weight: number | null;
  port: number | null;
  created_at: string;
  updated_at: string;
}

export interface DnsRecordInput {
  recordType: DnsRecordType;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  weight?: number;
  port?: number;
}

/**
 * Normalizes and validates a domain label (e.g. "fortless" or "my-service").
 */
export function validateDomainLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label);
}

/**
 * Normalizes and validates a full domain name (e.g. "fortless.net").
 */
export function normalizeDomainName(raw: string): string {
  let clean = raw.trim().toLowerCase();
  clean = clean.replace(/^[a-z]+:\/\//i, ''); // Strip protocol
  clean = clean.replace(/\/.*$/, ''); // Strip path
  clean = clean.replace(/:\d+$/, ''); // Strip port
  clean = clean.replace(/\.$/, ''); // Strip trailing dot
  return clean;
}

/**
 * Validates fully qualified domain syntax according to RFC 1035 / RFC 1123.
 */
export function isValidDomainName(domain: string): boolean {
  const norm = normalizeDomainName(domain);
  if (!norm || norm.length > 253) return false;
  const parts = norm.split('.');
  if (parts.length < 2) return false;
  return parts.every(part => validateDomainLabel(part));
}

/**
 * Performs a domain search across supported TLDs and verifies availability against existing zones.
 */
export function searchDomain(db: Database.Database, query: string): { query: string; results: DomainSearchResult[] } {
  const cleaned = normalizeDomainName(query);
  if (!cleaned) {
    return {
      query,
      results: [{
        domain: query,
        tld: '',
        available: false,
        status: 'INVALID_SYNTAX',
        annualPriceMinorUnits: null,
        currency: null,
        reason: 'Empty or invalid domain query',
      }],
    };
  }

  const parts = cleaned.split('.');
  const results: DomainSearchResult[] = [];

  if (parts.length === 1) {
    // Label without TLD — generate results for all supported catalog TLDs
    const label = parts[0] || '';
    const validLabel = validateDomainLabel(label);

    for (const [tldKey, info] of Object.entries(TLD_CATALOG)) {
      const fullDomain = `${label}${tldKey}`;
      if (!validLabel) {
        results.push({
          domain: fullDomain,
          tld: tldKey,
          available: false,
          status: 'INVALID_SYNTAX',
          annualPriceMinorUnits: null,
          currency: null,
          reason: 'Domain label contains invalid characters or exceeds 63 characters',
        });
        continue;
      }

      const existing = db.prepare('SELECT id FROM domain_zones WHERE domain_name = ?').get(fullDomain);
      results.push({
        domain: fullDomain,
        tld: tldKey,
        available: !existing,
        status: existing ? 'TAKEN' : 'NOT_CLAIMED',
        availabilityTier: existing ? undefined : 'LOCAL_ZONE_AVAILABLE',
        isExternalRegistrarVerified: false,
        annualPriceMinorUnits: info.annualPriceMinorUnits,
        currency: info.currency,
      });
    }
  } else {
    // Specific domain provided (e.g. "mysite.com")
    if (!isValidDomainName(cleaned)) {
      return {
        query: cleaned,
        results: [{
          domain: cleaned,
          tld: `.${parts.slice(1).join('.')}`,
          available: false,
          status: 'INVALID_SYNTAX',
          annualPriceMinorUnits: null,
          currency: null,
          reason: 'Domain name syntax violates RFC 1035 specifications',
        }],
      };
    }

    const tld = `.${parts.slice(1).join('.')}`;
    const tldInfo = TLD_CATALOG[tld];

    if (!tldInfo) {
      results.push({
        domain: cleaned,
        tld,
        available: false,
        status: 'UNSUPPORTED_TLD',
        annualPriceMinorUnits: null,
        currency: null,
        reason: `TLD ${tld} is not currently offered in the Fortless registrar catalog`,
      });
    } else {
      const existing = db.prepare('SELECT id FROM domain_zones WHERE domain_name = ?').get(cleaned);
      results.push({
        domain: cleaned,
        tld,
        available: !existing,
        status: existing ? 'TAKEN' : 'NOT_CLAIMED',
        availabilityTier: existing ? undefined : 'LOCAL_ZONE_AVAILABLE',
        isExternalRegistrarVerified: false,
        annualPriceMinorUnits: tldInfo.annualPriceMinorUnits,
        currency: tldInfo.currency,
      });
    }
  }

  return { query: cleaned, results };
}

export function validateDnsRecordLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  return /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i.test(label);
}

/**
 * Validates a DNS record's format and parameters according to RFC standards.
 */
export function validateDnsRecordPayload(input: DnsRecordInput): { valid: boolean; error?: string } {
  const { recordType, name, content, ttl = 3600, priority, weight, port } = input;

  // NEW-384: numeric fields must be whole numbers wherever they are present.
  for (const [label, value] of [['priority', priority], ['weight', weight], ['port', port]] as const) {
    if (value !== undefined && value !== null && !Number.isInteger(value)) {
      return { valid: false, error: `${label} must be a whole number` };
    }
  }
  if (!Number.isInteger(ttl)) return { valid: false, error: 'TTL must be an integer between 60 and 86400 seconds' };

  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Record name is required' };
  }

  const cleanName = name.trim();
  if (cleanName !== '@' && cleanName !== '*' && !cleanName.split('.').every(p => validateDnsRecordLabel(p))) {
    return { valid: false, error: `Invalid DNS record name "${name}". Must be "@", "*", or valid alphanumeric labels.` };
  }

  if (typeof ttl !== 'number' || ttl < 60 || ttl > 86400) {
    return { valid: false, error: 'TTL must be an integer between 60 and 86400 seconds' };
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, error: 'Record content cannot be empty' };
  }

  const cleanContent = content.trim();

  switch (recordType) {
    case 'A': {
      if (net.isIPv4(cleanContent) === false) {
        return { valid: false, error: `Invalid IPv4 address "${content}" for A record` };
      }
      break;
    }
    case 'AAAA': {
      if (net.isIPv6(cleanContent) === false) {
        return { valid: false, error: `Invalid IPv6 address "${content}" for AAAA record` };
      }
      break;
    }
    case 'CNAME': {
      const target = normalizeDomainName(cleanContent);
      if (!isValidDomainName(target)) {
        return { valid: false, error: `Invalid target hostname "${content}" for CNAME record` };
      }
      break;
    }
    case 'MX': {
      const target = normalizeDomainName(cleanContent);
      if (!isValidDomainName(target)) {
        return { valid: false, error: `Invalid mail exchanger hostname "${content}" for MX record` };
      }
      if (typeof priority !== 'number' || priority < 0 || priority > 65535 || !Number.isInteger(priority)) {
        return { valid: false, error: 'MX record requires an integer priority between 0 and 65535' };
      }
      break;
    }
    case 'TXT': {
      if (cleanContent.length > 2048) {
        return { valid: false, error: 'TXT record content cannot exceed 2048 characters' };
      }
      break;
    }
    case 'SRV': {
      const target = normalizeDomainName(cleanContent);
      if (!isValidDomainName(target)) {
        return { valid: false, error: `Invalid target host "${content}" for SRV record` };
      }
      if (typeof priority !== 'number' || priority < 0 || priority > 65535) {
        return { valid: false, error: 'SRV record requires an integer priority (0-65535)' };
      }
      if (typeof weight !== 'number' || weight < 0 || weight > 65535) {
        return { valid: false, error: 'SRV record requires an integer weight (0-65535)' };
      }
      if (typeof port !== 'number' || port < 1 || port > 65535) {
        return { valid: false, error: 'SRV record requires an integer port (1-65535)' };
      }
      break;
    }
    case 'NS': {
      const target = normalizeDomainName(cleanContent);
      if (!isValidDomainName(target)) {
        return { valid: false, error: `Invalid nameserver hostname "${content}" for NS record` };
      }
      break;
    }
    default:
      return { valid: false, error: `Unsupported DNS record type "${recordType}"` };
  }

  return { valid: true };
}

/**
 * Creates a new authoritative domain zone for an account.
 */
export function createDomainZone(
  db: Database.Database,
  input: {
    accountId: string;
    domainName: string;
    autoRenew?: boolean;
    whoisPrivacy?: boolean;
    periodYears?: number;
    actorUserId?: string;
    ipAddress?: string;
  }
): DomainZoneRecord {
  const norm = normalizeDomainName(input.domainName);
  if (!isValidDomainName(norm)) {
    throw new Error(`Invalid domain name "${input.domainName}". Must conform to RFC 1035.`);
  }

  const RESERVED_DOMAINS = new Set([
    'fortless.net', 'fortless.cloud', 'fortless.org', 'fortless.io',
    'localhost', 'example.com', 'example.org', 'example.net'
  ]);
  if (RESERVED_DOMAINS.has(norm) || norm.endsWith('.fortless.net') || norm.endsWith('.fortless.cloud')) {
    throw new Error(`Domain "${norm}" is a reserved system domain and cannot be registered as a custom zone.`);
  }

  // NEW-370: a name is never handed to a second workspace once it is proven, and an unproven claim can only be taken
  // over by someone who proves control through a DNS challenge (see startDomainClaim / completeDomainClaim).
  const existing = db.prepare('SELECT id, account_id, ownership_verified_at FROM domain_zones WHERE domain_name = ?').get(norm) as
    { id: string; account_id: string; ownership_verified_at: string | null } | undefined;
  if (existing) {
    if (existing.account_id === input.accountId) throw new Error(`Domain "${norm}" is already in your workspace.`);
    if (existing.ownership_verified_at) throw new Error(`DOMAIN_VERIFIED_ELSEWHERE: "${norm}" already belongs to another verified workspace.`);
    throw new Error(`DOMAIN_CLAIMED_UNVERIFIED: "${norm}" was added by another workspace that has not proven control. Start a claim and publish the verification TXT record to take it over.`);
  }
  const zoneCount = (db.prepare('SELECT COUNT(*) AS c FROM domain_zones WHERE account_id = ?').get(input.accountId) as { c: number }).c;
  if (zoneCount >= MAX_ZONES_PER_ACCOUNT) {
    throw new Error(`LIMIT_REACHED: a workspace can hold at most ${MAX_ZONES_PER_ACCOUNT} DNS zones.`);
  }

  const zoneId = generateId('zone');
  const period = input.periodYears || 1;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + period * 365.25 * 24 * 60 * 60 * 1000).toISOString();
  const ownershipToken = crypto.randomBytes(16).toString('hex');

  const zone: DomainZoneRecord = {
    id: zoneId,
    account_id: input.accountId,
    domain_name: norm,
    status: 'PENDING_DELEGATION',
    auto_renew: input.autoRenew !== false ? 1 : 0,
    nameservers: JSON.stringify(FORTLESS_NAMESERVERS),
    whois_privacy: input.whoisPrivacy !== false ? 1 : 0,
    delegation_verified: 0,
    ownership_token: ownershipToken,
    ownership_verified_at: null,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  };

  db.transaction(() => {
    db.prepare(`
      INSERT INTO domain_zones (id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at, ownership_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      zone.id,
      zone.account_id,
      zone.domain_name,
      zone.status,
      zone.auto_renew,
      zone.nameservers,
      zone.whois_privacy,
      zone.created_at,
      zone.expires_at,
      ownershipToken
    );

    // Seed default NS records
    const ns1Id = generateId('dns');
    const ns2Id = generateId('dns');
    db.prepare(`
      INSERT INTO dns_records (id, zone_id, account_id, record_type, name, content, ttl)
      VALUES (?, ?, ?, 'NS', '@', 'ns1.fortless.net', 86400)
    `).run(ns1Id, zoneId, input.accountId);

    db.prepare(`
      INSERT INTO dns_records (id, zone_id, account_id, record_type, name, content, ttl)
      VALUES (?, ?, ?, 'NS', '@', 'ns2.fortless.net', 86400)
    `).run(ns2Id, zoneId, input.accountId);

    // Audit event
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DOMAIN_ZONE_CREATED', 'domain_zone', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      input.accountId,
      input.actorUserId || null,
      input.actorUserId ? 'USER' : 'SYSTEM',
      zoneId,
      input.ipAddress || '127.0.0.1',
      zoneId,
      JSON.stringify({ domain: norm, expiresAt })
    );
  })();

  return zone;
}

function loadZone(db: Database.Database, accountId: string, zoneId: string): DomainZoneRecord {
  const zone = db.prepare('SELECT * FROM domain_zones WHERE id = ? AND account_id = ?').get(zoneId, accountId) as DomainZoneRecord | undefined;
  if (!zone) throw new Error('NOT_FOUND: Domain zone does not exist or access is forbidden');
  return zone;
}

const flattenTxt = (rows: string[][]) => rows.map((chunks) => chunks.join(''));

async function txtProves(lookup: DnsLookup, domain: string, token: string): Promise<boolean> {
  const { recordName, recordValue } = ownershipChallenge(domain, token);
  try {
    return flattenTxt(await lookup.resolveTxt(recordName)).some((value) => value.trim() === recordValue);
  } catch {
    return false; // NXDOMAIN, timeout or SERVFAIL: no proof
  }
}

/** NEW-370: proves control of the domain by looking for the challenge TXT record in public DNS. */
export async function verifyDomainOwnership(
  db: Database.Database,
  accountId: string,
  zoneId: string,
  lookup: DnsLookup = systemLookup,
  actor: { userId?: string; ipAddress?: string } = {}
): Promise<{ verified: boolean; challenge: ReturnType<typeof ownershipChallenge> }> {
  const zone = loadZone(db, accountId, zoneId);
  const token = zone.ownership_token;
  if (!token) throw new Error('This zone has no ownership challenge. Delete and re-add it.');
  const challenge = ownershipChallenge(zone.domain_name, token);
  if (zone.ownership_verified_at) return { verified: true, challenge };
  if (!(await txtProves(lookup, zone.domain_name, token))) return { verified: false, challenge };
  db.transaction(() => {
    db.prepare("UPDATE domain_zones SET ownership_verified_at = datetime('now', 'utc') WHERE id = ? AND ownership_verified_at IS NULL").run(zone.id);
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DOMAIN_OWNERSHIP_VERIFIED', 'domain_zone', ?, ?, ?, ?)
    `).run(generateId('aud'), accountId, actor.userId || null, actor.userId ? 'USER' : 'SYSTEM', zone.id, actor.ipAddress || '127.0.0.1', zone.id, JSON.stringify({ domain: zone.domain_name }));
  })();
  return { verified: true, challenge };
}

/**
 * Validates domain nameserver delegation against public DNS before the zone is reported ACTIVE. It needs proven
 * ownership first and every returned name server must be a Fortless one (NEW-370, FTL-DNS-202).
 */
export async function verifyDomainDelegation(
  db: Database.Database,
  accountId: string,
  zoneId: string,
  lookup: DnsLookup = systemLookup
): Promise<{ verified: boolean; status: string }> {
  const zone = loadZone(db, accountId, zoneId);
  if (!zone.ownership_verified_at) return { verified: false, status: zone.status };
  let ns: string[];
  try {
    ns = (await lookup.resolveNs(zone.domain_name)).map((n) => n.toLowerCase().replace(/\.$/, ''));
  } catch {
    return { verified: false, status: zone.status };
  }
  const delegated = ns.length > 0 && ns.every((n) => FORTLESS_NAMESERVERS.includes(n));
  if (!delegated) return { verified: false, status: zone.status };
  db.prepare("UPDATE domain_zones SET status = 'ACTIVE', delegation_verified = 1 WHERE id = ? AND status != 'SUSPENDED'").run(zone.id);
  return { verified: true, status: 'ACTIVE' };
}

/** Starts a claim on a domain that another workspace added without proving control. */
export function startDomainClaim(
  db: Database.Database,
  input: { accountId: string; domainName: string }
): ReturnType<typeof ownershipChallenge> & { domain: string } {
  const domain = normalizeDomainName(input.domainName);
  if (!isValidDomainName(domain)) throw new Error(`Invalid domain name "${input.domainName}".`);
  const holder = db.prepare('SELECT account_id, ownership_verified_at FROM domain_zones WHERE domain_name = ?').get(domain) as { account_id: string; ownership_verified_at: string | null } | undefined;
  if (holder?.account_id === input.accountId) throw new Error('This domain is already in your workspace; verify it from the zone.');
  if (holder?.ownership_verified_at) throw new Error(`DOMAIN_VERIFIED_ELSEWHERE: "${domain}" already belongs to another verified workspace.`);
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO domain_claims (id, account_id, domain_name, token) VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id, domain_name) DO NOTHING
  `).run(generateId('clm'), input.accountId, domain, token);
  const row = db.prepare('SELECT token FROM domain_claims WHERE account_id = ? AND domain_name = ?').get(input.accountId, domain) as { token: string };
  return { domain, ...ownershipChallenge(domain, row.token) };
}

/** Completes a claim: only a visible DNS proof removes an unproven holder and creates the zone for the claimant. */
export async function completeDomainClaim(
  db: Database.Database,
  input: { accountId: string; domainName: string; actorUserId?: string; ipAddress?: string },
  lookup: DnsLookup = systemLookup
): Promise<{ verified: boolean; zone?: DomainZoneRecord }> {
  const domain = normalizeDomainName(input.domainName);
  const claim = db.prepare('SELECT token FROM domain_claims WHERE account_id = ? AND domain_name = ?').get(input.accountId, domain) as { token: string } | undefined;
  if (!claim) throw new Error('NOT_FOUND: start a claim for this domain first.');
  if (!(await txtProves(lookup, domain, claim.token))) return { verified: false };
  const zoneId = generateId('zone');
  db.transaction(() => {
    const holder = db.prepare('SELECT id, account_id, ownership_verified_at FROM domain_zones WHERE domain_name = ?').get(domain) as { id: string; account_id: string; ownership_verified_at: string | null } | undefined;
    if (holder?.ownership_verified_at) throw new Error(`DOMAIN_VERIFIED_ELSEWHERE: "${domain}" already belongs to another verified workspace.`);
    if (holder) {
      db.prepare('DELETE FROM domain_zones WHERE id = ?').run(holder.id);
      db.prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, ?, NULL, 'SYSTEM', 'DOMAIN_ZONE_CLAIMED_AWAY', 'domain_zone', ?, '127.0.0.1', ?, ?)
      `).run(generateId('aud'), holder.account_id, holder.id, holder.id, JSON.stringify({ domain, claimedBy: input.accountId }));
    }
    const now = new Date();
    db.prepare(`
      INSERT INTO domain_zones (id, account_id, domain_name, status, nameservers, created_at, expires_at, ownership_token, ownership_verified_at)
      VALUES (?, ?, ?, 'PENDING_DELEGATION', ?, ?, ?, ?, datetime('now', 'utc'))
    `).run(zoneId, input.accountId, domain, JSON.stringify(FORTLESS_NAMESERVERS), now.toISOString(), new Date(now.getTime() + 365.25 * 24 * 3600 * 1000).toISOString(), claim.token);
    for (const host of FORTLESS_NAMESERVERS) {
      db.prepare("INSERT INTO dns_records (id, zone_id, account_id, record_type, name, content, ttl) VALUES (?, ?, ?, 'NS', '@', ?, 86400)").run(generateId('dns'), zoneId, input.accountId, host);
    }
    db.prepare('DELETE FROM domain_claims WHERE account_id = ? AND domain_name = ?').run(input.accountId, domain);
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DOMAIN_ZONE_CREATED', 'domain_zone', ?, ?, ?, ?)
    `).run(generateId('aud'), input.accountId, input.actorUserId || null, input.actorUserId ? 'USER' : 'SYSTEM', zoneId, input.ipAddress || '127.0.0.1', zoneId, JSON.stringify({ domain, viaClaim: true }));
  })();
  return { verified: true, zone: db.prepare('SELECT * FROM domain_zones WHERE id = ?').get(zoneId) as DomainZoneRecord };
}

/**
 * Lists all domain zones belonging to a tenant.
 */
export function listDomainZones(db: Database.Database, accountId: string): DomainZoneRecord[] {
  return db.prepare(`
    SELECT id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at, ownership_verified_at, delegation_verified,
           CASE WHEN ownership_verified_at IS NULL THEN ownership_token END AS ownership_token
    FROM domain_zones
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).all(accountId) as DomainZoneRecord[];
}

/**
 * Retrieves a single domain zone with tenant verification.
 */
export function getDomainZone(db: Database.Database, accountId: string, zoneId: string): DomainZoneRecord | null {
  const row = db.prepare(`
    SELECT id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at, ownership_verified_at, delegation_verified,
           CASE WHEN ownership_verified_at IS NULL THEN ownership_token END AS ownership_token
    FROM domain_zones
    WHERE id = ? AND account_id = ?
  `).get(zoneId, accountId);
  return (row as DomainZoneRecord) || null;
}

/**
 * Lists all DNS records for a given zone with tenant boundary checks.
 */
export function listDnsRecords(db: Database.Database, accountId: string, zoneId: string): DnsRecordEntry[] {
  const zone = getDomainZone(db, accountId, zoneId);
  if (!zone) {
    throw new Error('NOT_FOUND: Domain zone does not exist or access is forbidden');
  }

  return db.prepare(`
    SELECT id, zone_id, account_id, record_type, name, content, ttl, priority, weight, port, created_at, updated_at
    FROM dns_records
    WHERE zone_id = ? AND account_id = ?
    ORDER BY name ASC, record_type ASC
  `).all(zoneId, accountId) as DnsRecordEntry[];
}

/**
 * Creates a DNS record enforcing RFC standards, CNAME collision checks, and tenant isolation.
 */
export function createDnsRecord(
  db: Database.Database,
  accountId: string,
  zoneId: string,
  input: DnsRecordInput,
  actorUserId?: string,
  ipAddress?: string
): DnsRecordEntry {
  const zone = getDomainZone(db, accountId, zoneId);
  if (!zone) {
    throw new Error('NOT_FOUND: Domain zone does not exist or access is forbidden');
  }
  if (!zone.ownership_verified_at) {
    throw new Error('OWNERSHIP_NOT_VERIFIED: prove control of this domain before editing its records.');
  }

  const validation = validateDnsRecordPayload(input);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.error}`);
  }

  const normName = input.name.trim().toLowerCase();
  const recordCount = (db.prepare('SELECT COUNT(*) AS c FROM dns_records WHERE zone_id = ?').get(zoneId) as { c: number }).c;
  if (recordCount >= MAX_RECORDS_PER_ZONE) {
    throw new Error(`LIMIT_REACHED: a zone can hold at most ${MAX_RECORDS_PER_ZONE} records.`);
  }
  const duplicate = db.prepare('SELECT 1 FROM dns_records WHERE zone_id = ? AND record_type = ? AND name = ? AND content = ?')
    .get(zoneId, input.recordType, normName, input.content.trim());
  if (duplicate) {
    throw new Error('DUPLICATE_RECORD: an identical record already exists.');
  }

  // RFC 1912 §2.4 CNAME Collision Invariants:
  // 1. If adding CNAME, no other records can exist at this name.
  // 2. If adding non-CNAME, no CNAME record can exist at this name.
  if (input.recordType === 'CNAME') {
    const existing = db.prepare('SELECT id, record_type FROM dns_records WHERE zone_id = ? AND name = ?').all(zoneId, normName) as { id: string; record_type: string }[];
    if (existing.length > 0) {
      throw new Error(`CNAME_COLLISION: RFC 1912 forbids CNAME for "${normName}" because other records (${existing.map(r => r.record_type).join(', ')}) already exist.`);
    }
  } else {
    const existingCname = db.prepare("SELECT id FROM dns_records WHERE zone_id = ? AND name = ? AND record_type = 'CNAME'").get(zoneId, normName);
    if (existingCname) {
      throw new Error(`CNAME_COLLISION: Cannot add ${input.recordType} record for "${normName}" because a CNAME record is already configured.`);
    }
  }

  const recordId = generateId('dns');
  const now = new Date().toISOString();

  const entry: DnsRecordEntry = {
    id: recordId,
    zone_id: zoneId,
    account_id: accountId,
    record_type: input.recordType,
    name: normName,
    content: input.content.trim(),
    ttl: input.ttl || 3600,
    priority: input.priority ?? null,
    weight: input.weight ?? null,
    port: input.port ?? null,
    created_at: now,
    updated_at: now,
  };

  db.transaction(() => {
    db.prepare(`
      INSERT INTO dns_records (id, zone_id, account_id, record_type, name, content, ttl, priority, weight, port, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.zone_id,
      entry.account_id,
      entry.record_type,
      entry.name,
      entry.content,
      entry.ttl,
      entry.priority,
      entry.weight,
      entry.port,
      entry.created_at,
      entry.updated_at
    );

    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DNS_RECORD_CREATED', 'dns_record', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      accountId,
      actorUserId || null,
      actorUserId ? 'USER' : 'SYSTEM',
      recordId,
      ipAddress || '127.0.0.1',
      recordId,
      JSON.stringify({ zoneId, recordType: entry.record_type, name: entry.name, content: entry.content })
    );
  })();

  return entry;
}

/**
 * Updates an existing DNS record with tenant boundary enforcement.
 */
export function updateDnsRecord(
  db: Database.Database,
  accountId: string,
  zoneId: string,
  recordId: string,
  patch: Partial<DnsRecordInput>,
  actorUserId?: string,
  ipAddress?: string
): DnsRecordEntry {
  const existing = db.prepare(`
    SELECT * FROM dns_records WHERE id = ? AND zone_id = ? AND account_id = ?
  `).get(recordId, zoneId, accountId) as DnsRecordEntry | undefined;

  if (!existing) {
    throw new Error('NOT_FOUND: DNS record does not exist or access is forbidden');
  }
  if (!getDomainZone(db, accountId, zoneId)?.ownership_verified_at) {
    throw new Error('OWNERSHIP_NOT_VERIFIED: prove control of this domain before editing its records.');
  }

  const merged: DnsRecordInput = {
    recordType: patch.recordType || existing.record_type,
    name: patch.name !== undefined ? patch.name : existing.name,
    content: patch.content !== undefined ? patch.content : existing.content,
    ttl: patch.ttl !== undefined ? patch.ttl : existing.ttl,
    priority: patch.priority !== undefined ? patch.priority : (existing.priority ?? undefined),
    weight: patch.weight !== undefined ? patch.weight : (existing.weight ?? undefined),
    port: patch.port !== undefined ? patch.port : (existing.port ?? undefined),
  };

  const validation = validateDnsRecordPayload(merged);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.error}`);
  }

  const normName = merged.name.trim().toLowerCase();

  // Check CNAME collisions if type or name changed
  if (merged.recordType === 'CNAME') {
    const conflicting = db.prepare('SELECT id, record_type FROM dns_records WHERE zone_id = ? AND name = ? AND id != ?').all(zoneId, normName, recordId) as { id: string; record_type: string }[];
    if (conflicting.length > 0) {
      throw new Error(`CNAME_COLLISION: RFC 1912 forbids CNAME for "${normName}" because other records already exist.`);
    }
  } else {
    const conflictingCname = db.prepare("SELECT id FROM dns_records WHERE zone_id = ? AND name = ? AND record_type = 'CNAME' AND id != ?").get(zoneId, normName, recordId);
    if (conflictingCname) {
      throw new Error(`CNAME_COLLISION: Cannot update to ${merged.recordType} for "${normName}" because a CNAME record exists.`);
    }
  }

  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      UPDATE dns_records
      SET record_type = ?, name = ?, content = ?, ttl = ?, priority = ?, weight = ?, port = ?, updated_at = ?
      WHERE id = ? AND zone_id = ? AND account_id = ?
    `).run(
      merged.recordType,
      normName,
      merged.content.trim(),
      merged.ttl || 3600,
      merged.priority ?? null,
      merged.weight ?? null,
      merged.port ?? null,
      now,
      recordId,
      zoneId,
      accountId
    );

    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DNS_RECORD_UPDATED', 'dns_record', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      accountId,
      actorUserId || null,
      actorUserId ? 'USER' : 'SYSTEM',
      recordId,
      ipAddress || '127.0.0.1',
      recordId,
      JSON.stringify({ zoneId, recordType: merged.recordType, name: normName })
    );
  })();

  return {
    ...existing,
    record_type: merged.recordType,
    name: normName,
    content: merged.content.trim(),
    ttl: merged.ttl || 3600,
    priority: merged.priority ?? null,
    weight: merged.weight ?? null,
    port: merged.port ?? null,
    updated_at: now,
  };
}

/**
 * Deletes a DNS record with strict tenant isolation.
 */
export function deleteDnsRecord(
  db: Database.Database,
  accountId: string,
  zoneId: string,
  recordId: string,
  actorUserId?: string,
  ipAddress?: string
): void {
  const existing = db.prepare(`
    SELECT * FROM dns_records WHERE id = ? AND zone_id = ? AND account_id = ?
  `).get(recordId, zoneId, accountId) as DnsRecordEntry | undefined;

  if (!existing) {
    throw new Error('NOT_FOUND: DNS record does not exist or access is forbidden');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM dns_records WHERE id = ? AND zone_id = ? AND account_id = ?').run(recordId, zoneId, accountId);

    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, ?, 'DNS_RECORD_DELETED', 'dns_record', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      accountId,
      actorUserId || null,
      actorUserId ? 'USER' : 'SYSTEM',
      recordId,
      ipAddress || '127.0.0.1',
      recordId,
      JSON.stringify({ zoneId, recordType: existing.record_type, name: existing.name })
    );
  })();
}
