/**
 * Isolated reproductions for audit batch 3 (reviewed commit fc02778). In-memory database only.
 * Run from the repository root: npx tsx audits/proofs/repro-batch3-fc02778.mts
 */
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../../src/database/schema.js';
import { runMigrations } from '../../src/database/migrations.js';
import { createSessionForUser, authenticateSession, generateTotpCode } from '../../src/modules/identity/auth.js';

const db = new Database(':memory:');
db.exec(SCHEMA_SQL);
runMigrations(db);
db.pragma('foreign_keys = OFF');

// NEW-368: the workspace of a session is the user's OLDEST active account; there is no workspace switch.
db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('u1', 'u1@example.test', 'x', 'U', 'ACTIVE', '2026-01-01')").run();
db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email, created_at) VALUES ('acc_inviter', 'Inviter workspace', 'owner', 'o@example.test', '2026-01-01 00:00:00'), ('acc_own', 'My own workspace', 'u1', 'u1@example.test', '2026-02-01 00:00:00')").run();
db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('m1', 'acc_own', 'u1', 'OWNER')").run();
const own = authenticateSession(createSessionForUser('u1', '127.0.0.1', 'test', true, db), db);
console.log(`before invitation accepted: session workspace = ${own?.account.id}`);
db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('m2', 'acc_inviter', 'u1', 'VIEWER')").run();
const after = authenticateSession(createSessionForUser('u1', '127.0.0.1', 'test', true, db), db);
console.log(`after joining an OLDER workspace as VIEWER: session workspace = ${after?.account.id}, role = ${after?.membership.role}`);

// NEW-366: a TOTP code stays valid for its whole window and can be submitted repeatedly.
const secret = 'JBSWY3DPEHPK3PXP';
const code = generateTotpCode(secret);
console.log(`TOTP code ${code} generated; the verifier keeps no used-counter, so the same code verifies again until the window ends (see auth.ts validTotp lines 133-137)`);
