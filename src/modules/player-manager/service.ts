import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import { ProviderNetworkError, PterodactylHttpAdapter, type ProviderAdapter } from '../provisioning/adapter.js';
import { ConsoleAccessError, decryptServiceSecret, encryptServiceSecret, resolveOwnedService, withAccountClientKey } from '../provisioning/console.js';
import { applyProperties, parseProperties, profileForEgg } from '../provisioning/game-profiles.js';
import { createServerPanelApi } from '../provisioning/server-panel.js';
import { queryA2SInfo, queryA2SPlayers, queryMinecraftPing } from './a2s.js';
import {
  buildBanCommand,
  buildKickCommand,
  buildUnbanCommand,
  GoldSrcRconClient,
  SourceRconClient,
  type GameRconClient,
} from './rcon.js';
import type {
  BanParams,
  AdministrationMethod,
  GameAdministrationStatus,
  ConsoleCommandRecord,
  KickParams,
  ModerationRecord,
  ProtocolType,
  ServerStatusResult,
  UnbanParams,
} from './types.js';

interface Ctx {
  serviceId: string;
  accountId: string;
  userId: string;
  role?: string;
  ipAddress?: string;
}

export interface PlayerManagerDeps {
  adapter?: ProviderAdapter;
  db?: Database.Database;
  secret?: string;
  queryA2SInfoFn?: typeof queryA2SInfo;
  queryA2SPlayersFn?: typeof queryA2SPlayers;
  queryMinecraftPingFn?: typeof queryMinecraftPing;
  rconClientFactory?: (gameType: string, host: string, port: number, password: string) => GameRconClient;
}

interface AdminConfigRow {
  selected_method: AdministrationMethod;
  administration_port: number | null;
  encrypted_password: string | null;
  last_successful_test_at: string | null;
  last_test_error: string | null;
  restart_required: number;
}

interface ResolvedAdministration {
  status: GameAdministrationStatus;
  password: string | null;
  externalId: string;
  ptero: PterodactylHttpAdapter;
  config: AdminConfigRow | null;
}

// User-level rate limiting for destructive player moderation (max 10 actions / min)
const moderationRateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MODERATION_ACTIONS_PER_MIN = 10;

function checkModerationRateLimit(userId: string): void {
  const now = Date.now();
  const times = (moderationRateLimit.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= MAX_MODERATION_ACTIONS_PER_MIN) {
    throw new ConsoleAccessError('Moderation rate limit exceeded. Please wait a minute before trying again.', 'RATE_LIMITED', 429);
  }
  times.push(now);
  moderationRateLimit.set(userId, times);
}

export function detectGameProtocol(eggName: string | null): { protocol: ProtocolType; gameType: string } {
  if (!eggName) return { protocol: 'unsupported', gameType: 'unknown' };
  const lower = eggName.toLowerCase();

  // FiveM check
  if (lower.includes('fivem') || lower.includes('cfx')) {
    return { protocol: 'unsupported', gameType: 'fivem' };
  }

  // Minecraft check
  if (
    lower.includes('minecraft') ||
    lower.includes('paper') ||
    lower.includes('spigot') ||
    lower.includes('purpur') ||
    lower.includes('bungeecord') ||
    lower.includes('velocity') ||
    lower.includes('forge') ||
    lower.includes('fabric') ||
    lower.includes('sponge')
  ) {
    return { protocol: 'minecraft', gameType: 'minecraft' };
  }

  // GoldSrc check
  if (
    lower.includes('counter-strike 1.6') ||
    lower.includes('cs 1.6') ||
    lower.includes('half-life 1') ||
    lower.includes('team fortress classic') ||
    lower.includes('day of defeat')
  ) {
    return { protocol: 'goldsrc', gameType: 'goldsrc' };
  }

  // Rust
  if (lower.includes('rust')) {
    return { protocol: 'rust', gameType: 'rust' };
  }

  // Source Engine (CS2, CS:GO, CS:S, GMod, TF2, L4D2, etc.)
  if (
    lower.includes('source') ||
    lower.includes('counter-strike') ||
    lower.includes('garry') ||
    lower.includes('team fortress') ||
    lower.includes('left 4 dead') ||
    lower.includes('ark') ||
    lower.includes('valheim') ||
    lower.includes('squad') ||
    lower.includes('insurgency')
  ) {
    return { protocol: 'source', gameType: 'source' };
  }

  return { protocol: 'unsupported', gameType: lower };
}

const SECRET_REDACT_REGEX = /(password|token|secret|key|rcon_password|rcon_pass)(\s*[=:]\s*|\s+)("[^"]*"|\S+)/gi;

export function redactSecrets(command: string): string {
  return command.replace(SECRET_REDACT_REGEX, '$1$2"***REDACTED***"');
}

export function createPlayerManagerService(deps: PlayerManagerDeps = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;
  const adapter = () => deps.adapter ?? getProviderAdapter();
  const panelApi = createServerPanelApi(deps);

  async function resolveTargetAllocation(ctx: Ctx): Promise<{ host: string; port: number; allocations: Array<{ id: number; ip: string; alias: string | null; port: number; primary: boolean }> }> {
    const d = db();
    const svcRow = d.prepare(`
      SELECT s.id, s.node_id, n.fqdn AS node_fqdn, n.name AS node_name
      FROM services s
      JOIN nodes n ON n.id = s.node_id
      WHERE s.id = ?
    `).get(ctx.serviceId) as { id: string; node_id: string; node_fqdn: string; node_name: string } | undefined;

    // Fetch allocations
    let allocs: Array<{ id: number; ip: string; alias: string | null; port: number; primary: boolean }> = [];
    try {
      const res = await panelApi.network(ctx);
      allocs = res.allocations;
    } catch {
      // ignore
    }

    const primary = allocs.find((a) => a.primary) ?? allocs[0];
    const port = primary?.port ?? 27015;
    const host = primary?.alias || svcRow?.node_fqdn || primary?.ip || '127.0.0.1';

    return { host, port, allocations: allocs };
  }

  const readConfig = (serviceId: string): AdminConfigRow | null => db().prepare(`
    SELECT selected_method, administration_port, encrypted_password, last_successful_test_at, last_test_error, restart_required
    FROM service_game_administration WHERE service_id = ?
  `).get(serviceId) as AdminConfigRow | undefined ?? null;

  const safeFile = async (ptero: PterodactylHttpAdapter, externalId: string, accountId: string, path: string): Promise<string | null> => {
    try {
      return await withAccountClientKey(accountId, ptero, db(), secret(), (key) => ptero.readFile(externalId, path, key));
    } catch { return null; }
  };

  async function resolveAdministration(ctx: Ctx, need = 'player.read'): Promise<ResolvedAdministration> {
    const { service, adapter: ptero } = resolveOwnedService(ctx, adapter(), db(), secret(), need);
    let eggName: string | null = null;
    try { eggName = await ptero.getServerEggName(service.external_id); } catch {}
    const profile = profileForEgg(db(), eggName);
    const detected = detectGameProtocol(profile ? `${profile.slug} ${profile.name} ${eggName ?? ''}` : eggName);
    const detectionSource = profile ? 'GAME_PROFILE' as const : eggName ? 'EGG_NAME_FALLBACK' as const : 'UNKNOWN' as const;
    const allocation = await resolveTargetAllocation(ctx);
    const cfg = readConfig(ctx.serviceId);
    let password: string | null = null;
    if (cfg?.encrypted_password) {
      try { password = decryptServiceSecret(cfg.encrypted_password); } catch {}
    }
    let rconEnabled: boolean | null = null;
    let detectedPort: number | null = null;
    let source: GameAdministrationStatus['configurationSource'] = cfg ? 'FORTLESS_OVERRIDE' : 'NONE';

    const desired = db().prepare('SELECT environment_variables FROM service_desired_configs WHERE service_id=?').get(ctx.serviceId) as { environment_variables: string } | undefined;
    if (desired?.environment_variables) {
      try {
        const env = JSON.parse(desired.environment_variables) as Record<string, unknown>;
        const envPassword = env['RCON_PASSWORD'] ?? env['RCON_PASS'];
        const envPort = Number(env['RCON_PORT'] ?? env['RCONPORT']);
        if (!password && typeof envPassword === 'string' && envPassword) password = envPassword;
        if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) detectedPort = envPort;
        if (!cfg && (password || detectedPort)) source = 'EGG_ENVIRONMENT';
      } catch {}
    }

    if (detected.protocol === 'minecraft') {
      const content = await safeFile(ptero, service.external_id, ctx.accountId, 'server.properties');
      if (content !== null) {
        const props = parseProperties(content);
        rconEnabled = props.get('enable-rcon')?.toLowerCase() === 'true';
        const parsedPort = Number(props.get('rcon.port'));
        if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) detectedPort = parsedPort;
        if (!password && props.get('rcon.password')) password = props.get('rcon.password') || null;
        if (!cfg && source === 'NONE') source = 'DETECTED_FILE';
      }
    } else if (detected.protocol === 'source' || detected.protocol === 'goldsrc') {
      const paths = detected.protocol === 'goldsrc'
        ? ['cstrike/server.cfg', 'valve/server.cfg', 'server.cfg']
        : ['cfg/server.cfg', 'csgo/cfg/server.cfg', 'garrysmod/cfg/server.cfg', 'server.cfg'];
      for (const path of paths) {
        const content = await safeFile(ptero, service.external_id, ctx.accountId, path);
        if (content === null) continue;
        const match = content.match(/^\s*rcon_password\s+["']?([^"'\r\n]+)["']?/im);
        if (!password && match?.[1]?.trim()) password = match[1].trim();
        rconEnabled = Boolean(match?.[1]?.trim());
        if (!cfg && source === 'NONE') source = 'DETECTED_FILE';
        break;
      }
    }

    const selected = cfg?.selected_method ?? 'AUTOMATIC';
    const native = detected.protocol === 'minecraft';
    const effectiveNative = selected === 'NATIVE_CONSOLE' || (selected === 'AUTOMATIC' && native);
    const rconPort = cfg?.administration_port ?? detectedPort ?? (detected.protocol === 'goldsrc' || detected.protocol === 'source' ? allocation.port : null);
    const allocated = rconPort !== null && allocation.allocations.some((a) => a.port === rconPort);
    const supportedMethods: AdministrationMethod[] = native ? ['AUTOMATIC', 'NATIVE_CONSOLE', 'RCON'] : detected.protocol === 'rust' || detected.protocol === 'unsupported' ? ['AUTOMATIC'] : ['AUTOMATIC', 'RCON'];
    const effectiveProtocol = effectiveNative ? 'PTERODACTYL_CONSOLE'
      : detected.protocol === 'minecraft' ? 'MINECRAFT_RCON'
      : detected.protocol === 'goldsrc' ? 'GOLDSRC_RCON'
      : detected.protocol === 'source' ? 'SOURCE_RCON'
      : detected.protocol === 'rust' ? 'RUST_WEBRCON' : 'UNSUPPORTED';
    let state: GameAdministrationStatus['state'];
    let message: string;
    if (effectiveNative) { state = 'AVAILABLE'; message = 'Fortless sends authorized commands through the native server console. RCON is not required.'; source = 'NATIVE_PROVIDER'; }
    else if (detected.protocol === 'rust' || detected.protocol === 'unsupported') { state = 'UNSUPPORTED'; message = detected.protocol === 'rust' ? 'Rust WebRCON is detected but is not enabled in this Fortless release.' : 'No verified administration transport is available for this game.'; }
    else if (detected.protocol === 'minecraft' && rconEnabled === false) { state = 'DISABLED'; message = 'RCON is disabled in the game configuration.'; }
    else if (!password) { state = 'SETUP_REQUIRED'; message = 'An RCON password is required.'; }
    else if (!rconPort || !allocated) { state = 'UNREACHABLE'; message = 'The RCON port is not assigned to this server. Add the port in Network before testing it.'; }
    else { state = cfg?.last_successful_test_at ? 'CONNECTED' : 'AVAILABLE'; message = 'RCON is configured. Test the connection before moderation.'; }

    return {
      externalId: service.external_id, ptero, password, config: cfg,
      status: {
        provider: 'PTERODACTYL', gameIdentity: profile?.name ?? eggName ?? 'Unknown game', detectionSource,
        gameProtocol: detected.protocol, queryMethod: detected.protocol === 'minecraft' ? 'MINECRAFT_SLP' : detected.protocol === 'source' || detected.protocol === 'goldsrc' ? 'A2S' : 'NONE',
        supportedMethods, selectedMethod: selected, effectiveProtocol, state,
        queryHost: allocation.host, queryPort: allocation.port, administrationHost: effectiveNative ? null : allocation.host,
        administrationPort: effectiveNative ? null : rconPort, rconEnabled, credentialsConfigured: Boolean(password), configurationSource: source,
        lastSuccessfulTestAt: cfg?.last_successful_test_at ?? null, lastTestError: cfg?.last_test_error ?? null,
        restartRequired: Boolean(cfg?.restart_required), capabilities: { kick: effectiveProtocol !== 'UNSUPPORTED' && effectiveProtocol !== 'RUST_WEBRCON', ban: effectiveProtocol !== 'UNSUPPORTED' && effectiveProtocol !== 'RUST_WEBRCON', unban: effectiveProtocol !== 'UNSUPPORTED' && effectiveProtocol !== 'RUST_WEBRCON', reliablePlayerList: false }, message,
      },
    };
  }

  const audit = (ctx: Ctx, action: string, metadata: Record<string, unknown>) => db().prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', ?, 'service', ?, ?, ?, ?)
  `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, action, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`, JSON.stringify(metadata));

  const nativeCommand = async (ctx: Ctx, resolved: ResolvedAdministration, command: string): Promise<'SUBMITTED' | 'UNKNOWN'> => {
    try {
      await withAccountClientKey(ctx.accountId, resolved.ptero, db(), secret(), (key) => resolved.ptero.clientServerCall(resolved.externalId, key, 'POST', '/command', { command }));
      return 'SUBMITTED';
    } catch (err) {
      if (err instanceof ProviderNetworkError) return 'UNKNOWN';
      throw err;
    }
  };

  const validateMinecraftTarget = (value: string) => {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(value)) throw new ConsoleAccessError('Choose a valid Minecraft player name.', 'INVALID_PLAYER', 400);
  };

  async function executeModeration(ctx: Ctx, action: 'KICK' | 'BAN' | 'UNBAN', input: KickParams | BanParams | UnbanParams): Promise<{ success: boolean; accepted: boolean; outcome: 'SUBMITTED' | 'UNKNOWN' | 'CONFIRMED'; message: string }> {
    checkModerationRateLimit(ctx.userId);
    const resolved = await resolveAdministration(ctx, 'player.moderate');
    if (!resolved.status.capabilities[action.toLowerCase() as 'kick' | 'ban' | 'unban']) throw new ConsoleAccessError(`${action.toLowerCase()} is unsupported for this game.`, 'UNSUPPORTED_OPERATION', 422);
    const gameType = resolved.status.gameProtocol;
    const duration = 'durationMinutes' in input ? input.durationMinutes ?? 0 : 0;
    const command = action === 'KICK' ? buildKickCommand(gameType, input.targetIdentifier, input.targetName, 'reason' in input ? input.reason : undefined)
      : action === 'BAN' ? buildBanCommand(gameType, input.targetIdentifier, input.targetName, duration, 'reason' in input ? input.reason : undefined)
      : buildUnbanCommand(gameType, input.targetIdentifier, input.targetName);
    let providerResponse = '';
    let outcome: 'SUBMITTED' | 'UNKNOWN' | 'CONFIRMED';
    if (resolved.status.effectiveProtocol === 'PTERODACTYL_CONSOLE') {
      validateMinecraftTarget(input.targetName);
      outcome = await nativeCommand(ctx, resolved, command);
      providerResponse = outcome === 'UNKNOWN' ? 'Provider response was not received; command outcome is unknown.' : 'Command accepted by provider.';
    } else {
      if (!resolved.password) throw new ConsoleAccessError('RCON password is not configured. Open Game Administration to configure it.', 'RCON_NOT_CONFIGURED', 422);
      if (!resolved.status.administrationPort || resolved.status.state === 'UNREACHABLE') throw new ConsoleAccessError('RCON port is not allocated to this server.', 'RCON_PORT_NOT_ALLOCATED', 422);
      const host = resolved.status.administrationHost!;
      const port = resolved.status.administrationPort;
      const client = deps.rconClientFactory ? deps.rconClientFactory(gameType, host, port, resolved.password)
        : gameType === 'goldsrc' ? new GoldSrcRconClient(host, port, resolved.password, 3500, true)
        : new SourceRconClient(host, port, resolved.password, 4000, true);
      try { await client.connect(); providerResponse = await client.execute(command); outcome = 'SUBMITTED'; }
      catch (err: any) { throw new ConsoleAccessError(`RCON command failed: ${err.message}`, err.code || 'RCON_EXEC_FAILED', err.statusCode || 502); }
      finally { await client.disconnect().catch(() => {}); }
    }
    const reason = 'reason' in input ? input.reason : undefined;
    db().prepare(`INSERT INTO player_moderation_log (id, service_id, actor_user_id, action, target_identifier, target_name, reason, duration_minutes, rcon_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`pml_${crypto.randomUUID()}`, ctx.serviceId, ctx.userId, action, input.targetIdentifier, input.targetName, reason || null, action === 'BAN' ? duration : null, providerResponse);
    audit(ctx, `player.${action.toLowerCase()}`, { targetName: input.targetName, targetIdentifier: input.targetIdentifier, durationMinutes: action === 'BAN' ? duration : undefined, reason, transport: resolved.status.effectiveProtocol, outcome });
    const verb = action === 'KICK' ? 'Kick' : action === 'BAN' ? 'Ban' : 'Unban';
    return { success: outcome !== 'UNKNOWN', accepted: true, outcome, message: outcome === 'UNKNOWN' ? `${verb} command may have been submitted, but the provider response was lost. Check the console before retrying.` : `${verb} command submitted for “${input.targetName}”.` };
  }

  return {
    async inspectExistingServices(): Promise<{ services: Array<Record<string, unknown>> }> {
      const ptero = adapter();
      if (!(ptero instanceof PterodactylHttpAdapter)) return { services: [] };
      const rows = db().prepare(`SELECT s.id, s.external_id, s.contract_status, c.selected_method, c.administration_port,
        CASE WHEN c.encrypted_password IS NULL THEN 0 ELSE 1 END AS credentials_configured, c.last_successful_test_at, c.last_test_error
        FROM services s LEFT JOIN service_game_administration c ON c.service_id=s.id
        WHERE s.provider_type='PTERODACTYL' AND s.external_id IS NOT NULL ORDER BY s.created_at DESC`).all() as any[];
      const services = await Promise.all(rows.map(async (row) => {
        let eggName: string | null = null;
        try { eggName = await ptero.getServerEggName(row.external_id); } catch {}
        const profile = profileForEgg(db(), eggName);
        const detected = detectGameProtocol(profile ? `${profile.slug} ${profile.name} ${eggName ?? ''}` : eggName);
        return { serviceId: row.id, serviceState: row.contract_status, gameIdentity: profile?.name ?? eggName ?? 'Unknown', gameProtocol: detected.protocol,
          detectionSource: profile ? 'GAME_PROFILE' : eggName ? 'EGG_NAME_FALLBACK' : 'UNKNOWN', selectedMethod: row.selected_method ?? 'AUTOMATIC',
          administrationPort: row.administration_port ?? null, credentialsConfigured: Boolean(row.credentials_configured), lastSuccessfulTestAt: row.last_successful_test_at ?? null, lastTestError: row.last_test_error ?? null };
      }));
      return { services };
    },

    async getServerStatus(ctx: Ctx): Promise<ServerStatusResult> {
      const { service, adapter: ptero } = resolveOwnedService(ctx, adapter(), db(), secret(), 'player.read');

      // 1. Egg name & game capability
      let eggName: string | null = null;
      try {
        eggName = await ptero.getServerEggName(service.external_id);
      } catch {
        // Fallback
      }

      const administration = (await resolveAdministration(ctx)).status;
      const protocol = administration.gameProtocol;
      const gameType = protocol === 'unsupported' ? detectGameProtocol(eggName).gameType : protocol;

      if (protocol === 'unsupported') {
        return {
          supported: false,
          state: 'UNSUPPORTED',
          gameType,
          adapter: 'none',
          players: [],
          administration,
          error:
            gameType === 'fivem'
              ? 'FiveM does not support headless RCON player administration.'
              : `Game administration is not supported for ${eggName || 'this application'}.`,
        };
      }

      // 2. Resolve address
      const { host, port } = await resolveTargetAllocation(ctx);

      // 3. Query based on protocol
      try {
        if (protocol === 'minecraft') {
          const fn = deps.queryMinecraftPingFn ?? queryMinecraftPing;
          const { info, players } = await fn(host, port);
          return {
            supported: true,
            state: 'ONLINE',
            gameType,
            adapter: 'minecraft-slp',
            info,
            players,
            playerListReliability: 'SAMPLED',
            administration,
          };
        } else {
          // A2S Query
          const infoFn = deps.queryA2SInfoFn ?? queryA2SInfo;
          const playersFn = deps.queryA2SPlayersFn ?? queryA2SPlayers;

          const [info, players] = await Promise.all([
            infoFn(host, port),
            playersFn(host, port).catch(() => []),
          ]);

          return {
            supported: true,
            state: 'ONLINE',
            gameType,
            adapter: protocol,
            info,
            players,
            playerListReliability: 'BEST_EFFORT',
            administration,
          };
        }
      } catch (err: any) {
        return {
          supported: true,
          state: 'OFFLINE',
          gameType,
          adapter: protocol,
          players: [],
          administration,
          error: err.message || 'Server did not respond to status query',
        };
      }
    },

    async getAdministration(ctx: Ctx): Promise<GameAdministrationStatus> {
      return (await resolveAdministration(ctx)).status;
    },

    async saveAdministration(ctx: Ctx, input: Record<string, unknown>): Promise<{ status: GameAdministrationStatus; recoveryFile: string | null }> {
      const resolved = await resolveAdministration(ctx, 'startup.update');
      const method = String(input['method'] ?? 'AUTOMATIC') as AdministrationMethod;
      if (!resolved.status.supportedMethods.includes(method)) throw new ConsoleAccessError('That administration method is not supported for this game.', 'UNSUPPORTED_METHOD', 422);
      const portRaw = input['port'];
      const port = portRaw === null || portRaw === undefined || portRaw === '' ? null : Number(portRaw);
      if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new ConsoleAccessError('Port must be between 1 and 65535.', 'INVALID_PORT', 400);
      if (method === 'RCON' && port !== null) {
        const network = await resolveTargetAllocation(ctx);
        if (!network.allocations.some((a) => a.port === port)) throw new ConsoleAccessError('That port is not allocated to this server. Add it in Network first.', 'RCON_PORT_NOT_ALLOCATED', 422);
      }
      const newPassword = typeof input['password'] === 'string' ? input['password'] : '';
      if (newPassword && (newPassword.length < 8 || newPassword.length > 191 || /[\r\n\0]/.test(newPassword))) throw new ConsoleAccessError('RCON password must be 8–191 characters on one line.', 'INVALID_PASSWORD', 400);
      const encrypted = newPassword ? encryptServiceSecret(newPassword) : resolved.config?.encrypted_password ?? null;
      db().prepare(`
        INSERT INTO service_game_administration (service_id, selected_method, administration_port, encrypted_password, updated_by_user_id, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now','utc'))
        ON CONFLICT(service_id) DO UPDATE SET selected_method=excluded.selected_method, administration_port=excluded.administration_port,
          encrypted_password=excluded.encrypted_password, updated_by_user_id=excluded.updated_by_user_id, updated_at=excluded.updated_at
      `).run(ctx.serviceId, method, port, encrypted, ctx.userId);

      let recoveryFile: string | null = null;
      if (input['syncToServer'] === true) {
        const automaticRcon = method === 'AUTOMATIC' && (resolved.status.gameProtocol === 'source' || resolved.status.gameProtocol === 'goldsrc');
        if (method !== 'RCON' && !automaticRcon) throw new ConsoleAccessError('Select RCON before writing RCON settings to the game server.', 'RCON_METHOD_REQUIRED', 422);
        const password = newPassword || resolved.password;
        if (!password && method === 'RCON') throw new ConsoleAccessError('Set an RCON password before synchronizing.', 'RCON_NOT_CONFIGURED', 422);
        const game = resolved.status.gameProtocol;
        const path = game === 'minecraft' ? 'server.properties' : game === 'goldsrc' ? 'cstrike/server.cfg' : game === 'source' ? 'cfg/server.cfg' : null;
        if (!path) throw new ConsoleAccessError('Fortless cannot safely update this game configuration.', 'SYNC_UNSUPPORTED', 422);
        const before = await safeFile(resolved.ptero, resolved.externalId, ctx.accountId, path) ?? '';
        let after = before;
        if (game === 'minecraft') {
          const changes: Record<string, string> = { 'enable-rcon': input['rconEnabled'] === false ? 'false' : 'true' };
          if (password) changes['rcon.password'] = password;
          if (port) changes['rcon.port'] = String(port);
          after = applyProperties(before, changes);
        } else if (password) {
          const line = `rcon_password "${password.replace(/["\\]/g, '')}"`;
          after = /^\s*rcon_password\s+.*$/im.test(before) ? before.replace(/^\s*rcon_password\s+.*$/im, line) : `${before.replace(/\s*$/, '\n')}${line}\n`;
        }
        recoveryFile = `${path}.copy`;
        await withAccountClientKey(ctx.accountId, resolved.ptero, db(), secret(), async (key) => {
          if (before) await resolved.ptero.copyFile(resolved.externalId, path, key);
          await resolved.ptero.writeFile(resolved.externalId, path, after, key);
        });
        db().prepare("UPDATE service_game_administration SET restart_required=1 WHERE service_id=?").run(ctx.serviceId);
      }
      audit(ctx, 'service.game_administration.updated', { method, port, credentialsChanged: Boolean(newPassword), syncedToServer: input['syncToServer'] === true, recoveryFile });
      return { status: (await resolveAdministration(ctx)).status, recoveryFile };
    },

    async resetAdministration(ctx: Ctx): Promise<GameAdministrationStatus> {
      resolveOwnedService(ctx, adapter(), db(), secret(), 'startup.update');
      db().prepare('DELETE FROM service_game_administration WHERE service_id=?').run(ctx.serviceId);
      audit(ctx, 'service.game_administration.reset', {});
      return (await resolveAdministration(ctx)).status;
    },

    async testAdministration(ctx: Ctx): Promise<{ success: boolean; status: GameAdministrationStatus }> {
      const resolved = await resolveAdministration(ctx, 'player.moderate');
      if (resolved.status.effectiveProtocol === 'PTERODACTYL_CONSOLE') {
        db().prepare("INSERT INTO service_game_administration (service_id,last_tested_at,last_successful_test_at,updated_by_user_id) VALUES (?,datetime('now','utc'),datetime('now','utc'),?) ON CONFLICT(service_id) DO UPDATE SET last_tested_at=datetime('now','utc'),last_successful_test_at=datetime('now','utc'),last_test_error=NULL").run(ctx.serviceId, ctx.userId);
        return { success: true, status: (await resolveAdministration(ctx)).status };
      }
      if (!resolved.password) throw new ConsoleAccessError('RCON password is missing.', 'RCON_NOT_CONFIGURED', 422);
      if (!resolved.status.administrationPort || resolved.status.state === 'UNREACHABLE') throw new ConsoleAccessError('RCON port is not allocated to this server.', 'RCON_PORT_NOT_ALLOCATED', 422);
      const game = resolved.status.gameProtocol;
      const client = deps.rconClientFactory ? deps.rconClientFactory(game, resolved.status.administrationHost!, resolved.status.administrationPort, resolved.password)
        : game === 'goldsrc' ? new GoldSrcRconClient(resolved.status.administrationHost!, resolved.status.administrationPort, resolved.password, 3500, true)
        : new SourceRconClient(resolved.status.administrationHost!, resolved.status.administrationPort, resolved.password, 4000, true);
      try {
        await client.connect();
        await client.execute(game === 'minecraft' ? 'list' : 'status');
        db().prepare("UPDATE service_game_administration SET last_tested_at=datetime('now','utc'),last_successful_test_at=datetime('now','utc'),last_test_error=NULL WHERE service_id=?").run(ctx.serviceId);
      } catch (err: any) {
        const safeError = err?.code === 'AUTH_FAILED' ? 'Authentication failed.' : err?.code === 'TIMEOUT' ? 'Connection timed out.' : 'Connection failed.';
        db().prepare("UPDATE service_game_administration SET last_tested_at=datetime('now','utc'),last_test_error=? WHERE service_id=?").run(safeError, ctx.serviceId);
        throw new ConsoleAccessError(safeError, err?.code || 'RCON_TEST_FAILED', err?.statusCode || 502);
      } finally { await client.disconnect().catch(() => {}); }
      audit(ctx, 'service.game_administration.tested', { protocol: resolved.status.effectiveProtocol, success: true });
      return { success: true, status: (await resolveAdministration(ctx)).status };
    },

    async kickPlayer(ctx: Ctx, params: KickParams) { return executeModeration(ctx, 'KICK', params); },
    async banPlayer(ctx: Ctx, params: BanParams) { return executeModeration(ctx, 'BAN', params); },
    async unbanPlayer(ctx: Ctx, params: UnbanParams) { return executeModeration(ctx, 'UNBAN', params); },

    getModerationHistory(ctx: Ctx, page = 0, limit = 25): { records: ModerationRecord[]; total: number } {
      resolveOwnedService(ctx, adapter(), db(), secret(), 'player.read');
      const d = db();
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, page) * safeLimit;

      const total = (d.prepare('SELECT COUNT(*) as count FROM player_moderation_log WHERE service_id = ?')
        .get(ctx.serviceId) as { count: number })?.count ?? 0;

      const rows = d.prepare(`
        SELECT id, service_id, actor_user_id, action, target_identifier, target_name, reason, duration_minutes, rcon_response, created_at
        FROM player_moderation_log
        WHERE service_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ? OFFSET ?
      `).all(ctx.serviceId, safeLimit, safeOffset) as any[];

      return {
        total,
        records: rows.map((r) => ({
          id: r.id,
          serviceId: r.service_id,
          actorUserId: r.actor_user_id,
          action: r.action,
          targetIdentifier: r.target_identifier,
          targetName: r.target_name,
          reason: r.reason,
          durationMinutes: r.duration_minutes,
          rconResponse: r.rcon_response,
          createdAt: r.created_at,
        })),
      };
    },

    recordCommand(ctx: Ctx, command: string, delivered = true, deliveryStatus = 'DELIVERED'): ConsoleCommandRecord {
      resolveOwnedService(ctx, adapter(), db(), secret(), 'control.console');
      const trimmed = command.trim();
      if (!trimmed) throw new ConsoleAccessError('Command cannot be empty', 'INVALID_COMMAND', 400);

      const commandHash = crypto.createHash('sha256').update(trimmed).digest('hex');
      const redacted = redactSecrets(trimmed);
      const id = `cch_${crypto.randomUUID()}`;

      db().prepare(`
        INSERT INTO console_command_history (id, service_id, actor_user_id, actor_role, command_hash, command_redacted, delivered, delivery_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, ctx.serviceId, ctx.userId, ctx.role || 'USER', commandHash, redacted, delivered ? 1 : 0, deliveryStatus);

      return {
        id,
        serviceId: ctx.serviceId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        commandHash,
        commandRedacted: redacted,
        delivered,
        deliveryStatus,
        createdAt: new Date().toISOString(),
      };
    },

    getCommandHistory(ctx: Ctx, limit = 50): ConsoleCommandRecord[] {
      resolveOwnedService(ctx, adapter(), db(), secret(), 'websocket.connect');
      const safeLimit = Math.min(Math.max(1, limit), 100);

      const rows = db().prepare(`
        SELECT id, service_id, actor_user_id, actor_role, command_hash, command_redacted, delivered, delivery_status, created_at
        FROM console_command_history
        WHERE service_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
      `).all(ctx.serviceId, safeLimit) as any[];

      return rows.map((r) => ({
        id: r.id,
        serviceId: r.service_id,
        actorUserId: r.actor_user_id,
        actorRole: r.actor_role,
        commandHash: r.command_hash,
        commandRedacted: r.command_redacted,
        delivered: Boolean(r.delivered),
        deliveryStatus: r.delivery_status,
        createdAt: r.created_at,
      }));
    },
  };
}
