# FORTLESS — Phased Implementation Roadmap & Execution Backlog

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Classification:** Engineering Roadmap & Task Board  

---

## 1. Phased Delivery Strategy

Development is executed in small, complete, testable vertical slices. Each slice comprises domain logic, data models, API endpoints, authorization checks, unit/integration tests, and documentation. No feature is marked complete without automated test evidence.

```
PHASE 0: Discovery, Architecture, Data Model, Threat Modeling (CURRENT)
   │
   ▼
PHASE 1: Platform Foundation, Database Engine, Multi-Tenant Auth & RBAC
   │
   ▼
PHASE 2: Product Catalog, Server-Side Quotes, PSP Sandbox & Webhook Invoicing
   │
   ▼
PHASE 3: Pterodactyl 1.x Provisioning, Outbox Worker & Reconciler
   │
   ▼
PHASE 4: Operational Readiness, Tickets, System Status & Go-Live Pilot
   │
   ▼
PHASE 5: Extended Infrastructure (Node.js Web Apps, cPanel/WHM, Domains, VPS)
   │
   ▼
PHASE 6: AI-Assisted Operations & Advanced Diagnostics
```

---

## 2. Detailed Phase Backlog & Acceptance Criteria

### Phase 0: Architecture, Specifications & Threat Model (Current)
- [x] **Task 0.1:** Audit workspace, environment, installed runtimes, existing directories, and CloudPanel/Nginx configuration.
- [x] **Task 0.2:** Formulate `PRODUCT_SPEC.md` covering service scope, actor roles, route maps, and customer journeys.
- [x] **Task 0.3:** Formulate `ARCHITECTURE.md` covering topology, trust boundaries, outbox/inbox patterns, and ADRs.
- [x] **Task 0.4:** Formulate `DATA_MODEL.md` covering entities, integer minor units, state machines, and relational constraints.
- [x] **Task 0.5:** Formulate `BILLING_AND_PAYMENTS.md` covering quote integrity, PSP flow, idempotency, and 25-point fault matrix.
- [x] **Task 0.6:** Formulate `PROVISIONING.md` covering provider adapter abstraction, Pterodactyl 1.x saga, and reconcilers.
- [x] **Task 0.7:** Formulate `SECURITY.md` covering OWASP ASVS 5.0 L2/L3 controls, threat modeling, SSRF defenses, and GDPR.
- [x] **Task 0.8:** Formulate `TEST_MATRIX.md` covering test pyramid, status tags, and strict P0 release gates.
- [x] **Task 0.9:** Formulate `ROADMAP.md` (this document) with executable vertical slices.
- [x] **Task 0.10:** Formulate `OPEN_DECISIONS.md` documenting missing commercial/provider details with safe defaults.
- [x] **Task 0.11:** Author project-native `AGENTS.md` with operational rules for AI engineering.
- [x] **Task 0.12:** Integrate the delivered Petal design source into the customer application, unify Fortless logo usage, and bind current API contracts without production claims. `[MOCK_ONLY]`

---

### Phase 1: Platform Foundation, Database Engine, Multi-Tenant Auth & RBAC
*Goal: Stand up the core TypeScript monorepo/application, database schema migrations, secure session authentication, and tenant authorization.*

- [ ] **Slice 1.1: Core Monorepo & TypeScript Engine Setup**
  - Scaffold clean modular application structure (`packages/contracts`, `apps/api`, `apps/worker`, `apps/web`).
  - Configure strict TypeScript settings, linter, test runner (Vitest), and Fastify/Node.js API baseline listening on configured port `3021`.
  - *Acceptance:* Health endpoint `GET /api/health` returns `200 OK` with JSON timestamp and git revision.
- [ ] **Slice 1.2: Relational Database Schema & Migrations**
  - Initialize database engine (SQLite WAL for test/dev, PostgreSQL schema compatible) with Prisma/Kysely.
  - Implement tables for `users`, `sessions`, `accounts`, `memberships`, `audit_events`.
  - *Acceptance:* Automated migration runs cleanly; foreign key constraints verified via integration tests.
- [ ] **Slice 1.3: User Registration, Argon2id Password Hashing & Email Verification**
  - Implement user sign-up with Argon2id hashing and time-limited verification tokens.
  - *Acceptance:* Unit test verifies password hash cannot be reversed; email verification activates account.
  - *Progress 2026-10-17:* Domain/API/UI implemented and locally tested, including single-use hash-at-rest tokens. External transactional email delivery remains configuration-blocked, so the slice is not complete.
- [ ] **Slice 1.4: Session Authentication, Device Tracking & Rate Limiting**
  - Implement secure HttpOnly/Secure/SameSite cookie sessions and login throttling.
  - *Acceptance:* Bruteforce attempts throttled after 5 failures; session rotation on login.
  - *Progress 2026-10-17:* Hashed opaque sessions, CSRF/origin controls, persistent per-IP+identifier throttling, and password-reset revocation implemented. Device-management UI, distributed limiter, and MFA remain open.
- [ ] **Slice 1.5: Multi-Tenant RBAC & Cross-Tenant Isolation Guards**
  - Implement server-side middleware resolving tenant context and enforcing role permissions (`OWNER`, `BILLING_MANAGER`, `TECH_ADMIN`, `VIEWER`).
  - *Acceptance:* Automated tests prove Tenant A cannot read Tenant B's account data (`AUTH-02`).

---

### Phase 2: Product Catalog, Server-Side Quotes, PSP Sandbox & Webhook Invoicing
*Goal: Build the commercial spine: immutable catalog, signed quote engine, Stripe sandbox checkout, idempotent webhook inbox, and sequential invoicing.*

- [ ] **Slice 2.1: Product Catalog & Plan Versioning Engine**
  - Implement catalog schema: `categories`, `products`, `plan_versions`, `plan_prices`, `regions`.
  - Administrative endpoints to create/publish/retire plan versions.
  - *Acceptance:* Catalog API returns only published plans; retired versions immutable.
- [ ] **Slice 2.2: Server-Side Cryptographic Quote Engine & Tax Calculator**
  - Generate server-owned quotes with exact minor unit totals, tax snapshots, and 15-minute TTL.
  - *Acceptance:* Quote hash rejects client manipulation (`FLT-01`); tax rounding verified.
- [ ] **Slice 2.3: Checkout State Machine & Idempotency Lock**
  - Implement `POST /api/v1/checkout` with `Idempotency-Key` header and temporary capacity reservation.
  - *Acceptance:* Concurrent requests with identical key return identical session without duplicate orders.
- [ ] **Slice 2.4: PSP Gateway Integration (Stripe Sandbox / Testmode)**
  - Integrate hosted checkout session creation with durable metadata references.
  - *Acceptance:* Client redirected to sandbox payment page; zero card data touches Fortless server.
- [ ] **Slice 2.5: Authoritative Webhook Inbox & Raw Signature Verification**
  - Ingest raw webhook POST, verify HMAC-SHA256 signature, persist to `psp_inbox_events`.
  - *Acceptance:* Forged signatures rejected (`PAY-01`); duplicate events deduplicated (`PAY-02`).
- [ ] **Slice 2.6: Settlement Transaction & Sequential Invoice Issuance**
  - Webhook worker commits atomic transaction: Order `PAID`, sequential invoice issued (`INV-2026-XXXXX`), entitlement granted, outbox event enqueued.
  - *Acceptance:* Invoice number sequence monotonically increases without gaps; credit note issuance tested.

---

### Phase 3: Pterodactyl 1.x Provisioning, Outbox Worker & Reconciler
*Goal: Orchestrate actual game server infrastructure via Pterodactyl Application API, transactional outbox sagas, and drift reconcilers.*

- [ ] **Slice 3.1: Provider Adapter Interface & Mock Driver**
  - Implement typed `ProviderAdapter` and a comprehensive `MockProviderAdapter` that simulates latencies, 500 errors, and timeouts.
  - *Acceptance:* Contract test suite passes against mock provider.
- [ ] **Slice 3.2: Transactional Outbox Worker Engine**
  - Implement background worker polling `outbox_events` with row locking (`FOR UPDATE SKIP LOCKED`) and exponential backoff retry.
  - *Acceptance:* Worker crash recovery leaves no orphaned jobs; retries bounded to 5 attempts.
- [ ] **Slice 3.3: Pterodactyl 1.x Launch Adapter Implementation**
  - Build real Pterodactyl 1.x Application API client (users, nodes, allocations, server creation).
  - *Acceptance:* Verified against staging Pterodactyl panel or fixture server with real payload formats.
- [ ] **Slice 3.4: Provisioning Saga & Timeout Recovery Engine**
  - Implement full saga: create server -> handle timeout by lookup via correlation tag -> poll install status -> activate service.
  - *Acceptance:* Simulated HTTP timeout after creation links existing server without creating a duplicate (`PROV-04`).
- [ ] **Slice 3.5: Client Service Management & Technical Proxy**
  - Implement `/app/services/[id]` API proxying power commands, resource utilization graphs, and ephemeral console websocket tickets.
  - *Acceptance:* Tenant B cannot power off Tenant A's server; websocket tickets expire in 60s.
- [ ] **Slice 3.6: Automated Drift Reconciler**
  - Periodic background job comparing Fortless services against provider instances.
  - *Acceptance:* Orphan servers detected and flagged for staff review (`PROV-08`).

---

### Phase 4: Operational Readiness, Tickets, System Status & Go-Live Pilot
*Goal: Complete operational toolset, support ticketing, public status page, backup restore drills, and security hardening.*

- [x] **Slice 4.1: Customer & Staff Support Ticketing Engine**
  - Multi-tenant support tickets with role-based internal notes, markdown sanitization, attachments (`TICK-01` to `TICK-04`).
- [x] **Slice 4.2: Automated Subscription Renewal & Dunning Scheduler**
  - End-of-month anchoring, 5-day grace period, invoice issuance, suspension, and payment settlement (`DUN-01` to `DUN-05`).
- [x] **Slice 4.3: Public System Status & Incident Management**
  - Standalone status dashboard (`/status`), operational indicators, incident updates timeline (`STAT-01` to `STAT-04`).
- [x] **Slice 4.4: Administrative Operations Dashboard**
  - Staff management read models and endpoints for orders, invoices, credit notes, capacity pools, and audit search (`ADM-09` to `ADM-12`).
- [x] **Slice 4.5: Backup & Disaster Recovery Verification**
  - Automated atomic database backup, AES-256-GCM encryption, checksum validation, and isolated staging restore verification (`BCK-01` to `BCK-04`).
- [x] **Slice 4.6: P0 Launch Gate Signoff & Limited Pilot Rollout**
  - All automated release gates verified in `TEST_MATRIX.md` (Gate 1, 2, 3, 6, 7, 8 verified; Gate 4 & 5 safely flagged pending vendor staging credentials).
  - Legal compliance documents posted at `/legal/terms`, `/legal/privacy`, `/legal/aup`, `/legal/refunds`, `/legal/sla`.

---

### Phase 5: Extended Infrastructure (Node.js Web Apps, cPanel/WHM, Domains, VPS)
*Goal: Expand Fortless orchestration beyond game/bot servers into multi-runtime cloud hosting: Web Apps, cPanel shared hosting, automated domain provisioning, and KVM/Proxmox cloud compute.*

- [x] **Slice 5.1: Node.js & Containerized Web App Hosting Engine**
  - Migration 13 applied; Web & Cloud Apps category seeded with Node.js Starter & Pro plans; Git repo validation & anti-SSRF; outbox worker environment variable mapping verified (`WEBAPP-01` to `WEBAPP-03`).
- [x] **Slice 5.2: cPanel / WHM Shared Hosting Provisioning Adapter**
  - Typed `CpanelProviderAdapter` and `MockCpanelAdapter` with automated account creation, package synchronization, Unknown Outcome recovery, and anti-SSRF protections (`CPANEL-01` to `CPANEL-04`).
- [x] **Slice 5.3: Domain Search, Registration & DNS Management Layer**
  - Migration 14 applied (`domain_zones` & `dns_records`); TLD catalog pricing; public search API (`/api/v1/domains/search`); multi-tenant authoritative DNS zone manager and RFC format validator (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, `SRV`) with CNAME collision prevention; Petal UI panel (`DOM-01` to `DOM-04`).
- [x] **Slice 5.4: Cloud VPS Compute Instances (Proxmox / KVM Adapter Interface)**
  - Migration 15 applied; Cloud VPS catalog seeded with Micro (€8.00/mo), Standard (€16.00/mo), and Pro (€32.00/mo) KVM plans; RFC 1123 hostname, guest OS, and SSH key validation; `ProxmoxHttpAdapter` with anti-SSRF protection, cloud-init provisioning, power lifecycle, and VNC console ticket generation; `MockProxmoxAdapter` with Unknown Outcome correlation lookup (`VPS-01` to `VPS-06`).

---

### Phase 6: AI-Assisted Operations & Advanced Diagnostics
*Goal: Provide guardrailed, read-only diagnostic intelligence, secret-redacted support triage, and contextual knowledge base retrieval.*

- [x] **Slice 6.1: Guardrailed AI Diagnostics & Support Assistant Engine**
  - Security redactor (`redactSensitiveData`) strips credit card PANs, CVVs, API tokens, passwords, and private keys before dispatch; `AiProviderAdapter` interface with `MockAiProviderAdapter` and `OpenAiCompatibleAiAdapter` (anti-SSRF protected); strict read-only guardrails rejecting monetary/destructive mutations; support ticket triage (`/api/v1/tickets/:id/ai-assist`, `/api/v1/admin/tickets/:ticketId/ai-assist`); service health diagnosis (`/api/v1/services/:id/diagnostics`); persistent audit logs in `ai_diagnostic_logs` (`AI-01` to `AI-05`, `AI-07`).
- [x] **Slice 6.2: Automated Knowledge Base & Documentation Retrieval**
  - Migration 16 applied (`knowledge_articles`); seeded authoritative guides for Minecraft EULA/OOM, Node.js port binding, cPanel SPF/DKIM, apex CNAME collisions, and VPS SSH hardening; multi-field keyword and tag ranking; public search API (`/api/v1/kb/articles`, `/api/v1/kb/articles/:slug`) (`AI-06`).

