# FORTLESS — Architecture, boundaries and reliability

## Logical topology
Internet -> CDN/WAF/TLS reverse proxy -> web frontend and authenticated API. API talks to PostgreSQL (primary transactional source), Redis queue/cache (nonauthoritative), private object store, payment provider and authentication/email provider. Separately deployed worker pools talk to external infrastructure providers using credentials held in a secret manager; no provider admin token sent to browser. Observability backend, backup storage and operations network separated where practical.

Monorepo bounded contexts: Identity/Organizations, Catalog/Pricing, Orders, Invoicing/Tax, Payments/Reconciliation, Service Contracts, Provisioning/Providers, Support, Content, Notifications, Security/Audit, Operations/Reporting. Cross-context state changes via typed application services plus durable outbox/inbox rather than other modules directly changing tables arbitrarily.

## Source of truth per concern
- Fortless DB: ownership, product version sold, contracted limits, pricing snapshot, invoices, local payment journal, intended service state, approvals, support history.
- PSP: captured/refunded/disputed transaction reality and payment method tokens; never derive trust solely from a browser-provided object.
- Pterodactyl/WHM/VPS/Registrar: actually provisioned resource and operational state. Reconcile Fortless intent with provider-observed reality.
- Email delivery service: attempts and delivery events, not authorization.
- Cloudflare/DNS: actual DNS record truth if integrated. Do not trust a local 'activated' flag as proof of routing.

## State machines and saga orchestration
Checkout state separate from order, invoice, payment, service contract, and provider resource lifecycle. Workers execute saga steps with preconditions, durable outbox, idempotency key, and compensation rather than a single fragile chain. For provisioning: Reserve -> PaidEntitlement -> ProvisionIntent -> ProviderCreate -> Discover/Verify -> LinkExternalResource -> Ready -> Notify. The API may return pending status immediately. Reconciliation inspects stuck operations and external state by stable correlation ID.

## Operational quality requirements
- All POSTs causing paid or destructive effects carry a scoped idempotency key; unique DB constraints enforce at-most-once logical effect where possible.
- No blind retries when external side effect uncertain. Outcome UNKNOWN prompts lookup and then retry/manual review; never assume failure from timeout.
- Workers have lease/heartbeat and recover after crash. Dead-letter queue and admin re-drive preserve trace and original operation ID.
- Timeouts, retries, backoff, circuit breakers, provider-specific rate limits, separately tunable budgets; graceful degradation for stale provider health.
- Provider errors classified transient/permanent/ambiguous, with normalized display safe for customers and full redacted diagnostics for staff.
- All events include correlationID, accountID when permitted, operationID, causationID, no PII leakage in traces.
- Maintenance and reconciliation processes compare local service subscriptions vs provider resources, orphan servers vs DB, unpaid entitlements vs active servers, missing invoices, unexpected resource limit drift, network allocations, renewal due counts, refund divergence.
- Periodic reports: paid-unfulfilled aging; provision operations stuck; payment PSP mismatch; invoice issuance gaps; unauthorized active provider service; expiring domains; imminent node saturation; failed backups.

## Infrastructure and deployment
Use staging and production isolation across DB, queues, PSP merchant/environment, provider nodes, DNS, email. Versioned and reviewed migrations, forward-only where possible, additive schema changes for rolling deployments, backup before risky migrations. No shared root accounts. Worker secrets should access only required external APIs. Disable staging outgoing customer mail and production billing. Pinned base images/lockfiles, no privileged containers or mounting Docker socket in main app. Restrict DB/Redis to internal network, permit-list outbound API provider connections. Encryption in transit, backups and sensitive data. TLS cert renewal monitoring, SPF/DKIM/DMARC for email. S3 uploads signed and time-limited; malware scan and limits.

## HA, backups and disaster recovery
Define RPO/RTO business objectives before launch. Automated off-host encrypted backup for PostgreSQL (PITR if feasible), private objects, key material with separate backup policy, infra config and non-secret environment templates. Test restore into isolated staging, verify financial references/provider mappings, document exact procedure. Restore after service mutations can create drift: run read-only reconciliation first, gate provisioning/termination until reviewed. Keep audit/financial retention and deletion policies compliant with legal advice.

## Decision log templates
Create ADRs for: (1) backend framework and monorepo, (2) payment authority, (3) invoice numbering and local tax rules, (4) Pterodactyl supported version, (5) provider reconciliation strategy, (6) integrated console vs official external panel, (7) multi-account membership baseline, (8) wallet avoidance, (9) audit retention, (10) hosting jurisdiction/provider.

## Documentation and review requirements
Each module describes inputs, outputs, trust assumptions, state machine, invariants, persistence, retries, errors, recovery and observability. Architecture diagrams must be consistent with real code. Keep OpenAPI schema checked against runtime request validation. Maintain runbooks for PSP downtime, provider downtime, accidental duplicate service, compromised staff account, chargeback, server data loss, database restore, leaked provider token, ransomware and invoice numbering anomaly.
