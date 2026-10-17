# PHASE 2 — INFRASTRUCTURE, DATABASE, RELIABLE JOBS AND CI

You are implementing a production-capable backend foundation for the existing Fortless app. Read `00_GLOBAL_CONTRACT.md` and the audit. Preserve existing UI and correct business invariants; no blanket rewrite.

### A. Database architecture

- Make a decision record comparing SQLite dev-only, production PostgreSQL and coexistence. Prefer PostgreSQL in production for multi-worker concurrency, row locking and durable service/payment history. Do not simply translate SQL syntax and assume same transaction semantics.
- Create versioned, repeatable, ordered migrations with checksums; migration runner must be separate from public API startup and must not run automatically on every request or process boot. Use backup/restore rehearsal and documented rollback/roll-forward.
- Review account/user/membership/staff boundary; add correct uniqueness, FKs and indexes for orders, monetary events, PSP identifiers, invoice sequences, service relations, reservation constraints, idempotency keys and outbox leases.
- Migrate existing actual data via staged export/transform/import/reconciliation, preserving IDs and historical entitlements. Tests must cover verification of row counts, relationships, balances, roles and known legacy inconsistencies. Run against snapshot first.
- Keep test environment deterministic, ephemeral and isolated. Data seeding must not create live users, staff owners, paid invoices or active servers by default.

### B. Jobs, concurrency and recovery

- Separate HTTP/API from worker runtime. Design durable queue backed by PostgreSQL outbox and optional Redis/BullMQ transport; queue transport must not be the sole authoritative event record.
- Lease jobs atomically with owner/lease expiration/heartbeat and bounded retries; recover `PROCESSING` after crash; add backoff+jitter, poison-message handling, dead letter, manual replay controls and audit.
- Integrate monotonic/idempotent state transitions for provider operations, emails, invoice documents, billing settlement and renewals.
- Implement correlation IDs and one operation per resource+action, with transactional persistence and explicit lifecycle; unknown external result => reconcile, not blind retry.
- Include contention tests with two workers and process-kill simulation; prove only one successful fulfillment and eventual lease recovery.

### C. Configuration and secrets

- No hardcoded live credentials; type-checked environment schema, clean dev/test/sandbox/prod separation, fail-closed mode capabilities, signed/key-rotation runbooks.
- Enforce loopback bind behind Nginx/Caddy or explicitly documented safe network topology. Resolve `src/index.ts` host binding mismatch.
- Restrict CORS origins, secure cookies, CSRF, trusted proxy headers, request size and API payload limits. Protect health metrics from leaking secrets.
- Store provider keys and encryption material outside repo; ensure runtime file permissions, backups encrypted, least-privileged service accounts.

### D. Quality gates and operational telemetry

- Add GitHub Actions CI with pinned Node LTS, lint/typecheck, tests, migration check, dependency audit, secret scanner, build artifact and browser smoke. CI must not require production secrets or use external live billing.
- Add structured security-conscious logs and request/job correlation IDs; metrics for HTTP error rate, queue age, worker stale locks, DB errors, checkout anomalies, provisioning failures, webhook backlog; alert routes and on-call runbook.
- Define Docker/Compose for local PostgreSQL/Redis/staging and deployment manifests as appropriate; network isolation and health/readiness endpoints.
- Build safe release mechanisms: migrations separate, release health checks, rollback protocol, backup/restore exercise, migration compatibility window, uptime probes, disk thresholds and connection pool bounds.

### Tests

- Two simultaneous checkouts try to consume same capacity/quote; only one valid reservation.
- Two concurrent workers see one outbox event; only one claims it.
- Worker killed at claim, after provider request, after DB write, during retry, at shutdown; recovery with zero duplicates.
- Restart with active sessions/MFA secrets: sessions/key state stable.
- DB migration from real *snapshot* preserves identities, roles, orders, invoices and tickets; isolate customer data.
- Cookie/CORS/CSRF/proxy spoof/localhost bind tests.

### Deliverables and gate

Working local+CI infrastructure, explicit DB migration plan/implementation, worker service, tests, monitoring foundation, update `docs/REALITY_MATRIX.md` and runbooks. Do not delete original SQLite before approved migration and verified backup. Do not enable payments or production provider mutations. Report actual commands and evidence.
