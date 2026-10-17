# Task 03: turn `/app` into a genuinely useful hosting dashboard

**Existing:** `loadServers()` in `public/assets/app-ui.js`, server metrics, empty `z-es`, service rows, `/api/v1/services`; preserve this implementation and its API contract.

**Canonical Petal:** Data display > Stat tiles / List items / Timeline; Charts > Area / Bar / Donut / Sparklines / Gauge / Ring group; Charts pro > Live mini chart / Combo; Workspace layout > Draggable widget dashboard (only if useful); Onboarding > Getting started checklist; Utilities > Skeleton/error/service status; Selection > Filter chips; Overlays > Tooltips.

Build summary cards from **real persisted data**: total services, running/stopped/installing, current allocated CPU/RAM/disk, upcoming invoices, open tickets and recent account events. Do not equate allocation with live utilization. Add view switch between list/cards only by composing Petal controls. Define a timeframe control (24h/7d/30d) and unit labels; if historical telemetry is unavailable show a beautiful Petal empty state with explanatory text, NOT a synthetic chart.

For true live metrics later, add a provider-neutral API with authorization and proper interval aggregation; power states are provider-observed rather than estimated. Avoid treating an unconfigured provider as healthy. Add refresh states, stable loading skeletons, last updated timestamp and robust fetch-failure recovery. If Petal draggable widgets are integrated, persist per-user layout, stable IDs and reset, with accessible non-drag alternatives and no broken mobile behavior.

Make service rows link to a future service detail route, invoices link to billing detail, ticket rows link to thread detail. Add a helpful first-server checklist using Petal onboarding component. Empty/onboarding states should be grounded in account data.

Acceptance: existing account still loads; no fake 72% CPU or random revenue; unauthorized users cannot read stats; charts have a11y text, low-data/no-data behavior; all filters and deep links work; visual regression on desktop/mobile/dark mode.
