# FORTLESS — Executable Test Matrix & Release Gates

**Version:** 1.0.0-PROD  
**Status:** Approved for Implementation (Phase 0 Baseline)  
**Standard:** Automated Quality & Security Verification Framework  

---

## 1. Test Verification Hierarchy

Every vertical slice must be validated across the testing pyramid before being marked complete:

```
                      ┌──────────────────────┐
                      │ End-to-End User Sagas│ (Playwright / Multi-Context)
                      ├──────────────────────┤
                      │ API & RBAC Boundary  │ (Supertest / Fastify Inject)
                      ├──────────────────────┤
                      │ Provider Contract    │ (Pterodactyl Mock & Sandbox)
                      ├──────────────────────┤
                      │ Transactional DB     │ (Prisma / SQL Foreign Key / Lock)
                      ├──────────────────────┤
                      │ Domain Invariant Unit│ (Pure Logic / Money / State Machines)
                      └──────────────────────┘
```

### Status Tagging Protocol:
- `[NOT_STARTED]` — Specification defined; implementation not yet created.
- `[MOCK_ONLY]` — Implemented and validated against local mocks, fixtures, and unit suites.
- `[SANDBOX_VERIFIED]` — Validated against official third-party vendor sandbox/staging environments (e.g. Stripe Testmode, Staging Pterodactyl Panel).
- `[PRODUCTION_VERIFIED]` — Validated in production under canary or pilot rollout with live audit evidence.

---

## 2. Comprehensive Test Scenarios by Category

### A. Authentication & Tenant Isolation
- [x] `AUTH-01`: Anonymous/Invalid session token returns null context. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AUTH-02`: Multi-Tenant Isolation — User A and User B belong to distinct accounts with zero cross-tenant leakage. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AUTH-03`: Argon2id password hashing is irreversible, authenticates valid passwords, rejects invalid. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `AUTH-04`: Billing Manager role cannot perform power action (`START`/`STOP`/`KILL`) on a server. `[NOT_STARTED]`
- [ ] `AUTH-05`: Technical Admin role cannot view payment methods or trigger refunds. `[NOT_STARTED]`
- [ ] `AUTH-06`: Staff member cannot access customer server file editor without signed time-limited consent ticket. `[NOT_STARTED]`
- [x] `AUTH-07`: Email verification and password reset tokens are hash-at-rest, single-use, and time-bound; password reset revokes prior sessions. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `AUTH-08`: Distributed rate limiter restricts brute-force login attempts (max 5 per IP/user per 15 min). `[NOT_STARTED]`

### B. Pricing, Quotes & Catalog Invariants
- [x] `CAT-01`: Seeded catalog contains published plans with exact pricing and resource limits. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CAT-02`: Manipulated client price payload is rejected; quote total rules. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CAT-03`: Quote signature verification rejects tampered quote IDs or wrong tenant. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `CAT-04`: 100 concurrent checkout attempts for a coupon with max 100 uses allows exactly 100 redemptions. `[NOT_STARTED]`
- [x] `CAT-05`: Quote calculates exact minor units, EU VAT (19% DE), and B2B reverse charge (0% FR). `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `CAT-06`: Region with zero available node capacity denies cart reservation. `[NOT_STARTED]`

### C. Payments & Webhooks (Critical Financial Gates)
- [x] `PAY-01`: Webhook signature verification validates authentic Stripe signatures and rejects forgeries. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PAY-02`: Duplicate delivery of same PSP event ID returns 200 OK without duplicate execution. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `PAY-03`: Two different event IDs for the same payment intent do not grant double server entitlements. `[NOT_STARTED]`
- [x] `PAY-04`: Webhook payload with mismatched amount transitions to ANOMALY_HELD. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PAY-05`: Repeated checkout submissions with same Idempotency-Key return identical session without duplicate orders. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `PAY-06`: Database outage during webhook ingestion returns non-2xx status, forcing PSP retry. `[NOT_STARTED]`
- [ ] `PAY-07`: Refund request exceeding remaining refundable balance is rejected with 422 Unprocessable. `[NOT_STARTED]`
- [ ] `PAY-08`: Partial refund creates credit note for exact partial amount, preserving remaining balance. `[NOT_STARTED]`
- [ ] `PAY-09`: Card details (PAN/CVV) never appear in logs, database columns, or API response bodies. `[NOT_STARTED]`

### D. Subscription Lifecycle & Renewals
- [ ] `SUB-01`: End-of-month renewal (Jan 31 -> Feb 28 -> Mar 31) maintains correct anchor date. `[NOT_STARTED]`
- [ ] `SUB-02`: Overlapping renewal worker jobs run simultaneously; exactly one renewal invoice generated. `[NOT_STARTED]`
- [ ] `SUB-03`: Cancellation effective at period end allows service usage until period end date, then terminates. `[NOT_STARTED]`
- [ ] `SUB-04`: Failed card payment initiates 5-day grace period; service remains `ACTIVE` with dunning alerts. `[NOT_STARTED]`
- [ ] `SUB-05`: Unpaid invoice after grace period triggers automated Pterodactyl `suspend`. `[NOT_STARTED]`

### E. Infrastructure Provisioning & Failure Recovery
- [x] `PROV-01`: Outbox worker provisions exactly one server and marks service ACTIVE. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `PROV-02`: Unpaid or canceled order never invokes provider creation API under any circumstances. `[NOT_STARTED]`
- [ ] `PROV-03`: Provider returns 500 error; outbox worker retries with exponential backoff + jitter. `[NOT_STARTED]`
- [x] `PROV-04`: The Unknown Outcome Rule — Timeout after creation recovers via correlation tag without duplicate server creation. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [ ] `PROV-05`: Outbox worker terminated via `SIGKILL` mid-execution; next worker picks up lease safely. `[NOT_STARTED]`
- [ ] `PROV-06`: Customer cannot manipulate container startup variables to bypass egg environment constraints. `[NOT_STARTED]`
- [ ] `PROV-07`: Service suspension stops container immediately; disk files remain intact. `[NOT_STARTED]`
- [ ] `PROV-08`: Reconciler discovers orphaned Pterodactyl server and logs quarantine alert. `[NOT_STARTED]`
- [ ] `PROV-05`: Outbox worker terminated via `SIGKILL` mid-execution; next worker picks up lease safely. `[NOT_STARTED]`
- [ ] `PROV-06`: Customer cannot manipulate container startup variables to bypass egg environment constraints. `[NOT_STARTED]`
- [ ] `PROV-07`: Service suspension stops container immediately; disk files remain intact. `[NOT_STARTED]`
- [ ] `PROV-08`: Reconciler discovers orphaned Pterodactyl server and logs quarantine alert. `[NOT_STARTED]`

### F. Security & Vulnerability Defense
- [ ] `SEC-01`: SSRF probe to `http://169.254.169.254` or `http://127.0.0.1` is blocked by egress IP validator. `[NOT_STARTED]`
- [ ] `SEC-02`: Stored XSS payload `<script>alert(1)</script>` in support ticket is sanitized on render. `[NOT_STARTED]`
- [ ] `SEC-03`: File manager download endpoint rejects path traversal `../../../../etc/shadow`. `[NOT_STARTED]`
- [ ] `SEC-04`: WebSocket console subscription without valid short-lived ticket is rejected with `401`. `[NOT_STARTED]`
- [ ] `SEC-05`: CORS header rejects untrusted origin requesting credentials (`Access-Control-Allow-Origin: *` blocked). `[NOT_STARTED]`

### G. Customer Application UI
- [x] `UI-01`: Homepage, login, registration, and authenticated app use the same Fortless logo asset. `[MOCK_ONLY]` (Static source verification)
- [x] `UI-02`: Customer app reads the implemented service, invoice, ticket, and audit API field contracts without fabricated provider status. `[MOCK_ONLY]` (TypeScript build + local HTTP smoke verification)
- [x] `UI-03`: Ticket and service content is escaped before dynamic HTML rendering. `[MOCK_ONLY]` (Source review; browser E2E remains not started)
- [ ] `UI-04`: Responsive keyboard, screen-reader, contrast, and browser interaction pass against the authenticated app. `[NOT_STARTED]`
- [x] `UI-05`: Auth and client shells define distinct portrait-phone and compact landscape-phone compositions with safe-area padding. `[MOCK_ONLY]` (Static CSS/source verification; device-browser E2E remains required)

---

## 3. Strict P0 Release Acceptance Gate Checklist

Before public commercial traffic is routed to Fortless, all mandatory gates must be verified:

- [ ] **Gate 1:** 100% of Critical Financial tests (Category C) pass in automated CI.
- [ ] **Gate 2:** 100% of Auth & Tenant Isolation tests (Category A) pass with zero leaks.
- [ ] **Gate 3:** Provider Timeout & Idempotency tests (Category E) pass with zero duplicate instances.
- [ ] **Gate 4:** Stripe Testmode / Sandbox end-to-end checkout, 3DS challenge, and webhook verification verified.
- [ ] **Gate 5:** Staging Pterodactyl 1.x panel verified with real server creation, suspension, and deletion.
- [ ] **Gate 6:** Off-host database backup and point-in-time recovery (PITR) drill executed and verified.
- [ ] **Gate 7:** Legal Terms of Service, Privacy Policy, and Acceptable Use Policy reviewed and posted.
- [ ] **Gate 8:** No hardcoded secrets, test credentials, or debug bypass flags exist in the codebase.
