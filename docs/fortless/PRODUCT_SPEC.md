# FORTLESS — Product Specification & Release Scope

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Security Tier:** OWASP ASVS 5.0 L2 Baseline / L3 Financial & Admin  

---

## 1. Executive Summary & Product Mission

**FORTLESS** is a commercial hosting and cloud infrastructure management platform engineered for security, high-integrity automated commerce, auditable operations, and multi-provider infrastructure orchestration.

Unlike legacy hosting billing panels (such as WHMCS, Blesta, or generic reseller wrappers), Fortless is architected as an authoritative, modern platform:
1. **Single Unified Customer Experience:** One identity, one organizational tenancy model, one coherent checkout and subscription system, unified invoice history, and consolidated infrastructure control.
2. **Authoritative Financial Invariants:** Fortless owns the commercial contract, immutable pricing snapshots, legal invoice issuance sequences, tax calculations, and subscription schedules. Third-party PSPs (Payment Service Providers) act as payment processors and vault authorities, but never unilaterally mutate local commercial records.
3. **Decoupled Infrastructure Orchestration:** Underlying hypervisors, game server panels (Pterodactyl), web panels (cPanel/WHM), and cloud virtualization nodes own operational runtime state. Fortless orchestrates provisioning via an idempotent transactional outbox engine and continuous state-reconciliation loops.
4. **Zero-Trust Multi-Tenancy:** Strict, server-enforced role-based and attribute-based access control (RBAC/ABAC). Every read, write, websocket subscription, and background job explicitly verifies tenant ownership. Direct Object References (IDOR/BOLA) are blocked by design.

---

## 2. Phased Service Offerings & Scope

| Category | Launch Phase | Orchestration Engine / Provider | Scope & Boundaries |
| :--- | :--- | :--- | :--- |
| **Game Server Hosting** | **P0 (Launch)** | Pterodactyl 1.x Application API | Minecraft, Palworld, Rust, CS2, etc. Automated container deployment, egg/startup variables validation, dedicated allocations, port mapping, resource throttling (CPU, RAM, Disk, IOPS). |
| **Discord Bot Hosting** | **P0 (Launch)** | Pterodactyl 1.x Application API | Dedicated runtime environments (Node.js, Python, Java, Go). Sandboxed process execution, isolated environment variable secret storage, automated restart policies, persistent storage. |
| **Node.js Web Apps** | **P1** | Custom Worker + Traefik/Caddy Edge | Sandboxed application containers, Git/archive deployment pipelines, HTTP routing, automatic Let's Encrypt TLS issuance, custom domain verification, secret injection. |
| **Shared Web Hosting** | **P1** | cPanel/WHM Reseller API | Traditional PHP/MySQL web hosting, email accounts, DNS zone management, automatic cPanel account provisioning via least-privilege WHM API tokens. |
| **Domain Management** | **P1** | Reseller Registrar API (OpenSRS/Namecheap/Enom) | Domain search, TLD pricing, registration, transfer with EPP auth codes, nameserver updates, DNSSEC management, renewal automation. |
| **Cloud VPS** | **P2** | Proxmox VE / KVM Cloud API | Dedicated vCPU, RAM, NVMe storage, IPv4/IPv6 allocation, cloud-init guest OS automation, snapshot backups, firewall isolation. |
| **Managed Databases** | **P2** | Isolated DB Orchestrator | Dedicated PostgreSQL, MariaDB, and Redis instances with automated backups, storage quotas, and client connection whitelisting. |
| **AI Support & Ops** | **P3** | Guardrailed LLM Gateway | Read-only ticket assistance, contextual documentation retrieval, safe log diagnostic suggestions. **AI never executes monetary or destructive actions.** |

---

## 3. Actor & Role-Based Access Control (RBAC) Matrix

Fortless enforces a strict separation between **Platform Staff** (global operators) and **Customer Organizations** (tenants).

```
Platform Staff (Global Scope)
├── Owner (Break-glass super-admin, full platform policy)
├── Administrator (General management, catalog, provider settings)
├── Billing Specialist (Invoice review, refunds within limits, tax exports)
├── Support Agent (Ticket response, diagnostics; NO raw secrets or card access)
├── Infrastructure Operator (Node pools, allocation monitoring, server re-sync)
└── Security Auditor (Append-only audit review, compliance logs, read-only)

Customer Organizations (Tenant Scope)
├── Account Owner (Primary legal entity, billing ownership, service deletion, member management)
├── Billing Manager (Invoices, payment methods, renewal preferences, tax profiles)
├── Technical Admin (Server power actions, console, files, backups, environment variables)
└── Viewer (Read-only visibility into service status, metrics, and non-sensitive configs)
```

### Server-Side Permission Enforcement Principles:
1. **Default Deny:** If an explicit permission grant is absent for the authenticated principal and targeted resource, the operation returns `403 Forbidden`.
2. **Dual-Layer Validation:** Permissions are verified at the API Gateway / Route layer **AND** at the domain service layer before database queries or provider dispatches.
3. **No Client-Supplied Tenant IDs:** The tenant (`accountId` / `organizationId`) is resolved strictly from the authenticated cryptographic session token and verified against the resource's foreign key.
4. **Separation of Duties:** Support agents cannot issue refunds or delete client servers; billing managers cannot access technical server consoles or container filesystems.

---

## 4. Public Information Architecture & Route Map

### 4.1. Public & Marketing Routes (SEO & Fast Delivery)
- `/` — Homepage: Transparent feature breakdown, real-time node locations, verified uptime metrics.
- `/hosting/games` — Game server catalog, supported game types, egg configurations, location picker.
- `/hosting/discord-bots` — Bot hosting options, supported runtimes, instant setup details.
- `/web-hosting` — Shared cPanel hosting features (P1 preview/waitlist).
- `/vps` — Cloud VPS specifications and compute tiers (P2 preview).
- `/domains` — Domain availability lookup and TLD pricing table (P1).
- `/pricing` — Clear billing cycle comparisons, renewal pricing, tax transparency.
- `/locations` — Interactive global datacenter map, test IPs, ping latency benchmarks.
- `/status` — Independent public status page, active incidents, scheduled maintenance notices.
- `/blog` & `/blog/[slug]` — Technical hosting guides, release notes, infrastructure updates.
- `/docs` & `/docs/[...slug]` — Self-service knowledge base, tutorials, API documentation.
- `/legal/terms` — Master Terms of Service.
- `/legal/privacy` — Privacy Policy & GDPR Data Processing Agreement.
- `/legal/aup` — Acceptable Use Policy (strict prohibition of crypto-mining, DDoS, malicious bots).
- `/legal/refunds` — Transparent Refund & Cancellation Policy.
- `/legal/sla` — Service Level Agreement terms.

### 4.2. Authentication Routes
- `/login` — Secure session initiation (Argon2id / WebAuthn Passkeys).
- `/register` — Account registration with email verification flow.
- `/verify-email` — Single-use, time-bound token verification.
- `/forgot-password` & `/reset-password` — Secure, non-enumerating password recovery.
- `/mfa/challenge` — TOTP / FIDO2 security key verification.

### 4.3. Customer Area (`/app`)
- `/app` — Operational Dashboard: active services, renewal alerts, resource summaries, open tickets.
- `/app/services` — Filterable service inventory (`ACTIVE`, `PENDING`, `SUSPENDED`, `CANCELLED`).
- `/app/services/[id]` — Technical service control center:
  - Overview: CPU, RAM, Disk, Network real-time utilization graphs.
  - Power: Start, Stop, Restart, Kill (server-authorized).
  - Console: Secure, authenticated terminal stream (ephemeral ticket-based websocket).
  - Files: Isolated file manager, text editor, SFTP connection credentials.
  - Databases: Add/remove isolated databases, credentials delivery.
  - Backups: Trigger manual backup, restore, download signed time-limited link.
  - Startup & Env: Configurable startup variables, container options.
  - Network: Port allocations, primary IP, reverse DNS.
  - Settings: Reinstall server, cancel subscription, rename service.
- `/app/orders` — Historical order ledger with fulfillment statuses.
- `/app/cart` & `/app/checkout` — Multi-line cart, signed quote preview, tax computation, PSP redirection.
- `/app/billing/invoices` — Official issued invoices, PDF download, payment status.
- `/app/billing/subscriptions` — Active recurring contracts, next renewal date, auto-renew toggle.
- `/app/billing/payment-methods` — Secure card vault management via PSP hosted setup intents.
- `/app/tickets` & `/app/tickets/[id]` — End-to-end encrypted support ticketing with attachments.
- `/app/account/profile` — User profile, contact details, organization preferences.
- `/app/account/security` — Active sessions, device revocation, password change, MFA/Passkey configuration.

### 4.4. Operational Staff Admin (`/admin`)
- `/admin` — Global telemetry: active MRR, pending fulfillments, failed queues, node saturation.
- `/admin/customers` — Account lookup, identity verification, risk flags, audit logs.
- `/admin/orders` — Orders management, manual intervention queue, stuck fulfillment recovery.
- `/admin/invoices` — Fiscal invoice ledger, credit note generator, tax export logs.
- `/admin/services` — Global infrastructure service list, manual sync, emergency suspension.
- `/admin/nodes` — Physical/virtual node capacity pools, allocation health, maintenance drain mode.
- `/admin/catalog` — Product definitions, plan versions, prices, egg mappings, coupon rules.
- `/admin/support` — SLA-prioritized ticket triage, internal staff notes, resolution tracking.
- `/admin/audit` — Immutable, append-only security event search with actor and correlation tracing.
- `/admin/system` — Provider API credentials status, worker health, feature flags, configuration.

---

## 5. Core User Journeys & Acceptance Criteria

### Journey 1: Clean First-Time Purchase & Instant Provisioning
1. **Catalog Selection:** Visitor selects "Minecraft Standard (4GB RAM)" in "Frankfurt (FRA-1)".
2. **Server Quote:** Backend validates node capacity in FRA-1. A cryptographic quote is generated: `EUR 12.00` + `EUR 2.28` (19% VAT) = `EUR 14.28`, TTL = 15 minutes.
3. **Checkout Submission:** User submits checkout with unique client idempotency key.
4. **PSP Payment:** User is redirected to PSP hosted checkout. Completes 3DS challenge.
5. **Authoritative Webhook:** PSP sends `payment_intent.succeeded`. Fortless verifies raw HMAC signature, event timestamp, and currency/amount against the internal order record.
6. **Atomic Transaction:**
   - Order marked `PAID`.
   - Invoice marked `PAID` with sequential document number.
   - Entitlement record created.
   - Outbox provisioning job enqueued.
7. **Worker Fulfillment:** Outbox worker picks up job, verifies provider node capacity, calls Pterodactyl Application API with unique correlation ID, links created `server_id`, and transitions service to `ACTIVE`.
8. **Customer Notification:** Customer receives confirmation receipt and server access credentials notification.

### Journey 2: Unhappy Path — Provider Out of Capacity Post-Payment
1. **Payment Captured:** Payment succeeds at PSP and is verified by Fortless webhook.
2. **Worker Discovery:** Outbox worker attempts to allocate port/RAM on target node. Pterodactyl returns `500` or capacity exhaustion error.
3. **Controlled State Transition:** Order transitions to `PAID_UNFULFILLED`. Service state set to `NEEDS_MANUAL_REVIEW`.
4. **Safeguard:** System does **NOT** crash, drop the order, or retry infinitely in a tight loop.
5. **Staff Alert & Customer Communication:** Staff dashboard triggers high-priority alert. Customer dashboard displays transparent "Provisioning Delayed — Allocating Additional Node Resources" notice with option to request automatic 1-click refund or await re-routing to adjacent region.

### Journey 3: Automated Renewal with Off-Session Payment
1. **Invoice Issuance:** 7 days prior to renewal anchor date, Fortless generates draft renewal invoice.
2. **Advance Notification:** Customer receives "Upcoming Service Renewal" email with amount and scheduled charge date.
3. **Execution Date:** Worker initiates off-session payment charge against saved PSP customer payment method using a unique renewal idempotency key.
4. **Success:** Payment confirms via webhook -> Invoice marked `PAID` -> Subscription term extended by 1 month -> Audit logged.
5. **Failure (Card Declined / SCA Required):** 
   - Invoice marked `PAID_FAILED`.
   - Automated 3-day grace period initiated. Service remains `ACTIVE`.
   - Customer alerted via email with secure payment link to complete SCA challenge.
   - Retry scheduled on Day 1, Day 3, and Day 5.
   - If unpaid after grace period expires: Service transitioned to `SUSPENDED` (container stopped, data preserved).
   - If unpaid after 14 days suspended: Service queued for termination with explicit staff review.

---

## 6. Design System Integration Contract

1. **Authoritative Design Library:** The project owner provides a standalone, production design system ("Petal" - Apple-inspired, flat, borderless, shadowless, light/dark responsive).
2. **Zero Competing Libraries:** No foreign component frameworks (Tailwind, Bootstrap, MUI, Chakra, etc.) shall be introduced.
3. **Strict Token & Component Reuse:** All navigation, cards, form inputs, buttons, tables, toasts, modal dialogs, and metrics chips must map directly to the design system's tokens and CSS classes.
4. **Phased UI Approach:** Backend domain models, API routes, security guards, and integration contracts are built first with minimal neutral scaffolding until design system components are integrated.
