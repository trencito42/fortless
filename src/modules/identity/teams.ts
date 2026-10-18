import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { queueEmail } from '../email/outbox.js';
import { generateId } from './auth.js';

export interface AccountMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'OWNER' | 'BILLING_MANAGER' | 'TECH_ADMIN' | 'VIEWER';
  createdAt: string;
  isOwner: boolean;
}

export interface AccountInvitation {
  id: string;
  accountId: string;
  email: string;
  role: 'OWNER' | 'BILLING_MANAGER' | 'TECH_ADMIN' | 'VIEWER';
  invitedByUserId: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function tokenDigest(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function listAccountMembers(accountId: string, db: Database.Database = getDatabase()): AccountMember[] {
  const rows = db.prepare(`
    SELECT m.id, m.user_id AS userId, u.name, u.email, m.role, m.created_at AS createdAt,
           CASE WHEN a.owner_user_id = u.id THEN 1 ELSE 0 END AS isOwner
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN accounts a ON a.id = m.account_id
    WHERE m.account_id = ?
    ORDER BY isOwner DESC, m.created_at ASC
  `).all(accountId) as (Omit<AccountMember, 'isOwner'> & { isOwner: number })[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt,
    isOwner: Boolean(r.isOwner),
  }));
}

export function listAccountInvitations(accountId: string, db: Database.Database = getDatabase()): AccountInvitation[] {
  return db.prepare(`
    SELECT ai.id, ai.account_id AS accountId, ai.email, ai.role,
           ai.invited_by_user_id AS invitedByUserId, u.name AS invitedByName,
           ai.expires_at AS expiresAt, ai.created_at AS createdAt
    FROM account_invitations ai
    JOIN users u ON u.id = ai.invited_by_user_id
    WHERE ai.account_id = ? AND ai.accepted_at IS NULL AND ai.expires_at > datetime('now', 'utc')
    ORDER BY ai.created_at DESC
  `).all(accountId) as AccountInvitation[];
}

export function inviteAccountMember(
  data: {
    accountId: string;
    invitedByUserId: string;
    email: string;
    role: 'OWNER' | 'BILLING_MANAGER' | 'TECH_ADMIN' | 'VIEWER';
    ipAddress: string;
  },
  db: Database.Database = getDatabase()
): { invitationId: string; rawToken: string } {
  const normalizedEmail = data.email.trim().toLowerCase();

  // 1. Verify inviter exists and is an authorized member
  const inviter = db.prepare(`
    SELECT m.role, u.name, a.name AS workspaceName
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN accounts a ON a.id = m.account_id
    WHERE m.account_id = ? AND m.user_id = ?
  `).get(data.accountId, data.invitedByUserId) as { role: string; name: string; workspaceName: string } | undefined;

  if (!inviter || (inviter.role !== 'OWNER' && inviter.role !== 'TECH_ADMIN')) {
    throw new Error('Only workspace owners and technical administrators can invite new members.');
  }

  // 2. Check if already an active member of this account
  const existingMember = db.prepare(`
    SELECT m.id FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.account_id = ? AND u.email = ?
  `).get(data.accountId, normalizedEmail);

  if (existingMember) {
    throw new Error('This user is already an active member of this workspace.');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = tokenDigest(rawToken);
  const invitationId = generateId('inv');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  return runInTransaction((trx) => {
    // Revoke previous pending invitations for this email in this account
    trx.prepare(`
      UPDATE account_invitations
      SET accepted_at = datetime('now', 'utc')
      WHERE account_id = ? AND email = ? AND accepted_at IS NULL
    `).run(data.accountId, normalizedEmail);

    trx.prepare(`
      INSERT INTO account_invitations (id, account_id, email, role, token_hash, invited_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(invitationId, data.accountId, normalizedEmail, data.role, tokenHash, data.invitedByUserId, expiresAt);

    // Queue transactional invitation email atomically
    queueEmail(trx, {
      recipient: normalizedEmail,
      template: 'account_invitation',
      payload: {
        workspaceName: inviter.workspaceName,
        role: data.role,
        inviteUrl: `${config.APP_ORIGIN}/app/settings?invitation=${rawToken}`,
        inviterName: inviter.name,
      },
    });

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'team.member_invited', 'invitation', ?, ?, ?)
    `).run(generateId('aud'), data.accountId, data.invitedByUserId, invitationId, data.ipAddress, generateId('cor'));

    return { invitationId, rawToken };
  }, db);
}

export function revokeAccountMember(
  data: {
    accountId: string;
    actorUserId: string;
    membershipId: string;
    ipAddress: string;
  },
  db: Database.Database = getDatabase()
): void {
  runInTransaction((trx) => {
    const actor = trx.prepare(`
      SELECT role FROM memberships WHERE account_id = ? AND user_id = ?
    `).get(data.accountId, data.actorUserId) as { role: string } | undefined;

    if (!actor || actor.role !== 'OWNER') {
      throw new Error('Only workspace owners can remove team members.');
    }

    const target = trx.prepare(`
      SELECT m.id, m.user_id AS userId, m.role, a.owner_user_id AS primaryOwnerId
      FROM memberships m
      JOIN accounts a ON a.id = m.account_id
      WHERE m.id = ? AND m.account_id = ?
    `).get(data.membershipId, data.accountId) as { id: string; userId: string; role: string; primaryOwnerId: string } | undefined;

    if (!target) {
      throw new Error('Membership not found.');
    }

    // Invariant: Cannot remove the workspace primary account owner
    if (target.userId === target.primaryOwnerId) {
      throw new Error('Cannot remove the primary workspace account owner.');
    }

    // Invariant: If removing an OWNER, ensure at least one other OWNER remains
    if (target.role === 'OWNER') {
      const ownerCount = (trx.prepare(`
        SELECT count(*) AS count FROM memberships WHERE account_id = ? AND role = 'OWNER'
      `).get(data.accountId) as { count: number }).count;

      if (ownerCount <= 1) {
        throw new Error('Cannot remove the last owner of the workspace.');
      }
    }

    trx.prepare('DELETE FROM memberships WHERE id = ?').run(data.membershipId);

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'team.member_revoked', 'membership', ?, ?, ?)
    `).run(generateId('aud'), data.accountId, data.actorUserId, data.membershipId, data.ipAddress, generateId('cor'));
  }, db);
}

export function acceptAccountInvitation(
  rawToken: string,
  userId: string,
  ipAddress: string,
  db: Database.Database = getDatabase()
): { accountId: string; role: string } {
  const tokenHash = tokenDigest(rawToken);

  return runInTransaction((trx) => {
    const invite = trx.prepare(`
      SELECT * FROM account_invitations
      WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > datetime('now', 'utc')
    `).get(tokenHash) as { id: string; account_id: string; email: string; role: string } | undefined;

    if (!invite) {
      throw new Error('This invitation link is invalid or has expired.');
    }

    const user = trx.prepare('SELECT email, status FROM users WHERE id = ?').get(userId) as { email: string; status: string } | undefined;
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Your user account must be active and verified to accept invitations.');
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new Error('This invitation was sent to a different email address.');
    }

    const existingMembership = trx.prepare(`
      SELECT id FROM memberships WHERE account_id = ? AND user_id = ?
    `).get(invite.account_id, userId);

    if (!existingMembership) {
      trx.prepare(`
        INSERT INTO memberships (id, account_id, user_id, role)
        VALUES (?, ?, ?, ?)
      `).run(generateId('mem'), invite.account_id, userId, invite.role);
    }

    trx.prepare(`
      UPDATE account_invitations
      SET accepted_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(invite.id);

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'team.invitation_accepted', 'invitation', ?, ?, ?)
    `).run(generateId('aud'), invite.account_id, userId, invite.id, ipAddress, generateId('cor'));

    return { accountId: invite.account_id, role: invite.role };
  }, db);
}
