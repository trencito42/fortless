# FORTLESS — Complete Codex Mega-Prompt Pack
This document concatenates all instructions. Usually use the separate stage files.


---

<!-- FILE: 00_GLOBAL_CONTRACT.md -->

# STAGE 00 — GLOBAL ENGINEERING CONTRACT (paste/read for EVERY session)

You are Codex acting as principal engineer, security reviewer, tester, and product implementer for **Fortless** in `trencito42/fortless`. Treat the existing repository as the authoritative executable state and the supplied design system + product blueprint as requirements, not as evidence that a feature works.

## Mission

Finish a commercially viable, secure, self-service hosting platform. The user explicitly reports that the admin panel and many visible features are mock. Your job is to systematically replace mock UI, fictional data, placebo buttons and disabled business flows with real operations backed by persistence and provider integrations, while retaining Fortless's existing visual identity.

## Read before any changes

- Root `AGENTS.md` and `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/REPOSITORY_AUDIT.md`.
- `docs/fortless/*`, `blueprint/fortless-blueprint/MASTER_PROMPT.md`, numbered blueprint specs.
- Petal design references: `blueprint/fortless-blueprint/design/{out.html,panel.html,parts/}` and `handoff/references/design-system/`; brand reference assets in `handoff/references/brand`.
- Production code `src/*`, `public/*`, package scripts and tests. Check HEAD; do not assume it is the inspected baseline SHA.

Resolve contradictions by favoring safety, actual behavior, and latest verified user requirements. Document each decision in `docs/DECISIONS.md` with tradeoffs; ask about business/legal data only where an implementation would otherwise be unsafe.

## Source-of-truth & honesty protocol

At start and after each slice maintain `docs/REALITY_MATRIX.md` with each customer and staff route, feature, UI control, API endpoint, DB model, external integration, permission, test evidence and state:

- `UI_ONLY`: render only, no authoritative backend.
- `MOCKED`: fake/local simulated data or provider response.
- `LOCAL_VERIFIED`: real backend/local persistence; test evidence attached.
- `SANDBOX_VERIFIED`: tested against actual provider sandbox/staging with success/failure receipts.
- `PRODUCTION_VERIFIED`: verified in production with explicitly authorized safe operations.
- `BLOCKED`: dependency is absent or policy is undefined.

Never equate automated test names, compilation, API status codes or local mock provider simulations with sandbox verification. Never present sample uptime, revenue, server status, latency or invoices as real metrics. Demo preview must be conspicuously labeled and disconnected from live business actions.

## Implementation guardrails

1. Prefer incremental vertical slices in the existing Fastify/TypeScript architecture; do not perform an unaudited rewrite to Next.js, NestJS, Prisma or microservices. A PostgreSQL transition may be justified, and must use versioned migration tooling and verification.
2. Retain existing Petal components, Inter Tight, monogram FL, the actual site's lime/blue/navy/white tokens, adaptive mobile/navigation patterns and accessibility behavior. No generic Tailwind/Bootstrap/Material redesign. Build common components/adapters; do not paste 400 KB of duplicate design markup into each new route.
3. Trust no client-supplied identity, price, permissions, VAT eligibility, quantity limits, server ID, provider ID, plan resources or PSP payment status. Validate server-side and tie to authenticated account membership.
4. All read and write paths are tenant-scoped by account. Staff roles use separate server-side RBAC. Do not use legacy `is_staff` for authority; never grant staff or first OWNER automatically from an email/domain/IP hint.
5. Monetary values use integer minor units and explicit currency. Every quote/order/payment/invoice/refund has identity and immutability rules. Never store card data; PSP handles PCI-sensitive payment flow.
6. Provider operations, refunds, staff changes, destructive actions and system jobs require idempotency, durable state transitions, audit and unknown-outcome recovery. Use a transactional outbox/inbox where appropriate.
7. Safe migration: backup, reversible or forward-compatible rollout, dry-run on snapshot, explicit post-migration integrity checks. Never delete historical payment records or live server resources to make tests pass.
8. Do not modify secrets or infer/use production credentials. Do not commit .env, tokens, session dumps, backup data, API responses containing secrets, or real customer PII.
9. Do not execute live charges, refunds, domain purchases/transfers, server deletion, outbound mass email, production staff elevation, production database migration or DNS changes without user approval. Stage risky operations behind flags and dry-run/confirm paths.
10. Ensure dependencies and providers are version-pinned intentionally and consult their currently applicable official docs before implementing nontrivial API behavior. Do not invent provider endpoints.
11. No silent fallback of broken external integration to successful mock behavior. Fail closed with explicit user-visible state and operational logs.
12. Keep runbooks, observability and measurable acceptance checks. Threat model every external trust boundary. Add tests for negative paths before calling a feature done.

## Every slice must contain

- **Inventory:** current implementation and missing behavior, with source paths.
- **Spec:** what actions/roles/states change, API shapes and trust boundaries.
- **Implementation:** DB migration (if any), server logic, UI binding, validations, permissions, workers, recovery.
- **Tests:** unit, API integration, concurrency/retry/IDOR/CSRF where relevant, real browser/mobile when UI changed.
- **Evidence:** actual commands executed, test totals, pass/fail output, screenshots (if useful), real vs mocked providers.
- **Risks & follow-up:** unresolved dependencies and next minimal slice.

### Standard response after work

`PHASE/SLICE`, `COMPLETED`, `BEHAVIOR NOW REAL`, `STILL MOCKED OR BLOCKED`, `MIGRATIONS`, `TESTS EXECUTED + RESULTS`, `SECURITY NOTES`, `FILES CHANGED`, `NEXT SLICE`. If a tool or runtime is unavailable, state that plainly rather than fabricate evidence.

## Definition of Done for an end-to-end feature

(1) UI is accessible/consistent, (2) server performs the action, (3) correct tenant + role, (4) state persists across server restart, (5) authoritative provider confirmation when applicable, (6) error path is understandable and recoverable, (7) idempotency and replay are safe, (8) audit+metrics are generated without secrets, (9) all required negative tests pass, and (10) production capability is honestly labeled.

## High-risk test classes that must be retained

Cross-account read/write by guessed IDs; cross-role admin access; guest mutations; CSRF + CORS; rate-limit evasion; webhook forgery, replay, out-of-order events and semantic mismatch; double-click checkout; quote manipulation; forged price/tax/quantity; simultaneous last-capacity orders; crash at every DB/PSP/provider boundary; timeouts after remote side-effects; renewal twice; refund twice; negative amount; chargeback; failed and delayed settlement; stale power operation; termination requires confirmation; stale cache/old sessions; restoration after database or worker failure.

**Stop at a phase boundary or decision gate. Do not interpret this global contract as approval to execute everything autonomously in production.**


---

<!-- FILE: 01_AUDIT_AND_REALITY_MAP.md -->

# PHASE 1 — CODE AUDIT, MOCK ELIMINATION MAP & BASELINE

**Paste this prompt to Codex together with `00_GLOBAL_CONTRACT.md`.**

Act as the lead reviewer. Do not build new features yet. Determine exactly how Fortless works today at HEAD. The user says the admin and customer application still feel mocked. Treat that as a hypothesis to test route-by-route rather than denying it because database tables or endpoints exist.

### Procedure

1. Read the full repo and current history/status. Identify app entrypoints, front-end architecture, config, data stores, deployed runtime if connected, and expected staging vs production. Avoid touching live services.
2. Start server on isolated local/test database and enumerate **every** public route, every `/app` and `/admin` view, all buttons, forms, selectors, navigation targets, menus, modals, empty states, data charts, jobs and external adapters. Inspect actual event handlers in `public/assets/{app-ui.js,admin-ui.js,auth-ui.js}` and routes in `src/server.ts`.
3. For each control ask: Is it decorative? Does it call the right API? Does the backend validate? Is persistence real? Does state survive restart? Does the role have permission? Are errors surfaced? Is an external provider required? Are displayed numbers live, fixtures or zero-based real records?
4. Inventory DB tables, constraints, migrations, ownership relations; trace from UI click to handler to DB mutation to queue to external service to refreshed UI. Flag dead-end and duplicate code paths.
5. Run `npm ci`, `npm run build`, `npm test` in a safe isolated workspace. Report observed outputs, not historical README claims. Add a basic Playwright browser smoke if feasible; otherwise document why browser validation is pending.
6. Read all docs, compare implementation-status claims with actual code. Correct stale claims; do not delete useful docs.
7. Create `docs/REALITY_MATRIX.md` with route/control/endpoint/current behavior/state/owner/priority/test evidence, including screenshot observations and mobile issues where inspected.
8. Create `docs/SECURITY_FINDINGS.md` with severity, exploit preconditions, evidence/locations, impact, reproducibility (safe test), and proposed remediation; separate confirmed bug from hypothesis.
9. Create `docs/PHASE_BACKLOG.md` ordered by dependencies and risk, broken into independently verifiable 1–4 hour (if plausible) vertical slices. Do not invent precise schedule promises.
10. Define objective release gates: no unauthorized privileges, no unverified monetary/provisioning operation, recoverable jobs, working admin, full customer journey, tested restores, real provider sandbox proof.

### Baseline concerns to investigate (do not assume all are exploitable right now)

- `operationalCapability()` in `src/server.ts` intentionally returns false for payments/provisioning/email; data-bound UI may still suggest live capabilities.
- Checkout returns a null provider URL; PSP webhook code is currently a local simulation and must not be enabled as is.
- Stripe event semantics (`payment_intent.succeeded` vs `checkout.session.completed`), correctness of payment status/amount/merchant/provider identities; duplicate and out-of-order settlement.
- Fixed VAT lookup, B2B VAT ID accepted on length, default Germany and assumed refund policies in open-decision docs.
- Quote checkout idempotency hash excludes `regionId` and `customOptions`.
- Worker `PROCESSING` jobs stuck on process death; retry/lease/dead-letter semantics; in-memory adapter-only provisioning; forceful `SUSPENDED` on transient provider failures.
- Service created `ACTIVE` before actual provider health, fallback node IDs, capacity not reserved transactionally.
- `src/index.ts` hardcodes `0.0.0.0` despite HOST configuration defaulting to loopback.
- First staff OWNER unassigned; staff read-only views and action UI limitations; staff permissions vs account membership roles.
- Test suite gives confidence only for the paths it actually exercises; no provider sandbox proof or browser E2E reported.

### Safe proof-of-function scenarios

Create test accounts A and B (non-production). A creates ticket and edits own profile; B cannot read or modify A's ticket. Check admin missing MFA/revoked role is denied on both page and API. Check mobile auth/app navigation. Submit duplicate quote checkout requests in disabled mode and ensure **no** payment, invoice or service side effects. Validate capabilities endpoint advertises disabled dependencies. Verify mock/demo labels appear.

### Deliverables

`docs/REALITY_MATRIX.md`, `docs/SECURITY_FINDINGS.md`, `docs/PHASE_BACKLOG.md`, revised `docs/IMPLEMENTATION_STATUS.md`, reproducible local setup/smoke instructions, and an executive summary of what is actually operational vs mocked. **Do not activate payments, providers, DNS, mail or production data.**

Stop and report. The owner reviews this map before major changes.


---

<!-- FILE: 02_PRODUCTION_FOUNDATION.md -->

# PHASE 2 — INFRASTRUCTURE, DATABASE, RELIABLE JOBS AND CI

You are implementing a production-capable backend foundation for the existing Fortless app. Read `00_GLOBAL_CONTRACT.md` and the audit. Preserve existing UI and correct business invariants; no blanket rewrite.

### A. Database architecture

- Make a decision record comparing SQLite dev-only, production PostgreSQL and coexistence. Prefer PostgreSQL in production for multi-worker concurrency, row locking and durable service/payment history. Do not simply translate SQL syntax and assume same transaction semantics.
- Create versioned, repeatable, ordered migrations with checksums; migration runner must be separate from public API startup and must not run automatically on every request or process boot. Use backup/restore rehearsal and documented rollback/roll-forward.
- Review account/user/membership/staff boundary; add correct uniqueness, FKs and indexes for orders, monetary events, PSP identifiers, invoice sequences, service relations, reservation constraints, idempotency keys and outbox leases.
- Migrate existing actual data via staged export/transform/import/reconciliation, preserving IDs and historical entitlements. Tests must cover verification of row counts, relationships, balances, roles and known legacy inconsistencies. Run against snapshot first.
- Keep test environment deterministic, ephemeral and isolated. Data seeding must not create live users, staff owners, paid invoices or active servers by default.

### B. Jobs, concurrency and recovery

- Separate HTTP/API from worker runtime. Design durable queue backed by PostgreSQL outbox and optional Redis/BullMQ transport; queue transport must not be the sole authoritative event record.
- Lease jobs atomically with owner/lease expiration/heartbeat and bounded retries; recover `PROCESSING` after crash; add backoff+jitter, poison-message handling, dead letter, manual replay controls and audit.
- Integrate monotonic/idempotent state transitions for provider operations, emails, invoice documents, billing settlement and renewals.
- Implement correlation IDs and one operation per resource+action, with transactional persistence and explicit lifecycle; unknown external result => reconcile, not blind retry.
- Include contention tests with two workers and process-kill simulation; prove only one successful fulfillment and eventual lease recovery.

### C. Configuration and secrets

- No hardcoded live credentials; type-checked environment schema, clean dev/test/sandbox/prod separation, fail-closed mode capabilities, signed/key-rotation runbooks.
- Enforce loopback bind behind Nginx/Caddy or explicitly documented safe network topology. Resolve `src/index.ts` host binding mismatch.
- Restrict CORS origins, secure cookies, CSRF, trusted proxy headers, request size and API payload limits. Protect health metrics from leaking secrets.
- Store provider keys and encryption material outside repo; ensure runtime file permissions, backups encrypted, least-privileged service accounts.

### D. Quality gates and operational telemetry

- Add GitHub Actions CI with pinned Node LTS, lint/typecheck, tests, migration check, dependency audit, secret scanner, build artifact and browser smoke. CI must not require production secrets or use external live billing.
- Add structured security-conscious logs and request/job correlation IDs; metrics for HTTP error rate, queue age, worker stale locks, DB errors, checkout anomalies, provisioning failures, webhook backlog; alert routes and on-call runbook.
- Define Docker/Compose for local PostgreSQL/Redis/staging and deployment manifests as appropriate; network isolation and health/readiness endpoints.
- Build safe release mechanisms: migrations separate, release health checks, rollback protocol, backup/restore exercise, migration compatibility window, uptime probes, disk thresholds and connection pool bounds.

### Tests

- Two simultaneous checkouts try to consume same capacity/quote; only one valid reservation.
- Two concurrent workers see one outbox event; only one claims it.
- Worker killed at claim, after provider request, after DB write, during retry, at shutdown; recovery with zero duplicates.
- Restart with active sessions/MFA secrets: sessions/key state stable.
- DB migration from real *snapshot* preserves identities, roles, orders, invoices and tickets; isolate customer data.
- Cookie/CORS/CSRF/proxy spoof/localhost bind tests.

### Deliverables and gate

Working local+CI infrastructure, explicit DB migration plan/implementation, worker service, tests, monitoring foundation, update `docs/REALITY_MATRIX.md` and runbooks. Do not delete original SQLite before approved migration and verified backup. Do not enable payments or production provider mutations. Report actual commands and evidence.


---

<!-- FILE: 03_AUTH_SECURITY_AND_EMAIL.md -->

# PHASE 3 — IDENTITY, AUTHORIZATION, EMAIL AND USER SETTINGS

You are completing **real** auth across Fortless marketing / login / register / customer app / staff admin using existing Petal design primitives. Read `00_GLOBAL_CONTRACT.md`. Do not replace the look and feel.

## Functional journeys

1. Register: client-side UX + server-side validation; normalized unique email; Argon2id policy; consent and terms links, validation accessibility; rate limits; create pending identity/account; no authenticated entitlement until verified.
2. Verification: real transactional email adapter with sandbox, vetted sender-domain configuration, SPF/DKIM/DMARC instructions, single-use hash-at-rest token and expiration; resend rate limit, same result for nonexistent email; invalid/expired, repeat click and mail delivery failures supported.
3. Login: session rotation, secure HttpOnly cookie, SameSite/Secure rules, user enumeration resistance, per-account/IP and global distributed limits (behind reverse proxy), alerts for unusual sign-ins, multi-factor challenge; redirect to approved safe `next` paths only.
4. Recovery: password reset email + single-use token, token binding, expiration, global session revocation and notifications; change-password flow from settings with recent authentication; never leak token in logs or referrer; consider recovery method under MFA.
5. MFA: maintain TOTP, one-use recovery codes, encryption key stability/rotation, anti-replay within allowed time windows, challenge throttling; implement passkeys/WebAuthn after choosing a vetted library and documented RP ID/origin handling; MFA enrollment/disable/credential changes require step-up and security event logging.
6. Sessions/devices: real list from DB, last seen/IP approximate, revoke one/all/other, refresh without stale state, expiry, locked/suspended account kills access; audit without exposing raw tokens.
7. Organizations: invite member via email, roles `OWNER`, `BILLING_MANAGER`, `TECH_ADMIN`, `VIEWER` (adjust only with explicit migration), accept/reject/revoke, role restrictions, last-owner protection, tenant switching with per-request authoritative account scope.
8. Staff identity: strict independent staff membership + MFA, DB-checked revocation on each operation, owner bootstrap with an explicit one-time audited CLI requiring verified email and MFA; no public self-service owner promotion.
9. Account settings: profile, billing profile validation, notification preferences, security, locale/timezone, real delete/data export workflow subject to legal retention; show truthful pending/unavailable statuses.
10. Email management: durable mail outbox, safe templating, signed links, retries, bounce/complaint handling, unsubscribe where applicable, security mail exempt from marketing opt-out, delivery observability. Never log reset/verification links.

## Security requirements

CSRF tokens associated with session context, Origin/Referer handling, CORS no wildcard credentials, XSS-safe output/HTML email rendering, session fixation prevention, Argon2 parameter review, no token localStorage for browser session, IP spoof resistance, denial on revoked team membership, API-specific rate limits.

## Petal/UI acceptance

All `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/mfa/challenge`, `/app/settings` states usable on desktop/portrait/landscape phone with keyboard, screen-reader labels and focus management. Submit/loading/success/error states must correspond to **actual backend outcomes**, not animations that imply delivery. No placeholder 'verification email sent' if mail provider is disabled: communicate configuration/queue state truthfully.

## Mandatory negative tests

Wrong/expired/reused token; race of two verification clicks; wrong MFA 5+ attempts; TOTP reused when replay protection applicable; brute force from multiple IPs; password reset invalidates every session; stolen CSRF; tenant A accessing B's sessions; revoked staff same-session action; unauthorized OWNER bootstrap; malicious `next=https://evil...`; origin spoofing; mail outbox unavailable and retries; credential rotation across process restart; concurrent invitation redemption; WebAuthn origin/RP mismatch and replay.

## Deliverables

Complete real auth/email sandbox integration, full settings UI, permissions matrix, migration and recovery docs, tests including Playwright on mobile breakpoints. Do not claim real email delivery without sandbox receipts; do not enable live sender until approved.


---

<!-- FILE: 04_ADMIN_CONTROL_PLANE.md -->

# PHASE 4 — REPLACE THE MOCK ADMIN PANEL WITH A REAL CONTROL PLANE

You are the lead implementer of the Fortless staff console. The owner reports that **the admin panel is mock**. Accept the usability issue and trace every visible action to persistent backend behavior. Read `00_GLOBAL_CONTRACT.md`, audit/migration status and existing `public/admin.html`, `public/assets/admin-ui.{js,css}`, `src/modules/admin/{access,read-model}.ts`, `src/server.ts` and database schema. Keep exactly the existing visual style/brand/Petal primitives.

## Goal

Turn `/admin` from a mostly read-only viewer into a secure, useful operational tool for a hosting company. Each section must support genuine list/detail workflows, pagination/search/filter/sort, accurate states, permission-scoped actionable controls and audit. Where live billing/provider dependencies are unavailable, implement safe review/queue/disabled control states, **not mock successful actions**.

## 1. Staff access & ownership

- Roles (existing): OWNER, ADMINISTRATOR, BILLING, SUPPORT, INFRASTRUCTURE, AUDITOR. Keep permission constants centralized and DB-enforced. Design action-level, field-level, tenant-level and sensitive-operation matrices; return 403 or 404 appropriately, never rely on nav hiding.
- Explicit, auditable **first OWNER bootstrap**: one-time CLI, chosen existing verified user, confirmed MFA, re-auth plus confirmation, recorded operator and time; no bootstrap API exposed publicly, never grant owner merely from sign-up or `.env` email.
- Staff create/change/suspend/revoke with reason, fresh step-up on sensitive mutations, deny self-demotion, last-active-owner protection and target identity/MFA checks; invitation/onboarding and activation if needed.
- Privileged access review logs; staff suspension instantly revokes session access to admin endpoints.

## 2. Admin information architecture + truly real features

**Overview:** real counts from DB with tested formulas (users, accounts, active paid services, tickets by SLA, outstanding invoices, MRR only once financially defined, payments collected, refunds, chargebacks, queue backlog, provider health). No fake charts, false uptime or made-up MRR; zero-data views explain precisely what is unavailable. Filters by period/region/provider; links to filtered lists.

**Accounts / Customers:** searchable paginated profiles with verified state, organizations, roles, linked services/orders/invoices/tickets, risk flags, activity. Actions: change account lock state, customer internal notes, hold/suspend ability (with reason and policy), notify user, revoke sessions with step-up, invite/revoke member only if authorized and appropriate. Never show password hashes, tokens, TOTP secrets, raw provider keys, card data. Account data export gated by policy; impersonation, if absolutely needed, requires explicit approval, visible banner, audit, restricted scope and limited duration; safer default is no impersonation.

**Orders / Billing:** separate real pages for orders, invoices, payments, subscriptions, credits, refunds, disputes, coupon use, failed renewals and reconciliation. Search, timeline and status transitions. Human-approved refund queue and exact monetary ledgers; never let admin set `PAID` or `SUCCEEDED` manually to deliver service. Financial interventions must use explicit adjustment/reconciliation workflows with dual-control for high-risk actions. Before Phase 6, show `INTEGRATION_NOT_CONFIGURED` with real DB records and only safe draft/read actions.

**Catalog / Products:** create categories/products, versioned plans, billing periods, region availability, prices, capacity, options, add-ons, visibility (draft/published/archived), reorder and publish. Full server-side limits, preview of actual checkout/tax selection, edit history, audit and explicit publish confirmation. Editing plan must not silently rewrite customers' existing entitlements. Product CRUD done in Phase 5 may be integrated incrementally here; do not fake it.

**Infrastructure:** providers/panels, nodes, clusters, regions, allocations, quota, health, utilization, drift and service inventory, incident flags, provisioning queue, audit operations. Hide provider controls until Phase 7 sandbox verification. Never expose API secrets. Staging node/pool states visibly identified. Suspend/un-suspend/resize/terminate flows guarded with policies, customer notice, approvals where needed, dry-run, correlation IDs and reconciliations.

**Services:** real detail (owner, product version, invoice/subscription, desired resources, actual provider identity, node, health/status, timestamps, operation history). Actions only for owned provider-managed services through server-side RBAC and capability flags. Show `PENDING`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ERROR`, `UNREACHABLE` according to authoritative state rather than assuming status.

**Support:** genuine global ticket inbox, queue assignment, staff internal notes distinct from customer messages, reply, priority/status transitions, tagging/category if needed, SLA and response indicators, attachment safety limits, customer notifications. Support staff cannot access financial secrets. Concurrent edits need optimistic locking/version or equivalent.

**Staff & Security:** staff role matrix, security events and review, login/MFA audit, access revocation and expiring step-up, blocked risk operations, security incident flag and review queue. Last owner cannot disappear.

**Operations & Audit:** immutable structured audit (who, what, before/after safe fields, when, IP, reason, correlation ID, result), job queue status and dead-letter replay controls, integration config *status* (never secrets), mail delivery log status, alerting, safe filtered logs, infrastructure health. Replaying a job never bypasses billing authorization.

**Website/Content (optional once core stable):** editable public FAQ, announcement/maintenance banner and SEO pages through audited staff CMS rather than hard-coded content; safe HTML sanitization and publish/draft preview.

## 3. API requirements

- Prefer explicit resource endpoints e.g. `/api/v1/admin/accounts/:id`, `/api/v1/admin/tickets/:id/...`, `/api/v1/admin/catalog/...`; full Zod validation; granular permissions; separate read DTOs and action commands. Query limits, stable pagination, search escaping, sort whitelists, optimistic version checks. No mass assignment.
- All changes use transactions + audit event in same commit, an outbox event when external/email work required, idempotency key for risky command. CSRF for browser mutations; server-confirmed step-up when needed.
- Rejected/unauthorized/invalid operations must not produce state change or side effects. Reply with stable error codes and precise actionable message.

## 4. Interface requirements

Use existing Petal components including table/record list, stats, cards, tags, dropdown, modal, confirmation, toast, empty state, slide-over/bottom sheet. Every CTA either performs an existing actual action, navigates correctly, or is visibly disabled with a reason. No alert('success') that is not backed by a DB transaction. Responsive navigation, dense real tables desktop, labeled record cards mobile, keyboard and focus.

## Tests / evidence

- Admin roles matrix tested for every high-value endpoint and sensitive field (including direct API access, not only UI), anonymous + nonstaff + MFA-incomplete + revoked staff. All 403 attempts have zero mutations.
- Owner bootstrap exactly once, no arbitrary elevation, cannot remove last owner or self-promote, step-up expires.
- Two staff race to edit same ticket or product; conflict handling correct.
- Sensitive admin change persists across process restart and creates exactly one audit event. Same operation repeated with idempotency key cannot duplicate.
- Empty catalog/provider state displays truth instead of fake revenues/server graphs.
- Real browser flows for support triage, product draft/publish and staff user management; mobile accessibility.

## Delivery sequencing

A. Staff bootstrap + detail pages/CRUD for identities/tickets with tests. B. Admin catalog/backoffice management when catalog core exists. C. Billing/provisioning admin controls activated **only after** corresponding provider sandbox phases; treat them as separate auditable follow-ups. Stop and report real vs pending admin areas. Never claim entire admin is done until the route-by-route reality matrix is all verified or explicitly unavailable for approved reasons.


---

<!-- FILE: 05_CATALOG_INVENTORY_COMMERCE.md -->

# PHASE 5 — REAL HOSTING PRODUCT CATALOG, PRICING, CONFIGURATION AND CAPACITY

You are implementing the Fortless catalog and inventory engine used by the storefront, admin and later checkout. Read `00_GLOBAL_CONTRACT.md`. Replace hardcoded-looking product displays and sample pricing with versioned, backend-authorized catalog records. **Do not activate real payments here.**

## Product model

Maintain service-type modules: game hosting, bot hosting, app/Node.js hosting, web hosting, VPS, domains, and (later) database/AI. **Only game hosting and Discord bot hosting are expected initial products; others may remain honestly planned.** Do not assume inventory/provider contracts exist.

- Category -> Product -> Versioned Plan -> Price by currency/billing period -> Region/Node/Provider offering -> Configurable options/add-ons, valid resource bounds and compatibility -> capabilities -> published status -> policy/marketing description.
- Make `DRAFT`, `PUBLISHED`, `UNLISTED`, `RETIRED` meaningful; plan version immutability once ordered. Existing service entitlements refer to acquired version/snapshot, never the mutable latest plan.
- Examples of configuration: CPU%, RAM, disk, backups, databases, allocations, egg ID (allowlisted, not customer-supplied arbitrary IDs), environment fields validated by egg schema, server name, software version, geography, optional additional ports. No arbitrary Docker images, startup commands, Docker privileges, bind mounts or env injection from browser requests.
- Product pages/region selector/plan cards sourced from API with legitimate pricing, detailed limits, technical support claims only when deliverable. No made-up uptime, unlimited promises or guaranteed instant provisioning.

## Pricing engine

- Money represented as ISO currency + integer minor units, checked arithmetic and maximum orders. Avoid float rounding and locale-induced decimal bugs. Handle special currency unit conventions.
- Plan prices for monthly/quarterly/yearly cycles, duration-aware promotions, configurable additions, quantity limits, renewal price and introductory discounts. Coupon semantics single-use/multi-use/per-account/per-product/expiry/cap, with transactional redemption after confirmed payment (avoid burning coupon on abandoned checkout).
- Tax inputs and customer billing address validated, but **tax decisions belong to Phase 6 approved policy**, not a frontend checkbox that triggers 0% tax.
- Expiring persisted quotes: authoritative server quote lines, totals, currency, tax evidence source, plan snapshot and validUntil; quote belongs to account, cannot be redeemed twice, tamper-safe. Cryptographic signature optional if persisted/verified authoritatively; signature must cover full semantic payload if retained.
- Hash idempotency requests using canonical full payload including `regionId`, quantity, custom options, plan version, billing period and account; same key+different canonical request -> conflict; same request -> same result.
- Compute proration for upgrades/downgrades using documented policy; no negative charge from rounding, no upgrade before settlement if payment required, no silent deletion of addons.

## Capacity and provider availability

- Region + node capacities are measured by provider state and reserved in DB atomically with concurrency locks, configurable oversell headroom, safety factor and maintenance mode.
- Allocations/network ports from controlled pool, not customer-selected arbitrary resources. Prevent duplicate port/node assignment; release reservations on abort with audit and stale-reservation sweeper.
- Distinguish catalog purchasable from technically provisionable and PSP-approved. If provider is not configured, block ordering of deliverable entitlements rather than taking funds and promising instant service.
- Explicit sold-out/maintenance/waitlist behavior, partial cart order when one region is unavailable, and plan limits enforced at *every* path including admin overrides.

## Admin and customer interface

- Staff create/edit/publish with preview, validation and audit; no retroactive mutation of historical service resources.
- Customer filters by game/use case/region/resources, configured options, quote summary and transparent totals. Use Petal tokens/cards/selectors and real empty states.
- Render display prices from backend data, never embed amount authority in HTML JS, hidden fields or query parameters.

## Tests

- Pricing minor units/currencies, discount stacking, invalid quantity (zero/negative/huge), sold-out, retired plan, region incompatible, invalid egg environment, custom startup command, malicious option fields, plan version changed mid-checkout.
- Two accounts buy last available slot at same moment; only one reserved. Concurrent coupon redemption with one remaining use; only one wins.
- Price editing after quote: expired/signed snapshots remain correct; no old price gets silently recomputed.
- Idempotency key reuse with altered region/options is denied. No quote belongs to another tenant; team VIEWER can't buy.
- Browser mobile and desktop purchase configurator, empty/unavailable/success/error states.

## Deliverables

Real catalog API + admin operations + public storefront sourcing, inventory policies, versioned/approved price and resource configuration and tests. Payment and technical delivery remain explicit disabled gates until Phase 6/7. Report real products and any seeded demo fixtures separately.


---

<!-- FILE: 06_BILLING_STRIPE_TAX.md -->

# PHASE 6 — PAYMENT-SAFE COMMERCE, STRIPE TEST MODE, INVOICING & FINANCIAL OPERATIONS

This is a **high-risk** stage. Read `00_GLOBAL_CONTRACT.md`, Phase 1 findings, current Stripe official docs for the pinned API version, `src/modules/{pricing,checkout,payments,invoicing}`, and `src/server.ts`. **Never activate live payments, collect real customer funds or silently decide fiscal policy.** Implement sandbox-first and prove safety before any production mode is even proposed.

## A. Decisions BEFORE activation

Create a signed-off checklist for legal merchant entity/domicile, merchant of record, B2B/B2C sales countries, VAT registrations/OSS requirements, fiscal document provider, currency/price display, applicable taxes, refund rules, retention, digital service withdrawal rules, AUP, PSP hosting/recurring approval, allowed payment methods and invoice series. Current repo docs include placeholder policies (e.g. universal 19% VAT / 72-hour refunds) that **must not** be treated as legal truth. Tax examples are test fixtures only. A valid VAT ID must be verified according to applicable requirements, with evidence/timestamp and fallback; merely length >5 is not verification. Unsupported jurisdiction/country => block or manual review, never arbitrarily default charge or 0%.

## B. Authoritative money model

- `Quote` -> `Order` -> `Invoice` / `PaymentAttempt` -> `PSP Checkout Session` -> signed provider event or authoritative PSP fetch -> `PaymentSettlement` -> service entitlement -> transactional outbox provisioning. Maintain independent commercial and technical state machines.
- Monetary totals in checked minor units with explicit ISO currency, line price/version/options, tax evidence, discounts, invoice sequencing and immutable records. Enforce numerical ranges (nonnegative) and currency matching.
- One idempotent Checkout Session creation per canonical checkout attempt; never create payment link from client input. Store real `checkout_session.id`, `payment_intent.id` (where present), merchant account, mode and expected amount/currency in DB, not a fake local attempt ID posing as session ID. Handle idempotent return after a PSP response timeout by lookup/reconciliation.
- Allow 3DS/SCA, declined, `requires_action`, delayed bank methods, pending, cancelled, expired and abandoned checkout. Do not assume redirect to success or `checkout.session.completed` means funds captured: inspect `payment_status`, session mode, payment method and authoritative PSP state; `checkout.session.async_payment_succeeded` and failed variants where applicable. Match event type-specific schemas; `amount_total` vs `amount_received` appropriately; never depend on an absent generic `amount` field.
- Verify official Stripe raw-body signature via vetted SDK (including timestamp tolerance); event parsed only after verification; reject wrong live/test mode, wrong connected merchant, wrong PSP object, wrong expected order/attempt, wrong amount/currency and non-final payment state. `metadata` is correlation aid, not payment proof. Store digest/event IDs and financial PSP identities with unique constraints and reconciliation. Redact secrets/PII in logs and stored event payload.

## C. Exactly-once EFFECT, at-least-once DELIVERY

- Provider webhook delivery is at-least-once and events may arrive out of order. Deduplicate event IDs AND settle a specific PSP payment exactly once regardless of different event IDs or webhook types. State transition must be transactional with guarded expected-state update/unique settlement ID; retries after partial crash never duplicate invoices, ledger allocations, entitlement, outbox or refunds.
- Distinguish invoice number allocation and fiscal document issuance. The tax/invoice partner decides legal sequencing; do not number draft as fiscal invoice prematurely if not compliant. Cancellation/credit-note issuance must preserve audit and legal history, never delete paid invoices.
- Build separate immutable payment ledger/allocation records and reconciliation job, mapping capture/refund/dispute/chargeback to order and invoice; nightly reconciliation detects missing/mismatched PSP amounts and orphan transactions, alerts humans and blocks automatic fulfillment on anomalies.
- Payments confirmed while capacity disappeared: create `PAID_UNFULFILLED_REVIEW`/queue and agreed refund/alternative handling, not blind server creation or money disappearance.

## D. Subscriptions and service renewals

- Choose and document one authority: local subscription engine coordinated with PSP or PSP subscriptions coordinated with local mirror. Never have two independent systems generating duplicate renewals/charges. Preserve provider identity of each invoice/payment.
- Initial periods, renewal dates, billing cycles, auto-renew and payment method consent, retry/dunning, grace period, invoices before charging when appropriate, suspended/past_due rules, unsuspension after confirmed payment, cancellation immediate vs end-of-term.
- Upgrade proration, addon modifications, usage metering if approved, plan transitions, tax rate changes and invoice adjustments; credits/refunds never exceed captured net payment.
- Refund workflow with staff role, reason, original payment linkage, idempotency, amount caps, provider confirmation, credit notes, partial refunds, duplicate event safety, alert to customer, service state policy. Chargebacks/disputes suspend actions based on approved policy; do not automatically delete data or hide dispute evidence.

## E. Frontend and admin

- Checkout displays complete and actual quote line/taxes/period, expected renewal total, T&C consent, order id, PSP redirect, pending state, success only after confirmed server-side settlement; error/expired retry with idempotency.
- Billing page has real invoices, downloadable legally correct documents if signed off, payment attempts, subscription cancellation, renewal controls, refunds status, payment method PSP portal, notification preferences. Never use placeholder PDFs as customer invoices.
- Admin queue for anomalous payments, failed renewal, refund approvals, chargebacks, corrections and manual reconciliation. Staff cannot set order PAID manually with an API toggle.

## F. Mandatory sandbox matrix (document test receipts)

1. Signed valid settled payment -> exactly one `PAID` entitlement and one outbox; never deliver before settlement.
2. Forged signature, replayed signature/time, altered body -> reject without side effects.
3. `checkout.session.completed` with unpaid/pending payment -> no provisioning; delayed success later -> one entitlement.
4. Correct session but wrong merchant, livemode, account, order ID, currency, amount, product metadata -> anomaly held.
5. Duplicate event ID, different events for same PSP payment, out-of-order events, concurrent same-payment delivery -> one financial settlement.
6. Network timeout after creating PSP session; retry matches the original session; no two chargeable orders.
7. Double-click checkout, race between two browser tabs, reusing idempotency key with changed region/option/quantity -> no incorrect order/price.
8. Tax manipulation, B2B flag with invalid/unverified VAT ID, ambiguous tax jurisdiction -> deny/live hold pending owner-approved policy.
9. 3DS challenge fail, declined, expired, partially captured/returned payments, overpayment and zero/negative amount -> correct state, no service grant.
10. Renewal paid twice, webhook delayed relative to dunning, user cancellation at renewal boundary -> no double charge or accidental termination.
11. Partial/full refund, duplicate refund webhook, dispute opened/won/lost, reversal -> consistent ledger, invoice/credit note, service status, audit.
12. Crash after PSP confirmation before DB commit, after DB commit before HTTP 200, before provisioning event dispatch -> eventual reconciliation, one result.
13. Cross-tenant invoice/checkout lookup, billing role boundaries, CSRF replay -> no leak or mutation.

## Deliverables and explicit approval gates

Real Stripe **test-mode** adapter, documented pinned API version, signed webhook contract integration with real Stripe test events, reconciled DB state machine, tests and screenshots, finance runbooks, unresolved tax/legal policy checklist. Do not switch to live; fail closed until owner provides/approves legal information, PSP access and production readiness evidence. Report exactly which cases ran in Stripe sandbox versus local mock.


---

<!-- FILE: 07_PTERODACTYL_PROVISIONING.md -->

# PHASE 7 — REAL PTERODACTYL STAGING PROVIDER AND SAFE PROVISIONING

You are implementing real Fortless infrastructure management against a user-approved **staging Pterodactyl panel**. Read `00_GLOBAL_CONTRACT.md`, Phase 6 payment state machine, `src/modules/provisioning/adapter.ts`, `src/modules/outbox/worker.ts`, provider model, and current official Pterodactyl Application API and Client API docs for the explicitly pinned tested panel version. No operation on the owner's production Pterodactyl or customer servers without separate explicit authorization.

## Architecture and boundaries

- Extend provider adapter with real HTTP client, scoped and rotated secrets, request deadlines, retry classification, status reconciliation and capability discovery; do not rely on `MockPterodactylAdapter` outside isolated tests.
- Use Application API only server-to-server with least privileges and isolated credential storage. Use Client API/proxy for customer-level operations only after server-side account->service->provider mapping and permission check. Do not leak provider application/client API keys, tokens, node allocation internals or privileged Wings access to browsers.
- Separate `providerInstanceId`, `providerServerId`, human-safe identifier, account owner, panel user identity and persistent correlation tag/external reference. Never infer ownership from arbitrary client-provided server ID.
- Identify the panel version, nodes, node allocations, egg/nest IDs, Docker image constraints, verified environment schema, backups/database quotas, storage/memory/CPU and data region. Validate every field against server-owned allowlists and current plan snapshot.

## Secure purchase-to-deployment saga

1. An invoice is marked authoritatively settled; a unique entitlement/service operation is created atomically with order item and outbox event.
2. Queue worker reserves capacity and valid available allocation transactionally, selects approved staging node, records correlation tag, operator, intended resources and operation intent.
3. Ensure provider user exists or create/map by unique externally bound ID; never use customer email as sole remote ownership proof.
4. Create server with correct egg, start command from allowlist, validated images/env/resource limits. Guard any configuration settings allowing arbitrary code/mount privilege escalation; this is paid hosting isolation, not local trusted scripts.
5. After remote success, read back server by stable ID / correlation tag, verify actual requested limits, install status, ownership and allocation. Only then move technical state to ready/active; don't equate process RUNNING with successful install.
6. Issue customer notifications and expose only permitted control-panel paths. Store no arbitrary startup secrets in plaintext; redact env vars in logs, encrypt if needed.
7. On timeout (unknown outcome), **reconcile by correlation**, do not blindly retry create. If API cannot prove outcome, mark `NEEDS_MANUAL_REVIEW`, alert staff and avoid duplicate resources.
8. If no node capacity, missing allocation, wrong egg or provider outage, mark fulfillment pending/review, preserve paid order and route to approved refund/alternate region decision; do not fabricate `ACTIVE`.

## Recoverable operation engine

- Durable job leases, heartbeat, backoff, max attempts, dead-letter, admin retry with step-up and idempotency, immutable audit history, per-service locks.
- Actions: start/stop/restart/kill, rename, startup option changes, backups/list/download/restore/delete with strict permissions, files/console/logs, database credentials and rotations, allocation/port management, rebuild/reinstall, resource upgrade/downgrade, suspend/unsuspend, migration, terminate.
- Classify each action as safe, high risk, or destructive; require recent auth and explicit typed confirmation where appropriate. `terminate` must honor retention/refund/billing policy; account delinquency usually suspends, not destructive deletion.
- For console/file manager real-time interface, design session-scoped proxy tokens or short-lived scoped credentials with server-side membership checks and expiry; WebSocket auth validated at handshake and periodically on revocation; path traversal prevention, upload limits and malicious file scanning policy.
- Track `commercial_status`, `desired_config`, `provider_observed_state`, `last_checked_at`, `provider_error` separately. Poll or subscribe to authorized health metrics, mark STALE/UNKNOWN when provider unreachable, not ONLINE by default.
- Capacity pressure/drift monitors and reconciliation sweeps for orphan Pterodactyl servers, deleted remote resources, wrong quotas, suspended state divergence, provider user mismatch and outbox lag. Admin remediation must never silently create a new billable entitlement.

## Tenant/role safety

Customer `OWNER`/`TECH_ADMIN` may act on own technical services, `BILLING_MANAGER` may pay/manage subscriptions without console secrets, `VIEWER` only view allowed metadata. Staff `SUPPORT` is not implicitly infrastructure root; `INFRASTRUCTURE` scoped operations with audit; independent RBAC enforcement on every API route. Prevent IDOR via guessed provider server identifier, node ID, backup ID, allocation, database ID and file path.

## Required tests (staging and fault injection)

- Authorized verified settled test order -> exactly one real staging server with exact CPU/RAM/disk/egg/region, persisted association, customer can see/control it.
- Unpaid/pending/forged test order -> zero provider calls; provider test credential accidentally used in production config -> fail closed.
- Timeout after server actually created -> retry finds same remote resource, no duplicate and no extra port allocation.
- Worker crash before/after API create and before/after DB commit; two workers race; stale `PROCESSING` recovered through lease.
- Failing node/insufficient capacity/invalid egg/slow install/remote 403/429/5xx/wrong observed resource -> explicit recoverable state; no billed but invisible service.
- Cross-tenant power, console WebSocket, file access, backups, env values and DB access denied; staff role matrix.
- Power action after suspension or cancellation fails; recently revoked team member loses WebSocket/API access.
- Destructive termination requires confirmation, authorized policy, outbox operation and audit; repeated deletion cannot delete someone else's server.
- Reconcile orphan resources/drift without overwriting real customer entitlements.

## Deliverables

Official staging adapter + integration/contract tests, real service and admin UI, capacity+allocation management, queue recovery, runbooks, fault injection evidence and honest capability status. **Keep live provider disabled until approved production credentials plus rollout plan are provided**. Do not overclaim protection from DDoS or backup guarantees without real infrastructure support.


---

<!-- FILE: 08_CUSTOMER_APP_SUPPORT_LIFECYCLE.md -->

# PHASE 8 — REAL CUSTOMER AREA, SUPPORT, SERVER LIFECYCLE AND POLISH

You are converting Fortless's existing `/app` shell into a completely functional user journey while retaining the supplied Petal/FL visual system. Read `00_GLOBAL_CONTRACT.md`, Phase 4–7 status and `public/app.html`, `public/assets/app-ui.js`, backend routes and provider capabilities. The user insists the app should not just look like the landing page: **everything shown should work**.

## Scope: route by route

**`/app` Home:** real products owned, paid/pending/failed service state, expiring renewals, actionable support tickets, payments due, notifications, recent activity. Never fabricate 99.9% uptime, six running servers or graphs. Empty dashboard has strong next action, not sample live servers.

**`/app/deploy`:** show actual configured published hosting offerings, region/capacity, resources, add-ons, validation, quote details, tax/rules, checkout redirect/pending state. No one-click server grant outside confirmed payment/approved trial entitlement. If PSP disabled, prevent checkout cleanly while allowing read-only plan selection or waitlist.

**`/app/services` and per-service detail:** list grouped by product & state, plan and capacity, real provider status with refresh timestamp. Service detail offers *verified* power controls, console/WebSocket, logs, files, backups, databases, env vars, networking/allocations, domain/proxy (if applicable), schedule/task features only when provider capability exists. Rate limit/high-risk action confirmation and role checks. Show unavailable features as unavailable, not fake links.

**`/app/billing`:** real invoices/receipts (only legally approved), orders, payment attempts, subscriptions, saved payment method via PSP billing portal, renewals, cancellation, upgrade/downgrade with displayed prorated amounts, refunds/disputes in progress and downloadable documents where supported. Pending and failed payment visually distinct from paid. All totals from authoritative DB/PSP.

**`/app/support`:** actual new ticket, thread, customer replies, status, attachments if approved, notifications, filtered list, pagination, reopen policy and role-appropriate views. One tenant cannot read another's ticket or attachment. Staff internal notes never returned in customer DTO.

**`/app/activity`:** accurate service changes, sign-ins, invoices, notifications, role changes and provisioning events with sensible safe detail and timestamps; no exposed tokens/passwords/provider secrets.

**`/app/settings`:** real profile, email change confirmation, billing details, session management, MFA/passkeys, organizations, roles/invites, preferences, data export/deletion request with retention policy. No fake success state.

**Notifications:** persisted bell/inbox state, read/unread, link to relevant action, opt-in per event type, mail statuses via outbox; do not send on sandbox-only/customer-live confusion.

## Service lifecycle and recovery

- Subscription renewal and scheduled billing gate, failed payment grace, suspension/un-suspension, cancellations immediate/end period, upgrades with proration and capacity, retry after provider outage, data deletion hold windows and backup retention with explicit policy.
- Reconciliation between PSP settled state, Fortless contract state and provider observed state; handle each as independent and report mismatches to admin without premature termination.
- Notifications of renewals/dunning/provision delays/incidents/cancellation/refund with clear states and appropriate anti-spam limits.
- Account deletion must respect invoices/legal retention/provider resources and avoid unsafe cascade deletes.

## Experience quality (all breakpoints)

- Reuse global design tokens, Inter Tight and logo geometry. Desktop app left navigation; mobile portrait bottom nav, compact landscape rail, accessible modal/bottom-sheet behavior; consistent CTA sizes, toasts, real loading/empty/error states, reduced-motion support and contrast.
- Provide coherent direct navigation, refreshing deep links, browser back/forward, network failure retries, no stale optimistic status after provider error.
- Form inputs with explicit validation and accessible messaging; client-side state does not replace server checks.
- Full cross-surface journey: marketing -> create account -> verify -> MFA -> choose plan -> pay test checkout -> pending -> real staging server -> manage -> receive ticket answer -> renew/cancel -> observe audit.

## Mandatory negative tests

Cross-tenant service IDs, invoice IDs, tickets and attachments; viewer power action and billing manager console; forbidden staff internal support note; failed PSP no server; delayed provider creates still PENDING not fake ONLINE; retry creates once; login revoked while console open; cancellation and renewal race; mobile landscape overflow; keyboard/focus/axe scanning; slow network+server errors.

## Deliverables

Functional customer flows backed by actual persistence and sandbox providers; UI visual regression screenshots desktop/tablet/phone, accessibility checks, security tests and updated truth matrix. Feature remains `BLOCKED`/`MOCKED` until real dependent phase is verified, regardless of how complete UI looks.


---

<!-- FILE: 09_OPTIONAL_PROVIDER_EXPANSION.md -->

# PHASE 9 — EXTEND FORTLESS BEYOND GAMES/BOTS (SEPARATE PROVIDER PROJECTS)

Use this prompt only after customer+admin, billing and Pterodactyl staging are verifiably functional. Read `00_GLOBAL_CONTRACT.md` and the provider API docs before designing or implementing. Do **not** interpret one adapter as authorization to promise all hosting products. Integrate each category incrementally behind its own capability gate, pricing, capacity, security review and contract tests.

## 1. Node.js / app hosting

An egg alone does not make trustworthy application hosting. Define supported runtimes, build/install/deploy pipeline, environment variable secret handling, persistent process supervisor, CPU/memory limits, log streaming, dependency/cache controls, self-service deployments, Git integration only with scoped OAuth, domains, DNS verification, HTTPS/TLS issuance/renewals, reverse-proxy routing, custom ports, access logs, quotas, anti-abuse policy and resource isolation. Explicitly prevent SSRF via metadata/internal-network access, port hijacking and untrusted workloads accessing host Docker socket. Include restore/rollbacks and health checks. Sell only once implementation is tested on staging.

## 2. Web hosting (cPanel/WHM or chosen partner)

Use documented, correctly licensed WHM APIs to create/suspend/upgrade/delete accounts and packages. Define email/DNS/SSL/backup responsibilities, plan caps, account ownership, distinct reseller roles, provider mapping and recovery after timeout; handle cPanel webhook/action limitations through polling. Do not assume CloudPanel, Plesk or cPanel features are equivalent. No cracked licensing. Bind controls to actual API support.

## 3. VPS hosting

Pick provider/hypervisor (Proxmox, cloud vendor, Virtualizor or other contract), choose tenant model, templates/images, CPU/RAM/storage quota, reserved/public IP allocations, secure passwords/SSH key injection, cloud-init, snapshots, reinstall, console proxy, power/network, reverse DNS, abuse handling, capacity and billing. Use isolated virtual machines, not Docker advertised as VPS. Enforce no customer access to hypervisor admin tokens. Never allow arbitrary host-local file/image paths.

## 4. Domain registrar + DNS

Choose reseller contract/API and permitted TLDs. Validate IDN/punycode and registrant contact rules, domain availability and transfer price in real time, nameservers, DNSSEC, EPP/AuthInfo, WHOIS privacy where available, auto-renew, transfer locks, pending redemption/restore states, failed registry operations, and time-sensitive expiry notices. A domain search result is not a reservation; purchase only after a unique paid order and accepted registrar transaction; uncertain outcome requires reconciliation, not blind retry. Never expose EPP keys or private contacts to unauthorized users.

## 5. Managed databases / object storage

Define actual engine/versions, quotas, isolated tenants and credentials, IP/TLS access, backups/restore, access logs, monitoring, encryption at rest, replication and disaster recovery. Never label a Pterodactyl database quota 'managed DB hosting' without a real managed service boundary.

## 6. Optional AI-assisted services

Only after core is stable. AI support assistant can read **approved redacted** logs and public docs with strict tenant scope; destructive changes require separate explicit user confirmation, server validation and audit. No model-generated shell commands executed automatically, no provider credentials sent to model, no privilege escalation via malicious customer log content. Per-account cost budgets and opt-in consent. No invented promises about AI deployment products without provider choice.

## Uniform delivery protocol PER category

Provider selection + contractual/technical limits -> capability specification -> data model -> admin plan template/inventory -> pricing/tax -> provider staging adapter -> trust boundary review -> full negative+fault injection tests -> customer UI -> docs/runbook -> rollout flag. Report `NOT_STARTED`, `STAGING_VERIFIED` or `PRODUCTION_VERIFIED` individually for each service category. Never ship 5 categories at once as mock cards masquerading as operational products.


---

<!-- FILE: 10_RELEASE_SECURITY_OPERATIONS.md -->

# PHASE 10 — PRE-LAUNCH SECURITY, RELIABILITY, COMPLIANCE AND RELEASE GATES

You are the independent go/no-go reviewer for Fortless. Read `00_GLOBAL_CONTRACT.md` and complete repo/status. Never declare '100% secure'. Identify residual risks, reproduce failures safely and provide evidence-based release recommendation. Do not trigger live payments, server destruction, DNS changes, production migrations or stress tests without separate explicit approval.

## 1. Threat model / abuse cases

Assets: customer IDs/session tokens, staff privileges, PSP identities/money, invoices/ledger, provider keys, server console/file content, domains, tenant data, staff notes, network allocations and backups. Threat actors: anonymous bots, fraudulent customer, compromised customer, malicious tenant inside paid hosting, compromised staff, compromised provider API and webhook spoofers. Draw data flows and trust boundaries. Check OWASP ASVS/Top 10, API access control, MFA and secrets. Every critical control must have at least one negative test.

## 2. Security review matrix

- Access: IDOR/BOLA on *all* object IDs including backup/file/ticket/invoice/domain/user/team/server; staff privilege levels and revocation, last-owner protection, safe redirects and authorization inside WebSocket/download links.
- Input: XSS from uploaded HTML, customer-controlled service names/logs/ticket content; SQL injection in sorting/search, path traversal, SSRF from image fetch/proxy/app deploy URLs, command injection in Pterodactyl start/env, stored XSS in admin views.
- Browser: cookie HttpOnly/Secure/SameSite, CSRF on all mutations, CORS exact allowlist, CSP without unsafe-inline where feasible, frame restrictions, HSTS in production, asset integrity, caching of personalized HTML as no-store.
- Secret management: .env scanning, provider/PSP keys rotation, encrypted backup and service credentials, admin/recovery-code exposure, crash logs, no customer PII in application telemetry.
- Reliability: degraded PSP/provision/email/db behavior stays fail closed without silent mock fallbacks; worker recovery, max payload size, timeouts, rate-limits, dependency failure isolation, outbox and settlement alarms.
- Financial: signed webhook verification, semantic payment status, replay/duplicate/delayed event protection, refund/dispute and tax evidence, invoice/ledger reconciliation, finance adjustments approvals.
- Infrastructure: provider API least privilege, container isolation, guest-to-host protection, storage/network per-tenant, DNS and domain transfer controls, server destruction authorization and backup retention.

## 3. Real operational verification

- Test suite: unit, integration, contract, DB migration, concurrency, property/fuzz checks for money parsing, e2e browser/mobile, accessibility, provider sandbox, restore rehearsal. Publish a test matrix with exact environment, date, and evidence. Never report a pass merely because a test was skipped.
- Disaster recovery: encrypted automatic backup schedule, off-site copy, restore of a full test snapshot, RPO/RTO measured, secret restoration/key rotation, reconciliation with remote provider and PSP after restore; runbooks and pager response.
- Observability: response latencies, error budgets, failed mail delivery, unsettled payments, webhook backlog, dead-letter, staging/live provider degradation, node utilization, backups missing, invoice anomalies, suspicious admin writes; alerts tested end-to-end.
- Load tests (staging only with authorization): account sign-in, pricing, admin search, concurrent checkout/last-capacity, retries and worker restarts, job replay storms, websocket connections. No production DDoS-style tests.
- Compliance: legal entity/invoice, consumer rights, VAT, GDPR data processing/retention, DPA for processors, acceptable use, refunds, copyright and abuse response, cookie policy when tracking; sign-offs from qualified professionals where required. Distinguish technical implementation from legal advice.
- Supply chain/deployment: dependency review, lockfile, secret scans, CI gating, branch protection, signed artifacts if feasible, staging/production parity, smoke, canary or safe rollout, rollback, explicit approval for production migration and live key activation.

## 4. Release gates (must all pass or remain blocked)

G1. Critical/high security findings resolved or approved risk exception with explicit reason; no cross-tenant or staff privilege escalation.
G2. PSP test-mode proof for paid, delayed, failed, refund, chargeback, duplicate and out-of-order events; immutable ledger reconciliation matches provider receipts.
G3. Provider staging proof with one server per entitled order; unknown outcomes recover, no misallocated resources.
G4. Real transactional email delivery verified; verification and recovery tested; no token disclosure.
G5. Admin operations and customer journey e2e; all features advertised as available are real and tested. Pending features clearly labeled.
G6. PostgreSQL/worker migration and backup restoration rehearsed; recovery within business-approved objectives.
G7. Business/legal policies, merchant approval, subscriptions and invoicing signed off.
G8. Observability/on-call, incident/runbooks, privacy and data management in place.
G9. Production credentials, DNS, provider resources, merchant live mode separately and explicitly authorized.

## Output

Create `docs/RELEASE_READINESS.md` with PASS/BLOCKED for each gate, links to exact test/log evidence, vulnerability list, open business decisions, rollback procedure and owner signoff checklist. Do not mark live without authorization. Give a recommended rollout sequence starting with internal staff, limited allowlisted customers, then paid beta with caps, and broader release only after monitoring.


---

<!-- FILE: 11_MASTER_ORCHESTRATOR_PROMPT.md -->

# FORTLESS — MASTER CODEX ORCHESTRATOR (paste into Codex)

You are the **lead principal engineer, security reviewer, QA engineer, architecture owner and full-stack implementation agent** for the existing Fortless hosting SaaS in this workspace. This is a real commercial platform, not a demo. The existing homepage and Petal design system are authored already; the user explicitly reports the admin panel and major customer flows are mocks or only partially real. Your mission is to deliver a robust, consistently designed, **actually functional** platform, in audited increments.

The full implementation brief is bundled under `FORTLESS_CODEX_MEGA_PROMPTS/` in this repository. **Read `README_START_HERE.md`, `00_GLOBAL_CONTRACT.md`, and all phase prompts before editing, then execute ONLY the first incomplete phase / smallest coherent vertical slice.** Also read root `AGENTS.md`, `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/fortless/*`, `blueprint/fortless-blueprint/MASTER_PROMPT.md`, and Petal references.

You must preserve the Fortless style: actual FL monogram, light gray backgrounds, dark navy, electric blue and lime, bold Inter Tight, flat rounded Petal components, mobile UX, consistent public/auth/customer/admin theme. Do not generate a generic replacement UI. No placeholder metrics or fake successful buttons.

## Start now, exact sequence

1. Inspect current Git HEAD and repository structure, inspect routes and UI event handlers and detect whether the repo changed from the 2026-10-17 inspected baseline. Do not assume documentation claims prove functionality.
2. Run available clean local/test checks and establish a safe isolated environment. **Do not touch live services or data.**
3. Execute `01_AUDIT_AND_REALITY_MAP.md`, documenting every component/control and its real operational state. Treat admin especially carefully.
4. Read the dependency plan for Phases 2–10 and create `docs/PHASE_BACKLOG.md` with concrete ordered vertical slices. Do not start a framework rewrite.
5. After audit, pick one or two small, safe high-priority slices within Phase 2/3 if their requirements and test environment are fully available; otherwise stop and report the audit and blockers. The user will then authorize the next stage.

## Non-negotiable production rules

- Never deliver hosting before authoritative confirmed settlement or approved free entitlement. Never trust front-end amount, server specs or claimed VAT/exemption.
- Never make Stripe live charges, refunds, domain registrations, live provider create/delete/power operations, production database migrations, initial staff OWNER grant, email blast, DNS changes or secrets rotation without specific approval.
- Sandbox and in-memory mocks are legitimate test tools, but are **never** evidence of a working production provider integration.
- All sensitive mutations require tenant/role checks, validations, audit and appropriate step-up; PSP/provider actions need idempotency and failure recovery.
- Maintain evidence-backed status in `docs/REALITY_MATRIX.md` and `docs/IMPLEMENTATION_STATUS.md` after each vertical slice; no feature counts as done based on UI design or code compilation alone.
- Fail closed when email, PSP or Pterodactyl is unavailable. Do not silently enable features and don't pretend to send email.
- For every high-impact financial/provider change test duplicate calls, out-of-order events, partial failure, concurrency, replay and unauthorized access.
- Review official APIs and pinned versions before implementing integrations; do not invent request/response shapes.
- Use existing stack pragmatically; migrate where technically needed, with compatibility and restore validation.

## Phase schedule

`01` Audit/Mock matrix -> `02` Backend, DB, workers, CI -> `03` Real auth/email/MFA -> `04` Functional admin -> `05` Catalog/pricing/inventory -> `06` Stripe sandbox/billing/tax -> `07` Pterodactyl staging -> `08` Full customer experience/renewal/support -> `09` Optional additional provider categories -> `10` Security, disaster recovery, production readiness.

Some parts (admin finance/provider tools, customer service actions) must be completed after dependent integrations. Explicitly track cross-phase dependencies and revisit until every advertised available feature passes its gates.

## Output now

Tell me what is actually implemented, what is mock, what is blocked, what tests you executed, what files you changed, evidence of persistence/authorization/recovery, any hard security blockers, and the next safe vertical slice. Start auditing and working; do not return a generic essay or rebuild the landing page. Work within the repository, not only in prose. Commit only if repo workflow and user instructions permit; do not push or deploy automatically without authorization.


---

<!-- FILE: README_START_HERE.md -->

# FORTLESS — Codex implementation playbook

**Target repository:** https://github.com/trencito42/fortless  
**Inspected baseline:** `main` commit `11b18889edc6cecbfac6a6f1183f4ec144e5c7e8` (2026-10-17).  
**Purpose:** turn the existing Fortless landing, Petal-branded UI, simulated features, API foundation and tests into a real commercial hosting platform without prematurely enabling payments or production infrastructure mutations.

## Very important

This is a **plan and instructions for Codex**, not an assertion that each phase has been executed. Read the repository anew at the beginning of every session; this file's baseline may be stale. The previous review was static GitHub-source inspection, not deployment validation, penetration testing, or verified live service testing.

The design system exists in the repo. Never discard it, replace it with generic component frameworks, or rebuild all pages in an unrelated style. Existing frontend is mostly static HTML/CSS/JS composed from Petal examples; backend is currently Fastify + TypeScript + SQLite, not an operational Next.js/Redis/PostgreSQL deployment. A rewrite is **not** an acceptance criterion; preserve working behavior and migrate carefully as production requirements demand.

## Run in this order

1. `00_GLOBAL_CONTRACT.md` — binding development rules and completion criteria. Read this every session.
2. `01_AUDIT_AND_REALITY_MAP.md` — prove what is real, mocked, broken and unavailable.
3. `02_PRODUCTION_FOUNDATION.md` — DB, migrations, jobs, config, test infrastructure, CI and observability.
4. `03_AUTH_SECURITY_AND_EMAIL.md` — complete real identity, email, MFA, sessions and tenant-safe access.
5. `04_ADMIN_CONTROL_PLANE.md` — make each admin view and action real, scoped, auditable, confirmable.
6. `05_CATALOG_INVENTORY_COMMERCE.md` — product plans, public availability, option validation, pricing and capacity.
7. `06_BILLING_STRIPE_TAX.md` — sandbox-first real checkout, webhook settlement, invoices, renewals and disputes.
8. `07_PTERODACTYL_PROVISIONING.md` — real staging integration, capacity checks, safe provisioning saga.
9. `08_CUSTOMER_APP_SUPPORT_LIFECYCLE.md` — every customer action backed by real data; support and lifecycle.
10. `09_OPTIONAL_PROVIDER_EXPANSION.md` — web hosting, domains, VPS, app hosting, managed databases, AI optional.
11. `10_RELEASE_SECURITY_OPERATIONS.md` — pre-launch negative tests, monitoring, recovery, legal approvals, release gates.
12. `11_MASTER_ORCHESTRATOR_PROMPT.md` — paste this once into Codex to direct ordered implementation.

**Recommended workflow:** give Codex `11_MASTER_ORCHESTRATOR_PROMPT.md`, let it read stage 00 and audit, then run *one phase or one small vertical slice per session*. The individual stage files are self-contained enough to be pasted into a new Codex session alongside `00_GLOBAL_CONTRACT.md`.

## Non-negotiable acceptance rule

No work is 'DONE' merely because the page exists, the endpoint returns 200, a test uses a fake adapter, or a README says it works. A feature must have real persistence, backend permissions, negative tests, honest capability labels, recovery paths, appropriate environment verification and a demonstrated journey. When real external credentials are missing, implement safe adapters/tests and report **BLOCKED FOR SANDBOX** rather than pretending success.

## Questions only the owner/business can resolve

Legal entity and country, tax/VAT/invoicing policy, refund policy and AUP, payment provider contract/approval, invoicing partner requirements, SMTP/email provider & domain, real Pterodactyl staging and capacity, live credentials, production infrastructure and backup RPO/RTO. Never silently 'decide' these based on a mock or example.

## Important observed risks from the baseline

- `src/server.ts` has `operationalCapability(...) => false`; checkout/provider/email are intentionally disabled.
- `src/modules/pricing/quote.ts` has hard-coded/unsafe assumptions about VAT, accepts claimed B2B tax ID based on length, defaults to `DE`, and contains no complete fiscal policy.
- `src/modules/payments/webhooks.ts` is not production-safe for Checkout Session asynchronous payment status and must be redesigned with authoritative PSP identity and settlement conditions.
- `src/modules/checkout/checkout.ts` does not create a hosted Stripe session, and its idempotency request hash excludes region/options even though they affect the result.
- `src/modules/outbox/worker.ts` changes events to `PROCESSING` without durable lease/recovery; provider is an in-memory test double.
- `src/index.ts` binds `0.0.0.0` while configuration declares an intended `HOST` default of 127.0.0.1; review exposure.
- Admin overview has real counts via SQL, but much of the admin UI consists of reads and non-operational workflows. A first OWNER has not been bootstrapped and the staff API is limited.
- Tests are present (`tests/platform.test.ts`), but 'passed' in repo docs is not an independently executed validation in this handoff.

Do not enable the currently disabled commerce/provider switches until the dedicated acceptance gates pass.
