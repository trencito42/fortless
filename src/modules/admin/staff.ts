import type Database from 'better-sqlite3';
import { runInTransaction } from '../../database/index.js';
import { generateId } from '../identity/auth.js';
import type { StaffRole } from './access.js';

export class StaffChangeError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) { super(message); this.name = 'StaffChangeError'; }
}

export interface StaffChange {
  actorUserId: string;
  targetUserId: string;
  role: StaffRole;
  status: 'ACTIVE' | 'REVOKED';
  reason: string;
  ipAddress: string;
}

/**
 * NEW-376: the single place where staff memberships change. Both the create and the update route use it, so the
 * self-change and final-owner rules cannot be bypassed by choosing the other route.
 */
export function applyStaffChange(db: Database.Database, change: StaffChange): { created: boolean; from: { role: string; status: string } | null } {
  return runInTransaction((trx) => {
    if (change.targetUserId === change.actorUserId) {
      throw new StaffChangeError('Self-modification is blocked to prevent administrative lockout.', 'SELF_CHANGE_BLOCKED', 409);
    }
    const current = trx.prepare('SELECT role, status FROM staff_memberships WHERE user_id = ?').get(change.targetUserId) as { role: string; status: string } | undefined;
    if (current?.role === 'OWNER' && current.status === 'ACTIVE' && (change.role !== 'OWNER' || change.status !== 'ACTIVE')) {
      const owners = trx.prepare("SELECT COUNT(*) AS count FROM staff_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'").get() as { count: number };
      if (owners.count <= 1) {
        throw new StaffChangeError('The final active owner cannot be removed.', 'LAST_OWNER', 409);
      }
    }
    trx.prepare(`
      INSERT INTO staff_memberships (user_id, role, status, created_by_user_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, status = excluded.status, updated_at = datetime('now', 'utc')
    `).run(change.targetUserId, change.role, change.status, change.actorUserId);
    trx.prepare('UPDATE users SET is_staff = ? WHERE id = ?').run(change.status === 'ACTIVE' ? 1 : 0, change.targetUserId);
    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, NULL, ?, 'STAFF', 'staff.membership_changed', 'staff_membership', ?, ?, ?, ?)
    `).run(
      generateId('aud'), change.actorUserId, change.targetUserId, change.ipAddress, generateId('cor'),
      JSON.stringify({ from: current ?? null, role: change.role, status: change.status, reason: change.reason })
    );
    return { created: !current, from: current ?? null };
  }, db);
}
