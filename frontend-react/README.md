# Fortless UI (Petal)

React 19 + TypeScript (strict) + Tailwind CSS v4 + Base UI. Flat design system: no borders, shadows or gradients; colour-block surfaces; light/dark; phone-first.

## Run

```bash
npm install
npm run dev          # workbench at http://localhost:5173
npm run typecheck
npm run lint         # ESLint: typescript-eslint, react-hooks, jsx-a11y
npm run build
npm test             # Playwright + axe over every story (builds and previews first)
npm run registry     # regenerates docs/COMPONENTS.md and docs/verification.json (evidence tiers)
npx tsx scripts/screenshots.ts   # docs/screenshots (needs preview on :4173)
```

## Fortless integration preview

The customer application uses `src/app/data/fortlessHttp.ts`; it does not fall back to fixture data. The component Workbench is development-only. Production output is isolated in `dist-react-preview/`, never the legacy `public/` directory. See `../docs/REACT_CUSTOMER_MIGRATION.md` for verified status and safe preview instructions.

Tooling note: `typescript` is aliased to `@typescript/typescript6` (typescript-eslint cannot use TS 7 yet) and `tsc` comes from `@typescript/native` (TS 7). Install with `npm install --legacy-peer-deps`.

Playwright needs a Chromium: `npx playwright install chromium`, or set `PW_CHROMIUM` to an existing binary.

## Layout

| Path | What |
|---|---|
| `src/styles/index.css` | All tokens (`@theme inline` over CSS variables), light/dark, density |
| `src/design-system/` | Layer A (primitives) and B (compositions): actions, forms, overlays, navigation, data, charts, technical, wizard |
| `src/features/` | Layer C: Fortless-specific components (servers, billing, DNS, security, domains) and `status.ts` |
| `src/workbench/` | The interactive catalogue. Each story renders in an iframe at the chosen width |
| `docs/` | `COMPONENTS.md` (generated), `verification.json` (generated), `MIGRATION.md` |

## Rules the components follow

- No fake operational data. Missing values render as a dash with a reason, never as zero. Stories use sample data and say so.
- Components never fetch. They take data and callbacks; the app owns the API.
- Async handlers may return a promise; failures are shown, never swallowed.
- Colour is never the only signal (status badges always have text).
- Verification has tiers, earned only by passing tests (`docs/verification.json`): render, a11y (axe), interaction (keyboard/pointer, `tests/interaction.spec.ts`), browser (interaction + screenshots). A status label never implies verification.

## Choosing a component

- 2 to 5 options: `SegmentedControl` or `RadioCardGroup`. Up to about 15: `Select`. More, or searchable: `ComboField`.
- Small confirmation: `AlertDialog`. Form or detail: `Dialog` (bottom sheet on phones) or `DetailPanel`.
- Lists: `DataTable` (cards on phones). Hierarchy: `TreeView`. Facts: `DescriptionList`. History: `Timeline`.
- Heavy widgets (`ServerConsole`, `CodeEditor`, `DiffViewer`) load lazily.

## Advanced pieces and how they compose

| Need | Use | Notes |
|---|---|---|
| Toolbar that collapses at narrow widths | `ResponsiveActionBar` (+ `Toolbar`) | This is the ActionToolbar. Order = priority; overflow goes to "More actions" |
| Actions on selected rows | `BulkActionBar` / `FloatingActionBar` | This is the ContextualActions pattern; `DataTable` wires it through `bulkActions` |
| Copy a command / reveal a value | `CommandButton`, `RevealButton`, `CopyButton` | Credentials: `SecretField` (never keeps plaintext when hidden) |
| Multi-select cards / single-select cards | `CheckboxCardGroup` / `RadioCardGroup` | Radio and checkbox semantics, not div buttons |
| Group of fields, conditional fields | `FieldGroup` + normal conditional rendering | See `DeployConfigurator` (Custom mode) |
| Everything blocking a form | `ValidationSummary` | Links focus the invalid field; takes focus when it appears |
| Filter rows | `FilterBuilder` + `applyFilters` | AND rules; send `rules` to an API for server-side filtering |
| Expandable rows | `DataTable renderExpanded` + `rowLabel` | Disclosure buttons with aria-expanded; inside the card on phones |
| Series toggles | `ChartLegend` + `TimeSeriesChart hidden` | Last visible series cannot be hidden |
| Multi-step flow | `FormWizard` (`persistKey` keeps a draft in sessionStorage) | Do not persist secrets |
| Audit log | `features/AuditTrail` | FilterBuilder + DataTable with details |
