import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';

export interface NotificationItem {
  id: string;
  accountId: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function createNotification(
  data: {
    accountId: string;
    userId?: string;
    type: string;
    title: string;
    message: string;
    linkUrl?: string;
  },
  db: Database.Database = getDatabase()
): string {
  const id = `notif_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO notifications (id, account_id, user_id, type, title, message, link_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
  `).run(id, data.accountId, data.userId || null, data.type, data.title, data.message, data.linkUrl || null);
  return id;
}

export function listNotifications(
  accountId: string,
  userId?: string,
  limit: number = 30,
  db: Database.Database = getDatabase()
): NotificationItem[] {
  const rows = db.prepare(`
    SELECT id, account_id, user_id, type, title, message, link_url, read_at, created_at
    FROM notifications
    WHERE account_id = ? AND (user_id IS NULL OR user_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(accountId, userId || null, limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    linkUrl: r.link_url,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export function markNotificationRead(
  notificationId: string,
  accountId: string,
  db: Database.Database = getDatabase()
): boolean {
  const res = db.prepare(`
    UPDATE notifications
    SET read_at = datetime('now', 'utc')
    WHERE id = ? AND account_id = ? AND read_at IS NULL
  `).run(notificationId, accountId);
  return res.changes > 0;
}

export function markAllNotificationsRead(
  accountId: string,
  userId?: string,
  db: Database.Database = getDatabase()
): number {
  const res = db.prepare(`
    UPDATE notifications
    SET read_at = datetime('now', 'utc')
    WHERE account_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL
  `).run(accountId, userId || null);
  return res.changes;
}

export function getUnreadNotificationCount(
  accountId: string,
  userId?: string,
  db: Database.Database = getDatabase()
): number {
  const row = db.prepare(`
    SELECT count(*) as count
    FROM notifications
    WHERE account_id = ? AND (user_id IS NULL OR user_id = ?) AND read_at IS NULL
  `).get(accountId, userId || null) as { count: number };
  return row ? row.count : 0;
}
