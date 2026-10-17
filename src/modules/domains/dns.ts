import net from 'node:net';
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
  status: 'AVAILABLE' | 'TAKEN' | 'UNSUPPORTED_TLD' | 'INVALID_SYNTAX';
  annualPriceMinorUnits: number | null;
  currency: string | null;
  reason?: string;
}

export interface DomainZoneRecord {
  id: string;
  account_id: string;
  domain_name: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'TRANSFERRED_OUT';
  auto_renew: number;
  nameservers: string;
  whois_privacy: number;
  created_at: string;
  expires_at: string;
}

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
        status: existing ? 'TAKEN' : 'AVAILABLE',
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
        status: existing ? 'TAKEN' : 'AVAILABLE',
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

  const existing = db.prepare('SELECT id FROM domain_zones WHERE domain_name = ?').get(norm);
  if (existing) {
    throw new Error(`Domain "${norm}" is already registered or active in Fortless DNS.`);
  }

  const zoneId = generateId('zone');
  const period = input.periodYears || 1;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + period * 365.25 * 24 * 60 * 60 * 1000).toISOString();

  const zone: DomainZoneRecord = {
    id: zoneId,
    account_id: input.accountId,
    domain_name: norm,
    status: 'ACTIVE',
    auto_renew: input.autoRenew !== false ? 1 : 0,
    nameservers: JSON.stringify(['ns1.fortless.net', 'ns2.fortless.net']),
    whois_privacy: input.whoisPrivacy !== false ? 1 : 0,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  };

  db.transaction(() => {
    db.prepare(`
      INSERT INTO domain_zones (id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      zone.id,
      zone.account_id,
      zone.domain_name,
      zone.status,
      zone.auto_renew,
      zone.nameservers,
      zone.whois_privacy,
      zone.created_at,
      zone.expires_at
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

/**
 * Lists all domain zones belonging to a tenant.
 */
export function listDomainZones(db: Database.Database, accountId: string): DomainZoneRecord[] {
  return db.prepare(`
    SELECT id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at
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
    SELECT id, account_id, domain_name, status, auto_renew, nameservers, whois_privacy, created_at, expires_at
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

  const validation = validateDnsRecordPayload(input);
  if (!validation.valid) {
    throw new Error(`VALIDATION_ERROR: ${validation.error}`);
  }

  const normName = input.name.trim();

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

  const normName = merged.name.trim();

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
