# Hardening report

Evidence source: Playwright (Chromium) run of the whole suite, 1441 tests, 1441 passed, 0 failed (render at 8 widths x light/dark, axe WCAG 2.1 AA at 320 and 1024 px x light/dark, 41 interaction tests). `tsc --noEmit`, `eslint src tests` and `vite build` clean. Tiers per component: `docs/COMPONENTS.md`, `docs/verification.json`.

## Defects reproduced and fixed

| Area | What was wrong (reproduced) | Fix |
|---|---|---|
| FileExplorer / DataTable on phones | The actions column was hidden or became a plain label/value row, so row actions were unreachable | `meta.actions` columns render next to the card title |
| DataTable | "Showing 1-0 of 0" on an empty filter result; row click was mouse-only (desktop and phone) | Pagination only with results; desktop rows focusable (Enter/Space); phone cards get an explicit "Open <row>" button |
| SecretField | Plaintext stayed in state after hiding | Dropped on hide, on tab hidden; copy and replace do not retain it |
| ServerConsole | A rejected command was swallowed | Alert under the input, command kept for retry, history only on success |
| PlayerManagerTable | No pending or failure contract | One action at a time, "Working…" state, success status, failure alert naming the player |
| FormWizard | No draft persistence | `persistKey` (sessionStorage: values, step, furthest step; cleared on submit/cancel) |
| DeployConfigurator | Custom mode only had env vars | Startup command, extra ports (validated 1024-65535), auto-restart; Quick submits defaults |
| BulkActionBar | At 320 px the Clear button fell outside the dark pill (contrast fail, found by axe) | Pill wraps; hidden bar is `visibility:hidden` |
| CommandButton (new) | Scrolling text inside a button failed axe `scrollable-region-focusable` | Text wraps |
| Tooling | No lint script | ESLint (typescript-eslint, react-hooks, jsx-a11y) with TS 6 API alias |

Checked and not defects: ResponsiveActionBar at 320 px, NumberField limits/keyboard, Combobox/MultiSelect, ButtonGroup/SegmentedControl semantics, Dialog focus trap and restore, AlertDialog over Dialog, chart resize and tooltip inside the viewport at 390 px, reduced-motion. Test-side flaws corrected (Base UI focus guard timing, strict-mode double match, masked input assertion).

## Added (no redundant components)

CommandButton, RevealButton, CheckboxCardGroup, ValidationSummary, ChartLegend (+ `TimeSeriesChart hidden`), FilterBuilder + `applyFilters`, DataTable `renderExpanded`/`rowLabel`, AuditTrail. ActionToolbar and ContextualActions already exist as `ResponsiveActionBar`/`Toolbar` and `BulkActionBar`; FieldGroup already existed. No new component was created for them.

## Not verified / deferred

- 31 components have render + axe evidence only (no interaction test): see the "Interaction" column. Highest-value next tests: app-shell (mobile sheet, rail flyouts), select, split-button, toggle-button-group, key-value, dropzone, code-editor, log-viewer, passkeys-sessions, api-keys, payment-methods, backups-schedules, domain-search, game-config.
- Chromium only. No real devices, touch hardware, Safari/Firefox, or screen reader testing. axe cannot judge reading order or announcement quality.
- Screenshots (docs/screenshots) cover 19 stories at 390 and 1440 px, light and dark, and were reviewed by eye for only a few of them.
- Still planned: Cart/Checkout, PricingTable, StartupVariablesEditor, NetworkAllocations, Announcements/KB, UsagePage (needs metrics backend), NotificationPreferences.
- DataTable is client-side only; no virtualization, column resize or sticky header.
- Workbench main chunk is over 700 kB.
