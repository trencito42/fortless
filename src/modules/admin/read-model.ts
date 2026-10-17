import type Database from 'better-sqlite3';
import { runInTransaction } from '../../database/index.js';
import { generateId } from '../identity/auth.js';
import { listTicketAttachments, type TicketAttachmentRecord } from '../support/tickets.js';

export interface AdminListOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

function page(options: AdminListOptions) {
  return {
    query: (options.query || '').trim().slice(0, 100),
    limit: Math.min(Math.max(options.limit || 25, 1), 50),
    offset: Math.max(options.offset || 0, 0),
  };
}

function search(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function getAdminOverview(db: Database.Database) {
  const counts = db.prepare(`
    SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM accounts) AS accounts,
      (SELECT count(*) FROM orders) AS orders,
      (SELECT count(*) FROM services WHERE contract_status = 'ACTIVE') AS activeServices,
      (SELECT count(*) FROM tickets WHERE status NOT IN ('RESOLVED', 'CLOSED')) AS openTickets,
      (SELECT count(*) FROM invoices WHERE status = 'OVERDUE') AS overdueInvoices,
      (SELECT count(*) FROM outbox_events WHERE status = 'PENDING') AS pendingOutboxEvents,
      (SELECT count(*) FROM outbox_events WHERE status = 'DEAD_LETTER') AS deadLetterEvents
  `).get() as Record<string, number>;

  const capabilities = {
    payments: 'NOT_CONFIGURED',
    provisioning: 'MOCK_ONLY',
    transactionalEmail: 'NOT_CONFIGURED',
  } as const;

  return { ...counts, capabilities };
}

export function listAdminAccounts(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT a.id, a.name, a.status, a.created_at,
           u.name AS owner_name, u.email AS owner_email, u.status AS owner_status,
           count(DISTINCT m.id) AS member_count,
           count(DISTINCT s.id) AS service_count,
           count(DISTINCT t.id) AS open_ticket_count
    FROM accounts a
    JOIN users u ON u.id = a.owner_user_id
    LEFT JOIN memberships m ON m.account_id = a.id
    LEFT JOIN services s ON s.account_id = a.id
    LEFT JOIN tickets t ON t.account_id = a.id AND t.status NOT IN ('RESOLVED', 'CLOSED')
    WHERE (? = '' OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    GROUP BY a.id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, limit, offset);

  return { accounts: rows, limit, offset };
}

export function listAdminServices(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT s.id, s.identifier, s.provider_type, s.contract_status, s.created_at,
           a.id AS account_id, a.name AS account_name,
           p.name AS product_name, pv.name AS plan_name,
           r.name AS region_name, n.name AS node_name,
           os.runtime_state, os.last_checked_at
    FROM services s
    JOIN accounts a ON a.id = s.account_id
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    JOIN nodes n ON n.id = s.node_id
    JOIN regions r ON r.id = n.region_id
    LEFT JOIN service_observed_states os ON os.service_id = s.id
    WHERE (? = '' OR s.id LIKE ? ESCAPE '\\' OR coalesce(s.identifier, '') LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR pv.name LIKE ? ESCAPE '\\')
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, limit, offset);

  return { services: rows, limit, offset };
}

export function listAdminTickets(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT t.id, t.subject, t.priority, t.status, t.created_at, t.updated_at,
           a.id AS account_id, a.name AS account_name,
           creator.name AS customer_name, creator.email AS customer_email,
           assignee.name AS assigned_staff_name,
           (SELECT count(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
    FROM tickets t
    JOIN accounts a ON a.id = t.account_id
    JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_staff_id
    WHERE (? = '' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR creator.name LIKE ? ESCAPE '\\' OR creator.email LIKE ? ESCAPE '\\')
    ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
             t.updated_at DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, limit, offset);

  return { tickets: rows, limit, offset };
}

export function listAdminAudit(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT ae.id, ae.account_id, ae.actor_type, ae.action, ae.resource_type,
           ae.resource_id, ae.ip_address, ae.correlation_id, ae.created_at,
           u.name AS actor_name, u.email AS actor_email, a.name AS account_name
    FROM audit_events ae
    LEFT JOIN users u ON u.id = ae.actor_user_id
    LEFT JOIN accounts a ON a.id = ae.account_id
    WHERE (? = '' OR ae.action LIKE ? ESCAPE '\\' OR ae.resource_type LIKE ? ESCAPE '\\'
      OR ae.resource_id LIKE ? ESCAPE '\\' OR ae.correlation_id LIKE ? ESCAPE '\\'
      OR coalesce(u.email, '') LIKE ? ESCAPE '\\' OR coalesce(a.name, '') LIKE ? ESCAPE '\\')
    ORDER BY ae.created_at DESC, ae.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, like, limit, offset);

  return { logs: rows, limit, offset };
}

export function listAdminStaff(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.status AS user_status,
           sm.role, sm.status, sm.created_at, sm.updated_at,
           CASE WHEN EXISTS (
             SELECT 1 FROM mfa_factors mf WHERE mf.user_id = u.id AND mf.type = 'TOTP' AND mf.is_confirmed = 1
           ) THEN 1 ELSE 0 END AS mfa_enabled
    FROM staff_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE (? = '' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR sm.role LIKE ? ESCAPE '\\')
    ORDER BY CASE sm.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, sm.created_at ASC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, limit, offset);
  return { staff: rows, limit, offset };
}

export interface AdminAccountDetail {
  account: {
    id: string;
    name: string;
    owner_user_id: string;
    status: string;
    created_at: string;
    updated_at: string;
    owner_name?: string;
    owner_email?: string;
    owner_status?: string;
    [key: string]: unknown;
  };
  members: Array<{
    id: string;
    role: string;
    created_at: string;
    user_id: string;
    name: string;
    email: string;
    status: string;
    [key: string]: unknown;
  }>;
  services: Array<{
    id: string;
    identifier: string | null;
    contract_status: string;
    created_at: string;
    product_name: string;
    plan_name: string;
    [key: string]: unknown;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    total_minor_units: number;
    currency: string;
    status: string;
    created_at: string;
    [key: string]: unknown;
  }>;
  tickets: Array<{
    id: string;
    subject: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  }>;
}

export function getAdminAccountDetail(accountId: string, db: Database.Database): AdminAccountDetail | null {
  const account = db.prepare(`
    SELECT a.*, u.name AS owner_name, u.email AS owner_email, u.status AS owner_status
    FROM accounts a
    JOIN users u ON u.id = a.owner_user_id
    WHERE a.id = ?
  `).get(accountId) as AdminAccountDetail['account'] | undefined;
  if (!account) return null;

  const members = db.prepare(`
    SELECT m.id, m.role, m.created_at, u.id AS user_id, u.name, u.email, u.status
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.account_id = ?
    ORDER BY m.created_at ASC
  `).all(accountId) as AdminAccountDetail['members'];

  const services = db.prepare(`
    SELECT s.id, s.identifier, s.contract_status, s.created_at, p.name AS product_name, pv.name AS plan_name
    FROM services s
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    WHERE s.account_id = ?
    ORDER BY s.created_at DESC
  `).all(accountId) as AdminAccountDetail['services'];

  const invoices = db.prepare(`
    SELECT id, invoice_number, total_minor_units, currency, status, created_at
    FROM invoices
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(accountId) as AdminAccountDetail['invoices'];

  const tickets = db.prepare(`
    SELECT id, subject, priority, status, created_at, updated_at
    FROM tickets
    WHERE account_id = ?
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(accountId) as AdminAccountDetail['tickets'];

  return { account, members, services, invoices, tickets };
}

export function updateAccountStatus(
  data: { accountId: string; status: 'ACTIVE' | 'LOCKED' | 'FLAGGED_FRAUD'; reason: string; actorUserId: string; ipAddress: string },
  db: Database.Database
) {
  runInTransaction((trx) => {
    const account = trx.prepare('SELECT id, status FROM accounts WHERE id = ?').get(data.accountId) as { id: string; status: string } | undefined;
    if (!account) throw new Error('Account not found.');

    trx.prepare("UPDATE accounts SET status = ?, updated_at = datetime('now', 'utc') WHERE id = ?")
      .run(data.status, data.accountId);

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'account.status_changed', 'account', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      data.accountId,
      data.actorUserId,
      data.accountId,
      data.ipAddress,
      generateId('cor'),
      JSON.stringify({ from: account.status, to: data.status, reason: data.reason })
    );
  }, db);
}

export interface AdminTicketDetail {
  ticket: {
    id: string;
    account_id: string;
    created_by_user_id: string;
    assigned_staff_id: string | null;
    subject: string;
    priority: string;
    status: string;
    service_id: string | null;
    created_at: string;
    updated_at: string;
    account_name?: string;
    creator_name?: string;
    creator_email?: string;
    assigned_staff_name?: string | null;
    [key: string]: unknown;
  };
  messages: Array<{
    id: string;
    ticket_id: string;
    author_user_id: string;
    is_staff_internal_note: number;
    body: string;
    created_at: string;
    author_name?: string;
    author_email?: string;
    is_staff_author?: number;
    [key: string]: unknown;
  }>;
  attachments: TicketAttachmentRecord[];
}

export function getAdminTicketDetail(ticketId: string, db: Database.Database): AdminTicketDetail | null {
  const ticket = db.prepare(`
    SELECT t.*, a.name AS account_name, creator.name AS creator_name, creator.email AS creator_email,
           assignee.name AS assigned_staff_name
    FROM tickets t
    JOIN accounts a ON a.id = t.account_id
    JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_staff_id
    WHERE t.id = ?
  `).get(ticketId) as AdminTicketDetail['ticket'] | undefined;
  if (!ticket) return null;

  const messages = db.prepare(`
    SELECT tm.*, u.name AS author_name, u.email AS author_email,
           CASE WHEN sm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_staff_author
    FROM ticket_messages tm
    JOIN users u ON u.id = tm.author_user_id
    LEFT JOIN staff_memberships sm ON sm.user_id = u.id AND sm.status = 'ACTIVE'
    WHERE tm.ticket_id = ?
    ORDER BY tm.created_at ASC
  `).all(ticketId) as AdminTicketDetail['messages'];

  const attachments = listTicketAttachments(ticketId, null, db);

  return { ticket, messages, attachments };
}

export function addStaffTicketReply(
  data: { ticketId: string; staffUserId: string; body: string; isInternalNote?: boolean; ipAddress: string },
  db: Database.Database
): { messageId: string } {
  return runInTransaction((trx) => {
    const ticket = trx.prepare('SELECT id, account_id, status FROM tickets WHERE id = ?').get(data.ticketId) as { id: string; account_id: string; status: string } | undefined;
    if (!ticket) throw new Error('Ticket not found.');

    const messageId = generateId('msg');
    const isInternal = data.isInternalNote ? 1 : 0;

    trx.prepare(`
      INSERT INTO ticket_messages (id, ticket_id, author_user_id, is_staff_internal_note, body)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, data.ticketId, data.staffUserId, isInternal, data.body);

    if (!data.isInternalNote) {
      trx.prepare(`
        UPDATE tickets
        SET status = 'WAITING_CUSTOMER', updated_at = datetime('now', 'utc'), assigned_staff_id = coalesce(assigned_staff_id, ?)
        WHERE id = ?
      `).run(data.staffUserId, data.ticketId);
    } else {
      trx.prepare("UPDATE tickets SET updated_at = datetime('now', 'utc') WHERE id = ?").run(data.ticketId);
    }

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id)
      VALUES (?, ?, ?, 'STAFF', ?, 'ticket', ?, ?, ?)
    `).run(
      generateId('aud'),
      ticket.account_id,
      data.staffUserId,
      isInternal ? 'ticket.internal_note_added' : 'ticket.staff_reply_added',
      data.ticketId,
      data.ipAddress,
      generateId('cor')
    );

    return { messageId };
  }, db);
}

export function updateTicketStatus(
  data: { ticketId: string; status: 'OPEN' | 'WAITING_CUSTOMER' | 'WAITING_STAFF' | 'RESOLVED' | 'CLOSED'; actorUserId: string; ipAddress: string },
  db: Database.Database
) {
  runInTransaction((trx) => {
    const ticket = trx.prepare('SELECT id, account_id, status FROM tickets WHERE id = ?').get(data.ticketId) as { id: string; account_id: string; status: string } | undefined;
    if (!ticket) throw new Error('Ticket not found.');

    trx.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now', 'utc') WHERE id = ?")
      .run(data.status, data.ticketId);

    trx.prepare(`
      INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'ticket.status_changed', 'ticket', ?, ?, ?, ?)
    `).run(
      generateId('aud'),
      ticket.account_id,
      data.actorUserId,
      data.ticketId,
      data.ipAddress,
      generateId('cor'),
      JSON.stringify({ from: ticket.status, to: data.status })
    );
  }, db);
}

export function listAdminOrders(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT o.id, o.status, o.currency, o.total_minor_units, o.idempotency_key, o.created_at, o.updated_at,
           a.id AS account_id, a.name AS account_name,
           u.name AS customer_name, u.email AS customer_email,
           (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    JOIN accounts a ON a.id = o.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR o.id LIKE ? ESCAPE '\\' OR o.status LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, limit, offset) as any[];

  return { orders: rows, limit, offset };
}

export function listAdminInvoices(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT inv.id, inv.invoice_number, inv.status, inv.currency,
           inv.subtotal_minor_units, inv.tax_minor_units, inv.total_minor_units,
           inv.amount_paid_minor_units, inv.due_date, inv.created_at,
           a.id AS account_id, a.name AS account_name,
           u.name AS customer_name, u.email AS customer_email,
           (SELECT count(*) FROM credit_notes cn WHERE cn.invoice_id = inv.id) AS credit_note_count
    FROM invoices inv
    JOIN accounts a ON a.id = inv.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR inv.id LIKE ? ESCAPE '\\' OR coalesce(inv.invoice_number, '') LIKE ? ESCAPE '\\'
      OR inv.status LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    ORDER BY inv.created_at DESC, inv.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, like, limit, offset) as any[];

  return { invoices: rows, limit, offset };
}

export function listAdminCreditNotes(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT cn.id, cn.credit_note_number, cn.amount_minor_units, cn.reason, cn.created_at,
           inv.id AS invoice_id, inv.invoice_number, inv.currency,
           a.id AS account_id, a.name AS account_name,
           u.name AS customer_name, u.email AS customer_email
    FROM credit_notes cn
    JOIN invoices inv ON inv.id = cn.invoice_id
    JOIN accounts a ON a.id = inv.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR cn.id LIKE ? ESCAPE '\\' OR cn.credit_note_number LIKE ? ESCAPE '\\'
      OR cn.reason LIKE ? ESCAPE '\\' OR inv.invoice_number LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    ORDER BY cn.created_at DESC, cn.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, like, like, limit, offset) as any[];

  return { creditNotes: rows, limit, offset };
}

export function getAdminCapacityPools(db: Database.Database) {
  const regions = db.prepare(`
    SELECT r.id, r.code, r.name, r.country, r.is_active,
           count(DISTINCT n.id) AS node_count,
           coalesce(sum(n.max_memory_mb), 0) AS total_memory_mb,
           coalesce(sum(n.allocated_memory_mb), 0) AS allocated_memory_mb,
           coalesce(sum(n.max_disk_mb), 0) AS total_disk_mb,
           coalesce(sum(n.allocated_disk_mb), 0) AS allocated_disk_mb
    FROM regions r
    LEFT JOIN nodes n ON n.region_id = r.id
    GROUP BY r.id
    ORDER BY r.code ASC
  `).all() as any[];

  const nodes = db.prepare(`
    SELECT n.id, n.region_id, n.name, n.fqdn, n.provider_instance_id,
           n.max_memory_mb, n.allocated_memory_mb, n.max_disk_mb, n.allocated_disk_mb,
           n.maintenance_mode, r.code AS region_code, r.name AS region_name,
           (SELECT count(*) FROM services s WHERE s.node_id = n.id AND s.contract_status = 'ACTIVE') AS active_service_count
    FROM nodes n
    JOIN regions r ON r.id = n.region_id
    ORDER BY r.code ASC, n.name ASC
  `).all() as any[];

  return { regions, nodes };
}
