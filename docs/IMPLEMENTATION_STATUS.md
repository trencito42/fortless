# Fortless Implementation Status

Last updated: 2026-10-17

Status labels: `NOT_STARTED`, `MOCK_ONLY`, `SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`.

## Phase 0 — Audit and Foundation

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Repository and stack audit | `MOCK_ONLY` | `docs/REPOSITORY_AUDIT.md`; local files/runtime inspected |
| Petal design source inventory | `MOCK_ONLY` | Supplied HTML/CSS/JS inspected and reused; no competing UI framework installed |
| Asset fingerprinting | `MOCK_ONLY` | SHA-256 content names emitted at runtime; hashed assets use one-year immutable cache |
| Environment safety | `MOCK_ONLY` | `.env.example`; production session secret is mandatory; development fallback is persisted with mode `0600` instead of rotating on restart; external modes default disabled |

## Phase 1 — Identity & Core Authentication

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Registration + Argon2id | `MOCK_ONLY` | New users remain `PENDING_VERIFICATION`; local integration tests |
| Email verification | `MOCK_ONLY` | 24-hour, hash-at-rest, single-use tokens; delivery provider not configured |
| Login + sessions | `MOCK_ONLY` | Opaque tokens, SHA-256 at rest, HttpOnly cookie, server guard; legacy sessions rotated and pre-verification ACTIVE identities safely grandfathered by audited migrations |
| Password recovery | `MOCK_ONLY` | Non-enumerating API, 15-minute single-use token, all sessions revoked after reset |
| Brute-force control | `MOCK_ONLY` | Persistent per-IP + normalized-identifier failure window; distributed Redis enforcement remains open |
| CSRF and CORS | `MOCK_ONLY` | Signed double-submit token for browser mutations; explicit origin allowlist |
| Responsive auth UI | `MOCK_ONLY` | Petal/Fortless portrait + dedicated small-landscape layouts |
| Session/device management | `MOCK_ONLY` | Real active-session inventory, current-device identification, tenant-safe individual revocation, revoke-others action and audit events |
| TOTP multi-factor authentication | `MOCK_ONLY` | Supplied Petal QR/OTP/backup component, six-cell challenge with paste/autofill/backspace handling, password-confirmed enrollment, AES-256-GCM protected secrets, restart-stable key material, restart-independent one-time recovery-code hashes, persistent attempt throttling, disable flow and audit events |
| Recent step-up authentication | `MOCK_ONLY` | Password plus live TOTP produces session-scoped evidence valid for ten minutes; failed password/code attempts do not elevate the session; transparent modal step-up in Admin UI |
| Native responsive app shell | `MOCK_ONLY` | Correct document/CSS layering, docked portrait tab bar, docked landscape rail, mobile record cards, bottom-sheet modals and safe-area handling |
| Customer app routing | `MOCK_ONLY` | `/app` dashboard, `/app/services`, scoped service detail, dedicated support list/new/detail and remaining History API routes; authenticated deep-link refresh and legacy hash migration |
| Staff/admin guard | `MOCK_ONLY` | Persisted, revocable staff memberships with `OWNER`, `ADMINISTRATOR`, `BILLING`, `SUPPORT`, `INFRASTRUCTURE`, and `AUDITOR` roles; permissions and MFA are checked from the database on every document/API request |

## Phase 2 — Production Infrastructure & Reliable Jobs

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Host binding isolation | `MOCK_ONLY` | Binds to `config.HOST` (default `127.0.0.1`), prevents reverse proxy bypass |
| Idempotency request hash | `MOCK_ONLY` | `customOptions` included in checkout idempotency hash |
| Worker concurrency & leasing | `MOCK_ONLY` | Concurrency-safe atomic event claiming, lease expiration reset, bounded exponential backoff, dead-letter queue |
| Runtime DB separation | `MOCK_ONLY` | `getDatabase()` decoupled from migration runs; explicit `npm run migrate` CLI |

## Phase 3 — Identity Hardening, Email, WebAuthn & Petal Product UI

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Transactional email outbox | `MOCK_ONLY` | Atomic queueing in SQLite, durable retry backoff, bounded attempts, dead-letter state, offline sandbox receipts |
| Staff owner bootstrap | `MOCK_ONLY` | `npm run staff:bootstrap-owner` CLI requires verified email, confirmed TOTP MFA; enforces `--force --reason` protection |
| Phishing-resistant WebAuthn | `MOCK_ONLY` | FIDO2/WebAuthn registration and authentication, anti-replay challenge lifecycle, ES256 signature verification, authenticator counter validation |
| Universal Petal Command Palette | `MOCK_ONLY` | `Ctrl+K` / `⌘K` global palette across customer and admin shells, scoped `/api/v1/search` with multi-tenant isolation, Arrow/Enter navigation |
| Ticketing with Markdown & Attachments | `MOCK_ONLY` | Dedicated customer list/new/conversation pages, original Petal editor/drop controls adapted to safe Markdown, customer/staff thread management, multi-tenant attachments with SHA256 integrity, 5MB limit and MIME whitelist |
| Native Petal SVG Charts | `MOCK_ONLY` | Chart primitives remain available, but customer pages do not render invented historical utilization series |
| Client redesign documentation | `MOCK_ONLY` | `docs/frontend/CLIENT_AREA_REDESIGN.md`, component map, route spec, progress and visual QA matrix; rendered browser QA remains pending |
| Petal client route sweep | `MOCK_ONLY` | Support inbox CSS completed from `z6`; Deploy uses original `z4` wizard/summary; Domains/Billing/Activity/Settings use Petal tables, lists and filters. Authenticated device visual QA remains pending. |
| Admin Step-Up Challenge Modal | `MOCK_ONLY` | Transparent 403 `STEP_UP_REQUIRED` interception, TOTP challenge verify `/api/v1/auth/step-up`, seamless mutation retry |

## Fail-closed integrations

- Customer checkout and Stripe webhook routes return configuration errors.
- The former instant-deploy route returns `410 LEGACY_FLOW_DISABLED` and cannot create payment/provider effects.
- Customer power actions return `PROVIDER_NOT_CONFIGURED`.
- Background provisioning dispatch is disabled at runtime.
- Capability API reports the exact non-operational verification tier.

## Verification executed

- `npx tsc --noEmit` — passed with 0 TypeScript compiler errors.
- `npm test` — 128/128 passed across the modular frontend, identity, catalog, payments, support, provisioning, staff RBAC, team/email, subscriptions/notifications, workers, WebAuthn, attachments, domains/DNS, VPS, cPanel, web apps, AI guardrails, renewal/dunning, status and backup suites.
- Separated `getDatabase()` connection acquisition from automatic schema migration runs.
- Fixed Admin UI modal clipping on mobile and invisibility on desktop by correcting unclosed `<nav class="tabbar">` and adding Petal `.scrim` / `.modal` CSS.
- Applied Migration 11 (`ticket attachments and multi-tenant file storage`) to SQLite database.
- PM2 dev process reloaded and operational on `127.0.0.1:3021`.
