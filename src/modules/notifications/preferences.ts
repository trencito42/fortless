import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';

export type OptionalEmailCategory = 'billing' | 'service' | 'support';

export interface NotificationPreferences {
  billingEmail: boolean;
  serviceEmail: boolean;
  supportEmail: boolean;
}

const defaults: NotificationPreferences = {
  billingEmail: true,
  serviceEmail: true,
  supportEmail: true,
};

export function getNotificationPreferences(
  userId: string,
  db: Database.Database = getDatabase()
): NotificationPreferences {
  const row = db.prepare(`
    SELECT billing_email, service_email, support_email
    FROM notification_preferences WHERE user_id = ?
  `).get(userId) as { billing_email: number; service_email: number; support_email: number } | undefined;
  if (!row) return { ...defaults };
  return {
    billingEmail: row.billing_email === 1,
    serviceEmail: row.service_email === 1,
    supportEmail: row.support_email === 1,
  };
}

export function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
  db: Database.Database = getDatabase()
): NotificationPreferences {
  db.prepare(`
    INSERT INTO notification_preferences (user_id, billing_email, service_email, support_email, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', 'utc'))
    ON CONFLICT(user_id) DO UPDATE SET
      billing_email = excluded.billing_email,
      service_email = excluded.service_email,
      support_email = excluded.support_email,
      updated_at = datetime('now', 'utc')
  `).run(userId, preferences.billingEmail ? 1 : 0, preferences.serviceEmail ? 1 : 0, preferences.supportEmail ? 1 : 0);
  return getNotificationPreferences(userId, db);
}

export function isOptionalEmailEnabled(
  recipient: string,
  category: OptionalEmailCategory,
  db: Database.Database
): boolean {
  const column = category === 'billing' ? 'billing_email' : category === 'service' ? 'service_email' : 'support_email';
  const row = db.prepare(`
    SELECT np.${column} AS enabled
    FROM users u
    LEFT JOIN notification_preferences np ON np.user_id = u.id
    WHERE lower(u.email) = lower(?)
  `).get(recipient) as { enabled: number | null } | undefined;
  return !row || row.enabled === null || row.enabled === 1;
}
