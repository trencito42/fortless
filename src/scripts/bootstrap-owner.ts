import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../database/index.js';
import { generateId } from '../modules/identity/auth.js';

export interface BootstrapOwnerOptions {
  email: string;
  force?: boolean;
  reason?: string;
  db?: Database.Database;
}

export interface BootstrapOwnerResult {
  userId: string;
  email: string;
  name: string;
  isInitialOwner: boolean;
  forced: boolean;
  reason?: string;
}

export function bootstrapOwner(options: BootstrapOwnerOptions): BootstrapOwnerResult {
  const email = options.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('Email address is required for staff owner bootstrap.');
  }

  const db = options.db || getDatabase();

  const user = db.prepare('SELECT id, email, name, status, email_verified_at FROM users WHERE email = ?').get(email) as {
    id: string;
    email: string;
    name: string;
    status: string;
    email_verified_at: string | null;
  } | undefined;

  if (!user) {
    throw new Error(`No user account found with email "${email}". Register and verify first.`);
  }

  if (user.status !== 'ACTIVE' || !user.email_verified_at) {
    throw new Error(`User account "${email}" is not verified. Complete email verification first.`);
  }

  // Verify TOTP MFA enrollment
  const mfaFactor = db.prepare("SELECT id FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 1")
    .get(user.id);

  if (!mfaFactor) {
    throw new Error(`User "${email}" has not enrolled in Two-Factor Authentication (TOTP). Staff OWNER promotion strictly requires confirmed MFA.`);
  }

  // Check if an existing active OWNER already exists
  const existingOwner = db.prepare("SELECT user_id FROM staff_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'").get() as { user_id: string } | undefined;

  const isInitialOwner = !existingOwner;
  const isSelf = existingOwner?.user_id === user.id;
  const isForced = Boolean(existingOwner && !isSelf);

  if (isForced) {
    if (!options.force) {
      throw new Error('An active staff OWNER already exists in the system. Refusing bootstrap without explicit --force and --reason.');
    }
    const reason = options.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new Error('Forced staff OWNER bootstrap strictly requires an explicit audit reason of at least 10 characters.');
    }
  }

  runInTransaction((trx) => {
    trx.prepare(`
      INSERT INTO staff_memberships (user_id, role, status)
      VALUES (?, 'OWNER', 'ACTIVE')
      ON CONFLICT(user_id) DO UPDATE SET role = 'OWNER', status = 'ACTIVE', updated_at = datetime('now', 'utc')
    `).run(user.id);

    trx.prepare('UPDATE users SET is_staff = 1 WHERE id = ?').run(user.id);

    // Get primary account for audit log
    const account = trx.prepare(`
      SELECT account_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1
    `).get(user.id) as { account_id: string } | undefined;

    const action = isForced ? 'staff.owner_bootstrapped_force' : 'staff.owner_bootstrapped';

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'STAFF', ?, 'user', ?, '127.0.0.1', ?)
    `).run(
      generateId('aud'),
      account?.account_id || 'acc_system',
      user.id,
      action,
      user.id,
      generateId('cor')
    );
  }, db);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isInitialOwner,
    forced: isForced,
    reason: options.reason,
  };
}

function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');
  const reasonArg = args.find((a) => a.startsWith('--reason='));
  const reason = reasonArg ? reasonArg.slice('--reason='.length).trim() : undefined;

  if (!email) {
    console.error('❌ Error: Email address is required.\nUsage: npm run staff:bootstrap-owner <email> [--force --reason="<justification>"]');
    process.exit(1);
  }

  try {
    const result = bootstrapOwner({ email, force, reason });
    console.log(`✅ Success: User "${result.email}" (${result.name}) is now an authorized staff OWNER.`);
    if (result.forced) {
      console.log(`⚠️ Note: Ownership was granted via forced override. Reason: "${result.reason}"`);
    }
    console.log('Access granted to /admin console with enforced role-based access control.');
  } catch (err: unknown) {
    console.error(`❌ Bootstrap Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run CLI if invoked directly
if (process.argv[1] && (process.argv[1].endsWith('bootstrap-owner.ts') || process.argv[1].endsWith('bootstrap-owner.js'))) {
  main();
}

