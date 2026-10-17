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
