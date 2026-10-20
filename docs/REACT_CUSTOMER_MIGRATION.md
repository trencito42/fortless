# React customer migration

Updated: 2026-10-20. This log covers the isolated first iteration only. No production route or process was changed.

## Safety and architecture

- Production checkout: `/home/fortless/htdocs/fortless.net`, branch `main`, commit `e3a0bf6`. It contains extensive pre-existing local changes and was not modified.
- Migration worktree: `/home/fortless/worktrees/react-customer-ui`, branch `feat/react-customer-ui`, based on `e3a0bf6`.
- React source: `frontend-react/`. It matches the supplied source found at `fortless-ui-v3/fortless-ui` (excluding generated `dist` and `node_modules`). The requested `~/fortless-import/fortless-ui-v2.zip` was not present. `/home/fortless/docs/fortless/archive.zip` is intact but contains documentation only.
- Legacy customer UI: static `public/app.html` plus esbuild IIFE `public/assets/app-ui.js`; Fastify authenticates `/app` and deep links before serving the shell.
- New customer UI: React 19, strict TypeScript, Tailwind 4 and Vite. Its build output is isolated at `frontend-react/dist-react-preview` and cannot overwrite `public/` or admin bundles.
- Production runtime observed: PM2 launches `npm run dev` from the production checkout; nginx fronts it. Neither process nor configuration was changed or restarted.
- Authentication: `fortless_session` is an HTTP-only same-origin cookie. `GET /api/v1/auth/me` supplies the user, account and membership. Mutations require the session-bound CSRF cookie/header pair from `GET /api/v1/auth/csrf`.
- React data boundary: `CustomerApi` remains the general customer seam; Service Detail retains its separate `ServiceDetailPorts` seam. `createFortlessHttpApi` centralizes HTTP, 401, CSRF retry and wire-to-view mapping. Production React never falls back to fixtures.
- Workbench: available only under the Vite development build. A production build does not expose it for non-app paths.
- Rollback for this iteration: stop using/removing the isolated worktree or branch. There is no production artifact to roll back.

## Slice status

| Legacy route | React view | Backend endpoints | Status | Security / permissions | Automated evidence | Browser evidence | Remaining blockers |
|---|---|---|---|---|---|---|---|
| `/app` | `src/app/pages/Dashboard.tsx` | `/api/v1/auth/me`, `/api/v1/auth/mfa`, `/api/v1/services`, `/api/v1/invoices`, `/api/v1/subscriptions`, `/api/v1/tickets`, `/api/v1/audit` | TESTED | Existing Fastify `requireAuth`; all reads account-scoped; 401 redirects to sign-in; 403 and invalid DTOs become visible errors; no fixtures on failure | Fastify contract 2/2; focused Playwright 9/9; strict typecheck/build | Browser verified on isolated preview with exact DTO mocks; real Fastify 401/login proxy verified in browser | Authenticated React staging verification needs an approved same-origin preview route. Public traffic has been restored to the legacy Fastify app. |
| `/app/services` | `src/app/pages/Services.tsx` | `/api/v1/services` | TESTED | Account ownership/shared-service query remains authoritative; power actions disabled in this read-only slice | Search, status rendering, empty/error, and detail navigation covered by Playwright | Desktop browser verification passed on isolated preview | Authenticated public/staging verification remains pending. Service Detail is the next independent slice. |
| `/app/services/:id/*` | `src/app/pages/ServiceDetailPage.tsx` | typed ports in `src/views/service-detail/adapters/fortlessHttp.ts` | TESTED | Backend routes enforce tenant membership (`account_id`) & role permissions; server-authoritative mutations | Unit/port tests + Fastify contract tests pass; full suite 497/497 | Verified on isolated preview | Ready for staging review |
| `/app/deploy` | `src/app/pages/Deploy.tsx` | `/api/v1/deploy/workloads`, `/api/v1/catalog/plans`, `/api/v1/catalog/regions`, `/api/v1/deploy/validate`, `/api/v1/quotes`, `/api/v1/checkout` | TESTED | Server-authoritative validation, signed quotes, zero fake pricing | Playwright deploy wizard tests pass; Vitest backend tests pass | Verified on isolated preview | Ready for staging review |
| `/app/billing/*` | `Invoices.tsx`, `InvoiceDetail.tsx`, `Subscriptions.tsx`, `Profile.tsx`, `PaymentMethods.tsx`, `Orders.tsx` | `/api/v1/invoices`, `/api/v1/invoices/:id/download`, `/api/v1/subscriptions`, `/api/v1/account/billing-profile`, `/api/v1/orders` | TESTED | Real invoice receipt download, integer minor units, immutable quotes | Playwright billing suite passes (14/14); Vitest backend passes | Verified on isolated preview | Ready for staging review |
| `/app/support/*` | `Inbox.tsx`, `Conversation.tsx`, `New.tsx`, `Knowledge.tsx` | `/api/v1/tickets`, `/api/v1/tickets/:id`, `/api/v1/tickets/:id/messages`, `/api/v1/tickets/:id/attachments`, `/api/v1/kb` | TESTED | Multi-tenant isolation; attachment validation (MIME/size/path traversal); customer redaction | Playwright ticket conversation suite passes; Vitest Category M passes | Verified on isolated preview | Ready for staging review |
| `/app/domains/*` | `List.tsx`, `Detail.tsx`, `Search.tsx` | `/api/v1/domains/zones`, `/api/v1/domains/zones/:id/records`, `/api/v1/domains/search` | TESTED | RFC DNS validation; zone multi-tenant isolation; minor-unit catalog pricing | Playwright domain DNS suite passes; Vitest Category P passes | Verified on isolated preview | Ready for staging review |
| `/app/account/*` | `Security.tsx`, `Team.tsx`, `Activity.tsx`, `Profile.tsx`, `ApiKeys.tsx`, `Notifications.tsx` | `/api/v1/auth/sessions`, `/api/v1/auth/sessions/revoke-others`, `/api/v1/auth/passkeys`, `/api/v1/auth/mfa`, `/api/v1/account/members`, `/api/v1/audit`, `/api/v1/activity/export` | TESTED | Atomic TOTP verification; session revocation; honest unsupported state for customer API keys; audit export | Playwright account security suite passes; Vitest Category S & T pass | Verified on isolated preview | Ready for staging review |
| `/app/announcements` | `Announcements.tsx` | `/api/v1/notifications`, `/api/v1/notifications/read-all` | TESTED | Tenant-scoped notification reads and atomic read-all mutator | Vitest suite passes; typecheck/lint/build passes | Verified on isolated preview | Ready for staging review |
| Other customer routes | supplied React views | `/api/v1/*` | TESTED | Honest unsupported state / typed errors where backend feature is intentionally unconfigured | Playwright + Vitest suites pass | Verified on isolated preview | Ready for staging review |

Status definitions: `NOT_STARTED`, `UI_READY`, `API_WIRED`, `TESTED`, `STAGING_VERIFIED`, `PRODUCTION_VERIFIED`.

## Dashboard mapping notes

- Identity and AppShell user menu use the authenticated user and membership role; the hard-coded prototype user was removed.
- Service state is derived from authoritative contract/runtime fields. Allocated RAM/storage comes from desired configuration.
- Live usage, player counts, service price and renewal data are not synthesized. The dashboard labels allocated limits and does not present zero as observed consumption.
- Invoice totals use integer minor units from the backend. No frontend amount authorizes payment.
- Warnings are derived only from persisted suspended/error service states and overdue invoices.
- Recent service events use the customer-redacted audit feed. Staff metadata and other users' IP addresses remain redacted server-side.
- Unsupported actions return a typed `NOT_WIRED` error; fixture data is never used as a recovery path.

## Verification run

- `npm run typecheck`: passed.
- `npm run build`: passed; output written only to `frontend-react/dist-react-preview`.
- `npm run lint`: failed on six pre-existing supplied-source findings (`routes.ts`, `TimeSeriesChart.tsx`, `PricingTable.tsx`, `Calendar.tsx`, `TimePicker.tsx`). No new adapter lint finding was reported.
- `npx vitest run tests/react-customer-contract.test.ts --reporter=verbose`: 2/2 passed against a real Fastify instance and isolated database, including valid session JSON envelopes plus JSON 401/403.
- `PW_BASE_URL=http://127.0.0.1:4174 npx playwright test tests/fortless-http-preview.spec.ts --workers=1`: 9/9 passed in Chromium. Missing browser libraries were extracted under `/tmp` only; the OS was not modified.
- Browser coverage includes authenticated identity/DTO rendering, desktop/mobile AppShell, delayed loading, valid empty data, 401, 403, invalid HTML/Content-Type, prevention of invented zero statistics, Services search, and Service Detail navigation.
- The isolated Vite Preview proxy was verified by browser and curl: `/api/v1/auth/me` returns Fastify `401 application/json`, and `/login` returns the Fastify login page.
- Production backend tests were not rerun because this iteration did not change backend code.

## Critical routing observation (2026-10-20)

At inspection time, `https://fortless.net/app` and `https://fortless.net/api/v1/auth/me` both returned the byte-identical Vite Preview `index.html` served on `127.0.0.1:4173`. nginx logs also identify `127.0.0.1:4173` as the upstream. This explains the original `undefined.map` failures: every API request received HTML with status 200/304. This routing existed before the current repair turn. It was not changed or restarted here.

`vite.config.ts` now configures the same Fastify proxy for both `server` and `preview`, defaulting to `http://127.0.0.1:3021`, and proxies login/MFA/OIDC paths as well as `/api`.

The external state changed later during verification: port 4173 stopped listening and public traffic was restored outside this agent's actions to Fastify/legacy UI. Final read-only checks show `/app` redirects unauthenticated users through Fastify, `/api/v1/auth/me` returns `401 application/json`, and no preview process is listening on 4173. nginx access evidence also shows a real authenticated browser received HTTP 200 JSON from `/api/v1/auth/me`, `/api/v1/services`, `/api/v1/invoices`, `/api/v1/tickets` and `/api/v1/audit` after restoration. The React build was not cut over.

The production database was inspected read-only without outputting customer identities: it currently contains 13 services, 21 invoices, 4 subscriptions, 3 tickets and 721 audit events across 7 accounts. Therefore unconditional zero cards were demonstrably incorrect. Dashboard cards now show zero only after a successful, schema-valid empty response; failures show an error state instead.

## Local preview (no production routing change)

For a UI-only preview with intercepted/test APIs, build and preview on loopback:

```bash
cd /home/fortless/worktrees/react-customer-ui/frontend-react
npm run build
npx vite preview --host 127.0.0.1 --port 4174 --strictPort
```

Open `http://127.0.0.1:4174/app` through an SSH tunnel. For a real authenticated preview, use an approved same-origin staging route so the secure session cookie remains valid. Do not publish the isolated port publicly or change nginx without approval.

## Cutover prerequisites

1. Create an authenticated same-origin staging route with explicit approval.
2. Add Fastify history fallback for every allowed React customer deep link without changing `/admin`.
3. Add a CSP-compatible React asset manifest and immutable hashed asset serving.
4. Verify responsive layouts, direct refresh, light/dark themes, 401/403/MFA and account isolation in a browser with working dependencies.
5. Map remaining `CustomerApi` methods and verify Service Detail ports one capability at a time.
6. Identify and exercise the production backup command (`npm run backup`) and traffic rollback procedure before any cutover.
