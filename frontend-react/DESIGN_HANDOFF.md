# DESIGN_HANDOFF — Fortless UI customer frontend

Frontend prototype only. A backend agent will wire real data. Nothing here holds privileged secrets; checkout, payments and deploy are **simulated**.

## Layers
- A `src/design-system/primitives|forms|data|technical` — Base UI + Tailwind v4, tokens from the Petal system.
- B compositions (`src/design-system/*`) — take data and callbacks, no fetching.
- C `src/features/*` — Fortless features (NotificationPreferences, Commerce, Content, UsageOverview, …).
- Views `src/views/service-detail` — own ports (`ports.ts`, 73 typed methods), `adapters/demo.ts` and `adapters/fortlessHttp.ts`.
- App `src/app/*` — router, shell, pages, `fixtures/`. Entry `main.tsx` mounts the customer app for `/app|/auth|/system`, the Workbench otherwise.

## Wiring the backend
1. Customer pages read through the `CustomerApi` interface (`src/app/api`); swap the fixture adapter in `DataProvider` for an HTTP adapter. `useApiQuery` refetches when the store version changes.
2. Service Detail: replace `createDemoPorts` in `pages/ServiceDetailPage.tsx` with `createFortlessHttpPorts({ baseUrl, … })`. Endpoint map: `docs/SERVICE_DETAIL_API_MAP.md` (regenerate with `npx tsx scripts/api-map.ts`).
3. Console history: the wire field is `commandRedacted` (raw commands never reach the browser). `ConsoleTab` loads `ports.console.history` and seeds the ArrowUp recall list via `ServerConsole.initialHistory`, skipping masked entries (`historyToRecall`).
4. The wire contract has no service name; the header shows `planName`. Ask the backend to add one.
5. Auth is fixture-only (`wrong@example.com` fails, `mfa*` → MFA, code `123456`). Replace with real sessions; secrets (API keys, card data) must stay server-side. Deploy secrets are held in a separate store key excluded from persistence.

## Simulated / planned (do not present as live)
Deploy provisioning and checkout (declined card `•••• 0087`), billing payments, domain registrar, Usage metrics (planned), passkey/QR in Security, notification channels.

## Tooling
`npm run build` (tsc strict + vite) — always run before Playwright (preview server reuses `dist`). `npx tsx scripts/list-stories.ts` updates `tests/story-ids.json`; `npx tsx scripts/registry-report.ts` produces the registry evidence tiers (render / a11y / interaction / browser).

## Honest status
See `VIEW_COVERAGE.md` for per-route evidence and gaps and `docs/CHECKPOINT.md` for history. `COMPONENT_REGISTRY.md` must be regenerated from `registry-report.ts` after the full Playwright run (not yet done at the time of writing).
