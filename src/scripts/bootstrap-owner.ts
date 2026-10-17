import { getDatabase, runInTransaction } from '../database/index.js';
import { generateId } from '../modules/identity/auth.js';

function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('❌ Error: Email address is required.\nUsage: npm run staff:bootstrap-owner <email>');
    process.exit(1);
  }

  const db = getDatabase();

  const user = db.prepare('SELECT id, email, name, status, email_verified_at FROM users WHERE email = ?').get(email) as {
    id: string;
    email: string;
    name: string;
    status: string;
    email_verified_at: string | null;
  } | undefined;

  if (!user) {
    console.error(`❌ Error: No user account found with email "${email}". Register and verify first.`);
    process.exit(1);
  }

  if (user.status !== 'ACTIVE' || !user.email_verified_at) {
    console.error(`❌ Error: User account "${email}" is not verified. Complete email verification first.`);
    process.exit(1);
  }

  // Verify TOTP MFA enrollment
  const mfaFactor = db.prepare("SELECT id FROM mfa_factors WHERE user_id = ? AND type = 'TOTP' AND is_confirmed = 1")
    .get(user.id);

  if (!mfaFactor) {
    console.error(`❌ Error: User "${email}" has not enrolled in Two-Factor Authentication (TOTP).`);
    console.error('Staff OWNER promotion strictly requires confirmed MFA. Enable MFA in /app/settings first.');
    process.exit(1);
  }

  // Check if an existing active OWNER already exists
  const existingOwner = db.prepare("SELECT user_id FROM staff_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'").get() as { user_id: string } | undefined;

  if (existingOwner && existingOwner.user_id !== user.id && !process.argv.includes('--force')) {
    console.error('⚠️ Warning: An active staff OWNER already exists in the system.');
    console.error('To grant an additional owner or transfer ownership, run with --force flag.');
    process.exit(1);
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

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'STAFF', 'staff.owner_bootstrapped', 'user', ?, '127.0.0.1', ?)
    `).run(generateId('aud'), account?.account_id || 'acc_system', user.id, user.id, generateId('cor'));
  }, db);

  console.log(`✅ Success: User "${user.email}" (${user.name}) is now an authorized staff OWNER.`);
  console.log('Access granted to /admin console with enforced role-based access control.');
}

main();
