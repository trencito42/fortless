import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { updateProfile, getBillingProfile, saveBillingProfile, ProfileValidationError } from '../src/modules/identity/profile.js';

let db: Database.Database;
const owner = { userId: 'usr_o', accountId: 'acc_1', role: 'OWNER' };
const viewer = { userId: 'usr_v', accountId: 'acc_1', role: 'VIEWER' };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO users (id, email, password_hash, name, status) VALUES ('usr_o', 'o@example.test', 'x', 'Old Name', 'ACTIVE'), ('usr_v', 'v@example.test', 'x', 'Viewer', 'ACTIVE')").run();
  db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES ('acc_1', 'Old Workspace', 'usr_o', 'b@example.test')").run();
});
afterEach(() => db.close());

describe('Profile and workspace', () => {
  it('PRO-01: users change their own name, owners also the workspace, and it is audited', () => {
    const res = updateProfile(owner, { name: '  Stefan   Pop ', workspaceName: 'Pop Hosting' }, db);
    expect(res.user).toMatchObject({ name: 'Stefan Pop' });
    expect(res.account).toMatchObject({ name: 'Pop Hosting' });
    expect(db.prepare("SELECT COUNT(*) c FROM audit_events WHERE action = 'profile.updated'").get()).toEqual({ c: 1 });
    expect(updateProfile(viewer, { name: 'Vee' }, db).user).toMatchObject({ name: 'Vee' });
    expect(() => updateProfile(viewer, { workspaceName: 'Mine now' }, db)).toThrow(/Only the workspace owner/);
    expect(db.prepare("SELECT name FROM accounts WHERE id = 'acc_1'").get()).toEqual({ name: 'Pop Hosting' });
  });

  it('PRO-02: roles, ownership and staff flags are refused, not ignored; bad names are rejected', () => {
    for (const field of ['role', 'isStaff', 'is_staff', 'ownerUserId', 'accountId', 'email', 'status']) {
      expect(() => updateProfile(viewer, { name: 'x', [field]: 'OWNER' }, db), field).toThrow(/Unsupported field/);
    }
    expect(db.prepare("SELECT is_staff s, email e FROM users WHERE id = 'usr_v'").get()).toEqual({ s: 0, e: 'v@example.test' });
    expect(() => updateProfile(owner, { name: '' }, db)).toThrow(/required/);
    expect(updateProfile(owner, { name: 'a\nb' }, db).user).toMatchObject({ name: 'a b' });
    expect(() => updateProfile(owner, { name: 'a\u0000b' }, db)).toThrow(/invalid/);
    expect(() => updateProfile(owner, { name: 'a\u001bb' }, db)).toThrow(/invalid/);
    expect(() => updateProfile(owner, { name: 'x'.repeat(101) }, db)).toThrow(/too long/);
    expect(() => updateProfile(owner, {}, db)).toThrow(/Nothing to change/);
    expect(() => updateProfile(owner, null, db)).toThrow(ProfileValidationError);
  });
});

describe('Billing profile', () => {
  const good = { companyName: 'Pop SRL', taxId: 'RO 123456', addressLine1: 'Str. Real 1', city: 'Cluj-Napoca', postalCode: '400001', country: 'ro' };

  it('PRO-03: nothing is invented before it is saved; owners and billing managers can save and update', () => {
    expect(getBillingProfile('acc_1', db)).toBeNull();
    expect(saveBillingProfile(owner, good, db)).toMatchObject({ country: 'RO', taxId: 'RO 123456' });
    expect(saveBillingProfile({ ...owner, role: 'BILLING_MANAGER' }, { ...good, city: 'Brasov' }, db).city).toBe('Brasov');
    expect(getBillingProfile('acc_1', db)!.city).toBe('Brasov');
    expect(db.prepare('SELECT COUNT(*) c FROM billing_profiles').get()).toEqual({ c: 1 });
    const audit = db.prepare("SELECT metadata m FROM audit_events WHERE action = 'billing.profile_updated'").all() as { m: string }[];
    expect(audit).toHaveLength(2);
    expect(audit.map((a) => a.m).join()).not.toContain('RO 123456');
  });

  it('PRO-04: other roles, bad input and unknown fields are refused', () => {
    expect(() => saveBillingProfile(viewer, good, db)).toThrow(/Only owners and billing managers/);
    expect(() => saveBillingProfile({ ...owner, role: 'TECH_ADMIN' }, good, db)).toThrow(/Only owners/);
    expect(() => saveBillingProfile(owner, { ...good, country: 'Romania' }, db)).toThrow(/two-letter/);
    expect(() => saveBillingProfile(owner, { ...good, taxId: '<script>' }, db)).toThrow(/Tax ID/);
    expect(() => saveBillingProfile(owner, { ...good, postalCode: '!!' }, db)).toThrow(/Postal/);
    expect(() => saveBillingProfile(owner, { ...good, addressLine1: '' }, db)).toThrow(/required/);
    expect(() => saveBillingProfile(owner, { ...good, accountId: 'acc_other' }, db)).toThrow(/Unsupported field/);
    expect(getBillingProfile('acc_1', db)).toBeNull();
  });
});
