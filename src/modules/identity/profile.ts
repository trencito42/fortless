import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { generateId } from './auth.js';

export class ProfileValidationError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 400) { super(message); this.name = 'ProfileValidationError'; }
}

interface Actor { userId: string; accountId: string; role: string; ipAddress?: string }
// Whitespace and printable text only: no control characters, so names cannot break layouts, logs or emails.
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(value: unknown, field: string, max: number, opts: { required?: boolean } = {}): string | null {
  if (value === undefined || value === null || value === '') {
    if (opts.required) throw new ProfileValidationError(`${field} is required.`, 'INVALID_INPUT');
    return null;
  }
  if (typeof value !== 'string') throw new ProfileValidationError(`${field} is invalid.`, 'INVALID_INPUT');
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v && opts.required) throw new ProfileValidationError(`${field} is required.`, 'INVALID_INPUT');
  if (v.length > max || CONTROL.test(v)) throw new ProfileValidationError(`${field} is invalid or too long.`, 'INVALID_INPUT');
  return v || null;
}

function rejectUnknown(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProfileValidationError('A request body is required.', 'INVALID_INPUT');
  const extra = Object.keys(input as object).filter((k) => !allowed.includes(k));
  // Ownership, roles and staff flags can never be set from a profile form, so any such field is an error, not ignored.
  if (extra.length) throw new ProfileValidationError(`Unsupported field: ${extra[0]}.`, 'UNSUPPORTED_FIELD');
  return input as Record<string, unknown>;
}

const audit = (db: Database.Database, a: Actor, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>) =>
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', ?, ?, ?, ?, ?, ?)
  `).run(generateId('aud'), a.accountId, a.userId, action, resourceType, resourceId, a.ipAddress || '127.0.0.1', generateId('cor'), JSON.stringify(metadata));

/** Your own display name, and the workspace (tenant) name when you are its OWNER. */
export function updateProfile(a: Actor, raw: unknown, db: Database.Database = getDatabase()) {
  const input = rejectUnknown(raw, ['name', 'workspaceName']);
  const name = 'name' in input ? text(input['name'], 'Name', 100, { required: true }) : undefined;
  const workspace = 'workspaceName' in input ? text(input['workspaceName'], 'Workspace name', 100, { required: true }) : undefined;
  if (name === undefined && workspace === undefined) throw new ProfileValidationError('Nothing to change.', 'INVALID_INPUT');
  if (workspace !== undefined && a.role !== 'OWNER') throw new ProfileValidationError('Only the workspace owner can rename the workspace.', 'FORBIDDEN', 403);

  const changed: string[] = [];
  if (name !== undefined && name !== null) { db.prepare("UPDATE users SET name = ?, updated_at = datetime('now', 'utc') WHERE id = ?").run(name, a.userId); changed.push('name'); }
  if (workspace !== undefined && workspace !== null) { db.prepare("UPDATE accounts SET name = ?, updated_at = datetime('now', 'utc') WHERE id = ?").run(workspace, a.accountId); changed.push('workspaceName'); }
  audit(db, a, 'profile.updated', 'account', a.accountId, { fields: changed });
  return {
    user: db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(a.userId),
    account: db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(a.accountId),
  };
}

export interface BillingProfile { companyName: string | null; taxId: string | null; addressLine1: string; addressLine2: string | null; city: string; postalCode: string; country: string }

export function getBillingProfile(accountId: string, db: Database.Database = getDatabase()): BillingProfile | null {
  const r = db.prepare('SELECT company_name, tax_id, address_line1, address_line2, city, postal_code, country FROM billing_profiles WHERE account_id = ?').get(accountId) as
    { company_name: string | null; tax_id: string | null; address_line1: string; address_line2: string | null; city: string; postal_code: string; country: string } | undefined;
  return r ? { companyName: r.company_name, taxId: r.tax_id, addressLine1: r.address_line1, addressLine2: r.address_line2, city: r.city, postalCode: r.postal_code, country: r.country } : null;
}

/** Invoice details. Only OWNER and BILLING_MANAGER may change them. The tax id is stored as entered and is not verified. */
export function saveBillingProfile(a: Actor, raw: unknown, db: Database.Database = getDatabase()): BillingProfile {
  if (a.role !== 'OWNER' && a.role !== 'BILLING_MANAGER') throw new ProfileValidationError('Only owners and billing managers can change billing details.', 'FORBIDDEN', 403);
  const input = rejectUnknown(raw, ['companyName', 'taxId', 'addressLine1', 'addressLine2', 'city', 'postalCode', 'country']);
  const taxId = text(input['taxId'], 'Tax ID', 30);
  if (taxId && !/^[A-Za-z0-9 .\-/]{2,30}$/.test(taxId)) throw new ProfileValidationError('Tax ID may only use letters, numbers, spaces and . - /', 'INVALID_INPUT');
  const postal = text(input['postalCode'], 'Postal code', 20, { required: true })!;
  if (!/^[A-Za-z0-9 -]{2,20}$/.test(postal)) throw new ProfileValidationError('Postal code is invalid.', 'INVALID_INPUT');
  const country = typeof input['country'] === 'string' ? input['country'].trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(country)) throw new ProfileValidationError('Choose a country (two-letter code).', 'INVALID_INPUT');
  const profile: BillingProfile = {
    companyName: text(input['companyName'], 'Company name', 120), taxId,
    addressLine1: text(input['addressLine1'], 'Address', 150, { required: true })!, addressLine2: text(input['addressLine2'], 'Address line 2', 150),
    city: text(input['city'], 'City', 80, { required: true })!, postalCode: postal, country,
  };
  db.prepare(`
    INSERT INTO billing_profiles (id, account_id, tax_id, company_name, address_line1, address_line2, city, postal_code, country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET tax_id = excluded.tax_id, company_name = excluded.company_name, address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2, city = excluded.city, postal_code = excluded.postal_code, country = excluded.country, updated_at = datetime('now', 'utc')
  `).run(generateId('bpr'), a.accountId, profile.taxId, profile.companyName, profile.addressLine1, profile.addressLine2, profile.city, profile.postalCode, profile.country);
  audit(db, a, 'billing.profile_updated', 'account', a.accountId, { country: profile.country, hasTaxId: Boolean(profile.taxId) });
  return profile;
}
