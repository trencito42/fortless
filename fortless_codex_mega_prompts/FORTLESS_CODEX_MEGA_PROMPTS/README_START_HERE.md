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
