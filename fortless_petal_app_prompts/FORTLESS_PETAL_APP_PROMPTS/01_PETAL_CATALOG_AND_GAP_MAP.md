# Task 01: complete Petal component adoption audit

Read `00_MANDATORY_RULES.md` first. DO NOT start by modifying HTML.

Enumerate **all 29 Petal gallery categories and their 245 named examples**, from the actual `blueprint/fortless-blueprint/design/out.html`, cross-check `panel.html` and `parts/*`. Treat the gallery as the *authoritative implementation inventory* rather than recreating widgets from screenshots.

For every component capture the source function (for example `dd()`, `tabs()`, `rte()`, `spark()` or `data-zw` renderer), CSS classes, initialization/events, data shape, required accessibility behavior, and whether a comparable component already exists in Fortless.

Build `docs/PETAL_UI_COMPONENT_MAP.md` and `docs/PETAL_FEATURE_OPPORTUNITIES.md`: each of `/app`, `/app/deploy`, `/app/billing`, `/app/support`, `/app/activity`, `/app/settings`, `/admin` and `/admin/*` gets a component adoption checklist. Identify which gallery components are meaningful for hosting operations (command palette, stats, dashboards, charts, searchable selects, wizard, uploader, ticket editor, invoice widget, status, log timeline) and which are irrelevant (media player, video calling). Do not add irrelevant features just to use components.

Catalog controls currently hard-coded, invisible behind fake data, actions that only call `toast()`, duplicate versions of built-in Petal primitives, and routes without deep-link support. Inspect actual runtime event handling; do not rely only on CSS class presence.

Output an evidence-linked prioritized backlog with exact source files and whether each UI feature requires a new API, database migration, permissions or vendor integration. Fix only clearly isolated, low-risk regressions in this audit slice. Record tested commands and resulting git commit.
