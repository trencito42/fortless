# Fortless Architectural & Engineering Decisions Log

Last Updated: 2026-10-17  
Governed by: Stage 00 Global Engineering Contract

---

## ADR-001: Fastify & TypeScript Monolith Retention vs. Framework Rewrite

- **Context**: The blueprint references Next.js, PostgreSQL, and Redis. However, the repository contains a functioning, production-grade Fastify 5 + TypeScript + SQLite architecture with comprehensive automated tests and minimal external overhead.
- **Decision**: Retain the existing Fastify + TypeScript modular monolith. Do not perform an unverified rewrite to Next.js or microservices.
- **Tradeoffs**:
  - *Benefits*: Faster development of real business slices, zero framework bloat, immediate test execution, high throughput, robust security controls (explicit raw body parsing, fine-grained CORS/CSRF hooks).
  - *Costs*: Frontend is currently delivered as vanilla HTML/JS bundles with Petal design tokens rather than server-side React components. Migration to PostgreSQL and Redis is deferred to an explicit, isolated migration slice.

---

## ADR-002: Zero-Trust Multi-Tenancy and Server-Side Authorization

- **Context**: Client requests can attempt to supply fabricated `account_id`, `owner_id`, or `role` fields.
- **Decision**: Completely ignore client-supplied tenant identifiers in request bodies. Authenticate the session from the cryptographic cookie/bearer token, extract the tenant membership (`account_id`), and enforce RBAC strictly on the server.
- **Tradeoffs**:
  - *Benefits*: Immune to IDOR (Insecure Direct Object Reference) and privilege escalation attacks.
  - *Costs*: Endpoints must always join against authenticated tenant session context.

---

## ADR-003: Zero Client Authority on Financials & Minor Unit Precision

- **Context**: Floating-point rounding errors and client-side price tampering are fatal in commercial hosting.
- **Decision**:
  1. All currency values are strictly stored and computed in integer minor units (Euro cents).
  2. Quotes are generated server-side, HMAC-SHA256 signed, and time-bound. Checkout verifies the signature.
  3. Payments are confirmed only via authoritative, raw-body HMAC-SHA256 signed Stripe webhooks. Client redirects `/success` are cosmetic only.
- **Tradeoffs**:
  - *Benefits*: Mathematically impossible for clients to manipulate pricing or simulate payments.
  - *Costs*: Requires strict raw body buffering in Fastify before JSON parsing.

---

## ADR-004: Transactional Outbox Pattern & The "Unknown Outcome" Rule

- **Context**: External network calls to infrastructure providers (e.g., Pterodactyl) or payment processors can time out (HTTP 5xx, socket timeout). Treating a timeout as a failure causes duplicate servers or double charges upon retry.
- **Decision**:
  1. Mutations write an outbox event atomically within the database transaction.
  2. Background outbox workers dispatch operations with durable idempotency keys.
  3. Network timeouts are classified as `UNKNOWN_OUTCOME`. The worker queries the provider by deterministic correlation tag before attempting any creation retry.
- **Tradeoffs**:
  - *Benefits*: Guaranteed zero duplicate server allocations under packet loss or vendor latency spikes.
  - *Costs*: Requires provider adapters to implement `lookupByCorrelationTag`.

---

## ADR-005: Two-Tier Staff RBAC with Step-Up and Mandatory MFA

- **Context**: Legacy hosting architectures use boolean `is_staff` flags without MFA or auditability.
- **Decision**:
  1. Staff access is managed via a dedicated `staff_memberships` table with 6 distinct roles: `OWNER`, `ADMINISTRATOR`, `BILLING`, `SUPPORT`, `INFRASTRUCTURE`, `AUDITOR`.
  2. Every staff document route and API call verifies active membership and TOTP/MFA verification on every request.
  3. Owner-level staff modifications require a fresh (10-minute) step-up authentication using password and live TOTP.
- **Tradeoffs**:
  - *Benefits*: Compromised standard sessions cannot perform destructive actions; revocation takes effect mid-session.
  - *Costs*: Privileged operators must enroll in MFA before accessing `/admin`.

---

## ADR-006: Retention of the Petal Design System

- **Context**: The project owner provided a bespoke, high-performance design system ("Petal") located in `blueprint/fortless-blueprint/design/`.
- **Decision**: Strictly reuse Petal styles, typography (`Inter Tight`, `JetBrains Mono`), color palettes (lime, blue, navy, surface steps), and components (`z4.css`, `z5.css`, `z6.css`). Forbid installing generic competing frameworks (Tailwind, Bootstrap, Material UI).
- **Tradeoffs**:
  - *Benefits*: Preserves the exact aesthetic, brand identity, and ultra-fast page load times intended by the creator.
  - *Costs*: Requires custom component composition rather than off-the-shelf React libraries.
