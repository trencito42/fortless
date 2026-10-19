import type Database from 'better-sqlite3';
import { runInTransaction } from '../../database/index.js';
import { generateId } from '../identity/auth.js';
import { listTicketAttachments, type TicketAttachmentRecord } from '../support/tickets.js';
import { queueEmail } from '../email/outbox.js';
import { createNotification } from '../notifications/notifications.js';

export interface AdminListOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface AdminJobListOptions extends AdminListOptions {
  type?: string;
  status?: string;
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
      (SELECT count(*) FROM services WHERE contract_status = 'SUSPENDED') AS suspendedServices,
      (SELECT count(*) FROM services WHERE contract_status = 'TERMINATED') AS terminatedServices,
      (SELECT count(*) FROM provision_operations WHERE status IN ('PENDING', 'IN_PROGRESS', 'VERIFYING')) AS provisioningServices,
      (SELECT count(*) FROM provision_operations WHERE status IN ('FAILED', 'NEEDS_MANUAL_REVIEW')) AS failedProvisioningJobs,
      (SELECT count(*) FROM tickets WHERE status NOT IN ('RESOLVED', 'CLOSED')) AS openTickets,
      (SELECT count(*) FROM tickets WHERE status = 'WAITING_STAFF') AS waitingStaffTickets,
      (SELECT count(*) FROM orders WHERE status IN ('DRAFT', 'AWAITING_PAYMENT', 'FULFILLING', 'PARTIALLY_FULFILLED')) AS pendingOrders,
      (SELECT count(*) FROM invoices WHERE status IN ('ISSUED', 'OVERDUE') AND amount_paid_minor_units < total_minor_units) AS unpaidInvoices,
      (SELECT count(*) FROM invoices WHERE status = 'OVERDUE') AS overdueInvoices,
      (SELECT count(*) FROM payment_attempts WHERE status = 'FAILED') AS failedPayments,
      (SELECT count(*) FROM outbox_events WHERE status = 'PENDING') AS pendingOutboxEvents,
      (SELECT count(*) FROM outbox_events WHERE status = 'DEAD_LETTER') AS deadLetterEvents,
      (SELECT count(*) FROM email_outbox WHERE status IN ('FAILED', 'DEAD_LETTER')) AS failedEmails,
      (SELECT count(*) FROM psp_inbox_events WHERE status IN ('FAILED', 'ANOMALY')) AS webhookFailures,
      (SELECT count(*) FROM nodes WHERE maintenance_mode = 0 AND (
        (max_memory_mb > 0 AND allocated_memory_mb * 100 >= max_memory_mb * 90) OR
        (max_disk_mb > 0 AND allocated_disk_mb * 100 >= max_disk_mb * 90)
      )) AS capacityAlerts
  `).get() as Record<string, number>;

  const collections = db.prepare(`
    SELECT currency, coalesce(sum(amount_paid_minor_units), 0) AS amount_minor_units
    FROM invoices
    WHERE paid_at IS NOT NULL AND paid_at >= datetime('now', '-30 days')
    GROUP BY currency ORDER BY currency
  `).all() as Array<{ currency: string; amount_minor_units: number }>;
  const attention = {
    invoices: db.prepare(`SELECT id, invoice_number, account_id, currency,
      total_minor_units - amount_paid_minor_units AS balance_minor_units, due_date, status
      FROM invoices WHERE status = 'OVERDUE' ORDER BY due_date ASC LIMIT 5`).all(),
    provisioning: db.prepare(`SELECT po.id, po.service_id, po.status, po.last_error, po.updated_at,
      s.identifier, a.name AS account_name FROM provision_operations po
      JOIN services s ON s.id = po.service_id JOIN accounts a ON a.id = s.account_id
      WHERE po.status IN ('FAILED', 'NEEDS_MANUAL_REVIEW') ORDER BY po.updated_at DESC LIMIT 5`).all(),
    tickets: db.prepare(`SELECT t.id, t.subject, t.priority, t.updated_at, a.name AS account_name
      FROM tickets t JOIN accounts a ON a.id = t.account_id
      WHERE t.status = 'WAITING_STAFF'
      ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, t.updated_at ASC LIMIT 5`).all(),
  };
  const recent = {
    accounts: db.prepare(`SELECT id, name, status, created_at FROM accounts ORDER BY created_at DESC LIMIT 5`).all(),
    orders: db.prepare(`SELECT o.id, o.status, o.currency, o.total_minor_units, o.created_at, a.name AS account_name
      FROM orders o JOIN accounts a ON a.id = o.account_id ORDER BY o.created_at DESC LIMIT 5`).all(),
    operations: db.prepare(`SELECT action, resource_type, resource_id, actor_type, correlation_id, created_at
      FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 8`).all(),
  };

  return { ...counts, collections, attention, recent };
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
  const total = (db.prepare(`
    SELECT count(*) AS count
    FROM accounts a
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
  `).get(query, like, like, like) as { count: number }).count;

  return { accounts: rows, total, limit, offset };
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
  const total = (db.prepare(`
    SELECT count(*) AS count
    FROM services s
    JOIN accounts a ON a.id = s.account_id
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    WHERE (? = '' OR s.id LIKE ? ESCAPE '\\' OR coalesce(s.identifier, '') LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR pv.name LIKE ? ESCAPE '\\')
  `).get(query, like, like, like, like, like) as { count: number }).count;

  return { services: rows, total, limit, offset };
}

export function listAdminTickets(db: Database.Database, options: AdminListOptions & { status?: string; departmentId?: string; assignedTo?: string } = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const status = options.status || '';
  const departmentId = options.departmentId || '';
  const assignedTo = options.assignedTo || '';
  const rows = db.prepare(`
    SELECT t.id, t.subject, t.priority, t.status, t.created_at, t.updated_at,
           a.id AS account_id, a.name AS account_name,
           creator.name AS customer_name, creator.email AS customer_email,
           assignee.name AS assigned_staff_name, t.assigned_staff_id,
           t.department_id, d.name AS department_name,
           (SELECT count(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
    FROM tickets t
    JOIN accounts a ON a.id = t.account_id
    JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_staff_id
    LEFT JOIN ticket_departments d ON d.id = t.department_id
    WHERE (? = '' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR creator.name LIKE ? ESCAPE '\\' OR creator.email LIKE ? ESCAPE '\\')
      AND (? = '' OR t.status = ?)
      AND (? = '' OR t.department_id = ?)
      AND (? = '' OR (? = 'UNASSIGNED' AND t.assigned_staff_id IS NULL) OR t.assigned_staff_id = ?)
    ORDER BY CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
             t.updated_at DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(query, like, like, like, like, like, status, status, departmentId, departmentId, assignedTo, assignedTo, assignedTo, limit, offset);
  const total = (db.prepare(`
    SELECT count(*) AS count
    FROM tickets t
    JOIN accounts a ON a.id = t.account_id
    JOIN users creator ON creator.id = t.created_by_user_id
    WHERE (? = '' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR creator.name LIKE ? ESCAPE '\\' OR creator.email LIKE ? ESCAPE '\\')
      AND (? = '' OR t.status = ?)
      AND (? = '' OR t.department_id = ?)
      AND (? = '' OR (? = 'UNASSIGNED' AND t.assigned_staff_id IS NULL) OR t.assigned_staff_id = ?)
  `).get(query, like, like, like, like, like, status, status, departmentId, departmentId, assignedTo, assignedTo, assignedTo) as { count: number }).count;

  return { tickets: rows, total, limit, offset };
}

export function listAdminAudit(db: Database.Database, options: AdminListOptions = {}) {
  const { query, limit, offset } = page(options);
  const like = search(query);
  const rows = db.prepare(`
    SELECT ae.id, ae.account_id, ae.actor_type, ae.action, ae.resource_type,
           ae.resource_id, ae.ip_address, ae.correlation_id, ae.metadata, ae.created_at,
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
  const total = (db.prepare(`
    SELECT count(*) AS count
    FROM audit_events ae
    LEFT JOIN users u ON u.id = ae.actor_user_id
    LEFT JOIN accounts a ON a.id = ae.account_id
    WHERE (? = '' OR ae.action LIKE ? ESCAPE '\\' OR ae.resource_type LIKE ? ESCAPE '\\'
      OR ae.resource_id LIKE ? ESCAPE '\\' OR ae.correlation_id LIKE ? ESCAPE '\\'
      OR coalesce(u.email, '') LIKE ? ESCAPE '\\' OR coalesce(a.name, '') LIKE ? ESCAPE '\\')
  `).get(query, like, like, like, like, like, like) as { count: number }).count;

  return { logs: rows, total, limit, offset };
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
  const total = (db.prepare(`
    SELECT count(*) AS count
    FROM staff_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE (? = '' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR sm.role LIKE ? ESCAPE '\\')
  `).get(query, like, like, like) as { count: number }).count;
  return { staff: rows, total, limit, offset };
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
  orders: any[];
  subscriptions: any[];
  audit: any[];
  notes: any[];
  billingProfile: any | null;
  summary: Record<string, number>;
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
    SELECT s.id, s.identifier, s.contract_status, s.created_at, p.name AS product_name, pv.name AS plan_name,
           os.runtime_state, n.name AS node_name
    FROM services s
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN nodes n ON n.id = s.node_id
    LEFT JOIN service_observed_states os ON os.service_id = s.id
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

  const orders = db.prepare(`
    SELECT id, status, currency, total_minor_units, created_at, updated_at
    FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(accountId) as any[];
  const subscriptions = db.prepare(`
    SELECT sub.id, sub.service_id, sub.status, sub.billing_interval, sub.current_period_end,
           sub.next_renewal_date, sub.renewal_price_minor_units, sub.currency, sub.auto_renew,
           s.identifier, p.name AS product_name, pv.name AS plan_name
    FROM subscriptions sub
    JOIN services s ON s.id = sub.service_id
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    WHERE sub.account_id = ? ORDER BY sub.created_at DESC
  `).all(accountId) as any[];
  const audit = db.prepare(`
    SELECT action, actor_type, resource_type, resource_id, ip_address, correlation_id, created_at
    FROM audit_events WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT 30
  `).all(accountId) as any[];
  const notes = db.prepare(`
    SELECT n.id, n.body, n.created_at, u.id AS author_user_id, u.name AS author_name, u.email AS author_email
    FROM admin_account_notes n JOIN users u ON u.id = n.author_user_id
    WHERE n.account_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 50
  `).all(accountId) as any[];
  const billingProfile = db.prepare(`
    SELECT company_name, tax_id, tax_id_type, address_line1, address_line2, city, postal_code, country, updated_at
    FROM billing_profiles WHERE account_id = ?
  `).get(accountId) as any | undefined;
  const summary = db.prepare(`
    SELECT
      (SELECT count(*) FROM services WHERE account_id = ?) AS services,
      (SELECT count(*) FROM orders WHERE account_id = ?) AS orders,
      (SELECT count(*) FROM invoices WHERE account_id = ?) AS invoices,
      (SELECT count(*) FROM tickets WHERE account_id = ?) AS tickets,
      (SELECT count(*) FROM invoices WHERE account_id = ? AND status IN ('ISSUED', 'OVERDUE') AND amount_paid_minor_units < total_minor_units) AS unpaid_invoices
  `).get(accountId, accountId, accountId, accountId, accountId) as Record<string, number>;

  return { account, members, services, invoices, tickets, orders, subscriptions, audit, notes, billingProfile: billingProfile || null, summary };
}

export function addAdminAccountNote(
  data: { accountId: string; authorUserId: string; body: string; ipAddress: string },
  db: Database.Database
) {
  return runInTransaction((trx) => {
    const account = trx.prepare('SELECT id FROM accounts WHERE id = ?').get(data.accountId);
    if (!account) throw new Error('Account not found.');
    const id = generateId('note');
    trx.prepare('INSERT INTO admin_account_notes (id, account_id, author_user_id, body) VALUES (?, ?, ?, ?)')
      .run(id, data.accountId, data.authorUserId, data.body);
    trx.prepare(`INSERT INTO audit_events
      (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'account.admin_note_added', 'account', ?, ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.authorUserId, data.accountId, data.ipAddress, generateId('cor'), JSON.stringify({ noteId: id }));
    return { id };
  }, db);
}

export function updateAdminBillingProfile(
  data: { accountId: string; actorUserId: string; ipAddress: string; companyName: string | null; taxId: string | null; taxIdType: string | null; addressLine1: string; addressLine2: string | null; city: string; postalCode: string; country: string },
  db: Database.Database
) {
  return runInTransaction((trx) => {
    const account = trx.prepare('SELECT id FROM accounts WHERE id = ?').get(data.accountId);
    if (!account) throw new Error('Account not found.');
    trx.prepare(`
      INSERT INTO billing_profiles (id, account_id, tax_id, tax_id_type, company_name, address_line1, address_line2, city, postal_code, country)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET tax_id = excluded.tax_id, tax_id_type = excluded.tax_id_type,
        company_name = excluded.company_name, address_line1 = excluded.address_line1, address_line2 = excluded.address_line2,
        city = excluded.city, postal_code = excluded.postal_code, country = excluded.country, updated_at = datetime('now', 'utc')
    `).run(generateId('bpr'), data.accountId, data.taxId, data.taxIdType, data.companyName, data.addressLine1, data.addressLine2, data.city, data.postalCode, data.country);
    trx.prepare(`INSERT INTO audit_events
      (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'billing.profile_updated_by_staff', 'account', ?, ?, ?, ?)`)
      .run(generateId('aud'), data.accountId, data.actorUserId, data.accountId, data.ipAddress, generateId('cor'), JSON.stringify({ country: data.country, hasTaxId: Boolean(data.taxId), taxIdType: data.taxIdType }));
    return { accountId: data.accountId };
  }, db);
}

export function getAdminServiceDetail(serviceId: string, db: Database.Database) {
  const service = db.prepare(`
    SELECT s.id, s.identifier, s.provider_type, s.provider_instance_id, s.external_id, s.contract_status,
           s.created_at, s.updated_at,
           a.id AS account_id, a.name AS account_name,
           u.id AS owner_user_id, u.name AS owner_name, u.email AS owner_email,
           p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
           pv.id AS plan_version_id, pv.name AS plan_name, pv.resource_specs,
           n.name AS node_name, n.fqdn AS node_fqdn, r.name AS region_name,
           dc.cpu_limit_pct, dc.memory_limit_mb, dc.disk_limit_mb, dc.startup_command,
           os.runtime_state, os.last_checked_at, os.raw_metrics
    FROM services s
    JOIN accounts a ON a.id = s.account_id
    JOIN users u ON u.id = a.owner_user_id
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    JOIN nodes n ON n.id = s.node_id
    JOIN regions r ON r.id = n.region_id
    LEFT JOIN service_desired_configs dc ON dc.service_id = s.id
    LEFT JOIN service_observed_states os ON os.service_id = s.id
    WHERE s.id = ?
  `).get(serviceId) as any;

  if (!service) return null;

  const audit = db.prepare(`
    SELECT action, actor_type, created_at, metadata
    FROM audit_events
    WHERE resource_id = ?
    ORDER BY created_at DESC LIMIT 10
  `).all(serviceId);

  return { service, audit };
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
           assignee.name AS assigned_staff_name, d.name AS department_name
    FROM tickets t
    JOIN accounts a ON a.id = t.account_id
    JOIN users creator ON creator.id = t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_staff_id
    LEFT JOIN ticket_departments d ON d.id = t.department_id
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

export function getAdminSupportMeta(db: Database.Database) {
  const departments = db.prepare(`SELECT id, name, description, is_active, created_at FROM ticket_departments ORDER BY is_active DESC, name ASC`).all();
  const macros = db.prepare(`SELECT m.id, m.name, m.body, m.status, m.department_id, d.name AS department_name, m.is_active, m.updated_at
    FROM ticket_macros m LEFT JOIN ticket_departments d ON d.id = m.department_id
    WHERE m.is_active = 1 ORDER BY m.name ASC`).all();
  const staff = db.prepare(`
    SELECT u.id, u.name, u.email, sm.role,
      sum(CASE WHEN t.status NOT IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) AS active_count,
      sum(CASE WHEN t.status = 'WAITING_STAFF' THEN 1 ELSE 0 END) AS waiting_count,
      max(t.updated_at) AS latest_activity
    FROM staff_memberships sm JOIN users u ON u.id = sm.user_id
    LEFT JOIN tickets t ON t.assigned_staff_id = u.id
    WHERE sm.status = 'ACTIVE' AND sm.role IN ('OWNER', 'ADMINISTRATOR', 'SUPPORT')
    GROUP BY u.id, u.name, u.email, sm.role ORDER BY active_count ASC, u.name ASC
  `).all();
  return { departments, macros, staff };
}

export function updateAdminTicketRouting(
  data: { ticketId: string; assignedStaffId: string | null; departmentId: string | null; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; actorUserId: string; ipAddress: string },
  db: Database.Database
) {
  return runInTransaction((trx) => {
    const ticket = trx.prepare('SELECT account_id, assigned_staff_id, department_id, priority FROM tickets WHERE id = ?').get(data.ticketId) as any;
    if (!ticket) throw new Error('Ticket not found.');
    if (data.assignedStaffId) {
      const staff = trx.prepare("SELECT 1 FROM staff_memberships WHERE user_id = ? AND status = 'ACTIVE'").get(data.assignedStaffId);
      if (!staff) throw new Error('Assigned staff member is not active.');
    }
    if (data.departmentId) {
      const department = trx.prepare('SELECT 1 FROM ticket_departments WHERE id = ? AND is_active = 1').get(data.departmentId);
      if (!department) throw new Error('Department is not active.');
    }
    trx.prepare("UPDATE tickets SET assigned_staff_id = ?, department_id = ?, priority = ?, updated_at = datetime('now', 'utc') WHERE id = ?")
      .run(data.assignedStaffId, data.departmentId, data.priority, data.ticketId);
    trx.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, ?, 'STAFF', 'ticket.routing_updated', 'ticket', ?, ?, ?, ?)`)
      .run(generateId('aud'), ticket.account_id, data.actorUserId, data.ticketId, data.ipAddress, generateId('cor'), JSON.stringify({ from: { assignedStaffId: ticket.assigned_staff_id, departmentId: ticket.department_id, priority: ticket.priority }, to: { assignedStaffId: data.assignedStaffId, departmentId: data.departmentId, priority: data.priority } }));
    return { ticketId: data.ticketId };
  }, db);
}

export function createTicketDepartment(data: { name: string; description: string; actorUserId: string; ipAddress: string }, db: Database.Database) {
  const id = generateId('dep');
  db.transaction(() => {
    db.prepare('INSERT INTO ticket_departments (id, name, description) VALUES (?, ?, ?)').run(id, data.name, data.description);
    db.prepare(`INSERT INTO audit_events (id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, 'STAFF', 'ticket.department_created', 'ticket_department', ?, ?, ?, ?)`)
      .run(generateId('aud'), data.actorUserId, id, data.ipAddress, generateId('cor'), JSON.stringify({ name: data.name }));
  })();
  return { id };
}

export function createTicketMacro(data: { name: string; body: string; status: string | null; departmentId: string | null; actorUserId: string; ipAddress: string }, db: Database.Database) {
  const id = generateId('mac');
  db.transaction(() => {
    db.prepare('INSERT INTO ticket_macros (id, name, body, status, department_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, data.name, data.body, data.status, data.departmentId, data.actorUserId);
    db.prepare(`INSERT INTO audit_events (id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
      VALUES (?, ?, 'STAFF', 'ticket.macro_created', 'ticket_macro', ?, ?, ?, ?)`)
      .run(generateId('aud'), data.actorUserId, id, data.ipAddress, generateId('cor'), JSON.stringify({ name: data.name }));
  })();
  return { id };
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

      const ticketRow = trx.prepare(`
        SELECT t.subject, t.created_by_user_id, u.email, u.name
        FROM tickets t
        JOIN users u ON u.id = t.created_by_user_id
        WHERE t.id = ?
      `).get(data.ticketId) as { subject: string; created_by_user_id: string; email: string; name: string } | undefined;

      const staffUser = trx.prepare('SELECT name FROM users WHERE id = ?').get(data.staffUserId) as { name: string } | undefined;
      const authorName = staffUser?.name || 'Fortless Support';

      if (ticketRow?.email) {
        queueEmail(trx, {
          recipient: ticketRow.email,
          template: 'ticket_reply',
          payload: {
            ticketId: data.ticketId,
            subject: ticketRow.subject,
            author: authorName,
            preview: data.body.slice(0, 300),
          },
        });
      }

      if (ticketRow) {
        createNotification({
          accountId: ticket.account_id,
          userId: ticketRow.created_by_user_id,
          type: 'TICKET_REPLY',
          title: 'New Support Reply',
          message: `${authorName} replied to your ticket "${ticketRow.subject}".`,
          linkUrl: `/app/support/${data.ticketId}`,
        }, trx);
      }
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
  const summary = db.prepare(`
    SELECT o.status, count(*) AS count
    FROM orders o
    JOIN accounts a ON a.id = o.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR o.id LIKE ? ESCAPE '\\' OR o.status LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    GROUP BY o.status
  `).all(query, like, like, like, like, like) as Array<{ status: string; count: number }>;
  const total = summary.reduce((sum, item) => sum + Number(item.count), 0);

  return { orders: rows, total, summary, limit, offset };
}

export function getAdminOrderDetail(orderId: string, db: Database.Database) {
  const order = db.prepare(`
    SELECT o.*, a.name AS account_name, u.name AS customer_name, u.email AS customer_email
    FROM orders o
    JOIN accounts a ON a.id = o.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE o.id = ?
  `).get(orderId) as any;
  if (!order) return null;

  const items = db.prepare(`
    SELECT oi.*, p.name AS product_name, pv.name AS plan_name, r.name AS region_name,
           s.id AS service_id, s.contract_status, os.runtime_state,
           (SELECT ql.unit_price_minor_units FROM quote_lines ql
            WHERE ql.quote_id = ? AND ql.plan_version_id = oi.plan_version_id LIMIT 1) AS unit_price_minor_units,
           po.id AS provision_operation_id, po.status AS provision_status,
           po.attempt_count, po.last_error, po.updated_at AS provision_updated_at
    FROM order_items oi
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    JOIN regions r ON r.id = oi.region_id
    LEFT JOIN services s ON s.id = oi.service_id
    LEFT JOIN service_observed_states os ON os.service_id = s.id
    LEFT JOIN provision_operations po ON po.id = (
      SELECT po2.id FROM provision_operations po2 WHERE po2.service_id = s.id ORDER BY po2.created_at DESC LIMIT 1
    )
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `).all(order.quote_id, orderId) as any[];

  const invoices = db.prepare(`
    SELECT id, invoice_number, status, currency, total_minor_units, amount_paid_minor_units, due_date, paid_at
    FROM invoices WHERE order_id = ? ORDER BY created_at DESC
  `).all(orderId) as any[];
  const audit = db.prepare(`
    SELECT action, actor_type, resource_type, resource_id, correlation_id, metadata, created_at
    FROM audit_events WHERE resource_id = ? ORDER BY created_at DESC LIMIT 30
  `).all(orderId) as any[];
  return { order, items, invoices, audit };
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
  const summary = db.prepare(`
    SELECT inv.currency, count(*) AS count,
           coalesce(sum(inv.amount_paid_minor_units), 0) AS paid_minor_units,
           coalesce(sum(max(inv.total_minor_units - inv.amount_paid_minor_units, 0)), 0) AS outstanding_minor_units,
           sum(CASE WHEN inv.status = 'OVERDUE' THEN 1 ELSE 0 END) AS overdue_count
    FROM invoices inv
    JOIN accounts a ON a.id = inv.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR inv.id LIKE ? ESCAPE '\\' OR coalesce(inv.invoice_number, '') LIKE ? ESCAPE '\\'
      OR inv.status LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    GROUP BY inv.currency ORDER BY inv.currency
  `).all(query, like, like, like, like, like, like) as any[];
  const total = summary.reduce((sum, item) => sum + Number(item.count), 0);

  return { invoices: rows, total, summary, limit, offset };
}

export function getAdminInvoiceDetail(invoiceId: string, db: Database.Database) {
  const invoice = db.prepare(`
    SELECT inv.*, a.name AS account_name, u.name AS customer_name, u.email AS customer_email
    FROM invoices inv
    JOIN accounts a ON a.id = inv.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE inv.id = ?
  `).get(invoiceId) as any;
  if (!invoice) return null;

  const lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id').all(invoiceId) as any[];
  const payments = db.prepare(`
    SELECT id, psp_name, psp_session_id, psp_payment_intent_id, status,
           amount_minor_units, currency, created_at
    FROM payment_attempts WHERE invoice_id = ? ORDER BY created_at DESC
  `).all(invoiceId) as any[];
  const refunds = db.prepare(`
    SELECT r.id, r.payment_attempt_id, r.amount_minor_units, r.reason, r.status, r.psp_refund_id, r.created_at
    FROM refunds r JOIN payment_attempts pa ON pa.id = r.payment_attempt_id
    WHERE pa.invoice_id = ? ORDER BY r.created_at DESC
  `).all(invoiceId) as any[];
  const creditNotes = db.prepare('SELECT * FROM credit_notes WHERE invoice_id = ? ORDER BY created_at DESC').all(invoiceId) as any[];
  const services = invoice.order_id ? db.prepare(`
    SELECT s.id, s.identifier, s.contract_status, p.name AS product_name, pv.name AS plan_name
    FROM order_items oi
    JOIN services s ON s.order_item_id = oi.id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    JOIN products p ON p.id = pv.product_id
    WHERE oi.order_id = ? ORDER BY s.created_at
  `).all(invoice.order_id) as any[] : [];
  const audit = db.prepare(`
    SELECT action, actor_type, correlation_id, metadata, created_at
    FROM audit_events WHERE resource_id = ? ORDER BY created_at DESC LIMIT 30
  `).all(invoiceId) as any[];
  return { invoice, lines, payments, refunds, creditNotes, services, audit };
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
  const summary = db.prepare(`
    SELECT inv.currency, count(*) AS count, coalesce(sum(cn.amount_minor_units), 0) AS credited_minor_units
    FROM credit_notes cn
    JOIN invoices inv ON inv.id = cn.invoice_id
    JOIN accounts a ON a.id = inv.account_id
    JOIN users u ON u.id = a.owner_user_id
    WHERE (? = '' OR cn.id LIKE ? ESCAPE '\\' OR cn.credit_note_number LIKE ? ESCAPE '\\'
      OR cn.reason LIKE ? ESCAPE '\\' OR inv.invoice_number LIKE ? ESCAPE '\\'
      OR a.name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
    GROUP BY inv.currency ORDER BY inv.currency
  `).all(query, like, like, like, like, like, like, like) as any[];
  const total = summary.reduce((sum, item) => sum + Number(item.count), 0);

  return { creditNotes: rows, total, summary, limit, offset };
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

export function listAdminJobs(db: Database.Database, options: AdminJobListOptions = {}) {
  const { query, limit, offset } = page(options);
  const type = String(options.type || '').trim().toUpperCase();
  const status = String(options.status || '').trim().toUpperCase();
  const like = search(query);
  const union = `
    SELECT 'PROVISIONING' AS job_type, id, status, service_id AS resource_id,
           operation_type AS subject, attempt_count, last_error, created_at, updated_at
    FROM provision_operations
    UNION ALL
    SELECT 'OUTBOX', id, status, aggregate_id, event_type, retry_count, last_error, created_at, scheduled_at
    FROM outbox_events
    UNION ALL
    SELECT 'EMAIL', id, status, NULL, template || ' → ' || recipient, attempts, last_error, created_at, scheduled_at
    FROM email_outbox
    UNION ALL
    SELECT 'WEBHOOK', id, status, event_id, event_type, 0, NULL, created_at, coalesce(processed_at, created_at)
    FROM psp_inbox_events
  `;
  const where = `WHERE (? = '' OR job_type = ?) AND (? = '' OR status = ?)
    AND (? = '' OR id LIKE ? ESCAPE '\\' OR coalesce(resource_id, '') LIKE ? ESCAPE '\\'
      OR subject LIKE ? ESCAPE '\\' OR coalesce(last_error, '') LIKE ? ESCAPE '\\')`;
  const args = [type, type, status, status, query, like, like, like, like];
  const jobs = db.prepare(`SELECT * FROM (${union}) ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as any[];
  const total = (db.prepare(`SELECT count(*) AS count FROM (${union}) ${where}`).get(...args) as { count: number }).count;
  return { jobs, total, limit, offset };
}
