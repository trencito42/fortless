# FORTLESS — Logical data model and invariants

## Model groups
**Identity**: users, credentials, identities, verified_emails, sessions, mfa_factors, account_security_events, organizations/accounts, account_memberships, roles, role_permissions, scoped_api_tokens, billing_profiles, contact_preferences.
**Catalog**: categories, products, plan_versions, plan_prices, product_options, option_values, plan_addons, provider_mappings, regions, nodes, capacity_pools, capacity_reservations, coupon_rules, coupon_redemptions, tax_codes.
**Commerce**: carts, cart_items, quotes, quote_lines, orders, order_items, invoices, invoice_lines, invoice_series, payment_attempts, payment_transactions, PSP_inbox_events, subscriptions, renewal_periods, refunds, credit_notes, disputes, finance_journal_entries, account_credit_journal (only when enabled), reconciliation_runs and reconciliation_diffs.
**Technical**: services, service_desired_config, service_observed_state, lifecycle_events, provider_instances, provider_external_mappings, provision_operations, job_attempts, allocations, usage_samples, backups_metadata, domains, domain_contacts, domain_operations, server_access_grants.
**Operations**: tickets, ticket_messages, ticket_attachments, ticket_assignments, internal_notes, notices, incidents, maintenance_windows, notification_templates, notification_outbox, delivery_attempts, content_entries, revisions, audit_events, approvals, idempotency_records, outbox_events, feature_flags, secrets_metadata.

## Data types and constraints
- Database timezone UTC. Store timestamps as timestamptz and billing/calendar policy and customer display timezone separately. Avoid relying on server local clock for invoice due calculations.
- Financial values exact decimal or integer minor units and explicit ISO currency; use currency-specific exponents and rounding policy, integer overflow checks. Never NaN/Infinity, never float.
- Products/plans/prices referenced by immutable version snapshots on order item and subscription; historical data survives catalog edits.
- `service.order_item_id` unique where the contract is one service per item. For quantities >1, create per-unit fulfillment items explicitly.
- Unique `(provider_instance_id, provider_external_id)` and stable app-generated external_id used for safe discovery after timeout.
- Unique `(psp_name, merchant_account, psp_event_id)` in inbox, unique `(psp_name, merchant_account, payment_external_id, event_semantics)` for local transaction state where relevant. Use database lock and semantic dedupe for concurrent events.
- Unique `(account_id, command_type, idempotency_key)` with validated request hash and expiration policy; mismatched body with reused key fails, not returns unrelated result.
- Invoice number unique `(issuing_entity_id, series, document_number)`; issued invoices immutable, void/credit/adjust with lawful companion documents. Sequence locked transactionally. Draft numbers separate if appropriate.
- Coupon max-redemptions atomically checked and reserved/consumed on definitive order/paid transition per chosen policy; refunded orders and coupon restoration follow an explicit rule.
- `service.owner_account_id`, invoice, order, ticket and domain ownership are mandatory and immutable except explicit audited transfer workflow.
- Audit records append only, protected from app-level customer edits, with actor/system, session, action, object, prior/after redacted metadata, reason, approver, time and correlationID. Security-sensitive records stored in separately restricted infrastructure.
- For soft-delete, enforce no automatic PII erasure where retention rules demand lawful preservation. Export/deletion process identifies legal holds and obligations.

## State machines
**Quote**: OPEN -> EXPIRED / CONVERTED / CANCELED.
**Order**: DRAFT -> AWAITING_PAYMENT -> PAID -> FULFILLING -> COMPLETED / PARTIALLY_FULFILLED / FULFILLMENT_FAILED; EXPIRED and CANCELED branches with explicit guards.
**PaymentAttempt**: CREATED -> REQUIRES_ACTION / PROCESSING -> SUCCEEDED / FAILED / CANCELED; subsequent refund/dispute in separate entities and derived view.
**Invoice**: DRAFT -> ISSUED -> OPEN / PAID / PARTIALLY_PAID / OVERDUE / VOIDED (where permitted) / CREDITED (with credit notes). Correctness matters more than enum convenience.
**Subscription**: PENDING -> ACTIVE -> PAST_DUE / CANCEL_SCHEDULED -> CANCELED / TERMINATED, with domain-specific rules.
**Service**: REQUESTED -> PROVISIONING -> ACTIVE / DEGRADED / FAILED / SUSPENDED -> TERMINATION_PENDING -> TERMINATED. Technical observed state independent (RUNNING, STOPPED, UNKNOWN etc.).
**ProvisionOperation**: PENDING -> IN_PROGRESS -> VERIFYING / RETRY_WAIT / UNKNOWN_OUTCOME -> SUCCEEDED / NEEDS_MANUAL_REVIEW / PERMANENT_FAILURE.
**Refund**: REQUESTED -> APPROVAL_REQUIRED / PSP_PENDING -> SUCCEEDED / FAILED; financial credit note and service entitlement effect independent.
**Domain**: SEARCHED (non-binding) -> ORDERED -> REGISTRATION_PENDING -> REGISTERED -> EXPIRED / REDEMPTION / TRANSFER_PENDING / TRANSFERRED / FAILED per TLD/provider.

## Required DB transactional operations
A. Quote-to-order snapshot is atomic; no invalid or stale quote can become new priced order invisibly.
B. Checkout attempt uses idempotency and DB unique constraints; two parallel requests do not create two logical purchases.
C. Verified PSP event entry and queued processing intent committed atomically before ACK; stale/conflicting events held for reconciliation.
D. When marking paid, ensure invoice and transaction ledger update in one DB transaction; outbox creation coupled to entitlement grant.
E. Service reservation and provisioning intent committed together; external provider call outside DB transaction; result linkage in next transaction.
F. Renewal process enforces one invoice for service contract + billing period, irrespective of concurrent workers or repeated schedules.
G. Refund ensures PSP confirmation and financial journal/credit note synchronization through recoverable saga; never silently mark refunded before PSP final confirmation.
H. Coupon redemption updates under lock against max uses.
I. Staff high-risk action approval binds amount/object/version and expires; cannot approve own critical action where separation-of-duties required.

## Seed/test fixtures
At least two independent accounts with multiple users and different roles, one staff support user, one finance staff, two provider instances, intentionally undercapacity region, three products/plan versions, a fake PSP with delayed/out-of-order/duplicate events, fake Pterodactyl side effects that can time out AFTER creation, one issued invoice and one refund/dispute.

## Migration rules
No direct production schema edits, no automatic forced migration at public API startup, backup before dangerous migration, reversible release strategy and safety review for destructive changes. Document data backfill and concurrency strategy. Production indexes for owner+status+date and unique external identities, no huge unindexed search endpoint.
