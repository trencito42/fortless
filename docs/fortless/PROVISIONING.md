# FORTLESS — Infrastructure Provisioning & Provider Integrations

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Classification:** Infrastructure Orchestration & Driver Specification  

---

## 1. Unified Provider Adapter Interface

All infrastructure providers (Pterodactyl, cPanel/WHM, Domain Registrars, Cloud Hypervisors) implement a strictly typed, standard provider contract. No controller or service speaks directly to proprietary vendor SDKs.

```typescript
export interface ProviderAdapter {
  readonly providerType: 'PTERODACTYL' | 'CPANEL' | 'REGISTRAR' | 'VPS';
  readonly version: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;

  // Capacity & Pre-flight
  validateConfig(config: unknown): Promise<Result<void, ValidationError>>;
  checkCapacity(planSpec: PlanResourceSpec, regionId: string): Promise<Result<CapacityReport, ProviderError>>;
  reserveCapacity(reservationId: string, planSpec: PlanResourceSpec, regionId: string): Promise<Result<void, ProviderError>>;
  releaseCapacity(reservationId: string): Promise<Result<void, ProviderError>>;

  // Lifecycle Orchestration
  provision(operationId: string, spec: ProvisioningSpec): Promise<Result<ProvisionResult, ProviderError>>;
  lookupByExternalId(externalId: string): Promise<Result<ObservedResource | null, ProviderError>>;
  lookupByCorrelationTag(correlationTag: string): Promise<Result<ObservedResource | null, ProviderError>>;
  observe(externalId: string): Promise<Result<ObservedResource, ProviderError>>;

  // Operations
  powerAction(externalId: string, action: 'START' | 'STOP' | 'RESTART' | 'KILL'): Promise<Result<void, ProviderError>>;
  suspend(externalId: string, reason: string): Promise<Result<void, ProviderError>>;
  unsuspend(externalId: string): Promise<Result<void, ProviderError>>;
  resize(externalId: string, newLimits: PlanResourceSpec): Promise<Result<void, ProviderError>>;
  reinstall(externalId: string): Promise<Result<void, ProviderError>>;
  createBackup(externalId: string): Promise<Result<BackupResult, ProviderError>>;
  restoreBackup(externalId: string, backupId: string): Promise<Result<void, ProviderError>>;
  terminate(externalId: string): Promise<Result<void, ProviderError>>;
}
```

### Provider Error Classification Hierarchy:
- `RETRYABLE_TRANSIENT`: Network blip, 502/503/504, connection reset. Retry with exponential backoff + jitter.
- `RATE_LIMITED`: Provider 429. Back off according to `Retry-After` header.
- `CAPACITY_EXHAUSTED`: Target node or region out of allocatable RAM, disk, or IP ports. Fail closed, alert operator.
- `VALIDATION_ERROR`: Invalid environment variable or corrupted egg JSON. Reject, require staff review.
- `UNKNOWN_OUTCOME`: Timeout after request dispatched. **Do not retry creation blindly; invoke lookup.**
- `PERMANENT_AUTH_ERROR`: Bad provider API token or unauthorized IP. Circuit-break, alert immediately.

---

## 2. The Canonical Provisioning Saga

```
[ Outbox Event: 'service.provision.v1' ]
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 1. Eligibility & Pre-condition Verification            │
│    - Verify Order is PAID                              │
│    - Verify Service is in REQUESTED / PENDING state    │
│    - Check tenant authorization & fraud flags          │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 2. Worker Concurrency Lock & Idempotency Key           │
│    - Acquire row-level lock on `provision_operations`  │
│    - Generate deterministic correlation ID:            │
│      tag = "fortless_svc_" + service_id                │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 3. Pre-flight Lookup (Check if already exists)         │
│    - Query provider by correlation tag                 │
│    - If exists: skip to Step 6 (Self-healing recovery) │
└──────────────────┬─────────────────────────────────────┘
                   │ (Not found)
                   ▼
┌────────────────────────────────────────────────────────┐
│ 4. Provider API Call (Pterodactyl Application API)     │
│    - Create User (if first service for account)        │
│    - Allocate Node & Free Port Allocation              │
│    - POST /api/application/servers                     │
│    - Timeout: 15 seconds                               │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ├──► TIMEOUT / NETWORK ERROR ─────────┐
                   │                                     ▼
                   │                  ┌──────────────────────────────────────┐
                   │                  │ 4a. Timeout Recovery Saga            │
                   │                  │     - Wait 5 seconds                 │
                   │                  │     - Lookup by correlation tag      │
                   │                  │     - If found: continue to Step 6   │
                   │                  │     - If not found: retry creation   │
                   │                  │     - If still ambiguous: quarantine │
                   │                  │       into `NEEDS_MANUAL_REVIEW`     │
                   │                  └──────────────────────────────────────┘
                   ▼
┌────────────────────────────────────────────────────────┐
│ 5. Response Linkage & Persistence                      │
│    - Extract `server_id`, `uuid`, `identifier`         │
│    - Store in `services` table                         │
│    - Record initial `service_observed_states`          │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 6. Polling Installation Progress                       │
│    - Pterodactyl 201 Created != Ready to use           │
│    - Poll `container.installed === 1` (max 5 minutes)  │
│    - When ready: transition Service to ACTIVE          │
│    - Transition OrderItem to FULFILLED                 │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ 7. Finalization & Customer Notification                │
│    - Enqueue 'service.ready.v1' notification           │
│    - Release temporary capacity reservation            │
│    - Append immutable Audit Log                        │
└────────────────────────────────────────────────────────┘
```

---

## 3. Pterodactyl 1.x Deep Integration Specification

### 3.1. API Boundary Separation
- **Application API (Administrative):**
  - **Endpoint:** `https://panel.example.com/api/application/`
  - **Usage:** Server creation, node management, user creation, resource limit adjustments, server deletion.
  - **Security:** Secret key stored in backend environment variables. **Never sent to frontend or public client.**
- **Client API (User Operations):**
  - **Endpoint:** `https://panel.example.com/api/client/`
  - **Usage:** Power toggles (start/stop/restart), file browsing, console streams, backups.
  - **Security:** Scoped API credentials or Fortless server-side reverse proxy with short-lived tokens.

### 3.2. Mandatory Security Guards for Game & Bot Containers
1. **Safe Egg Allowlists:** Only eggs reviewed and approved in the Fortless catalog can be deployed. Customers cannot supply arbitrary Docker images with root privileges or raw host volume mounts.
2. **Environment Variable Sanitization:** Custom startup parameters are strictly validated against regex schemas to prevent command injection into startup bash scripts.
3. **Dedicated Port Allocation:** Port allocations are reserved transactionally; customers cannot claim arbitrary ports belonging to other tenants.
4. **Console & Log Sanitization:** Terminal logs streamed to the frontend are stripped of dangerous escape sequences and ANSI terminal injection attacks.

---

## 4. Operational Reconciliation & Orphan Server Detection

A background reconciler runs every 6 hours to protect against infrastructure drift and orphaned costs:

1. **Orphan Discovery:** Scans all servers in the Pterodactyl panel. If a server has an external tag `fortless_svc_...` but the corresponding Fortless service is `TERMINATED` or absent, the server is flagged for quarantine.
2. **Missing Server Discovery:** If a Fortless service is marked `ACTIVE` but Pterodactyl returns `404 Not Found`, the service is moved to `DEGRADED_UNREACHABLE` with an urgent alert to infrastructure staff.
3. **Resource Drift Rectification:** If a customer's RAM limit in Pterodactyl is modified outside Fortless (e.g., changed from 4GB to 16GB), the reconciler resets the limits to the authoritative plan snapshot.

---

## 5. Future Provider Adapters Roadmap

| Provider Type | Target Vendor | API Mechanism | Status |
| :--- | :--- | :--- | :--- |
| **Pterodactyl 1.x** | Pterodactyl Panel / Wings | REST Application API + Client API | **P0 Implementation** |
| **cPanel / WHM** | cPanel & WHM 120+ | WHM UAPI / JSON-API via Reseller Token | **P1 Planned** |
| **Domain Registrar** | Reseller API (OpenSRS/Namecheap) | XML/JSON Reseller EPP Gateway | **P1 Planned** |
| **Node.js Managed** | Docker + Traefik Proxy | Custom Orchestrator + ACME TLS | **P1 Planned** |
| **Cloud VPS** | Proxmox VE 8.x / KVM | Proxmox Authenticated REST API | **P2 Planned** |
| **Managed Databases**| PostgreSQL / Redis Containers | Internal Orchestrator with Quotas | **P2 Planned** |
