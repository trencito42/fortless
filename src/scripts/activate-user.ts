import { getDatabase, runInTransaction } from '../database/index.js';
import { generateId } from '../modules/identity/auth.js';

export function activateUser(targetEmail: string) {
  const email = targetEmail.trim().toLowerCase();
  const db = getDatabase();

  const user = db.prepare('SELECT id, email, name, status, email_verified_at, is_staff FROM users WHERE lower(email) = ?').get(email) as {
    id: string;
    email: string;
    name: string;
    status: string;
    email_verified_at: string | null;
    is_staff: number;
  } | undefined;

  if (!user) {
    console.error(`❌ User not found with email: ${email}`);
    process.exit(1);
  }

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE users
      SET status = 'ACTIVE',
          email_verified_at = COALESCE(email_verified_at, datetime('now', 'utc')),
          updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(user.id);

    trx.prepare(`
      UPDATE email_verification_tokens
      SET consumed_at = datetime('now', 'utc')
      WHERE user_id = ? AND consumed_at IS NULL
    `).run(user.id);

    // Also ensure associated accounts are ACTIVE
    trx.prepare(`
      UPDATE accounts
      SET status = 'ACTIVE',
          updated_at = datetime('now', 'utc')
      WHERE id IN (SELECT account_id FROM memberships WHERE user_id = ?)
    `).run(user.id);

    // Get primary account for audit log
    const membership = trx.prepare(`
      SELECT account_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1
    `).get(user.id) as { account_id: string } | undefined;

    const accountId = membership?.account_id || 'acc_system';

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'STAFF', 'user.activated_manually', 'user', ?, '127.0.0.1', ?)
    `).run(
      generateId('aud'),
      accountId,
      user.id,
      user.id,
      generateId('cor')
    );
  }, db);

  const updatedUser = db.prepare('SELECT id, email, name, status, email_verified_at, is_staff FROM users WHERE id = ?').get(user.id);
  const accounts = db.prepare('SELECT a.id, a.name, a.status, m.role FROM accounts a JOIN memberships m ON a.id = m.account_id WHERE m.user_id = ?').all(user.id);

  console.log(`✅ Contul ${email} a fost activat cu succes!`);
  console.log('User:', updatedUser);
  console.log('Accounts:', accounts);
}

const emailArg = process.argv[2] || 'stef4nutz@gmail.com';
activateUser(emailArg);
