# STAGE 12 — SERVER MANAGEMENT EXTENSIONS (admin-configurable)

Read `00_GLOBAL_CONTRACT.md` and root `AGENTS.md` first. Read the repo again; this file describes the state on 2026-10-19 and may be stale.

## Where things stand (verify, do not trust)

Already built, `MOCK_ONLY` unless noted. Writes have NOT been exercised on the real panel:
- Per-account Pterodactyl client keys (`src/modules/provisioning/console.ts`, panel patch in `panel-sso/`), shared access gate (`service-access.ts`), service sharing (`service-members.ts`).
- Files, backups, network, startup, settings, databases, schedules, activity: `files.ts`, `server-panel.ts`, `runtime-sync.ts`, UI in `src/frontend/client/pages/services/`.
- Game profiles as data (`game-profiles.ts`, table `game_profiles`, `data/game-profiles/minecraft-java.json`, `npm run profiles:import`) and game tools (`game-tools.ts`): server.properties form, Java recommendation, Modrinth plugin/mod install with SHA-512 check, icon.
- Admin API for profiles exists (`/api/v1/admin/game-profiles`), **there is no admin UI yet**.

## Hard rules for this stage

1. **Nothing game- or vendor-specific in code.** Egg names, config schemas, Java rules, install sources, hosts, RCON settings, subdomain bases, allowed egg alternatives, limits and feature switches live in the database and are edited from the admin panel. A new game must need zero deploys.
2. Every customer action: server-side authorization via `getServiceAccess`, a per-operation permission, input validation, audit event without secrets, typed errors, no fake success.
3. Unknown outcomes (timeouts) are reported as pending and re-checked, never as failures or blind retries.
4. Petal only. The binding visual reference is the read-only `fortless-redesign/Fortless Views.html`; `docs/design/views.html` is the normalized design-content copy. Do not alter either reference. Reuse `public/assets/petal-app.css` and `src/frontend/petal/` primitives (`card`, `li`, `pill`, `tbl`, `fld`/`inp`, `seg`/`tabs`, `sw`, `alert`, `mdl`/`bx`, empty/loading/error states, responsive shell). If a required pattern is absent, derive one reusable component in the same visual grammar instead of adding route-local styling or a new design system. No generic helper text.
5. Label every feature `[MOCK_ONLY]`, `[SANDBOX_VERIFIED]`, `[PRODUCTION_VERIFIED]` in `docs/fortless/TEST_MATRIX.md`. Include negative tests (other tenant, shared viewer, bad input, injection, hostile URLs).

## Slice 1 — Admin UI for game profiles and feature switches (do this first)

Add an admin page "Game profiles" (staff permission `catalog:manage`, step-up for delete) following `src/frontend/admin/pages/catalog/`:
- List, create, edit, enable/disable, delete, import/export JSON of a profile (use `validateProfile`, show its errors inline).
- Form editors, not raw JSON only, for: egg names (pick from `/api/v1/admin/providers/pterodactyl/inventory`), config file, config field schema (key, label, type bool/int/enum/string, group, min/max, options, default), game version variable, Java rules, install sources (provider, label, kind, directory, facets, loaders, download hosts), icon file.
- Per-profile **feature switches** stored in a new `features` JSON column (migration): `settingsForm`, `javaRecommendation`, `installer`, `icon`, `players`, `eggChanger`, `subdomains`, `commandHistory`. The service page shows a tool only if its switch is on and the viewer has the permission.
- A "Test against a server" button that resolves the profile for a chosen service and shows what the customer would see.
- Audit every change (`admin.game_profile_*`).
- Match the canonical operations/admin composition: `.ap` shell, `.hd` page hierarchy, `.card` sections, `.tbl.rsp` desktop-to-record-card behavior, `.mdl`/`.bx` dialogs or drawers, Petal pills/switches, visible focus, dark/light tokens and phone container behavior. Do not invent new radii, shadows, colors or control geometry.

## Slice 2 — Persistent command history

Store the last N commands per (account, service, user) in the database (N configurable per profile, default 50), never store output, redact nothing silently: tell the user history exists and offer "clear". Endpoint + UI in the console. Respect `control.console`.

## Slice 3 — More install sources and loaders (data only)

Extend `installSources` so Fabric, NeoForge, Quilt and Paper-family plugin sources are just profile data. Add providers behind an interface (`modrinth` now). Hangar and Spigot only if their terms allow it. CurseForge needs an API key: add it as an admin setting stored encrypted, disabled until set. Show required dependencies from the catalog and install them only after the user confirms. Keep hash verification and the host allowlist.

## Slice 4 — Modpack installer

Modrinth `.mrpack`: download once, verify hash, parse `modrinth.index.json`, download every file from allowed hosts with hash and size checks, apply `overrides/`, write through signed Wings uploads or a server-side archive step. Cap total size, file count and path depth. Reject path traversal and absolute paths. Make it resumable and report progress; a crash must not leave a half-installed pack unnoticed (record state, offer retry or rollback via a backup first).

## Slice 5 — Player manager (per game, admin-configured)

Profile-driven `players` capability: transport (`rcon` or `query`), port source (an allocation or startup variable), command templates for list/kick/ban/op/whitelist with argument validation (names `^[A-Za-z0-9_]{1,16}$` for Minecraft, configurable). RCON password is read from the game's own config through the files API each time, never stored in Fortless. The connection must go to the node address from the panel allocation, not a customer-supplied address. Timeouts and failures are typed. Everything audited.

## Slice 6 — Subdomains

Use the existing Domains/DNS module. Admin settings: base domain(s), allowed record types (A/SRV), SRV service/protocol per profile, TTL, per-plan limits, reserved and blocked labels. Customer picks a label; the platform creates the records pointing at the allocation alias and port, validates label syntax, uniqueness and ownership, and removes the records when the server is terminated or the label is released. Include collision handling and an audit trail.

## Slice 7 — Egg changer

Only to alternatives an admin lists per profile (`allowedEggChanges`: from egg name to egg names). Show exactly what will happen (reinstall, which files stay, which variables reset), require a fresh backup option, require typing the server name, use the Application API with idempotency and the unknown-outcome rule, and record the previous egg and variables so the change can be reversed. Admin switch `eggChanger` off by default.

## Explicitly out of scope until the owner provides infrastructure and decisions

Auto FastDL (web server on nodes), Reverse proxy manager (proxy on nodes), Server importer (remote SFTP/FTP source, credentials handling, transfer limits). Write a short design note for each in `docs/DECISIONS.md` and ask the owner the open questions instead of building a placeholder.

## Verification before calling anything done

- Run the full test suite and `npx tsc --noEmit` (known pre-existing errors in `src/server.ts` near the admin power and `getServerDetails` code may remain; do not hide them).
- Exercise each write path once against the real panel on a disposable server, record the result as `SANDBOX_VERIFIED` with evidence, or leave the item `MOCK_ONLY`.
- Test in a browser: tab URLs, dialogs, dropdowns, scrollbars, dark and light themes, phone width.
- Report honestly what was not verified.
