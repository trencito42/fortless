# FORTLESS — Product specification and release scope

## Product definition
Fortless sells infrastructure-backed hosting through one customer account and one commercial management platform. It is NOT WHMCS, a WHMCS theme, a Pterodactyl fork or a collection of hardcoded product cards. It may link to or wrap supported vendor client functions while Fortless remains responsible for commercial workflow, access to its own data, support and billing. Avoid promising white-label vendor functions until supported and security-tested.

## Actor / role matrix
- Anonymous visitor: browse published products, docs, status, legal pages, read pricing; may create an unpublished draft cart; no private data.
- Registered unverified user: login, verify email, manage account, limited cart; block high-risk checkout and API provision until risk policy satisfied.
- Account owner: full account administrative authority with sensitive operations requiring step-up auth, manage billing, membership and services.
- Account billing manager: quote/order/payment/invoice/billing details, NOT instance secrets or technical controls unless separately granted.
- Account technical manager: service controls, logs, domains and backups granted by capability, NOT refunds or payment methods.
- Account viewer: read explicitly granted resources; cannot edit or read secrets.
- Staff support: tickets and sanitized account diagnostic summaries; no blanket customer impersonation, payment card modifications or secret reading.
- Staff billing: reconciliation/invoices/refunds within limits and approval policy, no provider root controls.
- Staff infrastructure: provider/nodes/provisioning controls, no customer payment card details.
- Staff security: audit/security controls with bounded elevated powers; permanent logs.
- Staff owner: super-admin with MFA/passkey and break-glass documented, not anonymous "admin=true" toggles.

## Public information architecture
- Home: clear offers, audience, benefits, truthfully verified uptime/location/support claims.
- Games, Discord Bots and later Node.js, Web Hosting, VPS, Databases: category landing, feature comparison, packages, configurable plans, capacity by location, FAQ.
- Domains: availability, registration, transfer, supported extensions only after registrar configured.
- Pricing: transparent billing cycle, taxes, setup fees, renewal pricing, promotions; no hidden auto-renew.
- Locations, Infrastructure and Trust pages: only actual supported locations and policies.
- Blog / Guides: genuine helpful content and SEO; no promise of AI search rankings.
- Documentation, status, contact, support, SLA, Terms, Privacy, Cookies, Refund, Acceptable Use.

## Customer information architecture
- Overview dashboard: status, current services, next renewal, pending actions, tickets and incidents.
- Catalog/order flow: choose product/version/region/options -> trusted quote -> view taxes and recurring total -> accept required terms -> hosted provider payment -> server-verified confirmation -> provisioning status -> usable service.
- Services: active/pending/suspended/terminated; list filters and details; capability-specific controls; upgrade/downgrade; plan/resources/billing and cancellation.
- Billing: invoices, payments, payment methods via hosted PSP, renewals, billing profiles, saved methods consent, retry, refunds and credit notes; CSV/accounting export where appropriate.
- Domains: registrant details, nameservers, renewals, transfers, locks, DNS if provided.
- Support: tickets, attachments, replies, status, incidents.
- Account and teams: profile, security, active sessions, MFA, billing contacts, notification preferences, team members.

## Staff information architecture
- Operations: current orders, failing provisioning jobs, aging paid/unfulfilled orders, provider health, capacity and incident timeline.
- Commerce: products, variants, plan versions, regions, addons, coupons, prices, quotas, taxes/currencies, checkout config.
- Customer management: lookup, membership, invoices, tickets, current services, risk flags, consented remediation tools.
- Finance: disputes, refunds, credit notes, journal, settlement/reconciliation, overdue receivables, failure queue, tax export.
- Infrastructure: providers, nodes, pools, allocations, deployment credentials stored externally, service reconciliations, maintenance and migration actions.
- Security: auth events, sensitive operations and approvals, 2FA compliance, audit trail, abuse cases, vulnerability status.
- Content: blog/docs/legal editable drafts with review/versioning and approvals.
- Configuration: business entity tax jurisdiction, invoice sequences, payment modes, policy versioning, feature flags, notifications, retention.

## Must-have user journeys with acceptance criteria

### First purchase
A legitimate customer registers, verifies email, selects an available supported plan, sees accurate totals including taxes and renewal price, pays through sandbox provider, receives a verifiable order/invoice status, and sees exactly one provisioned server. The service works and has the purchased resources; nothing is created if payment is unconfirmed.

### Unhappy purchase
A customer pays, but provider is offline or out of resources. The order remains PAID but UNFULFILLED, customer sees status and a support path, staff gets alert, and recovery must either fulfill exactly once or compensate with explicit refund/credit; no silent exception.

### Renewal
Customer receives fair notice, next invoice has correct cycle, provider confirms one settlement, term extends once, service remains accessible; on failure appropriate notice/grace applies. Cancellation effective date must prevent renewal charges after requested end.

### Abuse and fraud
New account runs repeated suspicious purchases or requests prohibited workloads. Apply documented, proportionate risk evaluation and temporary manual review, with no unexplained charge and no unauthorized server resources. Complaints/refunds/audits are handled by staff with approval logs.

### Technical actions
Tech admin can restart their instance but not another user's; support can advise without reading secrets; billing manager cannot perform destructive technical operations. Error states are accurate and reversible where supported.

## Decisions and separation of phases
P0 live: identity, roles, catalog, quote and taxes boundary, PSP sandbox-tested payment path, orders, invoices, renewal, provisioning via tested stable Pterodactyl, service lifecycle, tickets, admin operations, audit/monitoring, backup/restore, required legal pages and support readiness.
P1 behind flags: Node apps with HTTP TLS routing, web hosting WHM, domains registrar, teams, advanced console/file integrations.
P2: VPS automation, managed database hosting, credits/wallet if properly ledgered, multi-currency, extensive team permission model.
P3: AI assistants, richer growth/analytics.
Unfinished modules remain gated and cannot collect money. Admin can draft disabled categories before the integrations exist.

## Design-system integration contract
Owner-supplied design system is authoritative. Produce inventory of its components, their supported props and assets. Build adapters only when strictly necessary, preserving semantics and accessibility. Maintain consistency across public/client/admin. No unofficial external UI library without approved justification. If system is absent, do not invent fonts/colors/branding and claim 1:1 implementation.
