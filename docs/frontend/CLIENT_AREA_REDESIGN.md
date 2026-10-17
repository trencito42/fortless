# Client Area Redesign

## Objective

Turn the authenticated client area into a production customer control plane whose interaction and visual language comes from the original Petal source in `blueprint/fortless-blueprint/design/`. No alternate UI framework is introduced and gallery demo data is never shipped as product data.

## Audited implementation

- Fastify serves authenticated deep links and account-scoped APIs.
- `src/frontend/client/` contains the modular TypeScript shell and pages.
- `src/frontend/petal/` contains lifecycle/data adapters for original Petal components.
- esbuild produces `public/assets/app-ui.js`; generated bundles are not hand-edited.
- `public/app.html` is the authenticated shell and stable route mount surface.
- `public/assets/petal-app.css` contains Petal primitives; `app-ui.css` only composes product pages.

## Redesign decisions

1. `/app` is the customer command center, using only real services, invoices, tickets and audit records.
2. The former service landing page moves to `/app/services`.
3. Ticket creation and conversations are pages, not modal overlays.
4. Petal's canonical rich editor markup and behavior is adapted to emit sanitized Markdown rather than browser HTML.
5. File upload uses the canonical Petal drop control and the existing authenticated, tenant-scoped attachment API. Message creation and file upload remain separate operations; the UI reports partial upload failure explicitly.
6. Unsupported provider, registrar and payment operations remain visibly unavailable.

## Implementation sequence

- M1: audit, route inventory and Petal mapping.
- M2: shell and navigation.
- M3: real-data dashboard.
- M4: services inventory/detail.
- M5: support list/new/detail and editor/uploader.
- M6: deploy, domains, billing, activity and settings refinement.
- M7: responsive, theme, keyboard and accessibility QA.
- M8: regression, screenshot review and removal of obsolete code.

Milestones are tracked in `REDESIGN_PROGRESS.md`. A milestone is not complete until both functional and rendered-interface checks pass.
