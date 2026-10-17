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
