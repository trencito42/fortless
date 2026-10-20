# React customer UI — go/no-go gate

Date: 2026-10-20  
Decision: **NOT READY — BLOCKERS REMAIN**

## Confirmed fixes

- Checkout uses a per-purchase UUID, reuses its final quote/key, blocks client double submission, and reconciles via tenant-scoped `GET /api/v1/checkout-intents/:key` before retry.
- Fastify remains authoritative: in-progress/divergent duplicates return `409`; completed responses replay; reconciliation is Owner/Billing Manager only.
- `POST /api/v1/quotes/preview` uses the authoritative tax calculation without persisting quote rows. Only the finalized order gets a persistent quote. Preview requests carry a real `AbortSignal` and stale results cannot replace current state.
- Quick Setup no longer implies software-EULA acceptance. Fortless Terms and workload EULA are separate.
- Checkout origins are allowlisted by backend `CHECKOUT_ALLOWED_ORIGINS` and frontend `VITE_CHECKOUT_ALLOWED_ORIGINS`.
- Billing balances are grouped by currency; unsupported invoice-payment/default-card CTAs were removed.
- Root `npm run build` now includes legacy assets, React production build and root TypeScript.

## Evidence

| Check | Result | Classification |
| --- | --- | --- |
| Root Vitest | 32 files / 504 tests passed before the final redirect test; final focused rerun passed 28/28 | unit + FASTIFY_INTEGRATION_TESTED contracts |
| Focused checkout, deployment, WebAuthn | 4 files / 50 tests passed; redirect allowlist test also passed in final 28/28 rerun | isolated integration/provider double |
| React typecheck, ESLint, production build | passed | BUILD_VERIFIED |
| Real Fastify + temp SQLite + synthetic login + React + Chromium | 2/2 passed | FASTIFY_INTEGRATION_TESTED |
| Existing React Playwright suite | 8 workbench timeouts, 4 interrupted, 1 passed, 1777 not run | FAILED |
| Stripe sandbox | not executed | BLOCKED_EXTERNAL |
| Pterodactyl sandbox | not executed | BLOCKED_EXTERNAL |
| Staging | not executed | NOT_STAGING_VERIFIED |

The real-browser suite proves Fastify login/session cookies, authenticated Dashboard, real SQLite inventory, Services, unauthenticated deep-link redirect, authenticated hard refresh, API/SPA separation, CSP and no-store HTML. It does not prove external payment or provisioning.

## Blockers and risks

- **High:** full existing Playwright is not green. Commerce/workbench tests expect embedded stories at production `/`, while workbench code is correctly absent from the production bundle; fixture customer-flow tests now hit real Fastify auth and redirect to login. Split those suites onto explicit workbench/fixture servers.
- **High / external:** no credentialed Stripe test-account checkout/webhook run.
- **High / external:** no real Pterodactyl sandbox provisioning/console/file run.
- **Medium:** DNS mutation, attachments, MFA/WebAuthn ceremony, suspended operations and mobile were not all repeated in the new Fastify-backed browser harness. Backend security suites passed; mocked browser tests are not equivalent.
- **Medium:** purchase intent is memory-only so deployment secrets never enter browser storage. A reload after an ambiguous submit cannot recover its key, but also cannot blindly submit a duplicate. Durable recovery needs a backend-issued opaque intent before checkout.

## Unsupported backend capabilities

Direct existing-invoice payment; saved payment methods; customer API-key issuance; cart persistence; billing-cycle changes; nameserver changes; domain auto-renew; some usage/history; fine-grained account permission editing. The UI labels/removes these actions rather than returning fake success or empty data.

## Cutover prerequisites

1. Clean build: `npm ci && npm run build`.
2. Configure matching backend/frontend checkout-origin allowlists.
3. Pass Stripe and Pterodactyl sandbox gates, repaired full Playwright, and staging smoke tests.
4. Keep `FORTLESS_REACT_CUSTOMER_UI=false` until owner approval. Roll back by restoring the flag and reloading the app process under normal change control. No exact rollback time is promised.

No production setting, service, database, proxy or feature flag was changed.
