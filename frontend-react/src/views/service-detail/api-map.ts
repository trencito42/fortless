import type { ServiceDetailPorts } from './ports';

/**
 * Typed registry of every service route the Service Detail view uses, with the evidence behind each of the five levels.
 * `docs/SERVICE_DETAIL_API_MAP.md` is generated from it (`npx tsx scripts/api-map.ts`), and `tests/service-api.spec.ts` runs every
 * entry through the real HTTP adapter against a recording fetch, so the map cannot drift from the transport.
 *
 * Level 1 (in source): `line` is the registration line in trencito42/fortless src/server.ts @ c6bab7e.
 * Level 3/4: `capability` / `permission` as enforced by the handler (not guessed from the frontend).
 * Level 5: `tests` are repository tests that exercise the handler with a mock/sandbox adapter. Nothing here was run against a live
 * panel by this project; `sandbox: true` marks routes whose provider half is covered by tests/sandbox/panel-sandbox.test.ts.
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Group = Exclude<keyof ServiceDetailPorts, 'platform'> | 'platform';

export interface ApiEntry {
  /** Port path on ServiceDetailPorts, e.g. "files.list". */
  port: string;
  method: Method;
  /** Path with `:id` etc. The sample args below produce the concrete URL. */
  path: string;
  line: number;
  /** Pterodactyl permission the handler requires (level 4). `account-owner` = service sharing is owner-only. */
  permission: string;
  /** Provider capability key (level 3). */
  capability: string;
  /** Body the route requires for destructive actions. */
  confirm?: boolean;
  /** Mutations report `pending: true` on a panel timeout instead of failing (NEW-381). */
  pendingOutcome?: boolean;
  tests: string[];
  sandbox?: boolean;
  note?: string;
  /** Arguments for the contract test, after the service id. */
  args?: unknown[];
  /** Expected URL (query included) and body for those arguments. */
  expect?: { url: string; body?: unknown };
}

const T = { console: 'tests/console.test.ts', files: 'tests/files.test.ts', panel: 'tests/server-panel.test.ts', players: 'tests/player-manager.test.ts', game: 'tests/game.test.ts', sharing: 'tests/sharing.test.ts' };
const S = '/api/v1/services/svc1';

export const API_MAP: ApiEntry[] = [
  { port: 'platform.capabilities', method: 'GET', path: '/api/v1/platform/capabilities', line: 747, permission: 'public', capability: '-', tests: [], note: 'Level 2 and the platform half of level 5: provisioning.enabled and provisioning.verification.', expect: { url: '/api/v1/platform/capabilities' } },
  { port: 'service.get', method: 'GET', path: '/api/v1/services/:id', line: 1794, permission: 'any access (404 otherwise)', capability: '-', tests: [], note: 'Returns access.permissions, providerCapabilities, observedState, desiredConfig and the last 20 audit events.', expect: { url: S } },
  { port: 'service.power', method: 'POST', path: '/api/v1/services/:id/power', line: 1835, permission: 'control.start | control.stop | control.restart', capability: 'power', tests: [], note: '503 PROVIDER_NOT_CONFIGURED when infrastructure is off. KILL needs control.stop.', args: ['RESTART'], expect: { url: `${S}/power`, body: { action: 'RESTART' } } },
  { port: 'service.usage', method: 'GET', path: '/api/v1/services/:id/usage', line: 1804, permission: 'any access', capability: 'power', tests: [], note: 'Polled fallback when the console socket is not feeding stats. Answers { available:false } instead of failing.', expect: { url: `${S}/usage` } },
  { port: 'service.activity', method: 'GET', path: '/api/v1/services/:id/activity', line: 1931, permission: 'activity.read', capability: '-', tests: [], note: 'Allowlisted customer-facing actions only, 15 per page.', args: [{ category: 'power', range: '7', q: 'x', page: 2 }], expect: { url: `${S}/activity?category=power&range=7&q=x&page=2` } },

  { port: 'console.connect', method: 'GET', path: '/api/v1/services/:id/console', line: 1864, permission: 'websocket.connect', capability: 'console', tests: [T.console], sandbox: true, note: 'Returns { token, socket }: a short-lived Wings token scoped to this server. The browser then opens the socket itself. Typed errors: CONSOLE_UNSUPPORTED 501, KEYMINT_NOT_CONFIGURED 503, SERVICE_NOT_ACTIVE 403, SERVICE_PROVISIONING 409.' },
  { port: 'console.history', method: 'GET', path: '/api/v1/services/:id/console/history', line: 2053, permission: 'websocket.connect', capability: 'console', tests: [T.players], note: 'Records expose commandRedacted, not command (the shipped client reads the wrong field).', expect: { url: `${S}/console/history?limit=50` } },
  { port: 'console.recordCommand', method: 'POST', path: '/api/v1/services/:id/console/history', line: 2057, permission: 'control.console', capability: 'console', tests: [T.players], args: ['say hi', true], expect: { url: `${S}/console/history`, body: { command: 'say hi', delivered: true } } },

  { port: 'files.list', method: 'GET', path: '/api/v1/services/:id/files', line: 1916, permission: 'file.read', capability: 'files', tests: [T.files], sandbox: true, args: ['/plugins'], expect: { url: `${S}/files?dir=%2Fplugins` } },
  { port: 'files.read', method: 'GET', path: '/api/v1/services/:id/files/content', line: 1917, permission: 'file.read-content', capability: 'files', tests: [T.files], note: 'Refuses files over 1 MB (413 FILE_TOO_LARGE).', args: ['/eula.txt'], expect: { url: `${S}/files/content?path=%2Feula.txt` } },
  { port: 'files.write', method: 'PUT', path: '/api/v1/services/:id/files/content', line: 1918, permission: 'file.update', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/a.txt', 'x'], expect: { url: `${S}/files/content`, body: { path: '/a.txt', content: 'x' } } },
  { port: 'files.createFolder', method: 'POST', path: '/api/v1/services/:id/files/folder', line: 1919, permission: 'file.create', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', 'logs'], expect: { url: `${S}/files/folder`, body: { dir: '/', name: 'logs' } } },
  { port: 'files.remove', method: 'POST', path: '/api/v1/services/:id/files/delete', line: 1920, permission: 'file.delete', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', ['a']], expect: { url: `${S}/files/delete`, body: { dir: '/', names: ['a'] } } },
  { port: 'files.rename', method: 'POST', path: '/api/v1/services/:id/files/rename', line: 1921, permission: 'file.update', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', 'a', 'b'], expect: { url: `${S}/files/rename`, body: { dir: '/', from: 'a', to: 'b' } } },
  { port: 'files.archive', method: 'POST', path: '/api/v1/services/:id/files/archive', line: 1922, permission: 'file.archive', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', ['a']], expect: { url: `${S}/files/archive`, body: { dir: '/', names: ['a'] } } },
  { port: 'files.unarchive', method: 'POST', path: '/api/v1/services/:id/files/unarchive', line: 1923, permission: 'file.archive', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', 'a.tar.gz'], expect: { url: `${S}/files/unarchive`, body: { dir: '/', file: 'a.tar.gz' } } },
  { port: 'files.move', method: 'POST', path: '/api/v1/services/:id/files/move', line: 1924, permission: 'file.update', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', 'a', '/b'], expect: { url: `${S}/files/move`, body: { dir: '/', name: 'a', destDir: '/b' } } },
  { port: 'files.chmod', method: 'POST', path: '/api/v1/services/:id/files/chmod', line: 1925, permission: 'file.update', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/', ['a'], '644'], expect: { url: `${S}/files/chmod`, body: { dir: '/', names: ['a'], mode: '644' } } },
  { port: 'files.pull', method: 'POST', path: '/api/v1/services/:id/files/pull', line: 1926, permission: 'file.create', capability: 'files', pendingOutcome: true, tests: [T.files], note: 'https only, SSRF-checked by Fortless; the node downloads the file.', args: ['/', 'https://example.com/a.zip', 'a.zip'], expect: { url: `${S}/files/pull`, body: { dir: '/', url: 'https://example.com/a.zip', filename: 'a.zip' } } },
  { port: 'files.copy', method: 'POST', path: '/api/v1/services/:id/files/copy', line: 1927, permission: 'file.create', capability: 'files', pendingOutcome: true, tests: [T.files], args: ['/a'], expect: { url: `${S}/files/copy`, body: { path: '/a' } } },
  { port: 'files.upload', method: 'GET', path: '/api/v1/services/:id/files/upload-url', line: 1928, permission: 'file.create', capability: 'files', tests: [T.files], note: 'Mints a signed Wings URL; the browser POSTs multipart to the node. Not exercised by the contract test (needs XHR).' },
  { port: 'files.downloadUrl', method: 'GET', path: '/api/v1/services/:id/files/download-url', line: 1929, permission: 'file.read-content', capability: 'files', tests: [T.files], args: ['/a'], expect: { url: `${S}/files/download-url?path=%2Fa` } },

  { port: 'players.status', method: 'GET', path: '/api/v1/services/:id/players', line: 2020, permission: 'player.read', capability: 'game', tests: [T.players], note: 'playerListReliability AUTHORITATIVE | SAMPLED | BEST_EFFORT decides whether moderation is safe. state UNSUPPORTED is a legitimate answer for games without a query adapter.', expect: { url: `${S}/players` } },
  { port: 'players.kick', method: 'POST', path: '/api/v1/services/:id/players/kick', line: 2021, permission: 'player.moderate', capability: 'game', tests: [T.players], args: [{ targetIdentifier: 'p', targetName: 'P' }], expect: { url: `${S}/players/kick`, body: { targetIdentifier: 'p', targetName: 'P' } } },
  { port: 'players.ban', method: 'POST', path: '/api/v1/services/:id/players/ban', line: 2028, permission: 'player.moderate', capability: 'game', tests: [T.players], args: [{ targetIdentifier: 'p', targetName: 'P', durationMinutes: 60 }], expect: { url: `${S}/players/ban`, body: { targetIdentifier: 'p', targetName: 'P', durationMinutes: 60 } } },
  { port: 'players.unban', method: 'POST', path: '/api/v1/services/:id/players/unban', line: 2036, permission: 'player.moderate', capability: 'game', tests: [T.players], args: [{ targetIdentifier: 'p', targetName: 'P' }], expect: { url: `${S}/players/unban`, body: { targetIdentifier: 'p', targetName: 'P' } } },
  { port: 'players.history', method: 'GET', path: '/api/v1/services/:id/players/history', line: 2048, permission: 'player.read', capability: 'game', tests: [T.players], args: [0, 25], expect: { url: `${S}/players/history?page=0&limit=25` } },
  { port: 'players.administration', method: 'GET', path: '/api/v1/services/:id/game-administration', line: 2042, permission: 'player.read', capability: 'game', tests: [T.players], expect: { url: `${S}/game-administration` } },
  { port: 'players.detect', method: 'POST', path: '/api/v1/services/:id/game-administration/detect', line: 2043, permission: 'player.read', capability: 'game', tests: [T.players], expect: { url: `${S}/game-administration/detect` } },
  { port: 'players.saveAdministration', method: 'PUT', path: '/api/v1/services/:id/game-administration', line: 2044, permission: 'startup.update', capability: 'game', tests: [T.players], note: 'Stores RCON credentials encrypted server-side (AES-256-GCM); they are never returned.', args: [{ method: 'RCON' }], expect: { url: `${S}/game-administration`, body: { method: 'RCON' } } },
  { port: 'players.resetAdministration', method: 'DELETE', path: '/api/v1/services/:id/game-administration', line: 2045, permission: 'startup.update', capability: 'game', tests: [T.players], expect: { url: `${S}/game-administration` } },
  { port: 'players.testAdministration', method: 'POST', path: '/api/v1/services/:id/game-administration/test', line: 2046, permission: 'player.moderate', capability: 'game', tests: [T.players], expect: { url: `${S}/game-administration/test` } },
  { port: 'players.autoConfigure', method: 'POST', path: '/api/v1/services/:id/game-administration/auto-configure', line: 2047, permission: 'startup.update', capability: 'game', tests: [T.players], args: [{}], expect: { url: `${S}/game-administration/auto-configure`, body: {} } },

  { port: 'service.diagnose', method: 'POST', path: '/api/v1/services/:id/diagnostics', line: 2155, permission: 'any access (tenant isolation by account)', capability: 'power', tests: [], note: '503 AI_NOT_CONFIGURED when the AI adapter is off. Logs are redacted server-side before analysis. The route uses requireAuth and the account owner check, not a Pterodactyl permission.', args: ['logs'], expect: { url: `${S}/diagnostics`, body: { recentLogs: 'logs' } } },
  { port: 'fastdl.status', method: 'GET', path: '/api/v1/services/:id/fastdl', line: 2001, permission: 'file.read', capability: 'files', tests: [], note: '{ supported:false, reason } when the egg has no FastDL profile (legitimate). While a sync runs the server skips the live config read so polling is cheap.', expect: { url: `${S}/fastdl` } },
  { port: 'fastdl.sync', method: 'POST', path: '/api/v1/services/:id/fastdl/sync', line: 2002, permission: 'file.read (as implemented; the UI asks for file.update)', capability: 'files', tests: [], note: 'Backend only resolves the service with file.read here. The view gates it on file.update, the stricter reading.', expect: { url: `${S}/fastdl/sync`, body: {} } },
  { port: 'fastdl.cancel', method: 'POST', path: '/api/v1/services/:id/fastdl/sync/cancel', line: 2003, permission: 'file.read (as implemented; the UI asks for file.update)', capability: 'files', tests: [], expect: { url: `${S}/fastdl/sync/cancel`, body: {} } },
  { port: 'fastdl.retry', method: 'POST', path: '/api/v1/services/:id/fastdl/sync/retry', line: 2004, permission: 'file.read (as implemented; the UI asks for file.update)', capability: 'files', tests: [], expect: { url: `${S}/fastdl/sync/retry`, body: {} } },
  { port: 'fastdl.manifest', method: 'GET', path: '/api/v1/services/:id/fastdl/manifest', line: 2005, permission: 'file.read', capability: 'files', tests: [], args: [{ page: 2, limit: 20, search: 'maps', status: 'FAILED' }], expect: { url: `${S}/fastdl/manifest?page=2&limit=20&search=maps&status=FAILED` } },
  { port: 'fastdl.configureCvar', method: 'POST', path: '/api/v1/services/:id/fastdl/configure-cvar', line: 2014, permission: 'file.update (writes server.cfg, keeps a backup)', capability: 'files', tests: [], expect: { url: `${S}/fastdl/configure-cvar`, body: {} } },
  { port: 'fastdl.saveSettings', method: 'PUT', path: '/api/v1/services/:id/fastdl/settings', line: 2015, permission: 'file.update', capability: 'files', tests: [], args: [{ autoSync: false, compressionMode: 'both', quotaBytes: 1024 }], expect: { url: `${S}/fastdl/settings`, body: { autoSync: false, compressionMode: 'both', quotaBytes: 1024 } } },
  { port: 'game.info', method: 'GET', path: '/api/v1/services/:id/game', line: 1991, permission: 'file.read', capability: 'game', tests: [T.game], note: '{ profile: null } when no game profile matches the egg: a legitimate "no game tools" state.', expect: { url: `${S}/game` } },
  { port: 'game.saveConfig', method: 'PUT', path: '/api/v1/services/:id/game/config', line: 1992, permission: 'file.update', capability: 'game', tests: [T.game], note: 'Validated against the profile schema server-side.', args: [{ motd: 'x' }], expect: { url: `${S}/game/config`, body: { values: { motd: 'x' } } } },
  { port: 'game.acceptEula', method: 'POST', path: '/api/v1/services/:id/game/eula/accept', line: 1993, permission: 'control.restart', capability: 'game', tests: [T.game], note: 'Writes eula=true and restarts the server.', expect: { url: `${S}/game/eula/accept` } },
  { port: 'game.searchMods', method: 'GET', path: '/api/v1/services/:id/game/mods/search', line: 1994, permission: 'file.read', capability: 'game', tests: [T.game], args: [{ source: 0, q: 'chunky', page: 1 }], expect: { url: `${S}/game/mods/search?source=0&q=chunky&page=1` } },
  { port: 'game.installMod', method: 'POST', path: '/api/v1/services/:id/game/mods/install', line: 1995, permission: 'file.create', capability: 'game', tests: [T.game], note: 'SHA-512 verified by Fortless before upload; one install per service, 3 globally (429 INSTALL_IN_PROGRESS / INSTALL_BUSY).', args: [{ source: 0, projectId: 'AANobbMI' }], expect: { url: `${S}/game/mods/install`, body: { source: 0, projectId: 'AANobbMI' } } },
  { port: 'game.setIcon', method: 'POST', path: '/api/v1/services/:id/game/icon', line: 1997, permission: 'file.create', capability: 'game', tests: [T.game], note: 'Body { png: base64 }. Server requires a 64x64 PNG under the size cap; 404 NO_PROFILE when the game has no icon file.', args: ['AAAA'], expect: { url: `${S}/game/icon`, body: { png: 'AAAA' } } },
  { port: 'game.installed', method: 'GET', path: '/api/v1/services/:id/game/mods/installed', line: 1996, permission: 'file.read', capability: 'game', tests: [T.game], args: [0], expect: { url: `${S}/game/mods/installed?source=0` } },

  { port: 'backups.list', method: 'GET', path: '/api/v1/services/:id/backups', line: 2123, permission: 'backup.read', capability: 'backups', tests: [T.panel], expect: { url: `${S}/backups` } },
  { port: 'backups.create', method: 'POST', path: '/api/v1/services/:id/backups', line: 2124, permission: 'backup.create', capability: 'backups', pendingOutcome: true, tests: [T.panel], args: [{ name: 'x' }], expect: { url: `${S}/backups`, body: { name: 'x' } } },
  { port: 'backups.remove', method: 'DELETE', path: '/api/v1/services/:id/backups/:uuid', line: 2125, permission: 'backup.delete', capability: 'backups', confirm: true, pendingOutcome: true, tests: [T.panel], args: ['u1'], expect: { url: `${S}/backups/u1`, body: { confirm: true } } },
  { port: 'backups.lock', method: 'POST', path: '/api/v1/services/:id/backups/:uuid/lock', line: 2126, permission: 'backup.delete', capability: 'backups', pendingOutcome: true, tests: [T.panel], note: 'Toggles; the panel decides the new state.', args: ['u1'], expect: { url: `${S}/backups/u1/lock` } },
  { port: 'backups.restore', method: 'POST', path: '/api/v1/services/:id/backups/:uuid/restore', line: 2127, permission: 'backup.restore', capability: 'backups', confirm: true, pendingOutcome: true, tests: [T.panel], args: ['u1', true], expect: { url: `${S}/backups/u1/restore`, body: { confirm: true, truncate: true } } },
  { port: 'backups.downloadUrl', method: 'GET', path: '/api/v1/services/:id/backups/:uuid/download-url', line: 2128, permission: 'backup.download', capability: 'backups', tests: [T.panel], args: ['u1'], expect: { url: `${S}/backups/u1/download-url` } },

  { port: 'network.list', method: 'GET', path: '/api/v1/services/:id/network', line: 2129, permission: 'allocation.read', capability: 'network', tests: [T.panel], expect: { url: `${S}/network` } },
  { port: 'network.assign', method: 'POST', path: '/api/v1/services/:id/network', line: 2130, permission: 'allocation.create', capability: 'network', pendingOutcome: true, tests: [T.panel], expect: { url: `${S}/network` } },
  { port: 'network.setNotes', method: 'PATCH', path: '/api/v1/services/:id/network/:aid', line: 2131, permission: 'allocation.update', capability: 'network', pendingOutcome: true, tests: [T.panel], args: [7, 'n'], expect: { url: `${S}/network/7`, body: { notes: 'n' } } },
  { port: 'network.setPrimary', method: 'POST', path: '/api/v1/services/:id/network/:aid/primary', line: 2132, permission: 'allocation.update', capability: 'network', pendingOutcome: true, tests: [T.panel], args: [7], expect: { url: `${S}/network/7/primary` } },
  { port: 'network.remove', method: 'DELETE', path: '/api/v1/services/:id/network/:aid', line: 2133, permission: 'allocation.delete', capability: 'network', pendingOutcome: true, tests: [T.panel], args: [7], expect: { url: `${S}/network/7` } },

  { port: 'databases.list', method: 'GET', path: '/api/v1/services/:id/databases', line: 2134, permission: 'database.read (+ database.view_password for passwords)', capability: 'databases', tests: [T.panel], note: 'Viewing passwords is audited server-side (service.database.password_viewed).', expect: { url: `${S}/databases` } },
  { port: 'databases.create', method: 'POST', path: '/api/v1/services/:id/databases', line: 2135, permission: 'database.create', capability: 'databases', pendingOutcome: true, tests: [T.panel], args: [{ name: 'db' }], expect: { url: `${S}/databases`, body: { name: 'db' } } },
  { port: 'databases.rotate', method: 'POST', path: '/api/v1/services/:id/databases/:did/rotate', line: 2136, permission: 'database.update', capability: 'databases', tests: [T.panel], note: 'The new password is returned once and never stored by the view.', args: ['5'], expect: { url: `${S}/databases/5/rotate` } },
  { port: 'databases.remove', method: 'DELETE', path: '/api/v1/services/:id/databases/:did', line: 2137, permission: 'database.delete', capability: 'databases', confirm: true, pendingOutcome: true, tests: [T.panel], args: ['5'], expect: { url: `${S}/databases/5`, body: { confirm: true } } },

  { port: 'schedules.list', method: 'GET', path: '/api/v1/services/:id/schedules', line: 2138, permission: 'schedule.read', capability: 'schedules', tests: [T.panel], expect: { url: `${S}/schedules` } },
  { port: 'schedules.save', method: 'POST', path: '/api/v1/services/:id/schedules[/:sid]', line: 2139, permission: 'schedule.create | schedule.update', capability: 'schedules', pendingOutcome: true, tests: [T.panel], args: [null, { name: 'n', minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*', active: true, onlyWhenOnline: false }], expect: { url: `${S}/schedules`, body: { name: 'n', minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*', active: true, onlyWhenOnline: false } } },
  { port: 'schedules.remove', method: 'DELETE', path: '/api/v1/services/:id/schedules/:sid', line: 2141, permission: 'schedule.delete', capability: 'schedules', pendingOutcome: true, tests: [T.panel], note: 'No server-side confirm; the view asks first.', args: [3], expect: { url: `${S}/schedules/3` } },
  { port: 'schedules.execute', method: 'POST', path: '/api/v1/services/:id/schedules/:sid/execute', line: 2142, permission: 'schedule.update', capability: 'schedules', pendingOutcome: true, tests: [T.panel], args: [3], expect: { url: `${S}/schedules/3/execute` } },
  { port: 'schedules.addTask', method: 'POST', path: '/api/v1/services/:id/schedules/:sid/tasks', line: 2143, permission: 'schedule.update', capability: 'schedules', pendingOutcome: true, tests: [T.panel], args: [3, { action: 'power', payload: 'restart', offset: 0, continueOnFailure: false }], expect: { url: `${S}/schedules/3/tasks`, body: { action: 'power', payload: 'restart', offset: 0, continueOnFailure: false } } },
  { port: 'schedules.updateTask', method: 'POST', path: '/api/v1/services/:id/schedules/:sid/tasks/:tid', line: 2144, permission: 'schedule.update', capability: 'schedules', pendingOutcome: true, tests: [T.panel], args: [3, 4, { action: 'command', payload: 'save-all', offset: 5, continueOnFailure: true }], expect: { url: `${S}/schedules/3/tasks/4`, body: { action: 'command', payload: 'save-all', offset: 5, continueOnFailure: true } } },
  { port: 'schedules.removeTask', method: 'DELETE', path: '/api/v1/services/:id/schedules/:sid/tasks/:tid', line: 2146, permission: 'schedule.update', capability: 'schedules', pendingOutcome: true, tests: [T.panel], args: [3, 4], expect: { url: `${S}/schedules/3/tasks/4` } },

  { port: 'startup.get', method: 'GET', path: '/api/v1/services/:id/startup', line: 2147, permission: 'startup.read', capability: 'startup', tests: [T.panel], expect: { url: `${S}/startup` } },
  { port: 'startup.setVariable', method: 'PUT', path: '/api/v1/services/:id/startup/variable', line: 2148, permission: 'startup.update', capability: 'startup', pendingOutcome: true, tests: [T.panel], note: 'One variable per call; the panel validates its own rules.', args: ['JAR', 'x.jar'], expect: { url: `${S}/startup/variable`, body: { key: 'JAR', value: 'x.jar' } } },
  { port: 'startup.setImage', method: 'PUT', path: '/api/v1/services/:id/startup/image', line: 2149, permission: 'startup.docker-image', capability: 'startup', pendingOutcome: true, tests: [T.panel], args: ['ghcr.io/x:java_21'], expect: { url: `${S}/startup/image`, body: { image: 'ghcr.io/x:java_21' } } },

  { port: 'settings.get', method: 'GET', path: '/api/v1/services/:id/settings', line: 2150, permission: 'startup.read', capability: 'settings', tests: [T.panel], note: 'Includes the SFTP host, port and username (panel_username.identifier). No password: SFTP uses the panel account password.', expect: { url: `${S}/settings` } },
  { port: 'settings.rename', method: 'POST', path: '/api/v1/services/:id/settings/rename', line: 2151, permission: 'settings.rename', capability: 'settings', pendingOutcome: true, tests: [T.panel], args: ['n', 'd'], expect: { url: `${S}/settings/rename`, body: { name: 'n', description: 'd' } } },
  { port: 'settings.reinstall', method: 'POST', path: '/api/v1/services/:id/settings/reinstall', line: 2152, permission: 'settings.reinstall', capability: 'settings', confirm: true, tests: [T.panel], expect: { url: `${S}/settings/reinstall`, body: { confirm: true } } },
  { port: 'settings.panelActivity', method: 'GET', path: '/api/v1/services/:id/panel-activity', line: 2145, permission: 'activity.read', capability: 'settings', tests: [T.panel], args: [2], expect: { url: `${S}/panel-activity?page=2` } },

  { port: 'members.list', method: 'GET', path: '/api/v1/services/:id/members', line: 1961, permission: 'account-owner', capability: 'users', tests: [T.sharing], expect: { url: `${S}/members` } },
  { port: 'members.invite', method: 'POST', path: '/api/v1/services/:id/members/invite', line: 1962, permission: 'account-owner', capability: 'users', tests: [T.sharing], args: ['a@b.co', 'viewer'], expect: { url: `${S}/members/invite`, body: { email: 'a@b.co', preset: 'viewer' } } },
  { port: 'members.revoke', method: 'DELETE', path: '/api/v1/services/:id/invitations/:iid', line: 1963, permission: 'account-owner', capability: 'users', tests: [T.sharing], args: ['i1'], expect: { url: `${S}/invitations/i1` } },
  { port: 'members.remove', method: 'DELETE', path: '/api/v1/services/:id/members/:mid', line: 1964, permission: 'account-owner', capability: 'users', tests: [T.sharing], args: ['m1'], expect: { url: `${S}/members/m1` } },
  { port: 'members.setPreset', method: 'PATCH', path: '/api/v1/services/:id/members/:mid', line: 1965, permission: 'account-owner', capability: 'users', tests: [T.sharing], args: ['m1', 'admin'], expect: { url: `${S}/members/m1`, body: { preset: 'admin' } } },
];

/** Routes that exist in server.ts but have no tab in this view yet. Listed so nothing is silently dropped. */
export const NOT_YET_IN_VIEW: Array<{ method: string; path: string; line: number; reason: string }> = [
  { method: 'GET', path: '/api/v1/services/:id/deployment', line: 1317, reason: 'Deployment progress screen, belongs to the order flow.' },
];
