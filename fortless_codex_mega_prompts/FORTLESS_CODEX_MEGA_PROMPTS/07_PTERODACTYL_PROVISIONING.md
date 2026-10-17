# PHASE 7 — REAL PTERODACTYL STAGING PROVIDER AND SAFE PROVISIONING

You are implementing real Fortless infrastructure management against a user-approved **staging Pterodactyl panel**. Read `00_GLOBAL_CONTRACT.md`, Phase 6 payment state machine, `src/modules/provisioning/adapter.ts`, `src/modules/outbox/worker.ts`, provider model, and current official Pterodactyl Application API and Client API docs for the explicitly pinned tested panel version. No operation on the owner's production Pterodactyl or customer servers without separate explicit authorization.

## Architecture and boundaries

- Extend provider adapter with real HTTP client, scoped and rotated secrets, request deadlines, retry classification, status reconciliation and capability discovery; do not rely on `MockPterodactylAdapter` outside isolated tests.
- Use Application API only server-to-server with least privileges and isolated credential storage. Use Client API/proxy for customer-level operations only after server-side account->service->provider mapping and permission check. Do not leak provider application/client API keys, tokens, node allocation internals or privileged Wings access to browsers.
- Separate `providerInstanceId`, `providerServerId`, human-safe identifier, account owner, panel user identity and persistent correlation tag/external reference. Never infer ownership from arbitrary client-provided server ID.
- Identify the panel version, nodes, node allocations, egg/nest IDs, Docker image constraints, verified environment schema, backups/database quotas, storage/memory/CPU and data region. Validate every field against server-owned allowlists and current plan snapshot.

## Secure purchase-to-deployment saga

1. An invoice is marked authoritatively settled; a unique entitlement/service operation is created atomically with order item and outbox event.
2. Queue worker reserves capacity and valid available allocation transactionally, selects approved staging node, records correlation tag, operator, intended resources and operation intent.
3. Ensure provider user exists or create/map by unique externally bound ID; never use customer email as sole remote ownership proof.
4. Create server with correct egg, start command from allowlist, validated images/env/resource limits. Guard any configuration settings allowing arbitrary code/mount privilege escalation; this is paid hosting isolation, not local trusted scripts.
5. After remote success, read back server by stable ID / correlation tag, verify actual requested limits, install status, ownership and allocation. Only then move technical state to ready/active; don't equate process RUNNING with successful install.
6. Issue customer notifications and expose only permitted control-panel paths. Store no arbitrary startup secrets in plaintext; redact env vars in logs, encrypt if needed.
7. On timeout (unknown outcome), **reconcile by correlation**, do not blindly retry create. If API cannot prove outcome, mark `NEEDS_MANUAL_REVIEW`, alert staff and avoid duplicate resources.
8. If no node capacity, missing allocation, wrong egg or provider outage, mark fulfillment pending/review, preserve paid order and route to approved refund/alternate region decision; do not fabricate `ACTIVE`.

## Recoverable operation engine

- Durable job leases, heartbeat, backoff, max attempts, dead-letter, admin retry with step-up and idempotency, immutable audit history, per-service locks.
- Actions: start/stop/restart/kill, rename, startup option changes, backups/list/download/restore/delete with strict permissions, files/console/logs, database credentials and rotations, allocation/port management, rebuild/reinstall, resource upgrade/downgrade, suspend/unsuspend, migration, terminate.
- Classify each action as safe, high risk, or destructive; require recent auth and explicit typed confirmation where appropriate. `terminate` must honor retention/refund/billing policy; account delinquency usually suspends, not destructive deletion.
- For console/file manager real-time interface, design session-scoped proxy tokens or short-lived scoped credentials with server-side membership checks and expiry; WebSocket auth validated at handshake and periodically on revocation; path traversal prevention, upload limits and malicious file scanning policy.
- Track `commercial_status`, `desired_config`, `provider_observed_state`, `last_checked_at`, `provider_error` separately. Poll or subscribe to authorized health metrics, mark STALE/UNKNOWN when provider unreachable, not ONLINE by default.
- Capacity pressure/drift monitors and reconciliation sweeps for orphan Pterodactyl servers, deleted remote resources, wrong quotas, suspended state divergence, provider user mismatch and outbox lag. Admin remediation must never silently create a new billable entitlement.

## Tenant/role safety

Customer `OWNER`/`TECH_ADMIN` may act on own technical services, `BILLING_MANAGER` may pay/manage subscriptions without console secrets, `VIEWER` only view allowed metadata. Staff `SUPPORT` is not implicitly infrastructure root; `INFRASTRUCTURE` scoped operations with audit; independent RBAC enforcement on every API route. Prevent IDOR via guessed provider server identifier, node ID, backup ID, allocation, database ID and file path.

## Required tests (staging and fault injection)

- Authorized verified settled test order -> exactly one real staging server with exact CPU/RAM/disk/egg/region, persisted association, customer can see/control it.
- Unpaid/pending/forged test order -> zero provider calls; provider test credential accidentally used in production config -> fail closed.
- Timeout after server actually created -> retry finds same remote resource, no duplicate and no extra port allocation.
- Worker crash before/after API create and before/after DB commit; two workers race; stale `PROCESSING` recovered through lease.
- Failing node/insufficient capacity/invalid egg/slow install/remote 403/429/5xx/wrong observed resource -> explicit recoverable state; no billed but invisible service.
- Cross-tenant power, console WebSocket, file access, backups, env values and DB access denied; staff role matrix.
- Power action after suspension or cancellation fails; recently revoked team member loses WebSocket/API access.
- Destructive termination requires confirmation, authorized policy, outbox operation and audit; repeated deletion cannot delete someone else's server.
- Reconcile orphan resources/drift without overwriting real customer entitlements.

## Deliverables

Official staging adapter + integration/contract tests, real service and admin UI, capacity+allocation management, queue recovery, runbooks, fault injection evidence and honest capability status. **Keep live provider disabled until approved production credentials plus rollout plan are provided**. Do not overclaim protection from DDoS or backup guarantees without real infrastructure support.
