# Service Detail: typed API mapping

Generated from `src/views/service-detail/api-map.ts` (do not edit by hand). Backend reference: trencito42/fortless @ c6bab7e, `src/server.ts` (line numbers below).

## The five levels

| Level | Question | Where it comes from in the view |
|---|---|---|
| 1 | Endpoint implemented in source | this table (`API_MAP`, `line`) |
| 2 | Reachable in the current runtime | `platform.provisioning.enabled`; typed 503s (`PROVIDER_NOT_CONFIGURED`, `KEYMINT_NOT_CONFIGURED`) |
| 3 | Provider capability available | `ServiceDetailDto.providerCapabilities` (Capability column) |
| 4 | User authorised | `access.permissions` (Permission column) plus lifecycle (contract ACTIVE, runtime settled) |
| 5 | Verified end to end | `platform.provisioning.verification` tier; the Tests column lists repository tests. **Nothing here was run live against a panel by this project.** |

"Unavailable" is only rendered with a reason produced by one of levels 2-4.

## Routes used by the view (73)

Every row is executed against the real HTTP adapter by `tests/service-api.spec.ts` (method, URL, body, CSRF header, `confirm`).

| Port | Method | Path | server.ts line | Capability | Permission | Notes | Backend tests |
|---|---|---|---|---|---|---|---|
| `platform.capabilities` | GET | `/api/v1/platform/capabilities` | 747 | - | public | - |  |
| `service.get` | GET | `/api/v1/services/:id` | 1794 | - | any access (404 otherwise) | - |  |
| `service.power` | POST | `/api/v1/services/:id/power` | 1835 | power | control.start | control.stop | control.restart | - |  |
| `service.usage` | GET | `/api/v1/services/:id/usage` | 1804 | power | any access | - |  |
| `service.activity` | GET | `/api/v1/services/:id/activity` | 1931 | - | activity.read | - |  |
| `console.connect` | GET | `/api/v1/services/:id/console` | 1864 | console | websocket.connect | - | `tests/console.test.ts` (+sandbox) |
| `console.history` | GET | `/api/v1/services/:id/console/history` | 2053 | console | websocket.connect | - | `tests/player-manager.test.ts` |
| `console.recordCommand` | POST | `/api/v1/services/:id/console/history` | 2057 | console | control.console | - | `tests/player-manager.test.ts` |
| `files.list` | GET | `/api/v1/services/:id/files` | 1916 | files | file.read | - | `tests/files.test.ts` (+sandbox) |
| `files.read` | GET | `/api/v1/services/:id/files/content` | 1917 | files | file.read-content | - | `tests/files.test.ts` |
| `files.write` | PUT | `/api/v1/services/:id/files/content` | 1918 | files | file.update | pending on timeout | `tests/files.test.ts` |
| `files.createFolder` | POST | `/api/v1/services/:id/files/folder` | 1919 | files | file.create | pending on timeout | `tests/files.test.ts` |
| `files.remove` | POST | `/api/v1/services/:id/files/delete` | 1920 | files | file.delete | pending on timeout | `tests/files.test.ts` |
| `files.rename` | POST | `/api/v1/services/:id/files/rename` | 1921 | files | file.update | pending on timeout | `tests/files.test.ts` |
| `files.archive` | POST | `/api/v1/services/:id/files/archive` | 1922 | files | file.archive | pending on timeout | `tests/files.test.ts` |
| `files.unarchive` | POST | `/api/v1/services/:id/files/unarchive` | 1923 | files | file.archive | pending on timeout | `tests/files.test.ts` |
| `files.move` | POST | `/api/v1/services/:id/files/move` | 1924 | files | file.update | pending on timeout | `tests/files.test.ts` |
| `files.chmod` | POST | `/api/v1/services/:id/files/chmod` | 1925 | files | file.update | pending on timeout | `tests/files.test.ts` |
| `files.pull` | POST | `/api/v1/services/:id/files/pull` | 1926 | files | file.create | pending on timeout | `tests/files.test.ts` |
| `files.copy` | POST | `/api/v1/services/:id/files/copy` | 1927 | files | file.create | pending on timeout | `tests/files.test.ts` |
| `files.upload` | GET | `/api/v1/services/:id/files/upload-url` | 1928 | files | file.create | - | `tests/files.test.ts` |
| `files.downloadUrl` | GET | `/api/v1/services/:id/files/download-url` | 1929 | files | file.read-content | - | `tests/files.test.ts` |
| `players.status` | GET | `/api/v1/services/:id/players` | 2020 | game | player.read | - | `tests/player-manager.test.ts` |
| `players.kick` | POST | `/api/v1/services/:id/players/kick` | 2021 | game | player.moderate | - | `tests/player-manager.test.ts` |
| `players.ban` | POST | `/api/v1/services/:id/players/ban` | 2028 | game | player.moderate | - | `tests/player-manager.test.ts` |
| `players.unban` | POST | `/api/v1/services/:id/players/unban` | 2036 | game | player.moderate | - | `tests/player-manager.test.ts` |
| `players.history` | GET | `/api/v1/services/:id/players/history` | 2048 | game | player.read | - | `tests/player-manager.test.ts` |
| `players.administration` | GET | `/api/v1/services/:id/game-administration` | 2042 | game | player.read | - | `tests/player-manager.test.ts` |
| `players.detect` | POST | `/api/v1/services/:id/game-administration/detect` | 2043 | game | player.read | - | `tests/player-manager.test.ts` |
| `players.saveAdministration` | PUT | `/api/v1/services/:id/game-administration` | 2044 | game | startup.update | - | `tests/player-manager.test.ts` |
| `players.resetAdministration` | DELETE | `/api/v1/services/:id/game-administration` | 2045 | game | startup.update | - | `tests/player-manager.test.ts` |
| `players.testAdministration` | POST | `/api/v1/services/:id/game-administration/test` | 2046 | game | player.moderate | - | `tests/player-manager.test.ts` |
| `players.autoConfigure` | POST | `/api/v1/services/:id/game-administration/auto-configure` | 2047 | game | startup.update | - | `tests/player-manager.test.ts` |
| `game.info` | GET | `/api/v1/services/:id/game` | 1991 | game | file.read | - | `tests/game.test.ts` |
| `game.saveConfig` | PUT | `/api/v1/services/:id/game/config` | 1992 | game | file.update | - | `tests/game.test.ts` |
| `game.acceptEula` | POST | `/api/v1/services/:id/game/eula/accept` | 1993 | game | control.restart | - | `tests/game.test.ts` |
| `game.searchMods` | GET | `/api/v1/services/:id/game/mods/search` | 1994 | game | file.read | - | `tests/game.test.ts` |
| `game.installMod` | POST | `/api/v1/services/:id/game/mods/install` | 1995 | game | file.create | - | `tests/game.test.ts` |
| `game.installed` | GET | `/api/v1/services/:id/game/mods/installed` | 1996 | game | file.read | - | `tests/game.test.ts` |
| `backups.list` | GET | `/api/v1/services/:id/backups` | 2123 | backups | backup.read | - | `tests/server-panel.test.ts` |
| `backups.create` | POST | `/api/v1/services/:id/backups` | 2124 | backups | backup.create | pending on timeout | `tests/server-panel.test.ts` |
| `backups.remove` | DELETE | `/api/v1/services/:id/backups/:uuid` | 2125 | backups | backup.delete | confirm:true, pending on timeout | `tests/server-panel.test.ts` |
| `backups.lock` | POST | `/api/v1/services/:id/backups/:uuid/lock` | 2126 | backups | backup.delete | pending on timeout | `tests/server-panel.test.ts` |
| `backups.restore` | POST | `/api/v1/services/:id/backups/:uuid/restore` | 2127 | backups | backup.restore | confirm:true, pending on timeout | `tests/server-panel.test.ts` |
| `backups.downloadUrl` | GET | `/api/v1/services/:id/backups/:uuid/download-url` | 2128 | backups | backup.download | - | `tests/server-panel.test.ts` |
| `network.list` | GET | `/api/v1/services/:id/network` | 2129 | network | allocation.read | - | `tests/server-panel.test.ts` |
| `network.assign` | POST | `/api/v1/services/:id/network` | 2130 | network | allocation.create | pending on timeout | `tests/server-panel.test.ts` |
| `network.setNotes` | PATCH | `/api/v1/services/:id/network/:aid` | 2131 | network | allocation.update | pending on timeout | `tests/server-panel.test.ts` |
| `network.setPrimary` | POST | `/api/v1/services/:id/network/:aid/primary` | 2132 | network | allocation.update | pending on timeout | `tests/server-panel.test.ts` |
| `network.remove` | DELETE | `/api/v1/services/:id/network/:aid` | 2133 | network | allocation.delete | pending on timeout | `tests/server-panel.test.ts` |
| `databases.list` | GET | `/api/v1/services/:id/databases` | 2134 | databases | database.read (+ database.view_password for passwords) | - | `tests/server-panel.test.ts` |
| `databases.create` | POST | `/api/v1/services/:id/databases` | 2135 | databases | database.create | pending on timeout | `tests/server-panel.test.ts` |
| `databases.rotate` | POST | `/api/v1/services/:id/databases/:did/rotate` | 2136 | databases | database.update | - | `tests/server-panel.test.ts` |
| `databases.remove` | DELETE | `/api/v1/services/:id/databases/:did` | 2137 | databases | database.delete | confirm:true, pending on timeout | `tests/server-panel.test.ts` |
| `schedules.list` | GET | `/api/v1/services/:id/schedules` | 2138 | schedules | schedule.read | - | `tests/server-panel.test.ts` |
| `schedules.save` | POST | `/api/v1/services/:id/schedules[/:sid]` | 2139 | schedules | schedule.create | schedule.update | pending on timeout | `tests/server-panel.test.ts` |
| `schedules.remove` | DELETE | `/api/v1/services/:id/schedules/:sid` | 2141 | schedules | schedule.delete | pending on timeout | `tests/server-panel.test.ts` |
| `schedules.execute` | POST | `/api/v1/services/:id/schedules/:sid/execute` | 2142 | schedules | schedule.update | pending on timeout | `tests/server-panel.test.ts` |
| `schedules.addTask` | POST | `/api/v1/services/:id/schedules/:sid/tasks` | 2143 | schedules | schedule.update | pending on timeout | `tests/server-panel.test.ts` |
| `schedules.updateTask` | POST | `/api/v1/services/:id/schedules/:sid/tasks/:tid` | 2144 | schedules | schedule.update | pending on timeout | `tests/server-panel.test.ts` |
| `schedules.removeTask` | DELETE | `/api/v1/services/:id/schedules/:sid/tasks/:tid` | 2146 | schedules | schedule.update | pending on timeout | `tests/server-panel.test.ts` |
| `startup.get` | GET | `/api/v1/services/:id/startup` | 2147 | startup | startup.read | - | `tests/server-panel.test.ts` |
| `startup.setVariable` | PUT | `/api/v1/services/:id/startup/variable` | 2148 | startup | startup.update | pending on timeout | `tests/server-panel.test.ts` |
| `startup.setImage` | PUT | `/api/v1/services/:id/startup/image` | 2149 | startup | startup.docker-image | pending on timeout | `tests/server-panel.test.ts` |
| `settings.get` | GET | `/api/v1/services/:id/settings` | 2150 | settings | startup.read | - | `tests/server-panel.test.ts` |
| `settings.rename` | POST | `/api/v1/services/:id/settings/rename` | 2151 | settings | settings.rename | pending on timeout | `tests/server-panel.test.ts` |
| `settings.reinstall` | POST | `/api/v1/services/:id/settings/reinstall` | 2152 | settings | settings.reinstall | confirm:true | `tests/server-panel.test.ts` |
| `settings.panelActivity` | GET | `/api/v1/services/:id/panel-activity` | 2145 | settings | activity.read | - | `tests/server-panel.test.ts` |
| `members.list` | GET | `/api/v1/services/:id/members` | 1961 | users | account-owner | - | `tests/sharing.test.ts` |
| `members.invite` | POST | `/api/v1/services/:id/members/invite` | 1962 | users | account-owner | - | `tests/sharing.test.ts` |
| `members.revoke` | DELETE | `/api/v1/services/:id/invitations/:iid` | 1963 | users | account-owner | - | `tests/sharing.test.ts` |
| `members.remove` | DELETE | `/api/v1/services/:id/members/:mid` | 1964 | users | account-owner | - | `tests/sharing.test.ts` |
| `members.setPreset` | PATCH | `/api/v1/services/:id/members/:mid` | 1965 | users | account-owner | - | `tests/sharing.test.ts` |

### Route notes

- `platform.capabilities`: Level 2 and the platform half of level 5: provisioning.enabled and provisioning.verification.
- `service.get`: Returns access.permissions, providerCapabilities, observedState, desiredConfig and the last 20 audit events.
- `service.power`: 503 PROVIDER_NOT_CONFIGURED when infrastructure is off. KILL needs control.stop.
- `service.usage`: Polled fallback when the console socket is not feeding stats. Answers { available:false } instead of failing.
- `service.activity`: Allowlisted customer-facing actions only, 15 per page.
- `console.connect`: Returns { token, socket }: a short-lived Wings token scoped to this server. The browser then opens the socket itself. Typed errors: CONSOLE_UNSUPPORTED 501, KEYMINT_NOT_CONFIGURED 503, SERVICE_NOT_ACTIVE 403, SERVICE_PROVISIONING 409.
- `console.history`: Records expose commandRedacted, not command (the shipped client reads the wrong field).
- `files.read`: Refuses files over 1 MB (413 FILE_TOO_LARGE).
- `files.pull`: https only, SSRF-checked by Fortless; the node downloads the file.
- `files.upload`: Mints a signed Wings URL; the browser POSTs multipart to the node. Not exercised by the contract test (needs XHR).
- `players.status`: playerListReliability AUTHORITATIVE | SAMPLED | BEST_EFFORT decides whether moderation is safe. state UNSUPPORTED is a legitimate answer for games without a query adapter.
- `players.saveAdministration`: Stores RCON credentials encrypted server-side (AES-256-GCM); they are never returned.
- `game.info`: { profile: null } when no game profile matches the egg: a legitimate "no game tools" state.
- `game.saveConfig`: Validated against the profile schema server-side.
- `game.acceptEula`: Writes eula=true and restarts the server.
- `game.installMod`: SHA-512 verified by Fortless before upload; one install per service, 3 globally (429 INSTALL_IN_PROGRESS / INSTALL_BUSY).
- `backups.lock`: Toggles; the panel decides the new state.
- `databases.list`: Viewing passwords is audited server-side (service.database.password_viewed).
- `databases.rotate`: The new password is returned once and never stored by the view.
- `schedules.remove`: No server-side confirm; the view asks first.
- `startup.setVariable`: One variable per call; the panel validates its own rules.
- `settings.get`: Includes the SFTP host, port and username (panel_username.identifier). No password: SFTP uses the panel account password.

## Not wired into the view yet

| Method | Path | server.ts line | Reason |
|---|---|---|---|
| GET | `/api/v1/services/:id/deployment` | 1317 | Deployment progress screen, belongs to the order flow. |
| POST | `/api/v1/services/:id/diagnostics` | 2155 | Support diagnostics; no screenshot or tab for it. |
| GET|POST|PUT | `/api/v1/services/:id/fastdl[/sync\|/manifest\|/settings\|/configure-cvar]` | 2001 | FastDL tab exists in the shipped app (shown only when the game supports it); not rebuilt yet. |
| POST | `/api/v1/services/:id/game/icon` | 1997 | Server icon upload (Minecraft); small follow-up inside the Game tab. |

## Console (Wings WebSocket)

Fortless stays the intermediary: `GET /services/:id/console` returns short-lived, server-scoped `{token, socket}`; the browser opens the socket and sends `auth`, `send logs`, `send command`. It receives `auth success`, `console output`, `install output`, `daemon message`, `status`, `stats`, `token expiring` (adapter refreshes the credential), `token expired` and `jwt error` (terminal; shown as a refusal). No Pterodactyl admin key or Application API access exists anywhere in the React code.

## Discrepancies and open points

- `GET /console/history` returns `commandRedacted`; the shipped client reads `command`. The typed contract follows the server. History seeding of the console input is not wired.
- Startup: there is no route to change the startup command, so the command is shown locked; image and variables save per call.
- Allocation tab: no backend route; it shows plan limits from `desiredConfig`.
- Mutations can answer `{pending:true}` when the panel times out; the view reports "outcome unknown" rather than success.
- Destructive routes require `confirm:true`; the adapter sends it only from an explicit confirm dialog.
