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

- `npm run build` — passed.
- `npm test` — 20/20 passed, including verification/reset/session-at-rest, legacy identity migration, cross-user device-revocation denial, TOTP gating, recent step-up evidence, one-time recovery-code consumption, secret-minimized staff read models, deny-by-default staff RBAC and immediate revocation.
- `node --check public/assets/auth-ui.js` and `node --check public/assets/app-ui.js` — passed before the final fail-closed patch; repeated in handoff validation.
- Isolated Fastify injection smoke: missing CSRF `403`; registration `201`; unverified login `401`; hashed asset emitted with `Cache-Control: public, max-age=31536000, immutable`.
- Migration rehearsal against a SQLite backup retained both users, added identity tables/columns, and rotated legacy sessions. The watch process applied migrations v1–v2 to the served development database; both legacy ACTIVE identities now have an audited verification timestamp.
- Live smoke on 2026-10-17 confirmed `/forgot-password` serves the same Inter Tight font declaration as login and anonymous `/app` still redirects to `/login?next=/app`.
- Isolated HTTP smoke confirmed anonymous/authenticated homepage states and authenticated `/login` → `/app`; the shared password control swaps between Heroicons-style eye and eye-slash states on login, register and reset.
- Isolated HTTP device smoke confirmed two active sessions, CSRF-protected revoke-others, one surviving current session and valid `/app` document ordering.
- Authentication dark mode now keeps the logo legible, suppresses browser autofill color leakage and uses Fortless brand-mark artwork; app timestamps parse SQLite values consistently as UTC, and the loopback-only reverse proxy is explicitly trusted for forwarded client IPs.
- Customer app visual sweep on 2026-10-17 replaced parallel route-specific cards with supplied Petal components across `/app`, `/app/deploy`, `/app/billing`, `/app/support`, `/app/activity` and `/app/settings`; authenticated browser/device visual regression remains open.
- MFA restart regression on 2026-10-17 confirmed the development cryptographic key remains identical across process replacement; recovery codes are checked before TOTP decryption and corrupt legacy ciphertext now returns explicit `503 MFA_CONFIGURATION_UNAVAILABLE` rather than a misleading authentication `401`.
- Admin foundation verification on 2026-10-17 compiled the guarded deep-link routes and bounded read APIs, syntax-checked the client bundle, and exercised account search, global counts, empty operational queues and audit retrieval against isolated SQLite databases. No staff flag or privilege was assigned to a real user as part of implementation.
- Isolated admin HTTP permission smoke on 2026-10-17 confirmed anonymous `401`, staff without MFA `403`, permitted support route `200`, non-permitted audit route `403`, and same-session revocation `403`. Migration v4 preserved the single pre-existing staff identity as `ADMINISTRATOR`; it created no new privileged identity. Fingerprinted admin JavaScript serves live with immutable caching.
- Isolated step-up/staff-management HTTP smoke on 2026-10-17 confirmed password + TOTP step-up `200`, owner-authorized staff grant `201`, persisted `SUPPORT` role and one immutable audit event. Migration v5 stores only step-up timestamps, never credentials or TOTP codes.
- Homepage mobile development notice was recomposed from the existing Petal status/action primitives into a readable two-row card with a 44px action target; the screenshot's compressed 8–10px presentation is no longer used.

## Remaining Phase 1 work

1. Select/configure sandbox transactional email and add delivery retry/outbox evidence.
2. Add WebAuthn/passkeys and apply the implemented recent step-up guard to each future destructive account/financial/provider action; validate TOTP on a browser/device matrix.
3. Explicitly assign the initial staff `OWNER` through an approved bootstrap procedure, then expose the already-protected staff mutation APIs through a Petal owner workflow.
4. Add API-level two-tenant, CSRF/CORS, rate-limit, mobile browser, and accessibility E2E suites.
5. Split migrations from public API startup and establish PostgreSQL/Redis test infrastructure before production.
