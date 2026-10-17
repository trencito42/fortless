# FORTLESS — Open Commercial, Legal & Provider Decisions

**Version:** 1.0.0-PROD  
**Status:** Phase 0 Baseline  
**Classification:** Decision Log & Conservative Engineering Fallbacks  

---

## 1. Operating Principle for Open Decisions

In accordance with mandatory engineering constraints:
1. **Never invent commercial or legal facts:** If business jurisdiction, tax configuration, registrar contracts, or provider API keys are unprovided, record them as open decisions.
2. **Never block platform architecture:** Development proceeds autonomously using strictly defined **Safe Engineering Defaults**.
3. **Fail-Closed on Unconfigured Live Operations:** No live charges or production resource provisioning can occur until the corresponding decision is resolved with approved configuration.

---

## 2. Decision Log & Recommended Defaults

### Decision 01: Legal Entity, Merchant of Record & Tax Jurisdiction
- **Status:** `OPEN` (Awaiting Owner Confirmation)
- **Question:** What is the legal business entity, country of establishment, tax registration number (VAT/EIN), and merchant-of-record domicile?
- **Impact on System:** Determines applicable VAT OSS rules, domestic tax calculation basis, fiscal invoice header requirements, and electronic invoicing formats.
- **Safe Engineering Default:**  
  Configure system for **European Union VAT OSS baseline (Single Currency: EUR)**. Default to domestic standard VAT rate (19%) for unverified B2C, 0% reverse-charge for verified B2B with valid VIES tax ID, and 0% for non-EU exports. Restrict live billing until exact merchant domicile is provided.

---

### Decision 02: Primary Payment Service Provider (PSP) Approval
- **Status:** `OPEN` (Awaiting Sandbox/Production Credentials)
- **Question:** Which PSP is contracted and approved for hosting, recurring subscriptions, and gaming infrastructure workloads (e.g. Stripe, Adyen, Mollie)?
- **Impact on System:** Determines webhook signature verification algorithms, hosted checkout session parameters, and off-session card charge APIs.
- **Safe Engineering Default:**  
  Target the **Stripe Hosted Checkout & Payment Intents API (API version 2024-06-20)**. Utilize local mock PSP adapter and Stripe Testmode fixtures for automated CI. Block live charges (`livemode === true`) until approved production merchant credentials are provided.

---

### Decision 03: Pterodactyl Staging Environment & API Version
- **Status:** `OPEN` (Awaiting Staging Panel Credentials)
- **Question:** What is the exact URL and version of the Pterodactyl staging panel (v1.11.x LTS vs 2.x beta), and what are the pre-configured Node IDs and Egg IDs?
- **Impact on System:** Determines Application API route endpoints, startup parameter formatting, and container allocation schemas.
- **Safe Engineering Default:**  
  Target **Pterodactyl 1.x Application API** specifications (`/api/application/servers`, `/api/application/nodes`, `/api/application/users`). Build an in-memory `MockPterodactylServer` that implements exact Pterodactyl 1.x HTTP request/response schemas for local development and test suites.

---

### Decision 04: Design System Provisioning & Route Integration
- **Status:** `RESOLVED` (Petal source delivered in repository)
- **Decision:** The authoritative Petal source is `blueprint/fortless-blueprint/design/`, including `panel.html`, `out.html`, and `design/parts/`. The application reuses its tokens and primitives; route-specific code is limited to composition adapters and API binding. Heroicons are used for application iconography as explicitly requested by the owner.
- **Impact on System:** Frontend UI styling and component mapping.
- **Constraint:** Do not install or invent a competing visual framework (Tailwind, Bootstrap, Material UI, or an unrelated custom theme). New UI must compose the delivered Petal components and tokens.

---

### Decision 05: Customer Tenancy Model in P0 (User vs Organization)
- **Status:** `RESOLVED_BY_DEFAULT`
- **Question:** Should P0 support multi-user organizations with role delegation, or single-user accounts?
- **Decision:** Implement the full **Organization / Account Model** in Phase 0 schema from Day 1 (`Account` -> `Membership` -> `User`).
- **Rationale:** Retrofitting multi-tenancy and organization ownership into an existing single-user schema later causes massive database migration friction and IDOR vulnerabilities. In P0, every user automatically creates an individual primary Account where they hold the `OWNER` role, with team invitations enabled seamlessly when needed.

---

### Decision 06: Invoice Numbering Format & Legal Sequence
- **Status:** `RESOLVED_BY_DEFAULT`
- **Question:** What format should fiscal invoice numbering follow?
- **Decision:** Utilize standard international fiscal numbering:
  - Paid Invoices: `INV-YYYY-XXXXX` (e.g., `INV-2026-00001`), monotonically increasing per calendar year.
  - Credit Notes: `CRN-YYYY-XXXXX` (e.g., `CRN-2026-00001`).
  - Draft Quotes: `QUO-YYYY-XXXXX`.
- **Rationale:** Complies with standard European and international accounting standards requiring continuous, non-repeating sequence numbering.

---

### Decision 07: Refund & Cancellation Window Policy
- **Status:** `OPEN` (Awaiting Legal Policy Signoff)
- **Question:** What is the commercial refund window for game servers (e.g., 24 hours, 72 hours, 14 days)?
- **Impact on System:** Proration calculation rules and automated self-service refund eligibility.
- **Safe Engineering Default:**  
  Default to **72-hour money-back guarantee for initial server purchase**, subject to acceptable use verification (zero abuse/DDoS flags). Renewals are non-refundable once the billing cycle begins. Automated refunds are capped at `EUR 50.00`; higher amounts require staff review.

---

### Decision 08: Operational Server Port Allocation Strategy
- **Status:** `RESOLVED_BY_DEFAULT`
- **Question:** How should game server port allocations be managed?
- **Decision:** Each server receives **one primary port** allocated atomically from the target node's available pool in Pterodactyl. Additional ports (e.g., for RCON, voice plugins) are provisionable as configurable add-ons. Ports cannot be chosen directly by the customer to prevent port stealing and network collisions.
