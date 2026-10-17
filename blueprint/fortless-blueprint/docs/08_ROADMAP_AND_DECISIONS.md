# FORTLESS — Implementation roadmap, deliverable contracts and open decisions

## Sequencing rationale
Do not implement every WHMCS feature in the first commit. Build an extensible commerce/provisioning spine, with Pterodactyl as the first real adapter. Use precise status labels for incomplete integrations. A broad but fake 'complete UI' is worse than a working smaller launch.

### Phase 0 — inspect, spec, security architecture (P0)
Deliver: repo inventory, supported/runtime versions, design system integration plan, accurate documentation under `/docs/fortless`, ADR payment authority and versioned provider contract, API boundary diagram, ERD, RBAC permissions, failure matrix, verified product scope, risk register, task backlog and explicit unknowns. No external side effects.
Exit: decisions documented; no business assumptions baked invisibly; agent knows which service can actually launch.

### Phase 1 — foundations & permissions
Deliver: workspace setup, DB migrations, local dev Docker, session/auth/password reset/MFA for staff, account entities and roles, consistent validation/errors, audit logging, admin guard, worker/outbox/inbox base, secrets strategy, baseline CI. Tests for BOLA/IDOR, privilege separation, session controls.
Exit: customers and staff safely isolated, admin is not a boolean in frontend.

### Phase 2 — catalog, quote and sandbox payment
Deliver: versioned products/plans/regions/prices, admin management, quote and server-side pricing, checkout/cart/order state machines, PSP sandbox hosted checkout, raw verified webhook durable inbox, payments/finance journal, invoice drafts/issued state with legal gates, cancellation and reconciliation jobs. Tests include duplicate/out-of-order webhook, replay, price tamper, exact money rounding, 3DS failure, refund/dispute.
Exit: no customer can gain paid entitlement by manipulating browser. No live charge until legal and merchant approval.

### Phase 3 — provider + service lifecycle
Deliver: provider abstraction with fake provider, Pterodactyl version-pinned adapter, capacity reservations, user/server mappings, job engine, reconcile timeout/drift, client technical controls at real API capability, service suspension/renewal. Tests include provider side effect succeeded but response lost and worker crash.
Exit: end-to-end sandbox: quote -> payment -> one actual staging Pterodactyl server -> visibility -> technical actions -> renewal -> cancellation; no duplicate entitlement.

### Phase 4 — operations and go-live pilot
Deliver: tickets, templates, product/incident status, admin finance/infrastructure operations, reconciliation/dunning dashboards, key rotation runbooks, S3 backups, verified restore, alerts, accessibility, content and legal pages, independent security review, limited staged launch and support/troubleshooting.
Exit: reviewed compliance, signed-off business model, real support ownership, emergency cancellation/refund procedures, P0 launch checklist fully signed.

### Phase 5 — integrations behind flags
Order: Node.js with proxy + TLS + abuse protections -> cPanel/WHM -> registrar -> VPS -> managed databases; each follows provider adapter contract, cost/capacity controls, own fault matrix, docs and sandbox tests. One module can reach production without declaring the entire phase complete.

### Phase 6 — AI and marketing
Optional support knowledge assistant with tenant-bound retrieval and no write tools by default, blog/docs content and SEO, analytics with lawful consent and transparent product claims, performance and UX optimization.

## Agent's incremental result format
For each slice, output: **Goal / Code changed / DB migrations / Security controls / Tests run and exact results / Integration status / Remaining risks / Next smallest slice**. Use task board checklist and never present planned features as implemented.

## Open decisions requiring owner's or partner's actual answer
- Legal entity and country of establishment; merchant of record; supported markets and consumer/business mix.
- PSP chosen and explicit approval for selling hosting, gaming/bot workloads, domains and subscriptions; supported card/alternative methods.
- Invoice authority and bookkeeping connection; Romanian/european e-invoicing/VAT treatment where relevant; accounting signoff, refund policy and recurring-consent wording.
- Branding domain, launch country/languages/currency, true support hours, SLA and initial legal policies.
- Initial launch categories, actual Pterodactyl version, server node list/regions, capacity, pricing, port policy, abuse policy, license rights and upstream infrastructure contracts.
- Hosting provider(s) and commercial margins; per-node provisioning credentials/capabilities, whether existing nodes have client data and whether migrations are in scope.
- Whether first release should link to Pterodactyl official console or implement permission-safe Fortless management UI with all required supporting APIs.
- cPanel/WHM reseller license and credentials, registrar API contract and domain purchase terms, VPS provider and access.
- Backup retention and data loss expectations; support team and escalation; who can approve refunds, manual paid grants and termination.
- Customer team/org support in P0 or P1; amount thresholds for manual fraud review and financial dual approvals.
- Design system location, component import path, tokens, accessibility convention and license; integrate exactly after supplied.

## Temporary safe defaults until decisions made
- Only sandbox/fake providers, test merchant, staging mail sandbox and hidden storefront buy buttons.
- Currency/accounting logic built for ISO codes, but only one explicitly configured settlement currency at launch.
- No free trial, wallet, crypto, manual paid overrides, automated destructive termination, custom untrusted Docker images or external payment receipt uploads.
- One paid line = one provisioned service, correct many-lines order handling.
- Fail closed on missing tax policy, payment verification, provider capacity or admin credentials.
- Default no privileged support impersonation and no AI-controlled operations.
