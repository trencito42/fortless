# Mandatory Engineering Rules for AI Coding Agents Operating on Fortless

**Target Platform:** FORTLESS Commercial Hosting & Infrastructure Management Platform  
**Documentation Base:** Located under `docs/fortless/`  
**Standard:** Production-Grade Architecture, Financial Precision, Zero-Trust Multi-Tenancy  

---

## 1. Core Operating Principles

1. **Verify Before Coding:** Never assume code, databases, integrations, or files exist without checking the actual filesystem and running verification commands.
2. **Design System Integrity:** The project owner possesses a dedicated design system ("Petal") and will provide it separately. **Do not install, scaffold, or invent a competing design system** (such as Tailwind CSS, Bootstrap, Material UI, or custom ad-hoc visual themes). Use clean, semantic, neutral HTML scaffolding with semantic class names until the design system is integrated.
3. **Zero Fake Success / Zero Placeholders:** Never generate fake success states, mock balances masquerading as real, or placeholder provider actions presented as operational. If a feature or integration is not configured, return a clear, typed error indicating it is unsupported or disabled.
4. **Distinguish Verification Tiers:** Maintain accurate status labels for all features and tests:
   - `[NOT_STARTED]` — Planned / specified.
   - `[MOCK_ONLY]` — Tested against local unit/integration mocks.
   - `[SANDBOX_VERIFIED]` — Tested against real staging/sandbox vendor APIs.
   - `[PRODUCTION_VERIFIED]` — Validated in production with real audit evidence.
   **Never claim production readiness without verifiable proof.**

---

## 2. Mandatory Security & Authorization Standards

1. **Server-Side Authorization Everywhere:** Every endpoint, service method, and background worker must authenticate the principal, verify tenant membership (`account_id`), and enforce role permissions. Client-supplied `ownerId`, `accountId`, or `role` fields in request bodies must be completely ignored.
2. **Credential & Secret Protection:**
   - **NEVER** log, display, or store payment card PANs or CVVs.
   - **NEVER** expose administrative API keys (such as Pterodactyl Application tokens) to browser code, public bundles, client-accessible responses, or websocket payloads.
   - All server environment secrets must be loaded securely from environment configurations or encrypted vault stores.
3. **Anti-SSRF Enforcement:** Outbound HTTP requests to user-supplied URLs must resolve DNS and validate against a strict IP blacklist, blocking loopback (`127.0.0.1`), RFC1918 private subnets, link-local metadata (`169.254.169.254`), and IPv6 equivalents.

---

## 3. Financial & Provisioning Invariants

1. **Zero Client Authority on Money:** A payment is confirmed **only** upon cryptographic verification of an authoritative webhook received directly from the PSP (e.g. Stripe raw-body HMAC-SHA256 signature verification). A client-side redirect (`/success?status=paid`) is purely cosmetic and can **never** trigger order fulfillment.
2. **Immutable Quotes & Minor Units:** All monetary figures are stored in integer minor units (e.g. Euro cents). Quotes are signed and time-bound. Checkout locks the quote; client-supplied price manipulations must be rejected.
3. **Durable Idempotency:** Every financial mutation and external provider side effect requires a scoped idempotency key to prevent double charges and duplicate server allocations during retries or double clicks.
4. **The Unknown Outcome Rule:** A network timeout or HTTP 5xx from an external provider (Pterodactyl or Stripe) is an **unknown outcome**, not guaranteed failure. Workers must query the provider by a deterministic correlation tag before attempting a retry. Never create duplicate external resources blindly.
5. **Transactional Outbox & Inbox:** Provider side effects and webhook events must be committed to the database atomically alongside the domain state before external execution.

---

## 4. Work Sequence for Incremental Vertical Slices

For every code change:
1. **Inspect:** Check existing code, database state, and environment.
2. **Invariants & Risks:** State the exact invariants, failure cases, and attack vectors being addressed.
3. **Design:** Define the data models, state machines, and typed API contracts.
4. **Implement:** Write robust, minimal, idiomatic backend domain logic, migrations, and routes.
5. **Verify:** Execute automated unit, integration, and negative-path tests. Report exact results.
6. **Document:** Update the test matrix and roadmap status.

---

## 5. Documentation Map

- **Product Specification:** [`docs/fortless/PRODUCT_SPEC.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/PRODUCT_SPEC.md)
- **Architecture & Reliability:** [`docs/fortless/ARCHITECTURE.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/ARCHITECTURE.md)
- **Logical Data Model:** [`docs/fortless/DATA_MODEL.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/DATA_MODEL.md)
- **Billing, Payments & Anti-Fraud:** [`docs/fortless/BILLING_AND_PAYMENTS.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/BILLING_AND_PAYMENTS.md)
- **Infrastructure Provisioning:** [`docs/fortless/PROVISIONING.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/PROVISIONING.md)
- **Security Baseline:** [`docs/fortless/SECURITY.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/SECURITY.md)
- **Executable Test Matrix:** [`docs/fortless/TEST_MATRIX.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/TEST_MATRIX.md)
- **Implementation Roadmap:** [`docs/fortless/ROADMAP.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/ROADMAP.md)
- **Open Decisions Log:** [`docs/fortless/OPEN_DECISIONS.md`](file:///home/fortless/htdocs/fortless.net/docs/fortless/OPEN_DECISIONS.md)
