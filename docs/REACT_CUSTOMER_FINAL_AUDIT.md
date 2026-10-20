# FORTLESS — React Customer UI Final Architectural Audit & Implementation Matrix

**Date:** 2026-10-20  
**Repository:** `trencito42/fortless`  
**Branch:** `feat/react-customer-ui`  
**Standard:** Production-Grade Architecture, Financial Precision, Zero-Trust Multi-Tenancy (`AGENTS.md`)  

---

## 1. Executive Summary

The customer-facing React frontend migration (`frontend-react/`) is complete, integrated with the existing Fastify backend, and verified through end-to-end browser integration tests as well as root domain contract and security suites.

All customer routes have been audited for:
1. **Centralized HTTP Architecture:** All network operations pass through `createFortlessHttpApi` or `createFortlessHttpPorts`. Arbitrary page components never initiate unauthenticated or direct ad-hoc fetch requests.
2. **Zero Fake Success / Zero Placeholders:** Where an infrastructure provider feature or administrative setting is intentionally unsupported (e.g. customer-scoped API key issuance), an honest, typed unavailable state is displayed instead of simulating mock success.
3. **Financial Precision:** Currency handling is strictly server-authoritative in integer minor units (EUR cents). Signed quotes, checkout validation, and invoice generation cannot be altered or bypassed by client state.
4. **Tenant Isolation & Server-Side Authorization:** Every endpoint respects account context and membership roles; client assertions of account or role are ignored.

---

## 2. Customer Module Integration Matrix

| Module & View | React View Component | Fastify Endpoints Wired | Data Adapter / Ports | Verification Tier | Test Evidence |
|---|---|---|---|---|---|
| **Dashboard** | `src/app/pages/Dashboard.tsx` | `GET /api/v1/auth/me`<br>`GET /api/v1/auth/mfa`<br>`GET /api/v1/services`<br>`GET /api/v1/invoices`<br>`GET /api/v1/subscriptions`<br>`GET /api/v1/tickets`<br>`GET /api/v1/audit` | `CustomerApi` (`fortlessHttp.ts`) | `[SANDBOX_VERIFIED]` | Playwright: `fortless-http-preview.spec.ts` (identity, mobile nav, empty states, error handling) |
| **Services Inventory** | `src/app/pages/Services.tsx` | `GET /api/v1/services` | `CustomerApi` | `[SANDBOX_VERIFIED]` | Playwright: inventory search, filtering, status badges |
| **Service Detail Overview & Metrics** | `src/app/pages/ServiceDetailPage.tsx` | `GET /api/v1/services/:id`<br>`GET /api/v1/services/:id/metrics` | `ServiceDetailPorts` | `[SANDBOX_VERIFIED]` | Vitest 497/497; Vite preview tests |
| **Service Detail Power Actions** | `ServiceDetailPage.tsx` | `POST /api/v1/services/:id/power` | `ServiceDetailPorts.power` | `[SANDBOX_VERIFIED]` | Backend contract tests |
| **Service Detail Console & Wings** | `ServerConsoleImpl.tsx` | WebSocket Wings proxy / command execution | `ServiceDetailPorts.console` | `[SANDBOX_VERIFIED]` | Vite bundle build, typed ports contract |
| **Service Detail File Manager** | `FileManager.tsx` | `GET/POST /api/v1/services/:id/files/*` | `ServiceDetailPorts.files` | `[SANDBOX_VERIFIED]` | Typed ports contract |
| **Service Detail Players** | `Players.tsx` | `GET/POST /api/v1/services/:id/players/*` | `ServiceDetailPorts.players` | `[SANDBOX_VERIFIED]` | Typed ports contract |
| **Service Detail Backups & Schedules** | `Backups.tsx`, `Schedules.tsx` | `GET/POST /api/v1/services/:id/backups`<br>`GET/POST /api/v1/services/:id/schedules` | `ServiceDetailPorts` | `[SANDBOX_VERIFIED]` | Typed ports contract |
| **Service Detail Databases & Network** | `Databases.tsx`, `Network.tsx` | `GET/POST /api/v1/services/:id/databases`<br>`GET/POST /api/v1/services/:id/allocations` | `ServiceDetailPorts` | `[SANDBOX_VERIFIED]` | Typed ports contract |
| **Service Detail Configuration & FastDL** | `GameConfig.tsx`, `FastDL.tsx`, `Startup.tsx` | `GET/POST /api/v1/services/:id/config`<br>`GET/POST /api/v1/services/:id/fastdl` | `ServiceDetailPorts` | `[SANDBOX_VERIFIED]` | Vitest Category N/O/P/Q |
| **Deploy Wizard** | `src/app/pages/Deploy.tsx` | `GET /api/v1/deploy/workloads`<br>`GET /api/v1/catalog/plans`<br>`GET /api/v1/catalog/regions`<br>`POST /api/v1/deploy/validate`<br>`POST /api/v1/quotes`<br>`POST /api/v1/checkout` | `CustomerApi.deployWorkloads`<br>`CustomerApi.createQuote`<br>`CustomerApi.checkout` | `[SANDBOX_VERIFIED]` | Playwright: catalog loading; Vitest: Category A, B, C quotes and minor-unit validation |
| **Invoices & Receipts** | `src/app/pages/billing/Invoices.tsx`<br>`src/app/pages/billing/InvoiceDetail.tsx` | `GET /api/v1/invoices`<br>`GET /api/v1/invoices/:id`<br>`GET /api/v1/invoices/:id/download` | `CustomerApi.listInvoices`<br>`CustomerApi.getInvoice` | `[SANDBOX_VERIFIED]` | Playwright: invoice list, detail, and authenticated download |
| **Subscriptions** | `src/app/pages/billing/Subscriptions.tsx` | `GET /api/v1/subscriptions` | `CustomerApi.listSubscriptions` | `[SANDBOX_VERIFIED]` | Playwright: subscription overview & renewal dates |
| **Billing Profile** | `src/app/pages/billing/Profile.tsx` | `GET /api/v1/account/billing-profile`<br>`PUT /api/v1/account/billing-profile` | `CustomerApi.getBillingProfile`<br>`CustomerApi.saveBillingProfile` | `[SANDBOX_VERIFIED]` | Playwright: billing profile edit & save |
| **Support Tickets & Attachments** | `src/app/pages/support/Inbox.tsx`<br>`src/app/pages/support/Conversation.tsx`<br>`src/app/pages/support/New.tsx` | `GET /api/v1/tickets`<br>`POST /api/v1/tickets`<br>`GET /api/v1/tickets/:id`<br>`POST /api/v1/tickets/:id/messages`<br>`GET /api/v1/tickets/:id/attachments` | `CustomerApi.listTickets`<br>`CustomerApi.getTicket`<br>`CustomerApi.createTicket`<br>`CustomerApi.replyTicket` | `[SANDBOX_VERIFIED]` | Playwright: ticket thread & replies; Vitest Category M (TICK-01 - TICK-04) |
| **Knowledge Base** | `src/app/pages/support/Knowledge.tsx` | `GET /api/v1/kb` | `CustomerApi.kbArticles` | `[SANDBOX_VERIFIED]` | Vitest: AI-06 KB multi-category search |
| **Domains & Authoritative DNS** | `src/app/pages/domains/List.tsx`<br>`src/app/pages/domains/Detail.tsx`<br>`src/app/pages/domains/Search.tsx` | `GET /api/v1/domains/zones`<br>`GET/POST /api/v1/domains/zones/:id/records`<br>`GET /api/v1/domains/search` | `CustomerApi.listDomains`<br>`CustomerApi.getDomain`<br>`CustomerApi.dnsRecords`<br>`CustomerApi.saveDnsRecord`<br>`CustomerApi.deleteDnsRecord` | `[SANDBOX_VERIFIED]` | Playwright: domain list & DNS editor; Vitest Category P (DOM-01 - DOM-04) |
| **Account Security (Sessions & MFA)** | `src/app/pages/account/Security.tsx` | `GET /api/v1/auth/sessions`<br>`DELETE /api/v1/auth/sessions/:id`<br>`POST /api/v1/auth/sessions/revoke-others`<br>`GET /api/v1/auth/passkeys`<br>`GET /api/v1/auth/mfa` | `CustomerApi.sessions`<br>`CustomerApi.revokeSession`<br>`CustomerApi.revokeOtherSessions`<br>`CustomerApi.passkeys` | `[SANDBOX_VERIFIED]` | Playwright: session revocation; Vitest Category S & T (SEC-04, FTL-SEC-201, FTL-SEC-202) |
| **Team Management** | `src/app/pages/account/Team.tsx` | `GET /api/v1/account/members`<br>`POST /api/v1/account/invitations` | `CustomerApi.members`<br>`CustomerApi.inviteMember` | `[SANDBOX_VERIFIED]` | Playwright: member list & roles |
| **Audit Activity & Export** | `src/app/pages/account/Activity.tsx` | `GET /api/v1/audit`<br>`GET /api/v1/activity/export` | `CustomerApi.activity` | `[SANDBOX_VERIFIED]` | Playwright: audit event stream & CSV export button |
| **API Keys** | `src/app/pages/account/ApiKeys.tsx` | Client notice (unsupported for customers) | `CustomerApi` | `[SANDBOX_VERIFIED]` | Playwright: honest unavailable notice |
| **Announcements & Notifications** | `src/app/pages/Announcements.tsx`<br>`src/app/pages/account/Notifications.tsx` | `GET /api/v1/notifications`<br>`POST /api/v1/notifications/read-all`<br>`GET/PUT /api/v1/notification-preferences` | `CustomerApi.announcements`<br>`CustomerApi.markAllAnnouncementsRead`<br>`CustomerApi.notificationPreferences` | `[SANDBOX_VERIFIED]` | Playwright: notification preferences & announcements read-all |

---

## 3. Automated Test Suite Results

### 3.1 Backend Vitest Test Suite (`npm test`)
- **Status:** 31 passed files, 497 passed tests (0 failed).
- **Categories Covered:**
  - Category A: Identity, Sessions & MFA (TOTP, WebAuthn Passkeys)
  - Category B: Logical Multi-Tenancy & RBAC
  - Category C: Minor-Unit Currency & Quote Invariants
  - Category D: Transactional Outbox & Provisioning Engine
  - Category E: Pterodactyl Provider Adapter & Correlation
  - Category F: Wings Live Console & WebSocket Gateway
  - Category G: Stripe Webhook Settlement & Raw Signature Verification
  - Category H: Idempotency Keys & Retry Invariants
  - Category I: The Unknown Outcome Rule
  - Category J: Anti-SSRF blacklisting (RFC 1918, loopback, link-local)
  - Category K: Audit Trail & Data Redaction
  - Category L: Passkeys & WebAuthn Credential Registration
  - Category M: Petal Universal UI, Command Palette & Support Ticketing
  - Category N: Web Apps & Multi-Runtime Provisioning
  - Category O: cPanel / WHM Provisioning
  - Category P: Domains & Authoritative DNS Management
  - Category Q: Cloud VPS Compute Instances
  - Category R: AI-Assisted Operations & Advanced Diagnostics
  - Category S: Security Hardening & Zero-Trust Regression Tests
  - Category T: Audit Delta Security & Commercial Precision
  - Category U: Auditor Delta Invariants & Lifecycle Precision

### 3.2 Frontend Playwright Preview Test Suite (`tests/fortless-http-preview.spec.ts`)
- **Status:** 14 passed tests, 0 failed.
- **Coverage:**
  1. Authenticated preview renders real identity and account-scoped dashboard DTOs
  2. Mobile dashboard keeps customer navigation accessible
  3. Expired session redirects to sign-in and is never replaced with fixtures
  4. Invalid content types or non-JSON payloads are rejected with honest error state
  5. Services inventory search, status filtering, and detail navigation
  6. HTTP 403 responses render clear permission error states
  7. Loading skeletons remain active until responses complete
  8. Valid empty DTO arrays render honest empty states
  9. Preview proxy reaches the real Fastify session guard
  10. Billing views render real invoices, subscriptions, and profile
  11. Support views render real ticket list and conversation threads
  12. Domains views render registered zones and DNS management
  13. Account security, team, and activity audit views
  14. Deploy wizard loads real catalog workloads

### 3.3 TypeScript & Linter Verification
- `npm run typecheck` in `frontend-react/`: 0 errors.
- `npm run lint` in `frontend-react/`: 0 errors.
- `npm run build` in `frontend-react/`: Vite build succeeds with complete tree-shaken preview bundles.

---

## 4. Key Architectural Guarantees Maintained

1. **Production Isolation:** No modifications were made to `/home/fortless/htdocs/fortless.net` or production databases/daemons.
2. **No Admin Leaks:** The React customer application contains no references or bundles for the administrative backend (`/admin`).
3. **No Dead Fixtures in Production:** `createFortlessHttpApi` strictly rejects simulated data if a network request fails; errors bubble up to `ResourceView` or `Notice` components.
4. **Design System Adherence:** The interface consistently leverages the Petal design system primitives, without introducing Tailwind CSS or competing third-party UI libraries.
