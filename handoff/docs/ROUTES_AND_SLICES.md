# Suggested routes, modules and build slices

This is a proposal, not a claim that these routes already exist. First audit the codebase and adapt without erasing stable existing work. Keep public pages indexable and authenticated routes private.

## Public
`/` landing; `/hosting` catalog; `/hosting/game-servers`; `/hosting/discord-bots`; later `/hosting/apps`, `/hosting/web`, `/hosting/vps`; later `/domains`; `/platform`; `/pricing` only when real data exists; `/about`; `/contact`; `/docs`; `/blog`; `/status` real integration or forthcoming marker; legal pages; 404/500.

## Auth
`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/mfa/verify`, `/auth/callback` only if supported integration, `/logout` as POST.

## Client area
`/app` overview; `/app/services`; `/app/services/[id]` (tabs only if supported); `/app/orders`; `/app/billing/invoices`; `/app/billing/payments`; `/app/billing/subscriptions`; `/app/support`; `/app/support/[id]`; `/app/settings/profile`; `/app/settings/security`; `/app/settings/billing`; `/app/notifications`; later `/app/domains`, team and API tokens.

## Admin area, strictly role/permission guarded
`/admin`; `/admin/accounts`; `/admin/users`; `/admin/catalog/products`; `/admin/catalog/plans`; `/admin/orders`; `/admin/services`; `/admin/providers`; `/admin/nodes`; `/admin/billing/invoices`; `/admin/billing/payments`; `/admin/billing/reconciliation`; `/admin/billing/disputes`; `/admin/support`; `/admin/audit`; `/admin/settings`; later CMS, risk dashboards and scheduled job dashboard.

## Phase slices (do not implement all in one turn)
0. Repo, components, stack, secrets inventory; architecture ADR; environment example; CI baseline; runnable local/staging/dev setup; migrations/test infra; list open business decisions.
1. Identity schema/session/auth flow; register/login/logout/verify/recovery; secure default permissions; appropriate MFA; E2E auth failure paths, CSRF/rate-limit tests. Implement auth shell with exact Fortless design.
2. Client app shell and dashboard from real authorized backend service entities; useful no-services empty state, loading/error states. Admin shell with high-trust guard and audit.
3. Catalog, draft/published plan versioning, server-priced quotes, order cart/checkout model, vouchers + atomic limits. Public catalog and admin management.
4. Sandbox PSP integration, webhook inbox, idempotency and transaction/ledger reconciliation. Payment risk gates and refunds/disputes with real sandbox tests, no live charging.
5. Provisioning abstraction, mock provider, durable queue and Pterodactyl staging adapter. Service inspect/reconcile and safe customer server management UI; test ambiguous outcomes and concurrency.
6. Full billing renewals, notifications, grace/suspend/termination, support tickets, admin ops, audit, imports, backups and recovery.
7. Other service adaptors only with actual provider contract/capabilities, verified integrations and corresponding tests.
8. Security review, backup restore drills, monitoring, rate/capacity tests, UX/accessibility and explicit launch approval.

## Acceptance for any slice
- Schema/migration and rollback documented.
- Every route and service op has server authorization and tenant isolation.
- Form, loading, empty, error, success UI match design system.
- Tests for happy path, unauthorized access, malformed requests, concurrent actions and failed dependencies.
- No fake balances, prices or infrastructure status presented as real.
- CI: lint, typecheck, unit, integration, E2E results accurately reported.
- Known unknowns in implementation status and open decisions.
