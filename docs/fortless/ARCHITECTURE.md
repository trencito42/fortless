# FORTLESS — System Architecture & Reliability Engineering

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Classification:** Core System Architecture  

---

## 1. System Topology & Trust Boundaries

```
                      [ PUBLIC INTERNET ]
                               │
                               ▼
               ┌───────────────────────────────┐
               │    Edge Reverse Proxy / WAF   │ (Nginx / Cloudflare / TLS 1.3)
               │    - Rate Limiting (IP/Token) │
               │    - DDoS Mitigation & HSTS   │
               └───────────────┬───────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
     ┌──────────────────┐            ┌──────────────────┐
     │  Web Application │            │   Core REST API  │
     │  (Next.js App)   │            │   (Node.js / TS) │
     │  - Public Pages  │            │  - Auth & RBAC   │
     │  - Client Portal │            │  - Cart & Quotes │
     │  - Admin Portal  │            │  - Invoicing     │
     └─────────┬────────┘            │  - Webhook Inbox │
               │                     └─────────┬────────┘
               │ (Internal HTTP)               │
               └───────────────────────────────┤
                                               ▼
                              ┌────────────────────────────────┐
                              │     Transactional Storage      │
                              │     - PostgreSQL / SQLite      │
                              │     - Redis (Cache & Queues)   │
                              └────────────────┬───────────────┘
                                               │
                                               ▼
                              ┌────────────────────────────────┐
                              │  Isolated Background Workers   │
                              │  - Outbox Dispatcher           │
                              │  - Provisioning Sagas          │
                              │  - Renewal Scheduler           │
                              │  - Drift Reconciler            │
                              └────────────────┬───────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │ (Strict Outbound Egress / Mutual TLS)         │
                       ▼                                               ▼
        ┌─────────────────────────────┐                 ┌─────────────────────────────┐
        │  Third-Party PSP Gateways   │                 │ Infrastructure Providers    │
        │  - Stripe Sandbox / Live    │                 │ - Pterodactyl 1.x Panel     │
        │  - SCA / 3DS Verification   │                 │ - Wings Nodes (KVM/Docker)  │
        └─────────────────────────────┘                 └─────────────────────────────┘
```

### Trust Boundary Definitions:
1. **Perimeter Untrusted:** Browser clients, web forms, query parameters, URL path variables, unverified cookies, and external incoming webhooks.
2. **Boundary Gateway:** The API layer authenticates principals, validates schemas (Zod/TypeBox), checks tenant membership, and enforces strict authorization.
3. **Internal Core (Trusted):** Domain business logic, database transactions, and the Outbox event queue.
4. **Worker Isolation (Restricted Outbound):** Background workers execute with dedicated, least-privileged API keys. Workers **never** trust cached entitlements; they re-verify database records before dispatching external side effects.
5. **Provider Endpoints (Audited Outbound):** External calls to Pterodactyl, cPanel, or Stripe are governed by timeouts, circuit breakers, and rate limiters.

---

## 2. Invariant Sources of Truth per Domain

To prevent split-brain states and data corruption, every domain concern has exactly **one** authoritative system of record:

| Domain Concern | Authoritative Source | Secondary / Derived Systems |
| :--- | :--- | :--- |
| **Commercial Contract & Pricing** | **Fortless Core Database** | Client UI displays, cached quotes |
| **Payment Status & Card Vault** | **PSP (Stripe / Authorized Gateway)** | Fortless `PaymentAttempt` mirror |
| **Issued Fiscal Invoices** | **Fortless Core Database** | Accounting exports, PDF documents |
| **Service Contract & Renewal Date** | **Fortless Core Database** | Automated cron triggers, notifications |
| **Actual Compute/Runtime State** | **Infrastructure Provider (Pterodactyl/Wings)** | Fortless `observed_state` cache |
| **DNS Record & Zone Authority** | **Cloudflare / Authoritative Nameservers** | Fortless domain dashboard |
| **Email Delivery Logs** | **Transactional Email Gateway (Postmark/SES)** | Fortless notification queue |

---

## 3. Asynchronous Saga Orchestration & Idempotent Pipelines

### 3.1. The Transactional Outbox Pattern
Directly invoking third-party HTTP endpoints inside a database transaction is strictly prohibited. Network delays or timeouts hold database connections open, risking connection pool exhaustion and split-brain rollbacks.

```
[ Client Request ]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│             Single Atomic DB Transaction               │
│                                                        │
│  1. Mutate Domain State (e.g. Order -> PAID)           │
│  2. Insert Outbox Event (e.g. 'order.provision.v1')    │
│     - Payload: { orderId, accountId, serviceSpec }     │
│     - Status: 'PENDING'                                │
│     - IdempotencyKey: 'prov_item_<order_item_id>'      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ (Committed to disk)
┌────────────────────────────────────────────────────────┐
│               Background Outbox Worker                 │
│                                                        │
│  1. Poll / Listen for PENDING outbox events            │
│  2. Acquire row lock (SELECT ... FOR UPDATE SKIP LOCKED)│
│  3. Execute Provisioning Saga with retries & backoff    │
│  4. Mark Outbox event 'COMPLETED' or 'FAILED'          │
└────────────────────────────────────────────────────────┘
```

### 3.2. Webhook Ingestion & The Idempotent Inbox Pattern
External webhooks from PSPs can arrive duplicated, delayed, or out-of-order. Webhook processing follows a two-tier gate:

1. **Gate 1: Signature & Digest Verification:** Validate raw body HMAC signature against the shared secret. If invalid, reject immediately (`400 Bad Request`).
2. **Gate 2: Inbox Persistence (Deduplication):**
   ```sql
   INSERT INTO psp_inbox_events (psp_name, merchant_account, event_id, event_type, payload, status)
   VALUES ('stripe', 'acct_primary', $1, $2, $3, 'RECEIVED')
   ON CONFLICT (psp_name, merchant_account, event_id) DO NOTHING;
   ```
   If the row already exists, return `200 OK` immediately without re-processing.
3. **Gate 3: Semantic State Guard:** Even if event IDs differ (e.g. across PSP retry mechanisms), the worker verifies the internal state machine. A transaction cannot transition from `PAID` to `PAID` twice.

---

## 4. Fault Handling, Timeout Recovery & Reconciliation

### 4.1. The "Unknown Outcome" Rule
When an external HTTP request to a provider (Pterodactyl or Stripe) times out or terminates with a connection reset:
- **Rule:** A timeout is **NOT** a failure. The provider may have successfully provisioned the server or captured the card before the network dropped.
- **Protocol:**
  1. The worker records operation state as `UNKNOWN_OUTCOME`.
  2. The worker initiates a **Discovery / Lookup Query** using a deterministic application tag or correlation ID (`external_id = "fortless_svc_" + service_id`).
  3. If the resource exists on the provider: link external ID, update status to `ACTIVE`.
  4. If the resource does not exist: safely re-dispatch the creation call.
  5. If the lookup returns an error: escalate to `NEEDS_MANUAL_REVIEW`. **Never create a second resource blindly.**

### 4.2. Continuous Drift Reconciliation Engine
A scheduled background reconciler executes every 6 hours to detect discrepancies between Fortless records and provider reality:
1. **Orphan Detection:** Discovers active servers on Pterodactyl that have no active matching service in Fortless. Quarantines and alerts staff.
2. **Ghost Server Detection:** Flags services marked `ACTIVE` in Fortless whose provider instances have been deleted or missing on Wings.
3. **Resource Drift Detection:** Compares assigned RAM, CPU, and disk quotas on provider nodes against the immutable purchased plan snapshot. Automatically corrects drift.
4. **Receivable & Settlement Reconciliation:** Reconciles internal `PAID` invoices against PSP captured payout batches to detect unrecorded chargebacks or settlement discrepancies.

---

## 5. Architecture Decision Records (ADRs)

### ADR-001: Language & Runtime Architecture
- **Context:** Fortless requires high type-safety, rapid asynchronous I/O, robust concurrency control, and shared contracts between frontend and backend.
- **Decision:** Standardize on **TypeScript 5.x** running on **Node.js 24 LTS**.
- **Rationale:** Native TypeScript provides strict compile-time verification across monetary calculations, state machines, and provider payloads. Node.js 24 delivers modern ECMAScript standards, high-throughput async processing, and broad ecosystem support for crypto and networking.

### ADR-002: Modular Monolith vs Microservices
- **Context:** Early-stage distributed microservices introduce operational complexity, network latency, distributed transaction failure modes, and deployment overhead.
- **Decision:** Architect Fortless as a **Modular Monolith** with separated logical domain packages (`identity`, `catalog`, `orders`, `invoicing`, `provisioning`, `audit`) and separate deployment boundaries for Web, API, and Worker processes.
- **Rationale:** Shared database transactions guarantee atomic operations across orders, invoices, and the outbox without two-phase commit overhead. Modules maintain strict interface boundaries, allowing future extraction into standalone microservices if required.

### ADR-003: Authoritative Billing & Invoicing Ownership
- **Context:** Subscription billing can be delegated completely to Stripe Billing or managed locally within Fortless.
- **Decision:** **Fortless is the sole commercial authority.** Fortless generates quotes, calculates taxes, issues sequential invoices, and schedules renewals. Stripe / PSP is used exclusively for payment method vaulting, 3DS challenges, and charge execution.
- **Rationale:** Retaining local subscription and invoice ownership prevents provider lock-in, eliminates double-charge race conditions, allows multi-provider payment routing (e.g., Stripe + PayPal + local bank transfers), and complies with local fiscal invoice numbering laws.

### ADR-004: Invoicing Sequence & Fiscal Document Immutability
- **Context:** Tax regulations in Europe and international jurisdictions mandate that issued invoices cannot be deleted, overwritten, or renumbered.
- **Decision:** All issued invoices receive an immutable, monotonically increasing number derived from an atomic database sequence (`INV-YYYY-XXXXX`). Corrections are executed exclusively via companion **Credit Notes** (`CRN-YYYY-XXXXX`). Draft invoices use separate temporary pro-forma numbers.

### ADR-005: Pterodactyl 1.x Integration Topology
- **Context:** Game server orchestration requires automated server creation, node allocation, and user lifecycle management on Pterodactyl panels.
- **Decision:** Target the official **Pterodactyl 1.x Application API** from secure backend workers. Pterodactyl 2.x support will be implemented as a separate versioned adapter when 2.x reaches GA. The frontend client communicates strictly with the Fortless API proxy, which dispenses short-lived, permission-scoped tokens. Administrative API keys are never exposed to browser clients.

### ADR-006: Outbox & Inbox Reliability Backbone
- **Context:** Intermittent provider outages or database connection interruptions must not result in lost orders or half-provisioned infrastructure.
- **Decision:** Implement the Transactional Outbox pattern for outbound side effects and the Idempotent Inbox pattern for incoming webhooks, backed by PostgreSQL/SQLite transactional persistence and Redis-assisted worker queues.

### ADR-007: Database & ORM Strategy
- **Context:** The application requires strong relational integrity, foreign key constraints, transactional locking (`FOR UPDATE`), and automated migration tracking.
- **Decision:** Utilize an enterprise relational database with a disciplined, migration-based ORM (Prisma / Kysely). SQLite in WAL mode with foreign keys enabled is supported for local isolated development and test suites, with PostgreSQL 16+ as the production target.

### ADR-008: Zero-Trust Multi-Tenancy & Authorization
- **Context:** Multi-tenant SaaS platforms are vulnerable to BOLA/IDOR attacks where users manipulate entity IDs in HTTP requests.
- **Decision:** Enforce server-side authorization at both the API boundary and domain service layers. Every query filters by `accountId`, verified against the authenticated user's active membership. Row-Level Security (RLS) is evaluated as defense-in-depth.
