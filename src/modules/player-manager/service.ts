import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import type { ProviderAdapter, PterodactylHttpAdapter } from '../provisioning/adapter.js';
import { ConsoleAccessError, resolveOwnedService } from '../provisioning/console.js';
import { parseProperties } from '../provisioning/game-profiles.js';
import { createServerPanelApi } from '../provisioning/server-panel.js';
import { queryA2SInfo, queryA2SPlayers, queryMinecraftPing } from './a2s.js';
import {
  buildBanCommand,
  buildKickCommand,
  GoldSrcRconClient,
  SourceRconClient,
  type GameRconClient,
} from './rcon.js';
import type {
  BanParams,
  ConsoleCommandRecord,
  KickParams,
  ModerationRecord,
  ProtocolType,
  ServerStatusResult,
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

  async function resolveTargetAllocation(ctx: Ctx): Promise<{ host: string; port: number }> {
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

    return { host, port };
  }

  return {
    async getServerStatus(ctx: Ctx): Promise<ServerStatusResult> {
      const { service, adapter: ptero } = resolveOwnedService(ctx, adapter(), db(), secret(), 'player.read');

      // 1. Egg name & game capability
      let eggName: string | null = null;
      try {
        eggName = await ptero.getServerEggName(service.external_id);
      } catch {
        // Fallback
      }

      const { protocol, gameType } = detectGameProtocol(eggName);

      if (protocol === 'unsupported') {
        return {
          supported: false,
          state: 'UNSUPPORTED',
          gameType,
          adapter: 'none',
          players: [],
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
          };
        }
      } catch (err: any) {
        return {
          supported: true,
          state: 'OFFLINE',
          gameType,
          adapter: protocol,
          players: [],
          error: err.message || 'Server did not respond to status query',
        };
      }
    },

    async resolveRconPassword(ctx: Ctx, gameType: string, ptero: PterodactylHttpAdapter, externalId: string): Promise<string> {
      // 1. Try environment variables from panel or service_desired_configs
      const desired = db().prepare('SELECT environment_variables FROM service_desired_configs WHERE service_id = ?')
        .get(ctx.serviceId) as { environment_variables: string } | undefined;

      if (desired?.environment_variables) {
        try {
          const env = JSON.parse(desired.environment_variables);
          if (env['RCON_PASSWORD']) return String(env['RCON_PASSWORD']);
          if (env['RCON_PASS']) return String(env['RCON_PASS']);
        } catch {}
      }

      // 2. Read config file based on game type
      try {
        if (gameType === 'minecraft') {
          const content = await ptero.readFile(externalId, 'server.properties', await ptero.mintAccountClientKey(ctx.accountId, secret()));
          const props = parseProperties(content);
          const rconPass = props.get('rcon.password');
          if (rconPass) return rconPass;
        } else if (gameType === 'source' || gameType === 'goldsrc') {
          // Read server.cfg
          const paths = ['cfg/server.cfg', 'cstrike/server.cfg', 'csgo/cfg/server.cfg', 'server.cfg'];
          for (const p of paths) {
            try {
              const content = await ptero.readFile(externalId, p, await ptero.mintAccountClientKey(ctx.accountId, secret()));
              const match = content.match(/rcon_password\s+["']?([^"'\r\n]+)["']?/i);
              if (match && match[1] && match[1].trim()) return match[1].trim();
            } catch {}
          }
        }
      } catch {}

      throw new ConsoleAccessError(
        'RCON password is not configured on this server. Please ensure an RCON password is set in your server settings.',
        'RCON_NOT_CONFIGURED',
        422
      );
    },

    async kickPlayer(ctx: Ctx, params: KickParams): Promise<{ success: boolean; message: string }> {
      checkModerationRateLimit(ctx.userId);
      const { service, adapter: ptero } = resolveOwnedService(ctx, adapter(), db(), secret(), 'player.moderate');

      let eggName: string | null = null;
      try { eggName = await ptero.getServerEggName(service.external_id); } catch {}
      const { protocol, gameType } = detectGameProtocol(eggName);

      if (protocol === 'unsupported') {
        throw new ConsoleAccessError(`Player kick is unsupported for ${eggName || 'this game'}.`, 'UNSUPPORTED_OPERATION', 422);
      }

      const { host, port } = await resolveTargetAllocation(ctx);
      const rconPassword = await this.resolveRconPassword(ctx, gameType, ptero, service.external_id);

      const cmd = buildKickCommand(gameType, params.targetIdentifier, params.targetName, params.reason);

      let rcon: GameRconClient;
      if (deps.rconClientFactory) {
        rcon = deps.rconClientFactory(gameType, host, port, rconPassword);
      } else if (protocol === 'goldsrc') {
        rcon = new GoldSrcRconClient(host, port, rconPassword);
      } else {
        rcon = new SourceRconClient(host, port, rconPassword);
      }

      let rconRes = '';
      try {
        await rcon.connect();
        rconRes = await rcon.execute(cmd);
      } catch (err: any) {
        throw new ConsoleAccessError(`Failed to execute kick via RCON: ${err.message}`, 'RCON_EXEC_FAILED', 502);
      } finally {
        await rcon.disconnect().catch(() => {});
      }

      // Record in player_moderation_log
      const logId = `pml_${crypto.randomUUID()}`;
      db().prepare(`
        INSERT INTO player_moderation_log (id, service_id, actor_user_id, action, target_identifier, target_name, reason, duration_minutes, rcon_response)
        VALUES (?, ?, ?, 'KICK', ?, ?, ?, NULL, ?)
      `).run(logId, ctx.serviceId, ctx.userId, params.targetIdentifier, params.targetName, params.reason || null, rconRes);

      // Audit event
      db().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, ?, ?, 'USER', 'player.kick', 'service', ?, ?, ?)
      `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, ctx.serviceId, `corr_${crypto.randomUUID()}`, JSON.stringify({
        targetName: params.targetName,
        targetIdentifier: params.targetIdentifier,
        reason: params.reason,
      }));

      return { success: true, message: `Kicked player "${params.targetName}".` };
    },

    async banPlayer(ctx: Ctx, params: BanParams): Promise<{ success: boolean; message: string }> {
      checkModerationRateLimit(ctx.userId);
      const { service, adapter: ptero } = resolveOwnedService(ctx, adapter(), db(), secret(), 'player.moderate');

      let eggName: string | null = null;
      try { eggName = await ptero.getServerEggName(service.external_id); } catch {}
      const { protocol, gameType } = detectGameProtocol(eggName);

      if (protocol === 'unsupported') {
        throw new ConsoleAccessError(`Player ban is unsupported for ${eggName || 'this game'}.`, 'UNSUPPORTED_OPERATION', 422);
      }

      const { host, port } = await resolveTargetAllocation(ctx);
      const rconPassword = await this.resolveRconPassword(ctx, gameType, ptero, service.external_id);

      const duration = params.durationMinutes ?? 0;
      const cmd = buildBanCommand(gameType, params.targetIdentifier, params.targetName, duration, params.reason);

      let rcon: GameRconClient;
      if (deps.rconClientFactory) {
        rcon = deps.rconClientFactory(gameType, host, port, rconPassword);
      } else if (protocol === 'goldsrc') {
        rcon = new GoldSrcRconClient(host, port, rconPassword);
      } else {
        rcon = new SourceRconClient(host, port, rconPassword);
      }

      let rconRes = '';
      try {
        await rcon.connect();
        rconRes = await rcon.execute(cmd);
      } catch (err: any) {
        throw new ConsoleAccessError(`Failed to execute ban via RCON: ${err.message}`, 'RCON_EXEC_FAILED', 502);
      } finally {
        await rcon.disconnect().catch(() => {});
      }

      // Record in player_moderation_log
      const logId = `pml_${crypto.randomUUID()}`;
      db().prepare(`
        INSERT INTO player_moderation_log (id, service_id, actor_user_id, action, target_identifier, target_name, reason, duration_minutes, rcon_response)
        VALUES (?, ?, ?, 'BAN', ?, ?, ?, ?, ?)
      `).run(logId, ctx.serviceId, ctx.userId, params.targetIdentifier, params.targetName, params.reason || null, duration, rconRes);

      // Audit event
      db().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, ?, ?, 'USER', 'player.ban', 'service', ?, ?, ?)
      `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, ctx.serviceId, `corr_${crypto.randomUUID()}`, JSON.stringify({
        targetName: params.targetName,
        targetIdentifier: params.targetIdentifier,
        durationMinutes: duration,
        reason: params.reason,
      }));

      return { success: true, message: `Banned player "${params.targetName}".` };
    },

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
