import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';
import { createNotification } from '../notifications/notifications.js';

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
  'application/zip',
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
/** NEW-372: per-ticket and per-workspace limits on top of the per-file cap. */
export const MAX_ATTACHMENTS_PER_TICKET = 10;
export const MAX_ATTACHMENT_BYTES_PER_ACCOUNT = 200 * 1024 * 1024; // 200 MB
/** NEW-371: base64 inflates a file by 4/3, so the route body limit must cover the largest allowed file plus the envelope. */
export const ATTACHMENT_BODY_LIMIT_BYTES = Math.ceil(MAX_ATTACHMENT_SIZE_BYTES * 4 / 3) + 64 * 1024;

export function sanitizeFilename(filename: string): string {
  const normalized = filename.replace(/\\/g, '/').replace(/[\0\r\n\t]/g, '').trim();
  const base = path.basename(normalized);
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return clean || 'attachment.dat';
}

export interface TicketAttachmentRecord {
  id: string;
  ticket_id: string;
  message_id: string | null;
  uploader_user_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  file_hash: string;
  storage_path: string;
  created_at: string;
  uploader_name?: string;
}

export interface PublicTicketAttachmentRecord {
  id: string;
  ticket_id: string;
  message_id: string | null;
  uploader_user_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  created_at: string;
  uploader_name?: string;
}

export function toPublicAttachment(rec: TicketAttachmentRecord): PublicTicketAttachmentRecord {
  return {
    id: rec.id,
    ticket_id: rec.ticket_id,
    message_id: rec.message_id,
    uploader_user_id: rec.uploader_user_id,
    filename: rec.filename,
    content_type: rec.content_type,
    byte_size: rec.byte_size,
    created_at: rec.created_at,
    uploader_name: rec.uploader_name,
  };
}

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
    createNotification({
      accountId: input.accountId,
      userId: input.userId,
      type: 'TICKET_CREATED',
      title: 'Ticket Submitted',
      message: `Your ticket "${subject}" was submitted.`,
      linkUrl: `/app/support/${ticketId}`,
    }, db);
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
  const attachments = listTicketAttachments(ticketId, accountId, db);
  return { ticket, messages, attachments };
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

export function addTicketAttachment(
  input: {
    ticketId: string;
    messageId?: string | null;
    accountId: string | null;
    userId: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
    ipAddress: string;
    storageBaseDir?: string;
  },
  db: Database.Database
): TicketAttachmentRecord {
  const cleanMime = (input.contentType.toLowerCase().split(';')[0] ?? '').trim();
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(cleanMime)) {
    throw new Error(`File type '${cleanMime}' is not permitted. Allowed: images, PDF, text, JSON, zip.`);
  }
  if (input.buffer.length === 0) {
    throw new Error('Attachment cannot be empty.');
  }
  if (input.buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error('Attachment exceeds maximum allowed size of 5 MB.');
  }

  const ticket = db.prepare('SELECT id, account_id, status FROM tickets WHERE id = ?').get(input.ticketId) as
    | { id: string; account_id: string; status: string }
    | undefined;

  if (!ticket) throw new Error('Ticket not found.');
  if (input.accountId && ticket.account_id !== input.accountId) {
    throw new Error('Ticket not found.');
  }
  if (input.accountId) {
    const perTicket = (db.prepare('SELECT COUNT(*) AS c FROM ticket_attachments WHERE ticket_id = ?').get(ticket.id) as { c: number }).c;
    if (perTicket >= MAX_ATTACHMENTS_PER_TICKET) {
      throw new Error(`QUOTA_EXCEEDED: a ticket can hold at most ${MAX_ATTACHMENTS_PER_TICKET} attachments.`);
    }
    const used = (db.prepare('SELECT COALESCE(SUM(a.byte_size), 0) AS total FROM ticket_attachments a JOIN tickets t ON t.id = a.ticket_id WHERE t.account_id = ?').get(ticket.account_id) as { total: number }).total;
    if (used + input.buffer.length > MAX_ATTACHMENT_BYTES_PER_ACCOUNT) {
      throw new Error('QUOTA_EXCEEDED: this workspace has used its attachment storage.');
    }
  }

  if (input.messageId) {
    const message = db.prepare('SELECT id, ticket_id, is_staff_internal_note FROM ticket_messages WHERE id = ? AND ticket_id = ?').get(input.messageId, ticket.id) as
      | { id: string; ticket_id: string; is_staff_internal_note: number }
      | undefined;
    if (!message) {
      throw new Error('Message not found on this ticket.');
    }
    if (input.accountId && message.is_staff_internal_note === 1) {
      throw new Error('Cannot attach to an internal note.');
    }
  }

  const safeName = sanitizeFilename(input.filename);
  const attachmentId = generateId('att');
  const fileHash = crypto.createHash('sha256').update(input.buffer).digest('hex');

  const baseDir = input.storageBaseDir || path.resolve(process.cwd(), 'data', 'attachments');
  const ticketDir = path.join(baseDir, ticket.id);
  if (!fs.existsSync(ticketDir)) {
    fs.mkdirSync(ticketDir, { recursive: true, mode: 0o750 });
  }

  const storageFilename = `${attachmentId}_${safeName}`;
  const diskPath = path.join(ticketDir, storageFilename);
  fs.writeFileSync(diskPath, input.buffer);

  try {
    return db.transaction(() => {
      db.prepare(`
        INSERT INTO ticket_attachments (id, ticket_id, message_id, uploader_user_id, filename, content_type, byte_size, file_hash, storage_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attachmentId,
        ticket.id,
        input.messageId || null,
        input.userId,
        safeName,
        cleanMime,
        input.buffer.length,
        fileHash,
        diskPath
      );

      db.prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, ?, ?, ?, 'ticket.attachment_uploaded', 'ticket_attachment', ?, ?, ?, ?)
      `).run(
        generateId('aud'),
        ticket.account_id,
        input.userId,
        input.accountId ? 'USER' : 'STAFF',
        attachmentId,
        input.ipAddress,
        generateId('cor'),
        JSON.stringify({ filename: safeName, size: input.buffer.length, contentType: cleanMime, fileHash })
      );

      return db.prepare('SELECT * FROM ticket_attachments WHERE id = ?').get(attachmentId) as TicketAttachmentRecord;
    })();
  } catch (err) {
    try {
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch {
      // ignore unlink failure
    }
    throw err;
  }
}

export function listTicketAttachments(
  ticketId: string,
  accountId: string | null,
  db: Database.Database
): TicketAttachmentRecord[] {
  const ticket = db.prepare('SELECT id, account_id FROM tickets WHERE id = ?').get(ticketId) as
    | { id: string; account_id: string }
    | undefined;
  if (!ticket) return [];
  if (accountId && ticket.account_id !== accountId) return [];
  const internalNoteFilter = accountId
    ? ` AND (ta.message_id IS NULL OR ta.message_id IN (SELECT id FROM ticket_messages WHERE is_staff_internal_note = 0))`
    : '';

  return db.prepare(`
    SELECT ta.id, ta.ticket_id, ta.message_id, ta.uploader_user_id, ta.filename,
           ta.content_type, ta.byte_size, ta.file_hash, ta.storage_path, ta.created_at,
           u.name AS uploader_name
    FROM ticket_attachments ta
    JOIN users u ON u.id = ta.uploader_user_id
    WHERE ta.ticket_id = ? ${internalNoteFilter}
    ORDER BY ta.created_at ASC
  `).all(ticketId) as TicketAttachmentRecord[];
}

export function getTicketAttachment(
  ticketId: string,
  attachmentId: string,
  accountId: string | null,
  db: Database.Database
): { record: TicketAttachmentRecord; buffer: Buffer } | null {
  const ticket = db.prepare('SELECT id, account_id FROM tickets WHERE id = ?').get(ticketId) as
    | { id: string; account_id: string }
    | undefined;
  if (!ticket) return null;
  if (accountId && ticket.account_id !== accountId) return null;

  const internalNoteFilter = accountId
    ? ` AND (ta.message_id IS NULL OR ta.message_id IN (SELECT id FROM ticket_messages WHERE is_staff_internal_note = 0))`
    : '';

  const record = db.prepare(`
    SELECT ta.*, u.name AS uploader_name
    FROM ticket_attachments ta
    JOIN users u ON u.id = ta.uploader_user_id
    WHERE ta.id = ? AND ta.ticket_id = ? ${internalNoteFilter}
  `).get(attachmentId, ticketId) as TicketAttachmentRecord | undefined;

  if (!record) return null;
  if (!fs.existsSync(record.storage_path)) return null;

  const buffer = fs.readFileSync(record.storage_path);
  return { record, buffer };
}

export function resolveTicket(
  input: { ticketId: string; accountId: string; userId: string; ipAddress: string },
  db: Database.Database
): { outcome: 'RESOLVED' | 'NOT_FOUND' } {
  return db.transaction(() => {
    const ticket = db.prepare('SELECT id, status FROM tickets WHERE id = ? AND account_id = ?').get(input.ticketId, input.accountId) as { id: string; status: string } | undefined;
    if (!ticket) return { outcome: 'NOT_FOUND' as const };
    const now = new Date().toISOString();
    db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').run('RESOLVED', now, input.ticketId);
    db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'USER', 'ticket.resolved', 'ticket', ?, ?, ?)`
    ).run(generateId('aud'), input.accountId, input.userId, input.ticketId, input.ipAddress, generateId('cor'));
    return { outcome: 'RESOLVED' as const };
  })();
}
