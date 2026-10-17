import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';

export interface CreateTicketInput {
  accountId: string;
  userId: string;
  subject: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  message: string;
  ipAddress: string;
}

export function listTickets(accountId: string, db: Database.Database) {
  return db.prepare(`
    SELECT t.id, t.subject, t.priority, t.status, t.created_at, t.updated_at, u.name AS author_name,
           (SELECT count(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_staff_internal_note = 0) AS message_count
    FROM tickets t
    JOIN users u ON u.id = t.created_by_user_id
    WHERE t.account_id = ?
    ORDER BY t.updated_at DESC, t.created_at DESC
  `).all(accountId);
}

export function createTicket(input: CreateTicketInput, db: Database.Database) {
  const subject = input.subject.trim();
  const message = input.message.trim();
  return db.transaction(() => {
    const ticketId = generateId('tkt');
    const messageId = generateId('tkm');
    db.prepare(`INSERT INTO tickets (id, account_id, created_by_user_id, subject, priority, status)
      VALUES (?, ?, ?, ?, ?, 'OPEN')`).run(ticketId, input.accountId, input.userId, subject, input.priority);
    db.prepare(`INSERT INTO ticket_messages (id, ticket_id, author_user_id, is_staff_internal_note, body)
      VALUES (?, ?, ?, 0, ?)`).run(messageId, ticketId, input.userId, message);
    db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'ticket.created', 'ticket', ?, ?, ?)`)
      .run(generateId('aud'), input.accountId, input.userId, ticketId, input.ipAddress, generateId('cor'));
    return { ticketId, messageId, subject, priority: input.priority, status: 'OPEN' as const };
  })();
}

export function getTicketThread(ticketId: string, accountId: string, db: Database.Database) {
  const ticket = db.prepare(`SELECT id, subject, priority, status, created_at, updated_at
    FROM tickets WHERE id = ? AND account_id = ?`).get(ticketId, accountId);
  if (!ticket) return null;
  const messages = db.prepare(`
    SELECT tm.id, tm.body, tm.created_at, u.name AS author_name,
           CASE WHEN EXISTS (
             SELECT 1 FROM staff_memberships sm WHERE sm.user_id = tm.author_user_id AND sm.status = 'ACTIVE'
           ) THEN 1 ELSE 0 END AS is_staff
    FROM ticket_messages tm
    JOIN users u ON u.id = tm.author_user_id
    WHERE tm.ticket_id = ? AND tm.is_staff_internal_note = 0
    ORDER BY tm.created_at ASC, tm.id ASC
  `).all(ticketId);
  return { ticket, messages };
}

export function addCustomerReply(
  input: { ticketId: string; accountId: string; userId: string; body: string; ipAddress: string },
  db: Database.Database
) {
  return db.transaction(() => {
    const ticket = db.prepare('SELECT status FROM tickets WHERE id = ? AND account_id = ?')
      .get(input.ticketId, input.accountId) as { status: string } | undefined;
    if (!ticket) return { outcome: 'NOT_FOUND' as const };
    if (ticket.status === 'CLOSED') return { outcome: 'CLOSED' as const };
    const messageId = generateId('tkm');
    db.prepare(`INSERT INTO ticket_messages (id, ticket_id, author_user_id, is_staff_internal_note, body)
      VALUES (?, ?, ?, 0, ?)`).run(messageId, input.ticketId, input.userId, input.body.trim());
    db.prepare("UPDATE tickets SET status = 'WAITING_STAFF', updated_at = datetime('now', 'utc') WHERE id = ?")
      .run(input.ticketId);
    db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'ticket.customer_replied', 'ticket', ?, ?, ?)`)
      .run(generateId('aud'), input.accountId, input.userId, input.ticketId, input.ipAddress, generateId('cor'));
    return { outcome: 'CREATED' as const, messageId };
  })();
}
