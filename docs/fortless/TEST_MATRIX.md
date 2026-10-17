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
- [x] `SUB-01`: End-of-month renewal (Jan 31 -> Feb 28 -> Mar 31) maintains correct anchor date. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-01)
- [x] `SUB-02`: Subscription renewal dunning assigns 5-day grace period, creates open invoice, and queues alert email. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-02)
- [x] `SUB-03`: Cancellation effective at period end terminates service upon period expiration. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-05)
- [x] `SUB-04`: Failed payment enters 5-day grace period; service remains `ACTIVE` with dunning alerts. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-02)
- [x] `SUB-05`: Expired grace period triggers automated service suspension; settlement unsuspends service. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-03 & DUN-04)

### E. Infrastructure Provisioning & Failure Recovery
- [x] `PROV-01`: Outbox worker provisions exactly one server and marks service ACTIVE. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-04`: The Unknown Outcome Rule — Timeout after creation recovers via correlation tag without duplicate server creation. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-05`: Outbox worker automatically recovers stuck PROCESSING events after lease expiration. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-06`: Tenant-isolated service detail returns full specs and rejects cross-tenant access. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-07`: Safe power actions update provider and observed state with persistent audit event. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-08`: Power action on non-active service fails closed. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-09`: Suspension and termination release node allocation and update status safely. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `PROV-10`: Insufficient node capacity flags provision_operations as NEEDS_MANUAL_REVIEW without fabricating ACTIVE. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

### F. Security & Vulnerability Defense
- [x] `SEC-01`: SSRF probe to `http://169.254.169.254` or `http://127.0.0.1` is blocked by egress IP validator. `[MOCK_ONLY]` (Verified in tests/platform.test.ts SSRF-01)
- [x] `SEC-02`: Stored XSS payload `<script>alert(1)</script>` in support ticket is sanitized on render. `[MOCK_ONLY]` (Verified in tests/frontend.test.ts UI-XSS-01)
- [x] `SEC-03`: File attachment upload rejects path traversal filenames (`../../evil.png`) and executable MIME types. `[MOCK_ONLY]` (Verified in tests/platform.test.ts TICK-02)
- [x] `SEC-04`: Multi-tenant scoped search and ticket downloads isolate tenant attachments strictly. `[MOCK_ONLY]` (Verified in tests/platform.test.ts TICK-03 & SEARCH-01)

### G. Customer Application UI
- [x] `UI-01`: Homepage, login, registration, and authenticated app use the same Fortless logo asset. `[MOCK_ONLY]` (Static source verification)
- [x] `UI-02`: Customer app reads the implemented service, invoice, ticket, and audit API field contracts without fabricated provider status. `[MOCK_ONLY]` (TypeScript build + local HTTP smoke verification)
- [x] `UI-03`: Ticket and service content is escaped before dynamic HTML rendering. `[MOCK_ONLY]` (Verified in tests/frontend.test.ts)
- [x] `UI-05`: Auth and client shells define distinct portrait-phone and compact landscape-phone compositions with safe-area padding. `[MOCK_ONLY]` (Static CSS/source verification)

### H. Extended Infrastructure & Web App Workloads
- [x] `WEBAPP-01`: Seeded catalog includes Web & Cloud Apps with valid Node.js plan specifications and EUR pricing. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `WEBAPP-02`: Web app configuration validation enforces safe Git repository URLs and blocks SSRF / loopback targets. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `WEBAPP-03`: Outbox worker maps web application parameters to provisioning spec environment variables and provisions successfully. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

### I. cPanel / WHM Shared Hosting
- [x] `CPANEL-01`: CpanelHttpAdapter blocks SSRF when configured with private/loopback WHM URLs. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CPANEL-02`: MockCpanelAdapter provisions cPanel account, registers correlation tag, and manages suspension/unsuspension/termination. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CPANEL-03`: The Unknown Outcome Rule — Timeout during cPanel account creation recovers via correlation lookup without creating duplicates. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CPANEL-04`: Direct VM power actions on shared cPanel hosting fail closed with typed UNSUPPORTED_OPERATION error. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

### J. Domains & Authoritative DNS Management
- [x] `DOM-01`: Domain search validates input, parses TLD, and returns availability and minor-unit pricing for catalog TLDs. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `DOM-02`: Multi-tenant zone isolation prevents Tenant B from viewing or mutating Tenant A's DNS records. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `DOM-03`: DNS record validation enforces RFC rules for A, AAAA, CNAME, MX, TXT, and SRV, rejecting invalid payloads. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `DOM-04`: CNAME collision rule (RFC 1912 §2.4): CNAME cannot coexist with other records at the same node. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

### K. Cloud VPS Compute Instances (Proxmox / KVM)
- [x] `VPS-01`: Seeded catalog includes Cloud VPS category and tiered plans with valid specs and EUR pricing. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `VPS-02`: VPS configuration validation validates hostnames, guest OS images, and SSH public keys. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `VPS-03`: ProxmoxHttpAdapter blocks SSRF when configured with private/loopback metadata URLs. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `VPS-04`: MockProxmoxAdapter provisions KVM instance, handles power lifecycle, and issues VNC console tickets. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `VPS-05`: The Unknown Outcome Rule — Timeout during VM provisioning recovers via correlation lookup without creating duplicate VMs. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `VPS-06`: Outbox worker maps VPS provisioning spec to hypervisor adapter and marks service ACTIVE. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

### L. AI-Assisted Operations & Advanced Diagnostics
- [x] `AI-01`: Input redactor strictly masks credit cards, API keys, private keys, passwords, and tokens before LLM dispatch. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-02`: Guardrail enforcement: AI outputs strictly read-only diagnostics; monetary and destructive action attempts fail closed. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-03`: OpenAiCompatibleAdapter validates base URL with anti-SSRF protections, rejecting loopback and metadata endpoints. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-04`: MockAiProviderAdapter diagnoses service crash states and returns structured root-cause analysis and remediation steps. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-05`: Ticket triage engine analyzes customer ticket thread, assigns category, sentiment, and drafts contextually accurate staff response with relevant KB article references. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-06`: Knowledge base search returns relevant articles by keywords/tags and respects multi-category filtering. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `AI-07`: Multi-tenant isolation prevents Tenant B from running AI diagnostics on Tenant A's service or ticket. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

---

## 3. Strict P0 Release Acceptance Gate Checklist

Before public commercial traffic is routed to Fortless, all mandatory gates must be verified:

- [x] **Gate 1:** 100% of Critical Financial tests (Category C) pass in automated CI (`PAY-01` to `PAY-10`, 100% pass).
- [x] **Gate 2:** 100% of Auth & Tenant Isolation tests (Category A) pass with zero leaks (`AUTH-01` to `AUTH-12`, 100% pass).
- [x] **Gate 3:** Provider Timeout & Idempotency tests (Category E) pass with zero duplicate instances (`PROV-01` to `PROV-10`, 100% pass).
- [ ] **Gate 4:** Stripe Testmode / Sandbox end-to-end checkout, 3DS challenge, and webhook verification verified. `[BLOCKED: Live Stripe Test API Keys Required]`
- [ ] **Gate 5:** Staging Pterodactyl 1.x panel verified with real server creation, suspension, and deletion. `[BLOCKED: Live Pterodactyl Instance Required]`
- [x] **Gate 6:** Automated atomic database backup, AES-256-GCM encryption, checksum validation, and isolated staging restore verification (`BCK-01` to `BCK-04`, 100% pass).
- [x] **Gate 7:** Legal Terms of Service, Privacy Policy, Acceptable Use Policy, Refund Policy, and SLA reviewed and posted. `[LOCAL_VERIFIED]` (Published at `/legal/:doc` with Petal Design System).
- [x] **Gate 8:** No hardcoded secrets, test credentials, or debug bypass flags exist in the codebase.
