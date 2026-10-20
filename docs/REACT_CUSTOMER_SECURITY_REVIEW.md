# FORTLESS — React Customer UI Security Hardening & Zero-Trust Review

**Target Surface:** Fastify REST API Boundaries & React Customer Frontend  
**Date:** 2026-10-20  
**Branch:** `feat/react-customer-ui`  
**Security Standard:** Strict Zero-Trust, Server-Side Authorization Everywhere, Zero Client Financial Authority (`AGENTS.md`)  

---

## 1. Authentication & Session Security

### 1.1 Cookie Security & Session Binding
- **Session Cookie:** The authenticated customer session cookie `fortless_session` is configured with `HttpOnly`, `SameSite=lax`, and `secure` in production (`SEC-10`). It is inaccessible to JavaScript.
- **CSRF Token Lifecycle:** Mutating requests (POST, PUT, DELETE, PATCH) require a session-bound cryptographic CSRF token fetched from `GET /api/v1/auth/csrf` and transmitted via header `X-CSRF-Token`.
  - In `fortlessHttp.ts`, CSRF tokens are retrieved on-demand and cached in-memory per session.
  - If a 403 CSRF mismatch occurs, the client automatically requests a fresh token and retries the mutation once. If CSRF initialization fails, mutations fail closed (`CSRF_INIT_FAILED`).
- **Session Revocation:** Revoking a session (`DELETE /api/v1/auth/sessions/:id` or `POST /api/v1/auth/sessions/revoke-others`) immediately invalidates tokens in the database, blocking subsequent API calls and WebSocket connections.

### 1.2 Route & Deep Link Protection
- Fastify server enforces authentication pre-handlers across all deep links under `/app` and `/app/*`.
- Unauthenticated requests are redirected with URL encoding:
  `/login?next=${encodeURIComponent(req.url)}`.
- If a session expires while navigating within the SPA, `fortlessHttp.ts` intercepts the HTTP 401 response and redirects the browser cleanly to the login screen with the current path preserved.
- No fixture or mock data is ever substituted when an authenticated request fails.

---

## 2. Authorization & Multi-Tenancy Invariants

### 2.1 Server-Side Enforcement (Zero Client Authority)
- Every Fastify endpoint independently authenticates the principal (`req.auth.user`), validates tenant membership (`req.auth.account`), and checks assigned role permissions (`req.auth.membership.role`).
- Any client-supplied `ownerId`, `accountId`, or `role` payload parameters are completely ignored by backend handlers.
- The React frontend merely reflects permissions granted by the server (e.g. disabling UI action buttons for `VIEWER` roles); backend security does not rely on the client hiding buttons.

### 2.2 Cross-Tenant Isolation Verification
Automated regression tests verify strict tenant isolation:
- **Services:** Tenant B cannot view, start, stop, or reconfigure Tenant A's services.
- **Support Tickets & Attachments:** `TICK-03` verifies Tenant B cannot access Tenant A's ticket conversations or stream attachment downloads.
- **DNS Zones:** `DOM-02` verifies Tenant B cannot view or modify Tenant A's DNS zones or records.
- **Backups & Databases:** Isolated strictly per tenant and service ownership.
- **Audit Activity:** Customer audit streams redact staff internal actions and IP addresses of other users.

---

## 3. Financial & Provisioning Integrity

### 3.1 Immutable Quotes & Minor Units
- All financial figures throughout the frontend (`Deploy.tsx`, `Invoices.tsx`, `Subscriptions.tsx`, `PricingTable.tsx`) are represented in integer minor units (EUR cents).
- The client NEVER calculates authoritative taxes, discounts, or final order prices.
- Deploy configuration requests a cryptographically signed, time-limited quote from `POST /api/v1/quotes`.
- Deploy configuration inputs are debounced (250ms) with cancellation of in-flight requests to eliminate excessive quote churn.
- Tax rates and jurisdiction labels (`taxLabel`) are derived solely from backend `taxEvidence`.

### 3.2 Checkout Idempotency & The Unknown Outcome Rule
- Checkout requests (`POST /api/v1/checkout`) require a deterministic idempotency key (`input.idempotencyKey ?? 'checkout-' + quoteId`).
- Network retries and transient timeouts reuse the exact same idempotency key, preventing duplicate order generation or duplicate payment intent creation.
- Checkout redirection URLs are strictly validated to allow only safe `http:` and `https:` schemes, preventing open-redirect vulnerabilities.
- Payment confirmation is strictly decoupled from client-side redirect status; orders are fulfilled ONLY upon server-side raw-body HMAC-SHA256 signature verification of Stripe webhooks.

---

## 4. Input Validation & Content Security

### 4.1 Content-Security-Policy (CSP)
- Fastify dynamically computes a strict Content-Security-Policy for all served HTML pages:
  ```text
  default-src 'self'; script-src 'self' 'sha256-...'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none';
  ```
- Inline scripts in `index.html` are hashed with SHA-256 and explicitly whitelisted in the header.

### 4.2 Local Offline QR Code Generation (Anti-Data-Leak)
- Previously, TOTP enrollment displayed a plain text `otpauth://` URI.
- In `frontend-react/src/app/components/QrCode.tsx`, QR codes are generated entirely client-side as inline SVGs using the bundled `qrcode` library.
- Secrets and TOTP keys are never transmitted to third-party image generation APIs.

### 4.3 WebAuthn / Passkeys Robustness
- Passkey registration payloads undergo strict client-side binary encoding matching Fastify WebAuthn contracts.
- User cancellations (`NotAllowedError`, `AbortError`) are caught gracefully and categorized as non-fatal without leaving corrupted session state.
- Sensitive security mutations (password change, recovery code regeneration, MFA disablement) enforce recent step-up authentication.

### 4.4 SSRF & Anti-Path-Traversal
- FastDL asset downloads and file manager operations enforce strict regex checks on `serviceId` (`/^[a-zA-Z0-9_-]{1,64}$/`) and normalize file paths to prevent directory traversal (`..`).
- Outbound provider webhooks and API integrations enforce strict DNS resolution and block RFC 1918 private IP ranges, loopback (`127.0.0.1`), and cloud metadata (`169.254.169.254`).

---

## 5. Security Audit Findings & Resolutions

| Finding ID | Severity | Component | Issue Description | Resolution Implemented | Test Verification |
|---|---|---|---|---|---|
| **SEC-FIX-01** | Medium | `Deploy.tsx` | Stale quote generation and keystroke spam | Implemented 250ms debouncing and AbortController request cancellation | Playwright deploy wizard tests |
| **SEC-FIX-02** | High | `fortlessHttp.ts` | Non-stable checkout idempotency keys generated via `randomUUID()` | Implemented deterministic idempotency key derivation based on quote ID | Checkout idempotency test |
| **SEC-FIX-03** | Medium | `fortlessHttp.ts` | Potential open redirect in checkout response | Enforced strict protocol validation (`http:` / `https:`) | Automated redirect validation |
| **SEC-FIX-04** | Low | `Security.tsx` | TOTP setup lacked local QR code renderer | Bundled `qrcode` library to render SVG locally without third-party network requests | Playwright test 18 (`mfa setup renders local svg qr code`) |
| **SEC-FIX-05** | Medium | `Services.tsx` / `Dashboard.tsx` | Suspended services conflated with critical technical errors | Decoupled `SUSPENDED` from error warnings; neutral badge treatment | Playwright test 15 (`suspended services do not trigger error warnings`) |
| **SEC-FIX-06** | Medium | `DNSRecordEditor.tsx` / `fortlessHttp.ts` | SRV and MX priority/weight/port dropped during serialization | End-to-end support for priority, weight, and port with automatic list reload | Playwright test 17 (`dns editor maps priority, weight and port`) |
| **SEC-FIX-07** | Medium | `ServiceDetailPage.tsx` | Generic "Service not found" for all API errors | Differentiated 401, 403, 404, and 500+ error tiers with actionable retry UI | Playwright test 16 (`service detail distinguishes 403, 404, and 500`) |

---

## 6. Residual Risk Assessment

- **Third-Party Provider Sandboxes:** Real Wings/Pterodactyl and Stripe staging environments require live credentials for production deployment; automated tests execute against verified mock and sandbox adapters.
- **Browser Compatibility:** WebAuthn passkey operations require modern browser support (Chrome 67+, Safari 14+, Firefox 60+). Legacy browsers fall back cleanly to password + TOTP authentication.
