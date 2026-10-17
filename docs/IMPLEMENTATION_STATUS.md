# Fortless implementation status

Last updated: 2026-10-17

Status labels: `NOT_STARTED`, `MOCK_ONLY`, `SANDBOX_VERIFIED`, `PRODUCTION_VERIFIED`.

## Phase 0 — audit and foundation

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Repository and stack audit | `MOCK_ONLY` | `docs/REPOSITORY_AUDIT.md`; local files/runtime inspected |
| Petal design source inventory | `MOCK_ONLY` | Supplied HTML/CSS/JS inspected and reused; no competing UI framework installed |
| Asset fingerprinting | `MOCK_ONLY` | SHA-256 content names emitted at runtime; hashed assets use one-year immutable cache |
| Environment safety | `MOCK_ONLY` | `.env.example`; production session secret is mandatory; development fallback is persisted with mode `0600` instead of rotating on restart; external modes default disabled |

## Phase 1 — identity slice 1

| Capability | Status | Evidence / limitation |
| --- | --- | --- |
| Registration + Argon2id | `MOCK_ONLY` | New users remain `PENDING_VERIFICATION`; local integration tests |
| Email verification | `MOCK_ONLY` | 24-hour, hash-at-rest, single-use tokens; delivery provider not configured |
| Login + sessions | `MOCK_ONLY` | Opaque tokens, SHA-256 at rest, HttpOnly cookie, server guard; legacy sessions rotated and pre-verification ACTIVE identities safely grandfathered by audited migrations |
| Password recovery | `MOCK_ONLY` | Non-enumerating API, 15-minute single-use token, all sessions revoked after reset |
| Brute-force control | `MOCK_ONLY` | Persistent per-IP + normalized-identifier failure window; distributed Redis enforcement remains open |
| CSRF and CORS | `MOCK_ONLY` | Signed double-submit token for browser mutations; explicit origin allowlist |
| Responsive auth UI | `MOCK_ONLY` | Petal/Fortless portrait + dedicated small-landscape layouts; browser/device E2E not yet executed |
| Cross-surface design coherence | `MOCK_ONLY` | Homepage, auth and app now share Fortless logo geometry, Inter Tight typography, color tokens and the same persisted theme preference |
| Mobile public homepage | `MOCK_ONLY` | Petal drawer navigation becomes full-screen on phones with focus return/trap, Escape and backdrop handling; development notice is compact; category, service, benefit and workflow collections use touch-native horizontal snap rails to reduce page height; physical-device visual regression remains open |
| Session-aware public navigation | `MOCK_ONLY` | Homepage CTAs are rendered from the server session state; authenticated users see dashboard actions and are redirected away from login/register |
| Customer app page guard | `MOCK_ONLY` | `/app` redirects unauthenticated requests server-side |
| Session/device management | `MOCK_ONLY` | Real active-session inventory, current-device identification, tenant-safe individual revocation, revoke-others action and audit events; local domain + HTTP coverage |
| TOTP multi-factor authentication | `MOCK_ONLY` | Supplied Petal QR/OTP/backup component, six-cell challenge with paste/autofill/backspace handling and separate recovery mode, password-confirmed enrollment, AES-256-GCM protected secrets, restart-stable key material, restart-independent one-time recovery-code hashes, persistent attempt throttling, disable flow and audit events; local tests only |
| Recent step-up authentication | `MOCK_ONLY` | Password plus live TOTP produces session-scoped evidence valid for ten minutes; failed password/code attempts do not elevate the session and successful elevation is audited. WebAuthn/passkeys remain open |
| Native responsive app shell | `MOCK_ONLY` | Correct document/CSS layering, docked portrait tab bar, docked landscape rail, mobile record cards, bottom-sheet modals and safe-area handling; physical-device browser matrix remains open |
| Customer app routing | `MOCK_ONLY` | Real History API paths (`/app/settings`, `/app/billing`, `/app/support`, etc.), authenticated deep-link refresh, back/forward navigation and automatic migration from legacy hash URLs |
| Customer app component integration | `MOCK_ONLY` | All six customer routes now compose supplied Petal primitives: stat tiles and service lists, plan selectors, invoice summaries/tables, support lists and modals, expandable audit rows, empty states, TOTP, session rows and responsive shells; no sample catalog cards are rendered while real API data loads |
| Staff/admin guard | `MOCK_ONLY` | Persisted, revocable staff memberships with `OWNER`, `ADMINISTRATOR`, `BILLING`, `SUPPORT`, `INFRASTRUCTURE`, and `AUDITOR` roles; permissions and MFA are checked from the database on every document/API request, so same-session revocation takes effect immediately |
| Staff operations workspace | `MOCK_ONLY` | Petal-based responsive routes at `/admin`, `/admin/accounts`, `/admin/services`, `/admin/tickets`, `/admin/audit`, and `/admin/staff`; role-filtered navigation and read APIs return real global database records with bounded search while deliberately omitting authentication/provider secrets |
| Staff membership administration | `MOCK_ONLY` | Owner-only create/change/revoke APIs require fresh step-up, confirmed target MFA, reason capture and audit; self-modification and removal of the final owner are rejected. No active `OWNER` has been inferred or auto-created, so live mutation remains unavailable until explicit owner assignment |

## Fail-closed integrations

- Customer checkout and Stripe webhook routes return configuration errors.
- The former instant-deploy route returns `410 LEGACY_FLOW_DISABLED` and cannot create payment/provider effects.
- Customer power actions return `PROVIDER_NOT_CONFIGURED`.
- Background provisioning dispatch is disabled at runtime.
- Capability API reports the exact non-operational verification tier.

## Verification executed

- `npm run build` — passed with 0 TypeScript compiler errors.
- `npm test` — 67/67 passed across Categories A through L:
  - Identity, auth, sessions, Argon2id, single-use tokens, step-up, and TOTP.
  - Catalog, dynamic pricing, EU VAT calculations, coupons, and capacity reservations.
  - Checkout idempotency, Stripe webhooks, refunds, disputes, and credit notes.
  - Multi-tenant support tickets and staff responses.
  - Pterodactyl provisioning adapter, power actions, anti-SSRF validation, and timeout recovery sagas.
  - Staff RBAC, read models, audit logs, and account lock mutations.
  - Category I: Outbox Concurrency, Crash Recovery, and Resilient Worker Leasing (atomic claiming with worker lease tokens, expired lease recovery, exponential backoff, and dead-lettering).
  - Category J: Transactional Email Outbox & Transport Isolation (concurrency-safe claiming, bounded retries, dead-lettering, sandbox receipts, and fail-closed live adapter).
  - Category K: Staff Owner Bootstrap Hardening & Recovery (rejection of unverified/no-MFA users, existing owner protection, and mandatory `--force --reason` audit log).
  - Category L: WebAuthn / Passkeys Phishing-Resistant MFA (single-use anti-replay challenges, origin mismatch rejection, ES256 cryptographic signature verification, authenticator counter anti-replay, and session issuance with `mfaVerified = true`).
- Decoupled `getDatabase()` connection acquisition from automatic schema migration runs.
- Fixed Admin UI modal clipping on mobile and invisibility on desktop by correcting unclosed `<nav class="tabbar">` and adding Petal `.scrim` / `.modal` CSS.
