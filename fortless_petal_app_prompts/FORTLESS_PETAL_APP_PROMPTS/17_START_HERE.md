# START HERE — Fortless Petal application completion pack

This package is **not a replacement** for the existing Fortless commercial/infrastructure playbook. It adds a separate **product-interface and working-controls track** focused on using the owner's 29-category, 245-example Petal custom component library to its potential.

**Verified at time of writing**: GitHub repo `trencito42/fortless`, initial phase-4 commit `7ee5c027…` (2026-10-17). Backend routes and UI may evolve; always inspect current HEAD before work.

### Order
1. Copy this folder into the existing Fortless repository. Do not overwrite `AGENTS.md` or the existing engineering playbook.
2. Send the content of `18_MASTER_RUNNER.md` as the one-time kickoff.
3. Let Codex implement `01` audit/map, then `02` global shell and Ctrl+K. After verifying every slice, proceed to `03` dashboard, `07` tickets, `09` settings, and other modules based on current backend readiness. Do not enable paid/provider stages before the separate safety gates.
4. For a specific feature, give Codex **the corresponding numbered file**, plus `00_MANDATORY_RULES.md`. Never tell it to rewrite the entire platform.
5. Require commit+push SHA, changed files, Petal source map, test evidence, and what's still blocked.

### Real source examples checked
- Petal command palette `#cmd`, `.cmd`, `cmdRender()`, `cmdRun()`, `cmdMove()`, keyboard trigger in `design/out.html`.
- Petal `.steps`, `data-zw="wizard"`, dropdowns/searchable selects, `.rte` editor, `.drop` uploader.
- Petal `data-zw="invoices"`, `data-zw="twofa"`, `data-zw="sessions"`, `data-zw="audit"`, `data-zw="apikeys"`.
- Petal `data-zw="chat"`, `data-zw="comments"`, `data-zw="widgets"`, `data-zw="sidebar"`.
- Existing Fortless `public/assets/app-ui.js`: real session/navigation, deploy/quote/capabilities, tickets, invoices, activity, settings, MFA wizard.
- Existing Fortless `public/assets/admin-ui.js`: overview/accounts/services/tickets/audit/staff views and new staff/account/ticket modals.

**Important difference:** Petal's gallery sample widgets may contain demo arrays and event handlers. Extract the genuine UI implementation and bind it to real Fortless entities and APIs. Do not ship demo state or demo commands into production.
