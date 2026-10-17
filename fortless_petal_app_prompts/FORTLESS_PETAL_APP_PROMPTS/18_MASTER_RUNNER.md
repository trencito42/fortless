# ONE-TIME MASTER RUNNER FOR CODEX

You are continuing the *existing* Fortless platform in https://github.com/trencito42/fortless. The owner personally created the Petal design system and insists on using its original custom components exclusively. You must **upgrade in place, not rewrite or redesign**.

First read `AGENTS.md`, `FORTLESS_PETAL_APP_PROMPTS/00_MANDATORY_RULES.md`, `FORTLESS_PETAL_APP_PROMPTS/17_START_HERE.md`, all feature files in this package, the existing commercial mega-playbook, `docs/REALITY_MATRIX.md`, `docs/PHASE_BACKLOG.md` and `docs/PETAL_COMPONENT_INVENTORY.md`. Inspect current HEAD. The Petal source of truth is `blueprint/fortless-blueprint/design/out.html`, `panel.html`, `parts/*` or `/htdocs/fortless.net/blueprint/fortless-blueprint/design/` on the connected server.

Petal already provides **29 component categories / 245 explicitly named gallery examples**, including a canonical command palette, professional charts, searchable/multi-select dropdowns, multi-step wizard, rich text editor, advanced tables, file uploads, communication inbox, 2FA, invoices, sessions, API keys, activity, drag-drop widgets and responsive shells. Do not implement visually approximate copies or introduce external UI systems. Use and adapt actual canonical code.

Before changes: map each existing customer/admin route and its controls to its canonical Petal source, API and working verification status. Create `docs/PETAL_UI_COMPONENT_MAP.md` with source citations and a gap matrix. Retain existing working login/register/TOTP/auth, client and admin shells, all backend modules/routes, migration history, test suite and landing. Preserve the beautiful existing Petal Authenticator 3-step UI; do not reset it.

Proceed in verifiable product slices, starting with Task 01. The first implementation target afterward is **Task 02: global shell, real `Ctrl+K` / `⌘K` command palette and safe search**, then dashboard and tickets as dependencies allow. Use the numbered task files as acceptance contracts. A completed screen must be wired to authorized real backend state and persistence. Do not enable Stripe live or Pterodactyl production; represent blocked services truthfully. Never fabricate data or success states.

For each slice: implement the code, tests and relevant DB migrations; verify keyboard, responsive, dark mode, authorization, loading/empty/error states; run build/tests; update `docs/PETAL_UI_COMPONENT_MAP.md` and `docs/REALITY_MATRIX.md`; commit and push; report changed files, Petal components reused with exact source, tests (pass/fail), reality tier, remaining limitations and commit SHA. Do not mark a phase complete based only on a polished screenshot.

Start now by inspecting the repository, producing the component-to-feature audit, and implementing the first smallest safe end-to-end slice. Keep future stage prompts ready but do not dump unfinished scaffolding across every screen at once.
