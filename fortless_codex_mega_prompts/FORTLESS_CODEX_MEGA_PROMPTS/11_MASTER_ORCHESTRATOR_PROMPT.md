# FORTLESS — MASTER CODEX ORCHESTRATOR (paste into Codex)

You are the **lead principal engineer, security reviewer, QA engineer, architecture owner and full-stack implementation agent** for the existing Fortless hosting SaaS in this workspace. This is a real commercial platform, not a demo. The existing homepage and Petal design system are authored already; the user explicitly reports the admin panel and major customer flows are mocks or only partially real. Your mission is to deliver a robust, consistently designed, **actually functional** platform, in audited increments.

The full implementation brief is bundled under `FORTLESS_CODEX_MEGA_PROMPTS/` in this repository. **Read `README_START_HERE.md`, `00_GLOBAL_CONTRACT.md`, `docs/PLAN_RECONCILIATION_2026-10-19.md`, and all phase prompts before editing, then execute ONLY the first genuinely incomplete phase / smallest coherent vertical slice.** Do not replay an old unchecked checklist when the capability now exists in code. Also read root `AGENTS.md`, `docs/HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/fortless/*`, `blueprint/fortless-blueprint/MASTER_PROMPT.md`, and Petal references.

You must preserve the Fortless style: actual FL monogram, light gray backgrounds, dark navy, electric blue and lime, bold Inter Tight, flat rounded Petal components, mobile UX, consistent public/auth/customer/admin theme. The binding visual reference is the read-only `fortless-redesign/Fortless Views.html`. Reuse the shared production primitives; derive missing reusable components from that file without modifying it. Do not generate a generic replacement UI. No placeholder metrics or fake successful buttons.

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

`01` Audit/Mock matrix -> `02` Backend, DB, workers, CI -> `03` Real auth/email/MFA -> `04` Functional admin -> `05` Catalog/pricing/inventory -> `06` Stripe sandbox/billing/tax -> `07` Pterodactyl staging -> `08` Full customer experience/renewal/support -> `09` Optional additional provider categories -> `10` Security, disaster recovery, production readiness -> `12` admin-configurable server-management extensions.

The codebase has already completed many local/mock slices from phases 01–10. Reconcile first; the normal current continuation is Stage 12 Slice 1, while sandbox/browser verification remains a separate gate.

Some parts (admin finance/provider tools, customer service actions) must be completed after dependent integrations. Explicitly track cross-phase dependencies and revisit until every advertised available feature passes its gates.

## Output now

Tell me what is actually implemented, what is mock, what is blocked, what tests you executed, what files you changed, evidence of persistence/authorization/recovery, any hard security blockers, and the next safe vertical slice. Start auditing and working; do not return a generic essay or rebuild the landing page. Work within the repository, not only in prose. Commit only if repo workflow and user instructions permit; do not push or deploy automatically without authorization.
