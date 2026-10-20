import type * as C from '../contracts';
import { MAX_EDIT_BYTES } from '../contracts';
import { ServiceApiError, type ConsoleConnection, type ConsoleHandlers, type ServiceDetailPorts } from '../ports';

/**
 * DEMONSTRATION adapter for the Workbench and tests. Everything it returns is invented and the UI that uses it says so.
 * It returns the same wire contracts as the real API (contracts.ts), behaves statefully (power, files, backups, schedules...),
 * and can be made slow, failing, unauthorised or unsupported so every loading, empty, error and permission state is reproducible.
 * It never touches the network.
 */
export type DemoPreset = 'owner' | 'viewer' | 'operator' | 'admin';
export interface DemoOptions {
  latency?: number;
  runtime?: C.RuntimeState;
  contract?: C.ContractStatus;
  providerType?: string;
  /** Who is looking. 'owner' = account owner with every permission. */
  as?: DemoPreset;
  capabilities?: Partial<C.ProviderCapabilities>;
  platform?: 'ready' | 'not-configured' | 'unknown' | 'verified';
  /** Workload family. Decides game profile, console output, files and startup variables so each workload shows its own configuration UI. */
  workload?: 'minecraft' | 'cs16' | 'cs2' | 'discord-bot' | 'nodejs' | 'python' | 'database';
  /** Plan shown in the header and limits. */
  plan?: { name: string; memoryMb: number; cpuPct: number; diskMb: number };
  /** Simulates an instance without an AI adapter (diagnostics answer 503 AI_NOT_CONFIGURED). */
  aiOff?: boolean;
  /** Simulates FastDL for an engine that supports it (CS 1.6 does by default). */
  fastdl?: 'supported' | 'unsupported';
  /** Overrides the derived game mode ('none' hides game tools). */
  game?: 'minecraft' | 'source' | 'none';
  /** Groups whose reads fail, and with which typed error. */
  failing?: Partial<Record<keyof ServiceDetailPorts, { status: number; code?: string; message: string }>>;
  /** Console socket refused with this typed error instead of connecting. */
  consoleError?: { status: number; code?: string; message: string };
  empty?: boolean;
}

const PERMS = {
  viewer: ['websocket.connect', 'file.read', 'backup.read', 'allocation.read', 'startup.read', 'database.read', 'schedule.read', 'activity.read', 'player.read'],
  operator: ['websocket.connect', 'control.console', 'control.start', 'control.stop', 'control.restart', 'file.read', 'file.read-content', 'file.create', 'file.update', 'file.delete', 'file.archive', 'backup.read', 'backup.create', 'backup.download', 'allocation.read', 'startup.read', 'database.read', 'schedule.read', 'activity.read', 'player.read', 'player.moderate'],
  admin: ['websocket.connect', 'control.console', 'control.start', 'control.stop', 'control.restart', 'file.read', 'file.read-content', 'file.create', 'file.update', 'file.delete', 'file.archive', 'file.sftp', 'backup.read', 'backup.create', 'backup.delete', 'backup.download', 'backup.restore', 'allocation.read', 'allocation.create', 'allocation.update', 'allocation.delete', 'startup.read', 'startup.update', 'startup.docker-image', 'settings.rename', 'settings.reinstall', 'database.read', 'database.create', 'database.update', 'database.delete', 'database.view_password', 'schedule.read', 'schedule.create', 'schedule.update', 'schedule.delete', 'activity.read', 'player.read', 'player.moderate'],
} as const;

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) { rej(new DOMException('Aborted', 'AbortError')); return; }
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

const LOG = [
  '\x1b[33mcontainer@demo~\x1b[0m java -version',
  'openjdk version "25.0.4.1" 2026-08-18 LTS',
  '\x1b[33mcontainer@demo~\x1b[0m java -Xms128M -XX:MaxRAMPercentage=95.0 -jar server.jar',
  'Starting org.bukkit.craftbukkit.Main',
  '[16:14:57 INFO]: [bootstrap] Running Java 25 on Linux (amd64)',
  '[16:15:17 INFO]: Loaded 1866 advancements',
  '[16:15:18 INFO]: Starting minecraft server version 26.3',
  '[16:15:20 INFO]: Default game type: SURVIVAL',
  '[16:15:20 INFO]: Starting Minecraft server on 0.0.0.0:25043',
  '\x1b[33m[16:15:20 WARN]: **** SERVER IS RUNNING IN OFFLINE/INSECURE MODE!\x1b[0m',
  '[16:15:22 INFO]: Done (4.213s)! For help, type "help"',
];

const LOGS: Record<NonNullable<DemoOptions['workload']>, string[]> = {
  minecraft: LOG,
  cs16: ['\x1b[33mcontainer@demo~\x1b[0m ./hlds_run -game cstrike +maxplayers 24 +map de_dust2', 'Protocol version 48', 'Exe version 1.1.2.7/Stdio (cstrike)', 'ReHLDS version 3.14.0.857', 'Server IP address 185.12.4.20:27015', '[AMXX] Loaded 12 plugins', 'Map: de_dust2', 'Server is running with 24 slots. VAC is enabled.'],
  cs2: ['\x1b[33mcontainer@demo~\x1b[0m ./cs2 -dedicated +map de_inferno', 'CS2 dedicated server starting', 'Loaded game mode: competitive', 'Server is listening on 0.0.0.0:27015'],
  'discord-bot': ['\x1b[33mcontainer@demo~\x1b[0m node dist/index.js', '[info] Logging in to Discord gateway', '[info] Ready as Modbot#4821', '[info] Registered 14 slash commands', '[info] Guilds: 3, members: 1,204'],
  nodejs: ['\x1b[33mcontainer@demo~\x1b[0m pnpm start', '> storefront-api@2.4.1 start', '> node dist/server.js', '{"level":"info","msg":"listening","port":3000}', '{"level":"info","msg":"connected to postgres"}'],
  python: ['\x1b[33mcontainer@demo~\x1b[0m python main.py', 'INFO scraper starting, 42 targets', 'INFO fetched 42/42 pages in 8.1s', 'INFO sleeping 300s'],
  database: ['\x1b[33mcontainer@demo~\x1b[0m mysqld', 'mysqld: ready for connections. Version: 8.4.2 port: 3306'],
};

type Node = { dir: true } | { dir: false; content: string };
const seedFiles = (workload: NonNullable<DemoOptions['workload']>) => {
  const m = new Map<string, Node>();
  const dirs: Record<string, string[]> = { minecraft: ['.cache', 'cache', 'config', 'libraries', 'logs', 'plugins', 'versions', 'world', 'config/paper'], cs16: ['cstrike', 'cstrike/maps', 'cstrike/addons', 'cstrike/addons/amxmodx', 'cstrike/models', 'cstrike/sound', 'logs'], cs2: ['game', 'game/csgo', 'game/csgo/cfg', 'logs'], 'discord-bot': ['src', 'dist', 'node_modules', 'logs'], nodejs: ['src', 'dist', 'node_modules', 'logs'], python: ['app', 'logs', '.venv'], database: ['data', 'logs'] };
  for (const d of dirs[workload] ?? dirs['minecraft']!) m.set('/' + d, { dir: true });
  const f: Record<string, string> = workload === 'minecraft' ? {
    'eula.txt': 'eula=true\n', 'ops.json': '[]\n', 'banned-players.json': '[]\n', 'server.properties': 'motd=A Minecraft Server\nmax-players=20\ndifficulty=easy\n',
    'bukkit.yml': 'settings:\n  allow-end: true\n  connection-throttle: 4000\n', 'server.jar': '', 'config/paper/global.yml': '_version: 31\n', 'logs/latest.log': LOG.map((l) => l.replace(new RegExp(String.fromCharCode(27) + '\\[\\d+m', 'g'), '')).join('\n') + '\n',
  } : ({
    cs16: { 'server.cfg': 'hostname "CS 1.6 Classic"\nsv_password ""\nmp_timelimit 20\nmp_friendlyfire 0\n', 'mapcycle.txt': 'de_dust2\nde_inferno\nde_nuke\n', 'cstrike/addons/amxmodx/configs/users.ini': '; admins\n', 'cstrike/maps/de_dust2.bsp': '', 'cstrike/models/player.mdl': '' },
    cs2: { 'game/csgo/cfg/server.cfg': 'hostname "CS2 Wingman"\n', 'game/csgo/cfg/gamemode_competitive_server.cfg': '' },
    'discord-bot': { 'package.json': '{\n  "name": "modbot",\n  "version": "1.8.0",\n  "scripts": { "build": "tsc", "start": "node dist/index.js" }\n}\n', 'src/index.ts': "import { Client } from 'discord.js';\n", 'dist/index.js': '', '.env': 'DISCORD_TOKEN=***\n', 'logs/bot.log': 'Ready as Modbot#4821\n' },
    nodejs: { 'package.json': '{\n  "name": "storefront-api",\n  "version": "2.4.1",\n  "scripts": { "build": "tsc", "start": "node dist/server.js" }\n}\n', 'pnpm-lock.yaml': 'lockfileVersion: 9\n', 'src/server.ts': '', 'dist/server.js': '', '.env': 'PORT=3000\n' },
    python: { 'main.py': 'print("scraper")\n', 'requirements.txt': 'requests==2.32.3\n', 'app/__init__.py': '' },
    database: { 'my.cnf': '[mysqld]\nmax_connections=100\n' },
  } as Record<string, Record<string, string>>)[workload] ?? {};
  for (const [p, c] of Object.entries(f)) m.set('/' + p, { dir: false, content: c });
  return m;
};
const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function createDemoPorts(opts: DemoOptions = {}): ServiceDetailPorts {
  const latency = opts.latency ?? 200;
  const as = opts.as ?? 'owner';
  const contract = opts.contract ?? 'ACTIVE';
  let runtime: C.RuntimeState = opts.runtime ?? 'RUNNING';
  const providerType = opts.providerType ?? 'PTERODACTYL';
  const workload = opts.workload ?? 'minecraft';
  const game = opts.game ?? (workload === 'minecraft' ? 'minecraft' : workload === 'cs16' || workload === 'cs2' ? 'source' : 'none');
  const cs = game === 'source';
  const app = workload === 'discord-bot' || workload === 'nodejs' || workload === 'python';
  const perms = [...(as === 'owner' ? PERMS.admin : PERMS[as])];
  const caps: C.ProviderCapabilities = { console: true, files: true, game: true, databases: true, schedules: true, backups: true, network: true, startup: true, settings: true, users: true, power: true, ...opts.capabilities };
  const files = seedFiles(workload);
  const err = (g: keyof ServiceDetailPorts) => { const f = opts.failing?.[g]; if (f) throw new ServiceApiError(f.message, f.status, f.code); };
  const call = async <T>(g: keyof ServiceDetailPorts, run: () => T | Promise<T>, signal?: AbortSignal): Promise<T> => { await sleep(latency, signal); err(g); return run(); };
  const mut = async (g: keyof ServiceDetailPorts, run: () => void): Promise<C.MutationDto> => call(g, () => { run(); return { success: true, pending: false }; });
  const started = Date.now();

  let live = runtime;
  const detail = (): C.ServiceDetailDto => ({
    access: { kind: as === 'owner' ? 'ACCOUNT' : 'MEMBER', preset: as === 'owner' ? null : as, permissions: perms, sharedBy: as === 'owner' ? null : 'Demo Owner' },
    id: 'svc_demo0001', accountId: 'acc_demo', orderItemId: 'oi_demo', providerType, providerCapabilities: caps, externalId: contract === 'ACTIVE' && runtime !== 'UNKNOWN' ? '41' : null,
    identifier: 'a1b2c3d4', contractStatus: contract, nodeId: 'node_1', nodeName: 'Demo-Node-01', nodeFqdn: 'node-01.demo.example', regionId: 'r1', regionName: 'EU - Frankfurt', regionCode: 'fra-1',
    planName: opts.plan?.name ?? 'Free tier', planVersionId: 'pv1', desiredConfig: { cpuLimitPct: opts.plan?.cpuPct ?? 200, memoryLimitMb: opts.plan?.memoryMb ?? 1024, diskLimitMb: opts.plan?.diskMb ?? 2048, startupCommand: null },
    observedState: { runtimeState: live, lastCheckedAt: new Date().toISOString() },
    auditTrail: [{ id: 'a1', action: 'service.provisioned', actorType: 'SYSTEM', createdAt: '2026-10-19T17:40:00Z', metadata: '{}' }, { id: 'a2', action: 'service.power.restart', actorType: 'USER', createdAt: '2026-10-19T20:25:00Z', metadata: '{"ip":"203.0.113.7"}' }],
    createdAt: '2026-10-19T17:40:00Z', updatedAt: '2026-10-20T08:00:00Z',
  });

  let cfg: Record<string, string> = { motd: 'A Minecraft Server', 'max-players': '20', gamemode: 'survival', difficulty: 'easy', pvp: 'true', hardcore: 'false', 'allow-flight': 'true', 'online-mode': 'false', 'spawn-protection': '16' };
  const schema: C.ConfigFieldDto[] = [
    { key: 'motd', label: 'Message of the day', type: 'string', group: 'General', maxLength: 59 }, { key: 'max-players', label: 'Max players', type: 'int', group: 'General', min: 1, max: 100, default: '20' },
    { key: 'gamemode', label: 'Game mode', type: 'enum', group: 'General', options: [{ value: 'survival', label: 'Survival' }, { value: 'creative', label: 'Creative' }, { value: 'adventure', label: 'Adventure' }] },
    { key: 'difficulty', label: 'Difficulty', type: 'enum', group: 'General', options: [{ value: 'peaceful', label: 'Peaceful' }, { value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] },
    { key: 'pvp', label: 'PvP', type: 'bool', group: 'World', description: 'Players can damage each other.' }, { key: 'hardcore', label: 'Hardcore', type: 'bool', group: 'World' },
    { key: 'allow-flight', label: 'Allow flight', type: 'bool', group: 'World' }, { key: 'online-mode', label: 'Online mode', type: 'bool', group: 'Security', description: 'Verify players with Mojang. Turn off only for offline networks.' },
    { key: 'spawn-protection', label: 'Spawn protection', type: 'int', group: 'World', min: 0, max: 64 },
  ];
  let csCfg: Record<string, string> = { hostname: 'CS 1.6 Classic', sv_password: '', mp_timelimit: '20', mp_roundtime: '2.5', mp_freezetime: '5', mp_friendlyfire: '0', mp_autoteambalance: '1', sv_gravity: '800', sv_airaccelerate: '10', sv_alltalk: '0', mp_c4timer: '35', mp_startmoney: '800' };
  const csSchema: C.ConfigFieldDto[] = [
    { key: 'hostname', label: 'Server name', type: 'string', group: 'General', maxLength: 64 }, { key: 'sv_password', label: 'Join password', type: 'string', group: 'General', description: 'Leave empty for a public server.' },
    { key: 'mp_timelimit', label: 'Map time limit (minutes)', type: 'int', group: 'Rules', min: 0, max: 120 }, { key: 'mp_roundtime', label: 'Round time (minutes)', type: 'string', group: 'Rules' },
    { key: 'mp_freezetime', label: 'Freeze time (seconds)', type: 'int', group: 'Rules', min: 0, max: 15 }, { key: 'mp_startmoney', label: 'Starting money', type: 'int', group: 'Rules', min: 800, max: 16000 },
    { key: 'mp_c4timer', label: 'C4 timer (seconds)', type: 'int', group: 'Rules', min: 10, max: 90 },
    { key: 'mp_friendlyfire', label: 'Friendly fire', type: 'bool', group: 'Rules' }, { key: 'mp_autoteambalance', label: 'Auto team balance', type: 'bool', group: 'Rules' },
    { key: 'sv_gravity', label: 'Gravity', type: 'int', group: 'Physics', min: 100, max: 2000 }, { key: 'sv_airaccelerate', label: 'Air acceleration', type: 'int', group: 'Physics', min: 0, max: 100 },
    { key: 'sv_alltalk', label: 'All talk', type: 'bool', group: 'Voice', description: 'Both teams hear each other.' },
  ];
  const installed = new Set<string>();
  let backups: C.BackupDto[] = opts.empty ? [] : [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Before plugin update', bytes: 312 * 1048576, createdAt: '2026-10-18T21:04:00Z', completedAt: '2026-10-18T21:05:10Z', successful: true, locked: true }];
  let schedules: C.ScheduleDto[] = opts.empty ? [] : [{ id: 1, name: 'Nightly restart', cron: { minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*' }, active: true, processing: false, onlyWhenOnline: true, lastRunAt: '2026-10-20T04:00:00Z', nextRunAt: '2026-10-21T04:00:00Z',
    tasks: [{ id: 1, sequence: 1, action: 'command', payload: 'say Restarting in 30 seconds', offset: 0, continueOnFailure: false }, { id: 2, sequence: 2, action: 'power', payload: 'restart', offset: 30, continueOnFailure: false }] }];
  let dbs: C.DatabaseDto[] = opts.empty ? [] : [{ id: '1', name: 's1_stats', username: 'u1_stats', host: 'db.demo.example:3306', connectionsFrom: '%', password: 'demo-not-a-real-password' }];
  let allocs: C.AllocationDto[] = [{ id: 1, ip: '203.0.113.20', alias: 'play.demo.example', port: 25043, notes: 'Game port', primary: true }, { id: 2, ip: '203.0.113.20', alias: null, port: 25044, notes: '', primary: false }];
  const appVars = (): C.StartupVariableDto[] => [
    { key: 'GIT_ADDRESS', name: 'Git repository', description: 'Repository cloned on install and updated on restart.', value: 'https://github.com/morgan/' + (workload === 'discord-bot' ? 'modbot' : workload === 'python' ? 'price-scraper' : 'storefront-api'), editable: true, rules: 'nullable|string' },
    { key: 'BRANCH', name: 'Branch', description: 'Branch to deploy.', value: 'main', editable: true, rules: 'nullable|string' },
    { key: 'NODE_ENV', name: 'Environment', description: 'Runtime mode.', value: 'production', editable: true, rules: 'required|in:development,production' },
    { key: 'BUILD_COMMAND', name: 'Build command', description: 'Runs after install.', value: workload === 'python' ? 'pip install -r requirements.txt' : 'pnpm install && pnpm build', editable: true, rules: 'nullable|string' },
    { key: 'START_COMMAND', name: 'Start command', description: 'Process started by the container.', value: workload === 'python' ? 'python main.py' : 'pnpm start', editable: true, rules: 'required|string' },
    ...(workload === 'discord-bot' ? [{ key: 'DISCORD_TOKEN', name: 'Bot token', description: 'Stored encrypted. Never shown after saving.', value: '', editable: true, rules: 'required|string' }] : []),
  ];
  const csVars = (): C.StartupVariableDto[] => [
    { key: 'SRCDS_MAP', name: 'Default map', description: 'Map loaded on start.', value: 'de_dust2', editable: true, rules: 'required|string' },
    { key: 'MAX_PLAYERS', name: 'Player slots', description: 'Maximum connected players.', value: '24', editable: true, rules: 'required|integer|between:2,32' },
    { key: 'AMXMODX', name: 'AMX Mod X', description: 'Install AMX Mod X on start.', value: '1', editable: true, rules: 'required|boolean' },
  ];
  let startupVars: C.StartupVariableDto[] = app ? appVars() : cs ? csVars() : [
    { key: 'MINECRAFT_VERSION', name: 'Minecraft Version', description: 'The version of minecraft to download. Leave at latest to always get the latest version.', value: 'latest', editable: true, rules: 'nullable|string|max:20' },
    { key: 'SERVER_JARFILE', name: 'Server Jar File', description: 'The name of the server jarfile to run the server with.', value: 'server.jar', editable: true, rules: 'required|regex:/^([\\w\\d._-]+)(\\.jar)$/' },
    { key: 'BUILD_NUMBER', name: 'Build Number', description: 'The build number for the paper release.', value: 'latest', editable: false, rules: 'required|string|max:20' },
  ];
  let image = app ? (workload === 'python' ? 'ghcr.io/demo/yolks:python_3.13' : 'ghcr.io/demo/yolks:nodejs_22') : cs ? 'ghcr.io/demo/games:rehlds' : 'ghcr.io/demo/yolks:java_25';
  let settings = { name: 'my-game-server', description: '' };
  let members: C.MembersDto = { members: opts.empty ? [] : [{ id: 'm1', preset: 'operator', createdAt: '2026-10-19T10:00:00Z', name: 'Alex Pop', email: 'alex@example.com' }], invitations: [] };
  let players: C.PlayerInfoDto[] = game === 'none' || opts.empty ? [] : [{ index: 0, name: 'Steve_Builder', score: 0, duration: 4120, ping: 31, steamId: undefined }, { index: 1, name: 'Alex_Miner', score: 0, duration: 905, ping: 58 }];
  let moderation: C.ModerationRecordDto[] = opts.empty ? [] : [{ id: 'mod1', serviceId: 'svc_demo0001', actorUserId: 'u1', action: 'BAN', targetIdentifier: 'Griefer99', targetName: 'Griefer99', reason: 'Griefing spawn', durationMinutes: null, rconResponse: null, createdAt: '2026-10-14T19:30:00Z' }];
  const admin = (): C.GameAdministrationStatusDto => ({
    provider: 'PTERODACTYL', gameIdentity: game === 'minecraft' ? 'Minecraft: Java Edition' : 'Counter-Strike 2', detectionSource: 'GAME_PROFILE', gameProtocol: game === 'minecraft' ? 'minecraft' : 'source', queryMethod: game === 'minecraft' ? 'MINECRAFT_SLP' : 'A2S',
    supportedMethods: ['AUTOMATIC', 'NATIVE_CONSOLE', 'RCON'], selectedMethod: 'AUTOMATIC', effectiveProtocol: 'PTERODACTYL_CONSOLE', state: 'CONNECTED', queryHost: '203.0.113.20', queryPort: 25043, administrationHost: null, administrationPort: null,
    rconEnabled: null, credentialsConfigured: false, configurationSource: 'NATIVE_PROVIDER', lastSuccessfulTestAt: '2026-10-20T07:50:00Z', lastTestError: null, restartRequired: false,
    capabilities: { kick: true, ban: true, unban: true, reliablePlayerList: game === 'minecraft' }, message: 'Commands go through the native console.',
  });

  const pending: Array<() => void> = [];
  const power = (a: C.PowerSignal) => {
    if (a === 'START' || a === 'RESTART') { live = 'RUNNING'; runtime = 'RUNNING'; } else { live = 'OFFLINE'; runtime = 'OFFLINE'; players = []; }
  };

  const connect = (_id: string, h: ConsoleHandlers): ConsoleConnection => {
    let closed = false; const timers: ReturnType<typeof setInterval>[] = []; const to: ReturnType<typeof setTimeout>[] = [];
    h.onStatus('connecting');
    to.push(setTimeout(() => {
      if (closed) return;
      if (opts.consoleError) { h.onStatus(opts.consoleError.status === 403 ? 'denied' : 'error', opts.consoleError.message); return; }
      h.onStatus('connected'); h.onPowerState?.(live === 'RUNNING' ? 'running' : 'offline');
      if (live === 'RUNNING') LOGS[workload].forEach((l, i) => to.push(setTimeout(() => !closed && h.onLine(l), 35 * i)));
      timers.push(setInterval(() => {
        if (closed || live !== 'RUNNING') return;
        const t = (Date.now() - started) / 1000;
        h.onStats?.({ state: 'running', cpu_absolute: 2 + 1.5 * Math.sin(t / 3) + Math.random(), memory_bytes: (0.92 + 0.03 * Math.sin(t / 7)) * 1073741824, memory_limit_bytes: 1073741824, disk_bytes: 235 * 1048576, uptime: 13 * 3600000 + 26 * 60000 + t * 1000, network: { rx_bytes: t * 1200, tx_bytes: t * 3100 } });
      }, 1000));
    }, latency));
    return {
      send: async (cmd) => {
        await sleep(100);
        if (live !== 'RUNNING') throw new ServiceApiError('The server is not running, so the command was not sent.', 0, 'NOT_RUNNING');
        h.onLine(`\x1b[36m> ${cmd}\x1b[0m`);
        h.onLine(cmd === 'list' ? `There are ${players.length} of a max of ${cfg['max-players']} players online: ${players.map((p) => p.name).join(', ')}` : cmd.startsWith('say ') ? `[Server] ${cmd.slice(4)}` : 'Unknown or incomplete command, see below for error');
      },
      close: () => { closed = true; timers.forEach(clearInterval); to.forEach(clearTimeout); h.onStatus('closed'); },
    };
  };

  void pending;
  return {
    platform: { capabilities: (s) => call('platform', () => {
      if (opts.platform === 'unknown') throw new ServiceApiError('Could not read platform status.', 502, 'PROVIDER_ERROR');
      return { provisioning: { enabled: opts.platform !== 'not-configured', mode: 'pterodactyl_1', verification: opts.platform === 'verified' ? 'SANDBOX_VERIFIED' : 'CONFIGURED' } } satisfies C.PlatformCapabilitiesDto;
    }, s) },
    service: {
      get: (_id, s) => call('service', () => detail(), s),
      power: (_id, a) => call('service', () => {
        if (live === 'INSTALLING') throw new ServiceApiError('The server is still provisioning.', 403);
        power(a); return { success: true as const, serviceId: 'svc_demo0001', action: a, runtimeState: runtime };
      }),
      diagnose: (_id, logs) => call('service', (): C.DiagnosticReportDto => {
        if (opts.aiOff) throw new ServiceApiError('AI assistance is not configured.', 503, 'AI_NOT_CONFIGURED');
        const l = (logs ?? '').toLowerCase();
        if (l.includes('eaddrinuse')) return { category: 'PORT_CONFLICT', rootCause: 'The app binds a fixed port that is already in use (EADDRINUSE).', confidence: 0.95, severity: 'CRITICAL', recommendations: ['Read the port from process.env.PORT instead of hard-coding it.', 'Listen on 0.0.0.0, not localhost.'], relevantArticleSlugs: ['nodejs-port'], isGuardrailed: true, recommendedArticles: [{ slug: 'nodejs-port', title: 'Use the port Fortless assigns' }] };
        if (l.includes('module_not_found') || l.includes('cannot find module')) return { category: 'MISSING_DEPENDENCY', rootCause: 'A dependency is missing after the last install.', confidence: 0.88, severity: 'CRITICAL', recommendations: ['Run the build command again so dependencies install.', 'Commit your lockfile.'], relevantArticleSlugs: [], isGuardrailed: true, recommendedArticles: [] };
        return { category: 'GENERAL', rootCause: 'No known failure pattern was found in the logs you provided.', confidence: 0.4, severity: 'INFO', recommendations: ['Check the Console tab around the time of the problem.', 'Contact support if this keeps happening.'], relevantArticleSlugs: [], isGuardrailed: true, recommendedArticles: [] };
      }),
      usage: (_id, s) => call('service', (): C.UsageDto => live === 'RUNNING' ? { available: true, usage: { state: 'running', cpuPct: 2.2, memoryBytes: 0.92 * 1073741824, diskBytes: 235 * 1048576, uptimeMs: 13 * 3600000 } } : { available: false }, s),
      activity: (_id, f, s) => call('service', () => {
        const all: C.ActivityEventDto[] = [
          { id: 'e1', action: 'service.power.restart', actorType: 'USER', createdAt: '2026-10-19T20:25:00Z', metadata: '{"ip":"203.0.113.7"}' },
          { id: 'e2', action: 'service.file.write', actorType: 'USER', createdAt: '2026-10-19T19:10:00Z', metadata: '{"path":"/server.properties","bytes":412}' },
          { id: 'e3', action: 'service.backup.create', actorType: 'USER', createdAt: '2026-10-18T21:04:00Z', metadata: '{"name":"Before plugin update"}' },
          { id: 'e4', action: 'service.provisioned', actorType: 'SYSTEM', createdAt: '2026-10-19T17:40:00Z', metadata: '{}' },
        ].filter((e) => !f.q || e.action.includes(f.q));
        return { events: opts.empty ? [] : all, total: opts.empty ? 0 : all.length, page: f.page ?? 1, pageSize: 15 };
      }, s),
    },
    console: {
      connect,
      history: (_id, s) => call('console', () => ({ history: [{ id: 'c1', serviceId: 'svc_demo0001', actorUserId: 'u1', commandHash: 'x', commandRedacted: 'list', delivered: true, deliveryStatus: 'DELIVERED', createdAt: '2026-10-20T07:00:00Z' }] }), s),
      recordCommand: (_id, _c, _d) => call('console', () => undefined),
    },
    files: {
      list: (_id, dir, s) => call('files', () => {
        const d = dir === '/' ? '' : dir.replace(/\/$/, '');
        const entries: C.PanelFileEntryDto[] = [];
        for (const [k, n] of files) if (parentOf(k) === (d || '/')) entries.push({ name: baseOf(k), isFile: !n.dir, isSymlink: false, size: n.dir ? 4096 : n.content.length, mime: n.dir ? 'inode/directory' : 'text/plain', modifiedAt: '2026-10-19T19:10:00Z' });
        if (d && !files.has(d)) throw new ServiceApiError('Not found on the server.', 404, 'NOT_FOUND');
        return { dir: dir || '/', entries: entries.sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name)) };
      }, s),
      read: (_id, path, s) => call('files', () => { const n = files.get(path); if (!n || n.dir) throw new ServiceApiError('Not found on the server.', 404, 'NOT_FOUND'); if (n.content.length > MAX_EDIT_BYTES) throw new ServiceApiError('File is too large to edit here. Download it instead.', 413, 'FILE_TOO_LARGE'); return { path, content: n.content }; }, s),
      write: (_id, path, content) => mut('files', () => { files.set(path, { dir: false, content }); }),
      createFolder: (_id, dir, name) => mut('files', () => { const p = `${dir === '/' ? '' : dir}/${name}`; if (files.has(p)) throw new ServiceApiError('A file or folder with that name already exists.', 409, 'PANEL_REFUSED'); files.set(p, { dir: true }); }),
      remove: (_id, dir, names) => mut('files', () => { for (const n of names) { const p = `${dir === '/' ? '' : dir}/${n}`; for (const k of [...files.keys()]) if (k === p || k.startsWith(p + '/')) files.delete(k); } }),
      rename: (_id, dir, from, to) => mut('files', () => { const a = `${dir === '/' ? '' : dir}/${from}`; const b = `${dir === '/' ? '' : dir}/${to}`; if (files.has(b)) throw new ServiceApiError('A file or folder with that name already exists.', 409, 'PANEL_REFUSED'); for (const k of [...files.keys()]) if (k === a || k.startsWith(a + '/')) { files.set(b + k.slice(a.length), files.get(k)!); files.delete(k); } }),
      move: (_id, dir, name, dest) => mut('files', () => { const a = `${dir === '/' ? '' : dir}/${name}`; const b = `${dest === '/' ? '' : dest}/${name}`; for (const k of [...files.keys()]) if (k === a || k.startsWith(a + '/')) { files.set(b + k.slice(a.length), files.get(k)!); files.delete(k); } }),
      copy: (_id, path) => mut('files', () => { const n = files.get(path); if (n) files.set(path.replace(/(\.[^./]+)?$/, ' copy$1'), n); }),
      archive: (_id, dir, names) => call('files', () => { const name = `archive-${names.length}.tar.gz`; files.set(`${dir === '/' ? '' : dir}/${name}`, { dir: false, content: '' }); return { archive: name, pending: false }; }),
      unarchive: (_id, _d, _f) => mut('files', () => undefined),
      chmod: (_id, _d, _n, mode) => mut('files', () => { if (!/^[0-7]{3,4}$/.test(mode)) throw new ServiceApiError('Permissions must be an octal mode such as 644.', 400, 'INVALID_MODE'); }),
      pull: (_id, _d, url) => mut('files', () => { if (!url.startsWith('https://')) throw new ServiceApiError('Only public https addresses without credentials are allowed.', 400, 'INVALID_URL'); }),
      downloadUrl: (_id, path) => call('files', () => `https://node-01.demo.example/download/file?token=demo&file=${encodeURIComponent(path)}`),
      upload: (_id, dir, file, onProgress) => {
        let cancelled = false;
        const promise = (async () => { for (let p = 0; p <= 100; p += 20) { if (cancelled) throw new DOMException('Aborted', 'AbortError'); onProgress(p); await sleep(latency / 2); } files.set(`${dir === '/' ? '' : dir}/${file.name}`, { dir: false, content: '' }); })();
        return { promise, cancel: () => { cancelled = true; } };
      },
    },
    players: {
      status: (_id, s) => call('players', (): C.ServerStatusDto => {
        if (live !== 'RUNNING') return { supported: true, state: 'OFFLINE', gameType: 'minecraft', adapter: 'minecraft-slp', players: [] };
        if (game === 'none') return { supported: false, state: 'UNSUPPORTED', gameType: 'unknown', adapter: 'none', players: [], error: 'This game has no query adapter.' };
        return { supported: true, state: 'ONLINE', gameType: game, adapter: 'minecraft-slp', players, playerListReliability: game === 'minecraft' ? 'SAMPLED' : 'AUTHORITATIVE', administration: admin(),
          info: { name: 'A Minecraft Server', map: 'world', folder: '', game: 'Minecraft', players: players.length, maxPlayers: Number(cfg['max-players']), bots: 0, serverType: 'dedicated', environment: 'linux', visibility: 'public', vac: false, version: '26.3', pingMs: 23 } };
      }, s),
      kick: (_id, b) => call('players', () => { players = players.filter((p) => p.name !== b.targetIdentifier); moderation = [{ id: `m${Date.now()}`, serviceId: 'svc_demo0001', actorUserId: 'u1', action: 'KICK', targetIdentifier: b.targetIdentifier, targetName: b.targetName, reason: b.reason ?? null, durationMinutes: null, rconResponse: null, createdAt: new Date().toISOString() }, ...moderation]; return {}; }),
      ban: (_id, b) => call('players', () => { players = players.filter((p) => p.name !== b.targetIdentifier); moderation = [{ id: `m${Date.now()}`, serviceId: 'svc_demo0001', actorUserId: 'u1', action: 'BAN', targetIdentifier: b.targetIdentifier, targetName: b.targetName, reason: b.reason ?? null, durationMinutes: b.durationMinutes ?? null, rconResponse: null, createdAt: new Date().toISOString() }, ...moderation]; return {}; }),
      unban: (_id, b) => call('players', () => { moderation = [{ id: `m${Date.now()}`, serviceId: 'svc_demo0001', actorUserId: 'u1', action: 'UNBAN', targetIdentifier: b.targetIdentifier, targetName: b.targetName, reason: null, durationMinutes: null, rconResponse: null, createdAt: new Date().toISOString() }, ...moderation]; return {}; }),
      history: (_id, _p, _l, s) => call('players', () => ({ total: moderation.length, records: moderation }), s),
      administration: (_id, s) => call('players', () => ({ status: admin() }), s),
      detect: () => call('players', () => ({ status: admin() })),
      testAdministration: () => call('players', () => ({ success: true, status: admin() })),
      autoConfigure: () => call('players', () => ({ status: admin() })),
      saveAdministration: () => call('players', () => ({ status: admin() })),
      resetAdministration: () => call('players', () => ({ status: admin() })),
    },
    game: {
      info: (_id, s) => call('game', (): C.GameInfoDto => cs ? ({
        profile: { slug: 'goldsrc-cs16', name: workload === 'cs2' ? 'Counter-Strike 2' : 'Counter-Strike 1.6 (ReHLDS)', configFile: '/server.cfg', configExists: true, schema: csSchema, sources: [{ index: 0, label: 'AMX Mod X plugins', kind: 'plugins', dir: '/cstrike/addons/amxmodx/plugins' }], icon: false },
        values: csCfg, eula: 'unavailable', java: { gameVersion: null, recommended: null, current: null, matches: null, available: [] },
      }) : game !== 'minecraft' ? { profile: null } : ({
        profile: { slug: 'minecraft-java', name: 'Minecraft: Java Edition', configFile: '/server.properties', configExists: true, schema, sources: [{ index: 0, label: 'Plugins', kind: 'plugins', dir: '/plugins' }, { index: 1, label: 'Mods', kind: 'mods', dir: '/mods' }], icon: true },
        values: cfg, eula: 'accepted', java: { gameVersion: '26.3', recommended: 'ghcr.io/demo/yolks:java_25', current: image, matches: image.endsWith('java_25'), available: ['ghcr.io/demo/yolks:java_25', 'ghcr.io/demo/yolks:java_21'] },
      }), s),
      saveConfig: (_id, values) => call('game', () => { if (cs) { for (const [k, v] of Object.entries(values)) { if (k === 'mp_timelimit' && Number(v) > 120) throw new ServiceApiError('Time limit must be 120 or less.', 400, 'INVALID_CONFIG'); csCfg = { ...csCfg, [k]: v }; } return; } for (const [k, v] of Object.entries(values)) { if (k === 'max-players' && Number(v) > 100) throw new ServiceApiError('Max players must be a whole number from 1 to 100.', 400, 'INVALID_INPUT'); cfg = { ...cfg, [k]: String(v) }; } }),
      acceptEula: () => call('game', () => ({ accepted: true, restarted: true })),
      searchMods: (_id, f, s) => call('game', (): C.ModSearchDto => {
        if (cs) { const amx: Array<[string, string, string]> = [['amx-admin', 'Admin Base', 'Core admin commands, bans and kicks'], ['amx-maps', 'Map Manager', 'Vote for the next map'], ['amx-gg', 'GunGame', 'Progress through weapons with every kill'], ['amx-zm', 'Zombie Plague', 'Humans against zombies'], ['amx-dm', 'Deathmatch', 'Free-for-all with instant respawn']]; const hits = amx.filter(([, t]) => t.toLowerCase().includes(f.q.trim().toLowerCase())).map(([id, t, d]) => ({ projectId: id, slug: id, title: t, description: d, author: 'AMXX community', downloads: 12000, iconUrl: null })); return { gameVersion: null, hits, total: hits.length, page: f.page }; }
        const all = f.source === 0 ? [['AANobbMI', 'Chunky', 'Pre-generates chunks, quickly and efficiently'], ['P7dR8mSH', 'WorldEdit', 'A Minecraft map editor that runs in-game.'], ['hXiIvTyT', 'Simple Voice Chat', 'A working voice chat in Minecraft!']] : [['mod00001', 'Fabric API', 'Core API for Fabric mods']];
        const hits = all.filter(([, t]) => t!.toLowerCase().includes(f.q.trim().toLowerCase())).map(([id, t, d]) => ({ projectId: id!, slug: t!.toLowerCase().replace(/\s+/g, '-'), title: t!, description: d!, author: 'demo', downloads: 123456, iconUrl: null }));
        return { gameVersion: '26.3', hits, total: hits.length, page: f.page };
      }, s),
      installMod: (_id, b) => call('game', () => { if (b.projectId === 'P7dR8mSH') throw new ServiceApiError('No release of this project supports 26.3.', 404, 'NO_COMPATIBLE_VERSION'); installed.add(b.projectId); return { file: `${b.projectId}.jar`, dir: '/plugins', version: '1.0.0' }; }),
      setIcon: (_id, png) => call('game', () => { if (!/^[A-Za-z0-9+/=]+$/.test(png)) throw new ServiceApiError('Choose a PNG image.', 400, 'INVALID_ICON'); }),
      installed: (_id, _s, sig) => call('game', () => ({ dir: '/plugins', files: [...installed].map((n) => ({ name: `${n}.jar`, size: 1000, modifiedAt: '2026-10-20T08:00:00Z' })) }), sig),
    },
    fastdl: (() => {
      const supported = opts.fastdl ? opts.fastdl === 'supported' : workload === 'cs16';
      let cfgF: { autoSync: boolean; compressionMode: C.FastDlCompression; quotaBytes: number; cvarConfiguredAt: string | null } = { autoSync: true, compressionMode: 'bz2', quotaBytes: 5 * 1073741824, cvarConfiguredAt: null };
      let manifest: C.FastDlManifestItemDto[] = opts.empty ? [] : ['maps/de_dust2.bsp', 'maps/de_inferno.bsp', 'maps/de_nuke.bsp', 'models/player/vip/vip.mdl', 'sound/ambience/wind1.wav', 'sprites/zbeam1.spr', 'maps/cs_custom_rush.bsp'].map((f, i) => ({ id: `f${i}`, serviceId: 'svc_demo0001', filePath: `cstrike/${f}`, fileSize: 800000 + i * 910000, compressedSize: 300000 + i * 350000, fileHash: `sha256:${(i + 1).toString(16).repeat(8)}`, isCompressed: true, storageRelPath: `${f}.bz2`, status: i === 6 ? 'FAILED' : 'SYNCED', lastError: i === 6 ? 'File changed while being read.' : null, syncedAt: '2026-10-20T06:00:00Z' }));
      let job: { id: string; startedAt: number; total: number; cancelled: boolean; failed: boolean } | null = null;
      const jobDto = (): C.FastDlSyncJobDto | null => {
        if (!job) return null;
        const per = 450; const done = Math.min(job.total, Math.floor((Date.now() - job.startedAt) / per));
        const finished = job.cancelled || done >= job.total;
        return { id: job.id, serviceId: 'svc_demo0001', triggerType: 'MANUAL', status: job.cancelled ? 'CANCELLED' : finished ? (job.failed ? 'FAILED' : 'COMPLETED') : 'RUNNING', totalFiles: job.total, processedFiles: done, syncedFiles: done, deletedFiles: 0, failedFiles: finished && job.failed ? 1 : 0, totalBytes: job.total * 1500000, currentFile: finished ? null : `cstrike/maps/de_map_${done}.bsp`, errorMessage: finished && job.failed ? 'Could not read cstrike/maps/cs_custom_rush.bsp.' : null, startedAt: new Date(job.startedAt).toISOString(), completedAt: finished ? new Date().toISOString() : null, createdAt: new Date(job.startedAt).toISOString(), updatedAt: new Date().toISOString() };
      };
      const status = (): C.FastDlStatusDto => {
        if (!supported) return { supported: false, reason: 'This game engine does not support HTTP FastDL.' };
        const j = jobDto(); const active = j && (j.status === 'RUNNING' || j.status === 'QUEUED') ? j : null;
        const stored = manifest.filter((m) => m.status !== 'DELETED').reduce((a, m) => a + m.compressedSize, 0); const orig = manifest.reduce((a, m) => a + m.fileSize, 0);
        return { supported: true, profile: { slug: 'goldsrc-cs16', name: 'Counter-Strike 1.6', engine: 'goldsrc', gameDir: 'cstrike', assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx'], extensions: ['bsp', 'mdl', 'wav', 'spr', 'tga', 'res'], compression: 'bz2', configFile: 'cstrike/server.cfg', cvarTemplate: 'sv_downloadurl "{url}"', description: 'Players download maps and models over HTTP instead of the slow game protocol.' },
          config: { enabled: true, autoSync: cfgF.autoSync, compressionMode: cfgF.compressionMode, quotaBytes: cfgF.quotaBytes, customPublicUrl: null, lastSyncAt: '2026-10-20T06:00:00Z', cvarConfiguredAt: cfgF.cvarConfiguredAt, cvarBackupPath: cfgF.cvarConfiguredAt ? '/cstrike/server.cfg.fortless-backup' : null },
          stats: { totalFiles: manifest.length, totalOriginalBytes: orig, totalStoredBytes: stored, quotaBytes: cfgF.quotaBytes, percentUsed: Math.round((stored / cfgF.quotaBytes) * 1000) / 10, cvarConfigured: !!cfgF.cvarConfiguredAt }, activeJob: active, publicDownloadUrl: 'https://fastdl.demo.example/svc_demo0001/' };
      };
      return {
        status: (_id, s) => call('fastdl', status, s),
        sync: () => call('fastdl', () => { if (job && jobDto()?.status === 'RUNNING') throw new ServiceApiError('A sync is already running.', 409, 'SYNC_RUNNING'); job = { id: `job${Date.now()}`, startedAt: Date.now(), total: 8, cancelled: false, failed: false }; return jobDto()!; }),
        cancel: () => call('fastdl', () => { if (job) job.cancelled = true; return { cancelled: true }; }),
        retry: () => call('fastdl', () => { manifest = manifest.map((m) => (m.status === 'FAILED' ? { ...m, status: 'SYNCED' as const, lastError: null } : m)); job = { id: `job${Date.now()}`, startedAt: Date.now(), total: 4, cancelled: false, failed: false }; return jobDto()!; }),
        manifest: (_id, q, s) => call('fastdl', () => { const rows = manifest.filter((m) => (!q.status || m.status === q.status) && (!q.search || m.filePath.toLowerCase().includes(q.search.toLowerCase()))); return { items: rows.slice((q.page - 1) * q.limit, q.page * q.limit), total: rows.length, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(rows.length / q.limit)) }; }, s),
        configureCvar: () => call('fastdl', () => { cfgF = { ...cfgF, cvarConfiguredAt: '2026-10-20T09:31:00Z' }; return { success: true, backupPath: '/cstrike/server.cfg.fortless-backup', downloadUrl: 'https://fastdl.demo.example/svc_demo0001/' }; }),
        saveSettings: (_id, patch) => call('fastdl', () => { if (patch.quotaBytes !== undefined && patch.quotaBytes < 104857600) throw new ServiceApiError('The quota must be at least 100 MB.', 400, 'INVALID_QUOTA'); cfgF = { ...cfgF, ...patch }; return status(); }),
      };
    })(),
    backups: {
      list: (_id, s) => call('backups', () => ({ backups, limit: 3 }), s),
      create: (_id, b) => call('backups', () => { if (backups.length >= 3) throw new ServiceApiError('Backup limit reached. Delete one first.', 409, 'PANEL_REFUSED'); backups = [{ uuid: crypto.randomUUID(), name: b.name || 'Backup ' + (backups.length + 1), bytes: 318 * 1048576, createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), successful: true, locked: !!b.locked }, ...backups]; return { success: true, pending: false }; }),
      remove: (_id, u) => mut('backups', () => { if (backups.find((b) => b.uuid === u)?.locked) throw new ServiceApiError('Unlock this backup before deleting it.', 409, 'PANEL_REFUSED'); backups = backups.filter((b) => b.uuid !== u); }),
      lock: (_id, u) => mut('backups', () => { backups = backups.map((b) => (b.uuid === u ? { ...b, locked: !b.locked } : b)); }),
      restore: (_id, _u, _t) => call('backups', () => { if (live === 'RUNNING') throw new ServiceApiError('The server must be offline to restore a backup.', 409, 'PANEL_REFUSED'); return { success: true, pending: false }; }),
      downloadUrl: (_id, u) => call('backups', () => `https://node-01.demo.example/download/backup?token=demo&uuid=${u}`),
    },
    network: {
      list: (_id, s) => call('network', () => ({ allocations: allocs }), s),
      assign: () => mut('network', () => { if (allocs.length >= 4) throw new ServiceApiError('Allocation limit reached.', 409, 'PANEL_REFUSED'); allocs = [...allocs, { id: allocs.length + 5, ip: '203.0.113.20', alias: null, port: 25050 + allocs.length, notes: '', primary: false }]; }),
      setNotes: (_id, a, notes) => mut('network', () => { allocs = allocs.map((x) => (x.id === a ? { ...x, notes } : x)); }),
      setPrimary: (_id, a) => mut('network', () => { allocs = allocs.map((x) => ({ ...x, primary: x.id === a })); }),
      remove: (_id, a) => mut('network', () => { allocs = allocs.filter((x) => x.id !== a); }),
    },
    databases: {
      list: (_id, s) => call('databases', () => ({ databases: perms.includes('database.view_password') ? dbs : dbs.map((d) => ({ ...d, password: null })) }), s),
      create: (_id, b) => call('databases', () => { if (dbs.length >= 2) throw new ServiceApiError('Database limit reached.', 409, 'PANEL_REFUSED'); dbs = [...dbs, { id: String(dbs.length + 2), name: `s1_${b.name}`, username: `u1_${b.name}`, host: 'db.demo.example:3306', connectionsFrom: b.remote ?? '%', password: 'demo-not-a-real-password' }]; return { success: true, pending: false }; }),
      rotate: (_id, did) => call('databases', () => { const p = `demo-${Math.random().toString(36).slice(2, 10)}`; dbs = dbs.map((d) => (d.id === did ? { ...d, password: p } : d)); return { password: p }; }),
      remove: (_id, did) => mut('databases', () => { dbs = dbs.filter((d) => d.id !== did); }),
    },
    schedules: {
      list: (_id, s) => call('schedules', () => ({ schedules }), s),
      save: (_id, sid, i) => mut('schedules', () => { const cron = { minute: i.minute, hour: i.hour, dayOfMonth: i.dayOfMonth, month: i.month, dayOfWeek: i.dayOfWeek }; schedules = sid === null ? [...schedules, { id: Date.now() % 100000, name: i.name, cron, active: i.active, processing: false, onlyWhenOnline: i.onlyWhenOnline, lastRunAt: null, nextRunAt: null, tasks: [] }] : schedules.map((s) => (s.id === sid ? { ...s, name: i.name, cron, active: i.active, onlyWhenOnline: i.onlyWhenOnline } : s)); }),
      remove: (_id, sid) => mut('schedules', () => { schedules = schedules.filter((s) => s.id !== sid); }),
      execute: (_id, sid) => mut('schedules', () => { schedules = schedules.map((s) => (s.id === sid ? { ...s, lastRunAt: new Date().toISOString() } : s)); }),
      addTask: (_id, sid, t) => mut('schedules', () => { schedules = schedules.map((s) => (s.id === sid ? { ...s, tasks: [...s.tasks, { id: Date.now() % 100000, sequence: s.tasks.length + 1, action: t.action, payload: t.payload, offset: t.offset, continueOnFailure: t.continueOnFailure }] } : s)); }),
      updateTask: (_id, sid, tid, t) => mut('schedules', () => { schedules = schedules.map((s) => (s.id === sid ? { ...s, tasks: s.tasks.map((x) => (x.id === tid ? { ...x, ...t } : x)) } : s)); }),
      removeTask: (_id, sid, tid) => mut('schedules', () => { schedules = schedules.map((s) => (s.id === sid ? { ...s, tasks: s.tasks.filter((x) => x.id !== tid).map((x, i) => ({ ...x, sequence: i + 1 })) } : s)); }),
    },
    startup: {
      get: (_id, s) => call('startup', (): C.StartupDto => ({ command: app ? '{{START_COMMAND}}' : cs ? './hlds_run -game cstrike +maxplayers {{MAX_PLAYERS}} +map {{SRCDS_MAP}}' : 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}', images: app ? (workload === 'python' ? { 'Python 3.13': 'ghcr.io/demo/yolks:python_3.13', 'Python 3.12': 'ghcr.io/demo/yolks:python_3.12' } : { 'Node.js 22': 'ghcr.io/demo/yolks:nodejs_22', 'Node.js 20': 'ghcr.io/demo/yolks:nodejs_20' }) : cs ? { 'ReHLDS': 'ghcr.io/demo/games:rehlds' } : { 'Java 25': 'ghcr.io/demo/yolks:java_25', 'Java 21': 'ghcr.io/demo/yolks:java_21', 'Java 17': 'ghcr.io/demo/yolks:java_17' }, variables: startupVars }), s),
      setVariable: (_id, key, value) => mut('startup', () => { if (key === 'SERVER_JARFILE' && !/\.jar$/.test(value)) throw new ServiceApiError('The server jar file must end in .jar.', 409, 'PANEL_REFUSED'); startupVars = startupVars.map((v) => (v.key === key ? { ...v, value } : v)); }),
      setImage: (_id, i) => mut('startup', () => { image = i; }),
    },
    settings: {
      get: (_id, s) => call('settings', () => ({ ...settings, identifier: 'a1b2c3d4', uuid: 'a1b2c3d4-0000-0000-0000-000000000000', node: 'Demo-Node-01', image, sftp: { host: 'node-01.demo.example', port: 2022, username: 'demo_user.a1b2c3d4' } }), s),
      rename: (_id, name, description) => mut('settings', () => { if (name.trim().length < 3) throw new ServiceApiError('The name needs at least 3 characters.', 400, 'INVALID_INPUT'); settings = { name, description }; }),
      reinstall: () => mut('settings', () => { live = 'INSTALLING'; runtime = 'INSTALLING'; }),
      panelActivity: (_id, page, s) => call('settings', () => ({ events: [{ event: 'server:sftp.write', timestamp: '2026-10-19T19:12:00Z', api: false, actor: 'demo_user' }, { event: 'server:console.command', timestamp: '2026-10-19T19:10:00Z', api: true, actor: null }], page, pages: 1, total: 2 }), s),
    },
    members: {
      list: (_id, s) => call('members', () => members, s),
      invite: (_id, email, preset) => call('members', () => { members = { ...members, invitations: [...members.invitations, { id: `i${members.invitations.length + 1}`, email, preset, expiresAt: '2026-10-27T10:00:00Z', createdAt: new Date().toISOString() }] }; return { invitationId: 'i1' }; }),
      revoke: (_id, iid) => call('members', () => { members = { ...members, invitations: members.invitations.filter((i) => i.id !== iid) }; }),
      remove: (_id, mid) => call('members', () => { members = { ...members, members: members.members.filter((m) => m.id !== mid) }; }),
      setPreset: (_id, mid, preset) => call('members', () => { members = { ...members, members: members.members.map((m) => (m.id === mid ? { ...m, preset } : m)) }; }),
    },
  };
}
