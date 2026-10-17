# Fortless repository audit

Date: 2026-10-17

## Verified repository state

- Workspace is not a Git worktree; no branch, remote, or clean/dirty status is available.
- Runtime: Node.js 24.22.0, npm 11.19.1, TypeScript 5.8, Fastify 5, SQLite through `better-sqlite3`.
- Shape: a TypeScript modular monolith with a single Fastify process, SQLite schema bootstrap, static HTML pages, and an in-process outbox loop. It is not the proposed Next.js/PostgreSQL/Redis deployment yet.
- Design source exists in `blueprint/fortless-blueprint/design/` and the transfer copy under `handoff/references/design-system/`. Petal tokens/primitives and the canonical Fortless mark are reusable.
- Existing domain code covered accounts/memberships, sessions, catalog/quotes, local checkout records, webhook fixtures, invoices, tickets, audit events, service records, an outbox worker, and an in-memory Pterodactyl test adapter.
- Existing public pages covered `/`, `/login`, `/register`, and a large `/app` shell. There was no operational admin page, email verification, password recovery, staff MFA flow, or provider-backed email delivery.

## Critical findings at start of this slice

1. Registration activated accounts and created sessions before email ownership was verified.
2. Raw bearer session tokens were stored as primary keys in SQLite.
3. No single-use verification or recovery tokens existed.
4. Credential throttling was only a generic process-local request limit.
5. Credentialed CORS reflected arbitrary origins and browser mutations had no explicit CSRF token.
6. A customer endpoint could fabricate a successful payment webhook and invoke the in-memory provider.
7. Default configuration contained mock-looking payment/provider credentials.
8. `/app` HTML was served without a server-side page guard; authorization happened later in browser JavaScript.
9. Auth UI was visually related to Fortless but duplicated CSS and had no dedicated landscape-phone layout.
10. The supplied handoff status was still `UNVERIFIED` and did not describe this repository.

## Current architecture decision

Keep the existing Fastify/TypeScript code while completing small vertical slices. Do not perform a framework rewrite before identity and authorization invariants are covered. SQLite remains a development/test target; production PostgreSQL migration, distributed rate limiting, separate workers, observability, backup/restore, and deployment isolation are release gates.

## External integration status

- Transactional email: `NOT_STARTED`; no provider selected, so no customer email is sent.
- PSP checkout: `NOT_STARTED`; customer checkout is fail-closed.
- Pterodactyl: `MOCK_ONLY`; customer provider mutations are fail-closed and the runtime worker is disabled.
- Legal/tax/invoice policy: open; current catalog/quote fixtures are not authority to collect money.
