# FORTLESS — React Customer UI Production Cutover & Rollback Plan

> Gate status (2026-10-20): do not cut over. Resolve `REACT_CUSTOMER_GO_NO_GO.md`. Root `npm run build` now includes React; both checkout-origin allowlists are required. No exact rollback duration is promised.

**Target Application:** FORTLESS Customer Portal (`/app`)  
**Feature Branch:** `feat/react-customer-ui`  
**Target Environments:** Staging / Production (`/home/fortless/htdocs/fortless.net`)  
**Standard:** Production-Grade Architecture, Zero Downtime, Instant Zero-Data-Loss Rollback  
**Status:** DRAFT / PREPARED — NOT AUTHORIZED FOR IMMEDIATE EXECUTION  

---

## 1. Executive Summary & Safety Invariants

This document establishes the precise step-by-step procedure for activating the modern React 19 customer frontend for the Fortless platform.

### Core Safety Invariants:
1. **Zero Database Migrations Required:** The React customer UI migration communicates with the exact existing Fastify v1 REST API (`/api/v1/*`) and WebSocket endpoints. No database schema changes, table alterations, or destructive record conversions are required.
2. **Non-Destructive Feature Flag:** Activation is controlled by an environment variable:
   ```env
   FORTLESS_REACT_CUSTOMER_UI=true
   ```
   When absent or set to `false`, Fastify defaults immediately to the legacy customer UI (`public/app.html` + `public/assets/app-ui.js`).
3. **Admin Surface Isolation:** The staff administrative portal (`/admin`) is completely separate and isolated. It does not share bundle files, routes, or styling with the React customer application. `/admin` remains 100% operational regardless of the customer UI feature flag state.
4. **Session & Auth Compatibility:** Both the legacy and React frontends rely on the identical, authoritative session cookie (`fortless_session`) and session-bound CSRF token (`/api/v1/auth/csrf`). Existing logged-in customers will not be logged out during cutover.
5. **Instant Rollback (< 5 seconds):** Reverting to the legacy customer UI requires only unsetting the environment flag and restarting or reloading the process. No database backups need to be restored.

---

## 2. Pre-Cutover Deployment Prerequisites

Before scheduling production cutover, the following prerequisites must be verified by the owner:

### 2.1 Artifact Verification
- [ ] Root TypeScript check passes cleanly: `npx tsc --noEmit` (0 errors).
- [ ] Frontend React TypeScript check passes: `cd frontend-react && npm run typecheck` (0 errors).
- [ ] Frontend React ESLint passes: `cd frontend-react && npm run lint` (0 errors).
- [ ] Root Vitest test suite passes completely: `npm test` (31 files, 497 tests passed).
- [ ] React HTTP integration suite passes: `npx playwright test tests/fortless-http-preview.spec.ts` (18/18 passed).
- [ ] Production React bundle is built cleanly in `frontend-react/dist-react-preview`:
  - `dist-react-preview/index.html`
  - `dist-react-preview/assets/*.js`
  - `dist-react-preview/assets/*.css`
  - `dist-react-preview/assets/*.woff2`

### 2.2 Infrastructure & Security Prerequisites
- [ ] Nginx configuration preserves pass-through to Fastify for `/app`, `/app/*`, and `/assets/*`.
- [ ] Fastify's `onSend` hook automatically derives Content-Security-Policy with inline script hashes for `index.html`.
- [ ] Hashed static assets in `dist-react-preview/assets/` are served with `Cache-Control: public, max-age=31536000, immutable`.
- [ ] Customer HTML responses (`/app` and `/app/*`) are served with `Cache-Control: no-store, private`.

---

## 3. Step-by-Step Activation Procedure

> [!CAUTION]
> **DO NOT EXECUTE THESE COMMANDS UNTIL FORMAL OWNER AUTHORIZATION IS GRANTED.**
> This procedure is documented for review and staging execution only.

### Step 1: Pre-Cutover Health Check
1. Verify production service health:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://fortless.net/health
   # Expected: 200
   ```
2. Verify legacy `/app` returns 302 redirect to `/login` when unauthenticated:
   ```bash
   curl -I https://fortless.net/app
   # Expected: HTTP/2 302, Location: /login?next=/app
   ```

### Step 2: Merge & Build on Target Host
1. Merge `feat/react-customer-ui` into `main` after independent pull request review.
2. In the deployment directory:
   ```bash
   npm ci
   cd frontend-react && npm ci && npm run build && cd ..
   npm run build:frontend
   npx tsc
   ```
3. Confirm `frontend-react/dist-react-preview/index.html` exists and is populated.

### Step 3: Enable the Feature Flag
1. Append or set the feature flag in the environment file (e.g. `.env` or systemd/PM2 environment):
   ```bash
   export FORTLESS_REACT_CUSTOMER_UI=true
   ```
2. Gracefully reload the Fastify service:
   ```bash
   pm2 reload fortless --update-env
   # Or: systemctl reload fortless
   ```

### Step 4: Immediate Post-Activation Smoke Verification
Execute the automated post-cutover smoke test:
1. **Unauthenticated deep link check:**
   ```bash
   curl -I https://fortless.net/app/account/security
   # Must return 302 to /login?next=%2Fapp%2Faccount%2Fsecurity
   ```
2. **Admin portal regression check:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://fortless.net/admin
   # Must return 302 to /login?next=%2Fadmin (unaltered)
   ```
3. **Static asset caching check:**
   Inspect one bundled asset:
   ```bash
   curl -I https://fortless.net/assets/<bundle-hash>.js
   # Must return 200, Content-Type: application/javascript, Cache-Control: public, max-age=31536000, immutable
   ```
4. **End-to-End customer journey:**
   - Sign in as a test customer account.
   - Verify `/app` renders Dashboard with real account data.
   - Verify suspended services show neutral status and do NOT trigger critical error warnings.
   - Open `/app/services/:id` and check power actions, console, and files.
   - Open `/app/account/security` and verify local SVG QR code displays for TOTP setup.
   - Open `/app/domains/:domain` and verify DNS records render with priority/weight/port.
   - Navigate to `/app/deploy` and verify quote debouncing and correct tax display.

---

## 4. Monitoring & Alert Thresholds

Monitor application and error metrics for 60 minutes post-activation:
- **HTTP 5xx Error Rate:** Must remain below 0.1% of customer traffic.
- **CSRF Failure Spikes:** Watch for `CSRF_INIT_FAILED` or HTTP 403 on `/api/v1/*`.
- **WebSocket Connection Failures:** Monitor Wings proxy connections for console streaming.
- **Client Error Reporting:** Monitor browser console error rates.

---

## 5. Rollback Procedure (< 5 Seconds Execution)

### Immediate Rollback Conditions:
Initiate instant rollback if ANY of the following occur:
1. Customer login or session validation fails systematically (> 1% failure rate).
2. CSRF tokens fail to validate on mutations across multiple sessions.
3. Unhandled runtime JavaScript crashes block customer access to services or billing.
4. Any financial mismatch or quote discrepancy is detected.
5. Admin portal functionality is impaired.

### Rollback Commands:
1. Disable the feature flag:
   ```bash
   export FORTLESS_REACT_CUSTOMER_UI=false
   # Or remove from .env / PM2 ecosystem
   ```
2. Gracefully reload the Fastify service:
   ```bash
   pm2 reload fortless --update-env
   ```
3. Verify immediate restoration of the legacy customer UI:
   ```bash
   curl -I https://fortless.net/app
   # Must serve legacy app.html with Cache-Control: no-store
   ```

**Data Safety Guarantee:** Because all business logic, orders, services, tickets, and financial data reside authoritatively in the Fastify backend database, rolling back the frontend has **zero impact** on user data, running game servers, paid invoices, or tickets created during the release window.
