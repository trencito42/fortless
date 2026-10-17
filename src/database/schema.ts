export const SCHEMA_SQL = `
-- FORTLESS PRODUCTION RELATIONAL SCHEMA
PRAGMA foreign_keys = ON;

-- 1. Identity & Tenancy
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified_at TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  billing_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'LOCKED', 'FLAGGED_FRAUD')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'BILLING_MANAGER', 'TECH_ADMIN', 'VIEWER')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(account_id, user_id)
);

CREATE TABLE IF NOT EXISTS staff_memberships (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'ADMINISTRATOR', 'BILLING', 'SUPPORT', 'INFRASTRUCTURE', 'AUDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REVOKED')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, -- SHA-256 digest of the opaque browser token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  mfa_verified_at TEXT,
  step_up_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY, -- SHA-256 digest; raw token is never persisted
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY, -- SHA-256 digest; raw token is never persisted
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id TEXT PRIMARY KEY,
  identifier_hash TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS mfa_factors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('TOTP')),
  secret_encrypted TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Authenticator app',
  is_confirmed INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(user_id, type)
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS mfa_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS billing_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tax_id TEXT,
  tax_id_type TEXT,
  company_name TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 2. Catalog & Capacity
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('PTERODACTYL', 'CPANEL', 'REGISTRAR', 'VPS')),
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS plan_versions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  resource_specs TEXT NOT NULL, -- JSON: { memoryMb, cpuPct, diskMb, databases, backups }
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(product_id, version)
);

CREATE TABLE IF NOT EXISTS plan_prices (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'EUR',
  interval TEXT NOT NULL CHECK(interval IN ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL')),
  price_minor_units INTEGER NOT NULL CHECK(price_minor_units >= 0),
  setup_fee_minor_units INTEGER NOT NULL DEFAULT 0 CHECK(setup_fee_minor_units >= 0),
  UNIQUE(plan_version_id, currency, interval)
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  provider_instance_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fqdn TEXT NOT NULL,
  max_memory_mb INTEGER NOT NULL,
  allocated_memory_mb INTEGER NOT NULL DEFAULT 0,
  max_disk_mb INTEGER NOT NULL,
  allocated_disk_mb INTEGER NOT NULL DEFAULT 0,
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS capacity_reservations (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
  cart_item_id TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN ('RESERVED', 'CONSUMED', 'RELEASED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS coupon_rules (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value INTEGER NOT NULL CHECK(discount_value > 0),
  max_redemptions INTEGER NOT NULL CHECK(max_redemptions > 0),
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupon_rules(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(coupon_id, account_id)
);

-- 3. Commerce, Quotes, Orders & Payments
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_minor_units INTEGER NOT NULL,
  tax_minor_units INTEGER NOT NULL,
  total_minor_units INTEGER NOT NULL,
  tax_calculation_snapshot TEXT NOT NULL, -- JSON
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CONVERTED', 'EXPIRED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_price_minor_units INTEGER NOT NULL,
  total_minor_units INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN (
    'DRAFT', 'AWAITING_PAYMENT', 'PAID', 'FULFILLING', 'COMPLETED',
    'PARTIALLY_FULFILLED', 'FULFILLMENT_FAILED', 'CANCELED'
  )),
  currency TEXT NOT NULL DEFAULT 'EUR',
  total_minor_units INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  custom_options TEXT NOT NULL DEFAULT '{}', -- JSON: server name, eggId, env vars
  fulfillment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(fulfillment_status IN ('PENDING', 'FULFILLED', 'FAILED')),
  service_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE, -- e.g. 'INV-2026-00001'
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOIDED', 'CREDITED')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  subtotal_minor_units INTEGER NOT NULL,
  tax_minor_units INTEGER NOT NULL,
  total_minor_units INTEGER NOT NULL,
  amount_paid_minor_units INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_minor_units INTEGER NOT NULL,
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  total_minor_units INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  series TEXT PRIMARY KEY,
  current_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  psp_name TEXT NOT NULL DEFAULT 'stripe',
  psp_session_id TEXT,
  psp_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
  amount_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS psp_inbox_events (
  id TEXT PRIMARY KEY,
  psp_name TEXT NOT NULL,
  merchant_account TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  payload TEXT NOT NULL, -- Raw JSON
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED', 'ANOMALY')),
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  UNIQUE(psp_name, merchant_account, event_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  service_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PAST_DUE', 'CANCEL_SCHEDULED', 'CANCELED', 'TERMINATED')),
  billing_interval TEXT NOT NULL CHECK(billing_interval IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  next_renewal_date TEXT NOT NULL,
  renewal_price_minor_units INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  auto_renew INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT NOT NULL REFERENCES payment_attempts(id) ON DELETE RESTRICT,
  amount_minor_units INTEGER NOT NULL CHECK(amount_minor_units > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED', 'SUCCEEDED', 'FAILED')),
  psp_refund_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  credit_note_number TEXT UNIQUE NOT NULL, -- e.g. 'CRN-2026-00001'
  amount_minor_units INTEGER NOT NULL CHECK(amount_minor_units > 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 4. Infrastructure & Provisioning
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  order_item_id TEXT UNIQUE NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('PTERODACTYL', 'CPANEL', 'REGISTRAR', 'VPS')),
  provider_instance_id TEXT NOT NULL,
  external_id TEXT, -- e.g. Pterodactyl Server ID (numeric/UUID)
  identifier TEXT,  -- e.g. Pterodactyl short identifier (8 chars)
  contract_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(contract_status IN ('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'TERMINATED')),
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS service_desired_configs (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  plan_version_id TEXT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
  cpu_limit_pct INTEGER NOT NULL,
  memory_limit_mb INTEGER NOT NULL,
  disk_limit_mb INTEGER NOT NULL,
  startup_command TEXT,
  environment_variables TEXT NOT NULL DEFAULT '{}' -- Encrypted JSON
);

CREATE TABLE IF NOT EXISTS service_observed_states (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  runtime_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(runtime_state IN ('RUNNING', 'STOPPED', 'INSTALLING', 'ERROR', 'OFFLINE', 'UNKNOWN')),
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  raw_metrics TEXT NOT NULL DEFAULT '{}' -- JSON
);

CREATE TABLE IF NOT EXISTS provision_operations (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('CREATE', 'SUSPEND', 'UNSUSPEND', 'RESIZE', 'TERMINATE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'VERIFYING', 'SUCCEEDED', 'NEEDS_MANUAL_REVIEW', 'FAILED')),
  idempotency_key TEXT UNIQUE NOT NULL,
  correlation_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- 5. Operations, Support, Audit & Idempotency
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_staff_internal_note INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('USER', 'STAFF', 'SYSTEM', 'PSP_WEBHOOK')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  ip_address TEXT,
  correlation_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}', -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  response_payload TEXT, -- JSON
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  PRIMARY KEY (account_id, scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL CHECK(template IN ('email_verification', 'password_reset', 'account_invitation', 'security_alert')),
  subject TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

CREATE TABLE IF NOT EXISTS account_invitations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'BILLING_MANAGER', 'TECH_ADMIN', 'VIEWER')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- Indices for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_memberships_status ON staff_memberships(status, role);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_lookup ON auth_login_attempts(identifier_hash, ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_services_account ON services(account_id);
CREATE INDEX IF NOT EXISTS idx_tickets_account ON tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_account ON audit_events(account_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_account_invitations_account ON account_invitations(account_id, email);
`;
