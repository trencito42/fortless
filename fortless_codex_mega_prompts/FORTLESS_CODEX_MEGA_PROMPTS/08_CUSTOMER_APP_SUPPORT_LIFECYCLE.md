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
