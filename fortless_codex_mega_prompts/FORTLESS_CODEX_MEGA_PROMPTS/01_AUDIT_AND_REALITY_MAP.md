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
