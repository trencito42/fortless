import type Database from 'better-sqlite3';
import { cleanupExpiredSessions } from '../identity/auth.js';

export interface MaintenanceResult {
  expiredSessions: number;
  pendingMfaSessions: number;
  webauthnChallenges: number;
  scrubbedEmails: number;
  sensitiveAttempts: number;
}

/** Link fields that carry one-time tokens and must not outlive delivery (NEW-398). */
export const TOKEN_BEARING_FIELDS = ['$.verifyUrl', '$.resetUrl', '$.inviteUrl'] as const;

/**
 * NEW-377, NEW-360, NEW-398: routine clean-up that nothing else performs.
 *  - expired sessions and abandoned (MFA-pending) sign-ins
 *  - WebAuthn challenges past their expiry
 *  - one-time links in delivered or dead-lettered emails
 *  - old failed-attempt records
 */
export function runMaintenance(db: Database.Database): MaintenanceResult {
  const sessions = cleanupExpiredSessions(db);
  const challenges = db.prepare("DELETE FROM webauthn_challenges WHERE datetime(expires_at) <= datetime('now', 'utc')").run().changes;
  const scrubbed = db.prepare(`
    UPDATE email_outbox SET payload_json = json_remove(payload_json, ${TOKEN_BEARING_FIELDS.map(() => '?').join(', ')})
    WHERE status IN ('SENT', 'DEAD_LETTER') AND (payload_json LIKE '%verifyUrl%' OR payload_json LIKE '%resetUrl%' OR payload_json LIKE '%inviteUrl%')
  `).run(...TOKEN_BEARING_FIELDS).changes;
  const attempts = db.prepare("DELETE FROM sensitive_action_attempts WHERE attempted_at < datetime('now', '-1 day')").run().changes;
  return { expiredSessions: sessions.expiredCount, pendingMfaSessions: sessions.pendingMfaCount, webauthnChallenges: challenges, scrubbedEmails: scrubbed, sensitiveAttempts: attempts };
}
