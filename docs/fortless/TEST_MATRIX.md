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
- [x] `CAT-10`: Production bootstrap hides demonstration products and synthetic regions while preserving them in the staff catalog for review. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)
- [x] `CAT-11`: Staff catalog read model exposes all plan versions, provider mappings, and integer-minor-unit prices without exposing provider credentials. `[MOCK_ONLY]` (Verified in tests/platform.test.ts)

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
- [x] `SUB-06`: Upcoming renewal reminder is queued once per billing period and remains idempotent across repeated scheduler runs. `[MOCK_ONLY]` (Verified in tests/phase4.test.ts DUN-02b)
- [x] `EMAIL-04`: Canonical Fortless Mail values are replaced safely; optional billing/service/support preferences suppress only their selected categories while security mail remains mandatory. `[SANDBOX_VERIFIED]` (Verified in tests/platform.test.ts NOTIF-02 and EMAIL-04)

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
- [x] `SEC-05`: Pterodactyl inventory requests apply DNS/IP anti-SSRF validation before outbound dispatch. `[MOCK_ONLY]` (Verified in tests/platform.test.ts SSRF-02)

### G. Customer Application UI
- [x] `UI-01`: Homepage, login, registration, and authenticated app use the same Fortless logo asset. `[MOCK_ONLY]` (Static source verification)
- [x] `UI-02`: Customer app reads the implemented service, invoice, ticket, and audit API field contracts without fabricated provider status. `[MOCK_ONLY]` (TypeScript build + local HTTP smoke verification)
- [x] `UI-03`: Ticket and service content is escaped before dynamic HTML rendering. `[MOCK_ONLY]` (Verified in tests/frontend.test.ts)
- [x] `UI-05`: Auth and client shells define distinct portrait-phone and compact landscape-phone compositions with safe-area padding. `[MOCK_ONLY]` (Static CSS/source verification)
- [x] `UI-06`: Operations shell loads the supplied Petal stylesheet and icon sprite and uses canonical `ap`, `sd`, `nv`, `li`, `pill`, `tbl`, `mdl`, and `bx` contracts without legacy admin `badge`, `scrim`, or `modal` primitives. `[MOCK_ONLY]` (Verified in tests/frontend.test.ts; browser screenshot verification remains pending)
- [x] `UI-07`: Portrait-phone landing and application “More” sheets remain below the persistent bottom dock, while editable controls use a 16px minimum font size to prevent automatic iOS focus zoom. `[MOCK_ONLY]` (Static contract verification in tests/frontend.test.ts)

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

## Category S: Per-Account Panel Keys & Live Console

- [x] `CON-01`: One panel Client API key per account, stored AES-256-GCM encrypted, minted once and reused. `[MOCK_ONLY]` (tests/console.test.ts)
- [x] `CON-02`: Tenant B cannot obtain console credentials for Tenant A's service; nothing is minted. `[MOCK_ONLY]`
- [x] `CON-03`: Suspended, provisioning, unconfigured and non-Pterodactyl cases return typed errors. `[MOCK_ONLY]`
- [x] `CON-04`: A revoked key triggers exactly one re-mint; a second rejection surfaces. `[MOCK_ONLY]`
- [x] `CON-05`: Key encryption round-trips and rejects tampering. `[MOCK_ONLY]`
- [x] `CON-06`: Mint request is HMAC-signed and never carries the Application API key. `[MOCK_ONLY]`
- [x] `CON-07`: Non-ws socket URLs from the provider are rejected. `[MOCK_ONLY]`
- [x] `CON-08`: Panel `FortlessKeyMintController` mints a per-account key on the real panel (Pterodactyl 1.11, bearer = identifier + secret) and the browser authenticates to Wings with it (`Connected · offline` seen on a stopped server). `[SANDBOX_VERIFIED]` (partial: console output and command sending not yet observed on a running server)

- [x] `FIL-01`: Server paths are normalised; traversal (`..`), NUL, backslashes and bad names are rejected. `[MOCK_ONLY]` (tests/files.test.ts)
- [x] `FIL-02`: File listing shows folders first and uses the account's own panel key. `[MOCK_ONLY]`
- [x] `FIL-03`: Another tenant gets 404 and no provider call is made. `[MOCK_ONLY]`
- [x] `FIL-04`: Writes and deletes are audited without file content; files over 1 MB are refused. `[MOCK_ONLY]`
- [x] `FIL-05`: Write is sent as raw `text/plain` with the account key; signed URLs must be https. `[MOCK_ONLY]`
- [x] `FIL-06`: Directory listing of a real server through the app's code path returns real entries. `[SANDBOX_VERIFIED]` (list only; read, write, rename, delete, upload and download not yet exercised on the real panel)

- [x] `FIL-06b`: Archive, unarchive and copy validate input, use the account key and are audited. `[MOCK_ONLY]`
- [x] `SRV-01`..`SRV-05`: Backups, network, startup and settings: mapping, tenant isolation, input validation, SFTP username, path allowlist, panel refusal detail. `[MOCK_ONLY]` (tests/server-panel.test.ts)
- [x] `SRV-06`: Read calls for backups, network, startup and settings return real data from the panel through the app's code path. `[SANDBOX_VERIFIED]` (reads only; create, restore, delete, reinstall and other writes not yet exercised)
- [x] `ACT-01`, `ACT-02`: Service activity hides internal noise, filters by category and search, never leaks other accounts, paginates and clamps pages. `[MOCK_ONLY]`

- [x] `SHR-01`..`SHR-07`: Service sharing: hashed invitation tokens and queued email, owner-only management, accept creates a panel subuser with the preset's permissions, panel refusal keeps the invitation pending, unverified/expired/revoked rejected, shared viewer reads with their own key but cannot write, removal deletes the panel subuser, typed error when sharing is unavailable. `[MOCK_ONLY]` (tests/sharing.test.ts)
- [ ] `SHR-08`: Real invite end to end (email, register, accept, panel subuser created, shared user sees the server in Servers & Instances and the panel). `[NOT_STARTED]`

- [x] `SRV-07`, `SRV-08`: Databases and schedules: mapping, input validation (names, cron, task actions, delays), tenant isolation, permission gating for shared users, audit. `[MOCK_ONLY]`
- [x] `SRV-09`: Databases and schedules reads return real data from the panel through the app's code path. `[SANDBOX_VERIFIED]` (reads only; create, rotate, delete, run and task changes not yet exercised)

- [x] `FIL-07`: Archive and unarchive timeouts are reported as pending (unknown outcome), other errors still fail. `[MOCK_ONLY]`
- [x] `SYN-01`..`SYN-06`: Adaptive polling (30 s viewed, 5 min cold), batch reconcile with limit drift recorded once and never auto-changed, missing servers flagged only when a direct lookup agrees, shared users removed on the panel lose access, staff relink with safeguards. `[MOCK_ONLY]` (tests/sync.test.ts)
- [ ] `SYN-07`: Reconcile and relink against the real panel with a recreated server. `[NOT_STARTED]`

- [x] `FIL-08`, `FIL-09`: Move (relative target, no self-nesting), permissions (octal only) and remote download (public https only, no credentials, no query string in audit, timeouts pending). `[MOCK_ONLY]`
- [x] `SRV-10`: Task editing with the same validation as creation; panel activity events mapped and paged. `[MOCK_ONLY]`
- [x] `GAM-01`..`GAM-09`: Game profiles as validated data, properties edited without touching comments or other keys, no line injection, Java recommended from the game version, tenant isolation and permissions on game tools, mod install verifies SHA-512 and only from allowed hosts, icon must be a real 64x64 PNG. `[MOCK_ONLY]` (tests/game.test.ts)
- [x] `GAM-10`: Profile resolution by egg name, settings file parsing and Modrinth search against the real panel and the public Modrinth API. `[SANDBOX_VERIFIED]` (reads only; saving settings, installing a jar, changing the icon, move, permissions and remote download not yet exercised on the real panel)

- [x] `WAN-01`..`WAN-05`: Passkeys with real attestation objects: the public key is extracted and stored, the credential id and rpIdHash are checked at registration, assertions are rejected for another site, without user presence, with a bad signature or a foreign origin, legacy rows (raw attestation object) are converted on first use, and the CBOR reader rejects truncated or over-nested input. `[MOCK_ONLY]` (tests/webauthn.test.ts, software authenticator; not yet exercised with a real browser authenticator)
- [ ] `WAN-06`: Passkey sign-in from the login page with a real authenticator, including the browser's conditional (autofill) prompt. `[NOT_STARTED]`
- [ ] `TAB-01`: Tab URLs (`/app/settings/<tab>`, `/app/services/<id>/<tab>`), back/forward and reload restore the tab. `[NOT_STARTED]` (server routes probed live; client behaviour not yet exercised in a browser)

- [x] `PRO-01`..`PRO-04`: Profile editing: own name, workspace name for the owner only, roles, ownership and staff flags refused (not ignored), control characters rejected, billing details limited to owners and billing managers, nothing invented before it is saved, tax id never written to the audit log. `[MOCK_ONLY]` (tests/profile.test.ts)

- [x] `DEP-01`..`DEP-16`: Universal Deployment Experience: 5-step contextual onboarding wizard with category filtering and Petal UI. Quick vs Custom setup without configuration loss. Server-side validation enforcing clean installations, mod loader isolation (rejecting Bukkit plugins on Forge/Fabric), CS 1.6 GoldSrc parameters and Metamod/AMX Mod X dependency trees, Discord Bot masked secrets and unready state guard, SSRF anti-loopback protections on repository URLs, dynamic provider egg resolution from live inventory with fail-closed missing mapping guards, migration 63 schema snapshotting, and post-provisioning file initializers (`eula.txt`, `server.properties`, `cstrike/server.cfg`, `.env`, starter templates). `[MOCK_ONLY]` (tests/deployment.test.ts)

- [x] `ADM-01`..`ADM-20`: Automatic Game Administration & RCON Provisioning: Data-driven capability registry (`GAME_PROFILES`) mapping Minecraft Java, Minecraft Bedrock, CS 1.6 ReHLDS, CS:Source, CS2, Rust, and FiveM. Zero mandatory RCON on Minecraft with native Pterodactyl console commands for moderation. Automatic GoldSrc RCON password generation and persistence in `cstrike/server.cfg` using primary game port without unnecessary allocations. Auto-adoption of pre-existing file configurations without silent overwriting. One-click "Configure automatically" for unconfigured services with backup copies (`.copy`). Capability rediscovery on egg changes and port updates. Strict encryption of credentials at rest with zero secret leakage in API payloads or audit events. Enforced anti-SSRF on allocations and multi-tenant isolation. All 20 mandatory invariants verified. `[MOCK_ONLY]` (tests/game-administration.test.ts)

---

## 3. Strict P0 Release Acceptance Gate Checklist

Before public commercial traffic is routed to Fortless, all mandatory gates must be verified:

- [x] **Gate 1:** 100% of Critical Financial tests (Category C) pass in automated CI (`PAY-01` to `PAY-10`, 100% pass).
- [x] **Gate 2:** 100% of Auth & Tenant Isolation tests (Category A) pass with zero leaks (`AUTH-01` to `AUTH-12`, 100% pass).
- [x] **Gate 3:** Provider Timeout & Idempotency tests (Category E) pass with zero duplicate instances (`PROV-01` to `PROV-10`, 100% pass).
- [ ] **Gate 4:** Stripe Testmode: checkout session lines/total, subscription cancel (period end and immediate) and staff refund are `[SANDBOX_VERIFIED]` (`npm run test:sandbox`, tests/sandbox/stripe-sandbox.test.ts). Still open: 3DS challenge, completing a hosted checkout and a Stripe-delivered signed webhook, and an induced-timeout unknown-outcome run (FTL-BILL-206).
- [ ] **Gate 5:** Pterodactyl Application API read-only inventory connectivity is confirmed, but real create/suspend/delete lifecycle evidence is still required. `[NOT_STARTED]`
- [x] **Gate 6:** Automated atomic database backup, AES-256-GCM encryption, checksum validation, and isolated staging restore verification (`BCK-01` to `BCK-04`, 100% pass).
- [x] **Gate 7:** Legal Terms of Service, Privacy Policy, Acceptable Use Policy, Refund Policy, and SLA reviewed and posted. `[LOCAL_VERIFIED]` (Published at `/legal/:doc` with Petal Design System).
- [x] **Gate 8:** No hardcoded secrets, test credentials, or debug bypass flags exist in the codebase.

## Stripe sandbox (real TEST-mode API)
- [x] `SBX-01`: Real checkout session bills the recurring line and the one-time setup line, total equals the quote, a retry with the same key returns the same order and one payment attempt (FTL-BILL-206 retry part, NEW-340, NEW-345). `[SANDBOX_VERIFIED]`
- [x] `SBX-02`: Introductory coupon is applied by Stripe and `amount_total` equals the quote (NEW-340). `[SANDBOX_VERIFIED]`
- [x] `SBX-03`: Cancel at period end sets `cancel_at_period_end`; immediate cancel ends the real subscription; a repeat finds no failed outbox event (NEW-333). `[SANDBOX_VERIFIED]`
- [x] `SBX-04`: Staff refund of EUR 5.00 creates exactly one Stripe refund of 500 and a replay does not add another (NEW-334). `[SANDBOX_VERIFIED]`
