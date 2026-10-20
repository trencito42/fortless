# Checkpoint (updated as phases complete)

Mission: complete the customer frontend (`/app`, `/auth`, `/system`). Scope excludes any `/admin` or staff view.

## Phase A: shared defects
- [x] Grouped controls: three distinct geometries (`group-shape.ts`), geometry test `tests/group-geometry.spec.ts`; SplitButton chevron width (`.w-ctl-*` utilities were missing).
- [x] HTTP base URL contract (`normalizeBaseUrl`) + tests.
- [x] Settings gate uses `startup.read` (backend gate for GET /settings); rename/reinstall gated per action.
- [x] Per-action power authorisation (`ServerPowerToolbar.allowed`), tested.
- [x] Upload retry is real (file + folder kept, fresh signed URL).
- [ ] FastDL, server icon, diagnostics UI; `commandRedacted` history seeding.
- [ ] Foundational components still partial (see registry).

## Phases B-G: not started

## Checkpoint — registry pass (2026-10-20)
- Added: `SegmentedBar` (rounded segments with gaps, used on the Dashboard), `Calendar`, `DatePicker`, `DateRangePicker` (presets), controlled `AlertDialog` and `Popover`, keyboard cursor for `TimeSeriesChart`, `TreeView` type-ahead/setsize/posinset, `DataTable` `maxHeight` sticky header, `ServerConsole` `initialHistory` (fed from `commandRedacted`).
- Confirmations added for API-key revoke, card removal, member removal and DNS delete; API keys take an expiry; TeamMembers has an invite dialog (`onInviteMember`); DNS records support MX/SRV priority.
- Fixed: FastDL POST adapters now send `{}` (api-map contract); Tabs use automatic activation.
- Evidence: full Playwright run 1760/1760 passed (before the last four keyboard tests); interaction subset 196/196 passed afterwards. Stories: 71, implemented 42, partial 29 (see COMPONENT_REGISTRY.md). 28 stories still have no interaction test.
- Not done: real-device/touch testing, swipe-to-dismiss on sheets, live backend wiring.
