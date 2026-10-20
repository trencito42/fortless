# Views layer

`src/views/` composes the stable kit into real pages. Components in `src/design-system` and `src/features` take data and callbacks only; views own data access through typed **ports**.

## Service Detail (`src/views/service-detail/`)

| File | Role |
|---|---|
| `contracts.ts` | Wire DTOs copied from the Fortless backend (c6bab7e). |
| `ports.ts` | `ServiceDetailPorts` (platform, service, console, files, players, game, backups, network, databases, schedules, startup, settings, members) and `ServiceApiError`. |
| `adapters/fortlessHttp.ts` | Production adapter: same-origin `/api/v1`, CSRF + one retry, step-up hook, typed errors, `confirm:true`, Wings WebSocket with token refresh. No panel credentials. |
| `adapters/demo.ts` | **Demonstration only.** In-memory, stateful, can simulate latency, failures, roles, unsupported providers. Used by the Workbench and tests. |
| `access.ts` | The five-level gate (`gateFor`, `tabsFor`): hidden (provider/permission) vs blocked-with-reason (runtime/lifecycle). |
| `api-map.ts` | Typed route registry; generates `docs/SERVICE_DETAIL_API_MAP.md` (`npx tsx scripts/api-map.ts`). |
| `mappers.ts`, `live.ts`, `tabs/*` | DTO to kit props, the single console socket, one component per tab. |

Production wiring (not done, by instruction): `<ServiceDetailView serviceId ports={createFortlessHttpPorts({ baseUrl: '/api/v1', ... })} />`.

## Verification

- `tests/service-api.spec.ts`: every API_MAP route through the real adapter, plus errors and the Wings flow (no browser).
- `tests/service-detail.spec.ts`: view behaviour in Chromium plus axe and overflow at 320 and 1024 across 9 scenarios.
- Screenshots: `docs/screenshots/service-detail/` (`npx tsx scripts/view-screenshots.ts`, needs preview on :4173).
- Not verified: any live panel; real Wings sockets; production auth flows.
