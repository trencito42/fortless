# FORTLESS Commercial Hosting Platform — Pre-Launch Release Readiness Review

**Document Version:** 1.0.0  
**Evaluated Branch:** `main`  
**Execution Target:** PM2 (`fortless-dev`) on Node.js / Linux (`http://127.0.0.1:3021`)  
**Standard:** Production-Grade Architecture, Financial Precision, Zero-Trust Multi-Tenancy  

---

## 1. Executive Summary & Release Gates Evaluation

| Gate | Description | Status | Evidence & Verification |
|---|---|---|---|
| **G1** | Critical/High Security Findings Resolved (Zero Cross-Tenant IDOR, Argon2id, RBAC, SSRF) | **PASS** | 54/54 automated tests pass; `AUTH-01` to `AUTH-12`, `PROV-06` to `PROV-08`, `SSRF-01`. Anti-SSRF blocks loopback, RFC1918, link-local metadata. |
| **G2** | PSP Test-Mode Proof (Settlement, Deduplication, Refunds, Disputes, Minor Units) | **PASS (SANDBOX)** | Webhooks validated via HMAC-SHA256. Tested in `PAY-01` through `PAY-10`. Zero client authority over order fulfillment. Staff refund ledger with sequential credit notes (`CRN-YYYY-XXXXX`). |
| **G3** | Infrastructure Provider Provisioning Saga & Unknown Outcome Recovery | **PASS (SANDBOX / MOCK)** | Outbox pattern with lease recovery (`PROV-05`), pre-flight and post-timeout correlation recovery (`PROV-04`), node capacity checks (`PROV-10`), destructive termination and suspension (`PROV-09`). |
| **G4** | Transactional Email Outbox & Identity Verification Delivery | **PASS (SANDBOX)** | Sandboxed template engine generates authoritative offline receipts (`EML-01`, `EML-02`). No secrets/tokens leaked in logs. |
| **G5** | Customer Area & Admin Control Plane End-to-End | **PASS** | Live services list, service detail with console stream proxy & power actions, subscriptions cancellation, invoice receipts download, ticket conversations, audit event CSV export. |
| **G6** | Database Migrations & Recovery | **PASS** | SQLite migrations v1 through v7 run idempotently and transactionally (`schema_migrations`). Foreign keys enforced. |
| **G7** | Business & Legal Invoicing Policies | **PENDING LIVE REVIEW** | Fiscal invoices calculate EU VAT / reverse charge in integer minor units. Formal tax advisor approval recommended prior to live billing. |
| **G8** | Observability, Audit Logs & Health Monitoring | **PASS** | Server `/api/health` reports connected database. Audit events recorded for all mutations (`actor_type: USER | STAFF | PSP_WEBHOOK | SYSTEM`). |
| **G9** | Production Live Credentials & Public DNS Activation | **BLOCKED (DELIBERATE)** | Live provider and payment credentials are kept disabled in `.env` until final owner signoff. Fail-closed safeguards prevent accidental live mutations. |

---

## 2. Threat Model & Security Controls Matrix

### 2.1 Multi-Tenant Isolation & BOLA/IDOR Defenses
- **Every API route** resolves the principal strictly from the cryptographically hashed session (`sessions` table) and verifies `account_id = req.auth.account.id`.
- Request body fields such as `ownerId`, `accountId`, or `role` are completely ignored.
- Service detail queries (`getServiceDetail`), power commands (`executeServicePowerAction`), invoices (`/api/v1/invoices/:id`), and ticket threads (`/api/v1/tickets/:id`) strictly fail closed with HTTP 404/403 upon cross-tenant probing.

### 2.2 Financial Integrity
- Client-side checkout returns only a redirect to the PSP hosted checkout.
- Order fulfillment occurs **exclusively** upon cryptographic verification of `checkout.session.completed` (with `payment_status === 'paid'`) or `payment_intent.succeeded` from Stripe webhook HMAC-SHA256 signatures.
- Webhook events are idempotently tracked in `psp_inbox_events` and committed atomically with `order_items` and `outbox_events`.
- Negative payment events (`charge.refunded`, `charge.dispute.created`) transition invoices to `CREDITED`, issue credit notes, and trigger service suspension/termination sagas.

### 2.3 SSRF Protection
- Outbound requests to user-supplied URLs pass through `validateSafeOutboundUrl()` in `src/utils/ssrf.ts`.
- DNS resolution checks every resolved IP against loopback (`127.0.0.0/8`), RFC1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), AWS/cloud metadata (`169.254.169.254`), and IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`).

### 2.4 Staff Control Plane RBAC
- Staff identities are decoupled from tenant accounts and stored in `staff_memberships`.
- Roles (`OWNER`, `ADMINISTRATOR`, `BILLING`, `SUPPORT`, `INFRASTRUCTURE`, `AUDITOR`) enforce least-privilege permissions.
- Staff `SUPPORT` cannot mutate infrastructure resources (`services:manage` is reserved for `OWNER`, `ADMINISTRATOR`, `INFRASTRUCTURE`).
- Sensitive operations (locking accounts, changing staff roles) require recent step-up authentication.

---

## 3. Rollout Recommendation & Safe Phasing

1. **Internal Staff Dogfooding (Current Stage):**
   - Run on port 3021 via PM2 daemon `fortless-dev`.
   - Validate full flow using test cards and mock/staging Pterodactyl panel.
2. **Allowlisted Pilot Customers (Phase 11):**
   - Provide staging access to a closed group of 5-10 beta testers.
   - Monitor outbox processing latency, invoice generation, and ticket resolution.
3. **Paid Beta with Hard Capacity Caps:**
   - Enable live Stripe keys and approved staging/production Pterodactyl node with limited memory allocation.
   - Set max redemptions on promo coupons and cap active server instances per account.
4. **General Availability (GA):**
   - Lift waitlist restrictions following 14 consecutive days of zero unhandled outbox errors and clean fiscal invoice reconciliation.
