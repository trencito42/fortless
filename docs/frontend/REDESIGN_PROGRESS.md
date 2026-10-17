# Client Redesign Progress

## M1 — Discovery and mapping (complete for first implementation slice)

- Audited modular frontend, shell, routes, APIs and generated bundle boundary.
- Inventoried canonical `out.html`, `panel.html`, `z4`, `z5`, `z6`, `z7`, `z8`, and `z8b` component sources.
- Created route and component maps.
- Implementation commit: `314839a`.

## M2 — Shell and navigation (in progress)

- Added Dashboard and separate Services destinations.
- Correct Petal notification bell remains connected to real notifications.
- Deep-link Fastify handling added for services and support pages.
- Added a Petal mobile More sheet so Domains, Billing, Audit and Security remain reachable without squeezing six tabs into 375px.
- Pending: desktop quick-create menu and notification focus/dismiss polish.

## M3 — Dashboard (implemented, visual review pending)

- `/app` combines real services, tickets, invoices and audit records.
- Partial API failures are disclosed; no loading zero or fabricated graph is shown.
- Empty service state leads to the real catalog and preserves commerce gating.

## M4 — Services (in progress)

- Inventory moved to `/app/services`; existing scoped detail route retained.
- Added real client-side name/identifier, product and observed-runtime filters with Petal controls.
- Removed the non-operational fake console and utilization-like allocation bars.
- Provider power actions are absent when the platform capability is unavailable; allocation labels explicitly distinguish limits from utilization.
- Pending: list/grid preference and deeper provider-specific detail surfaces after verified capability APIs exist.

## M5 — Support (implemented, visual review pending)

- Removed customer ticket modal dependency.
- Added list search/status filters and dedicated new/detail routes.
- Added original Petal rich editor/drop control adapters.
- Preserved tenant-scoped create/reply/attachment APIs and explicit partial-upload errors.
- Backend support lifecycle and attachments have automated coverage.

## M6 — Commerce, domains and account records (implemented, visual review pending)

- Replaced the stacked deploy form with Petal's original multi-step wizard and plan selectors.
- Replaced the hand-built order summary with Petal `z-sum`/`z-plsum` primitives.
- Removed browser-computed VAT and total claims; only the server-created signed quote is authoritative for final tax and total.
- Added Petal invoice search/status controls and Petal activity category filters.
- Converted domain zones and workspace members to Petal tables with native mobile record cards.
- Domain catalog actions now say “Create DNS zone” and explicitly do not claim registrar purchase.
- Fixed the support inbox regression caused by missing canonical `z6.css` extraction.

## M7–M8 (pending)

- Authenticated browser screenshot comparison across desktop, portrait and landscape remains pending.
- Accessibility pass, notification focus/dismiss polish and dead-code cleanup remain pending.

Latest automated evidence: `npm run build` passes; full suite status is recorded after the current route-test update in `VISUAL_QA.md`.
