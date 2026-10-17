# FORTLESS coding agent rules (Codex, Cursor, Claude Code)

You are implementing a REAL commercial hosting platform, not a UI mockup or a WHMCS clone. First read, completely and in this order:

1. `docs/CODEX_CONTEXT.md` (verified project context, user intentions, current reality)
2. `docs/DESIGN_SYSTEM_INTEGRATION.md` (visual source of truth and UX expectations)
3. `MASTER_PROMPT.md` (full product, architecture, security and payment requirements)
4. ALL numbered `docs/01_*.md` through `docs/08_*.md` (technical specs)
5. `docs/ROUTES_AND_SLICES.md` and `docs/IMPLEMENTATION_STATUS.md` (app structure, phasing, reporting)

## Non-negotiables
- Inspect repository files and verify what really exists; never pretend code works or tests passed.
- Respect and reuse the two supplied HTML design-system references (tokens, interaction patterns, cards, inputs, responsive behaviour). They are *reference HTML*, not a ready-made React package. Port/reuse intentionally; don't call them an installed component library.
- The existing Fortless landing prototype is a visual reference, NOT evidence of backend, live infrastructure, pricing, or uptime.
- Protect tenant boundaries on server for every operation; require appropriate MFA for admin actions, secure sessions/CSRF defenses, rate limits and audit logs.
- Treat money as integer minor units/exact decimals. Server-authored quotes; verified, deduplicated PSP webhooks; no paid services solely from client redirect.
- Durable provisioning with idempotency, reconciliation after ambiguous network failures, DLQ/manual repair; least privilege for all provider keys.
- Absolutely no real card charges, live provisioning, customer email, DNS changes, or destructive operations without explicit approval and safely configured environment.
- No invented company data, tax settings, prices, SLAs, performance benchmarks, customers, testimonials, provider support or feature availability.
- Keep all external integrations disabled/configuration-blocked until selected provider, official API version, proper credentials and sandbox tests exist. Never label simulation as live.
- No secrets or sensitive customer records in Git, browser bundles, issue comments, screenshots, logs or AI output.
- Favor small vertical slices with schema, API, UI, authorization, tests and rollback notes. Write reports of files changed, migrations, tests EXECUTED and unresolved blockers.
- Maintain `docs/IMPLEMENTATION_STATUS.md` after each coding task. For meaningful decisions write ADRs/updates rather than assuming.
- Developer usability: strict TypeScript, accessible UI, responsive page states, useful error/empty/loading views, no silent failures.

## First action
Read the instructions, inspect the workspace, and begin the foundation: authentication/register/login/verification/recovery, unified application shell, client dashboard, staff/admin guard, and documented prerequisites. Build complete thin slices rather than an impossible one-shot all-platform attempt.
