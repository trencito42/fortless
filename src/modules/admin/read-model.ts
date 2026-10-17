import type Database from 'better-sqlite3';

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
