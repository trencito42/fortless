import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  parseA2SInfoResponse,
  parseA2SPlayerResponse,
} from '../src/modules/player-manager/a2s.js';
import {
  buildKickCommand,
  buildBanCommand,
  RconError,
} from '../src/modules/player-manager/rcon.js';
import {
  detectGameProtocol,
  redactSecrets,
  createPlayerManagerService,
} from '../src/modules/player-manager/service.js';
import { ProviderNetworkError, PterodactylHttpAdapter } from '../src/modules/provisioning/adapter.js';
import { ConsoleAccessError } from '../src/modules/provisioning/console.js';

class MockPteroAdapter extends PterodactylHttpAdapter {
  eggName = 'Counter-Strike 2';
  fileContent = 'rcon_password "TestSecretPass123"';
  submittedCommands: string[] = [];
  allocationPorts = [27015];
  commandTimeout = false;
  writtenFile: { path: string; content: string } | null = null;
  copiedFiles: string[] = [];

  constructor(egg = 'Counter-Strike 2', file = 'rcon_password "TestSecretPass123"') {
    super({ panelUrl: 'https://panel.example.test', apiKey: 'test_key_0123456789' });
    this.eggName = egg;
    this.fileContent = file;
  }

  override async getServerEggName() {
    return this.eggName;
  }

  override async mintAccountClientKey() {
    return 'ptlc_test_client_key_01234567890123456789';
  }

  override async assignServerOwner() { return false; }

  override async readFile() {
    return this.fileContent;
  }

  override async writeFile(_externalId: string, path: string, content: string) { this.writtenFile = { path, content }; }
  override async copyFile(_externalId: string, path: string) { this.copiedFiles.push(path); }

  override async clientServerCall(_externalId: string, _key: string, _method: any, subpath: string, body?: any) {
    if (subpath === '/network/allocations') return { data: this.allocationPorts.map((port, index) => ({ attributes: { id: index + 1, ip: '203.0.113.10', ip_alias: 'games.example.test', port, is_default: index === 0 } })) };
    if (subpath === '/command') { this.submittedCommands.push(String(body?.command ?? '')); if (this.commandTimeout) throw new ProviderNetworkError('timeout'); return {}; }
    return {};
  }
}

describe('Player Manager & Game Administration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Protocol Parsers', () => {
    it('parses Source Engine A2S_INFO packet correctly', () => {
      // Construct a mock Source A2S_INFO packet (0x49)
      const parts: Buffer[] = [
        Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49]), // Header + 0x49
        Buffer.from([0x11]), // protocol 17
        Buffer.from('Fortless CS2 Server\0', 'utf8'), // server name
        Buffer.from('de_dust2\0', 'utf8'), // map
        Buffer.from('cs2\0', 'utf8'), // folder
        Buffer.from('Counter-Strike 2\0', 'utf8'), // game
        Buffer.from([0x90, 0x02]), // steam app id (656)
        Buffer.from([0x08]), // 8 players
        Buffer.from([0x14]), // 20 max players
        Buffer.from([0x01]), // 1 bot
        Buffer.from('d', 'ascii'), // dedicated
        Buffer.from('l', 'ascii'), // linux
        Buffer.from([0x00]), // public
        Buffer.from([0x01]), // VAC secured
        Buffer.from('1.39.8.5\0', 'utf8'), // version
      ];
      const packet = Buffer.concat(parts);
      const info = parseA2SInfoResponse(packet, 24);

      expect(info.name).toBe('Fortless CS2 Server');
      expect(info.map).toBe('de_dust2');
      expect(info.game).toBe('Counter-Strike 2');
      expect(info.players).toBe(8);
      expect(info.maxPlayers).toBe(20);
      expect(info.bots).toBe(1);
      expect(info.serverType).toBe('dedicated');
      expect(info.environment).toBe('linux');
      expect(info.visibility).toBe('public');
      expect(info.vac).toBe(true);
      expect(info.version).toBe('1.39.8.5');
      expect(info.pingMs).toBe(24);
    });

    it('parses GoldSrc Engine A2S_INFO packet correctly', () => {
      const parts: Buffer[] = [
        Buffer.from([0xff, 0xff, 0xff, 0xff, 0x6d]), // Header + 0x6d
        Buffer.from('127.0.0.1:27015\0', 'ascii'),
        Buffer.from('Oldschool CS 1.6\0', 'utf8'),
        Buffer.from('de_inferno\0', 'utf8'),
        Buffer.from('cstrike\0', 'utf8'),
        Buffer.from('Counter-Strike 1.6\0', 'utf8'),
        Buffer.from([0x05]), // 5 players
        Buffer.from([0x20]), // 32 max players
        Buffer.from([48]), // protocol 48
        Buffer.from('d', 'ascii'), // dedicated
        Buffer.from('l', 'ascii'), // linux
        Buffer.from([0x00]), // public
      ];
      const packet = Buffer.concat(parts);
      const info = parseA2SInfoResponse(packet, 15);

      expect(info.name).toBe('Oldschool CS 1.6');
      expect(info.map).toBe('de_inferno');
      expect(info.players).toBe(5);
      expect(info.maxPlayers).toBe(32);
      expect(info.protocol).toBe(48);
    });

    it('parses A2S_PLAYER packet correctly', () => {
      const p1 = Buffer.concat([
        Buffer.from([0x00]), // index
        Buffer.from('PlayerOne\0', 'utf8'),
        Buffer.from([12, 0, 0, 0]), // score 12
        Buffer.from([0x00, 0x00, 0xa0, 0x43]), // 320.0 seconds (float32 LE)
      ]);
      const p2 = Buffer.concat([
        Buffer.from([0x01]),
        Buffer.from('PlayerTwo\0', 'utf8'),
        Buffer.from([25, 0, 0, 0]), // score 25
        Buffer.from([0x00, 0x00, 0x20, 0x44]), // 640.0 seconds
      ]);

      const packet = Buffer.concat([
        Buffer.from([0xff, 0xff, 0xff, 0xff, 0x44]), // Header + 0x44
        Buffer.from([0x02]), // 2 players
        p1,
        p2,
      ]);

      const players = parseA2SPlayerResponse(packet);
      expect(players.length).toBe(2);
      // Sorted by score descending
      expect(players[0]!.name).toBe('PlayerTwo');
      expect(players[0]!.score).toBe(25);
      expect(players[0]!.duration).toBe(640);

      expect(players[1]!.name).toBe('PlayerOne');
      expect(players[1]!.score).toBe(12);
      expect(players[1]!.duration).toBe(320);
    });
  });

  describe('Game Protocol Detection', () => {
    it('detects Minecraft Java varieties', () => {
      expect(detectGameProtocol('Minecraft Paper').protocol).toBe('minecraft');
      expect(detectGameProtocol('Minecraft Spigot').protocol).toBe('minecraft');
      expect(detectGameProtocol('Purpur Minecraft').protocol).toBe('minecraft');
      expect(detectGameProtocol('BungeeCord').protocol).toBe('minecraft');
    });

    it('detects GoldSrc engines', () => {
      expect(detectGameProtocol('Counter-Strike 1.6').protocol).toBe('goldsrc');
      expect(detectGameProtocol('Half-Life 1').protocol).toBe('goldsrc');
    });

    it('detects Source engines', () => {
      expect(detectGameProtocol('Counter-Strike: Global Offensive').protocol).toBe('source');
      expect(detectGameProtocol('Counter-Strike 2').protocol).toBe('source');
      expect(detectGameProtocol("Garry's Mod").protocol).toBe('source');
      expect(detectGameProtocol('Team Fortress 2').protocol).toBe('source');
    });

    it('detects Rust', () => {
      expect(detectGameProtocol('Rust').protocol).toBe('rust');
    });

    it('fails closed on FiveM as unsupported', () => {
      const res = detectGameProtocol('FiveM Server');
      expect(res.protocol).toBe('unsupported');
      expect(res.gameType).toBe('fivem');
    });

    it('fails closed on unknown or null egg', () => {
      expect(detectGameProtocol(null).protocol).toBe('unsupported');
      expect(detectGameProtocol('NodeJS Web App').protocol).toBe('unsupported');
    });
  });

  describe('Command Formatting & Redaction', () => {
    it('builds kick commands per engine', () => {
      expect(buildKickCommand('minecraft', '1', 'Steve', 'Griefing')).toBe('kick Steve Griefing');
      expect(buildKickCommand('source', '12', 'Player1', 'AFK')).toBe('kickid 12 "AFK"');
      expect(buildKickCommand('goldsrc', '3', 'Player1')).toBe('kick #3 "Kicked by administrator"');
      expect(buildKickCommand('rust', '76561198000000000', 'Player1', 'Toxic')).toBe('kick "76561198000000000" "Toxic"');
      expect(() => buildKickCommand('fivem', '1', 'Steve')).toThrow(RconError);
    });

    it('builds ban commands per engine', () => {
      expect(buildBanCommand('minecraft', '1', 'Steve', 60, 'Rules')).toBe('ban Steve Rules');
      expect(buildBanCommand('minecraft', '1', 'Steve', 0, 'Cheating')).toBe('ban Steve Cheating');
      expect(buildBanCommand('source', 'STEAM_0:1:12345', 'Player1', 120)).toBe('banid 120 "STEAM_0:1:12345" kick; writeid');
      expect(() => buildBanCommand('fivem', '1', 'Steve')).toThrow(RconError);
    });

    it('redacts sensitive credentials before storing command history', () => {
      expect(redactSecrets('rcon_password supersecret123')).toBe('rcon_password "***REDACTED***"');
      expect(redactSecrets('set password=MySecretPass')).toBe('set password="***REDACTED***"');
      expect(redactSecrets('sv_setsteamaccount "0123456789ABCDEF"')).toBe('sv_setsteamaccount "0123456789ABCDEF"');
      expect(redactSecrets('say hello everyone')).toBe('say hello everyone');
    });
  });

  describe('Player Manager Service & Security Isolation', () => {
    const accountA = 'acc_tenant_a';
    const accountB = 'acc_tenant_b';
    const userA = 'usr_tenant_a';
    const userB = 'usr_tenant_b';
    const serviceId = 'svc_test_cs2';

    beforeEach(() => {
      db.exec('PRAGMA foreign_keys = OFF;');
      // Seed users and accounts with owner_user_id
      db.prepare("INSERT INTO users (id, email, password_hash, name, status) VALUES (?, 'a@test.com', 'h', 'User A', 'ACTIVE')").run(userA);
      db.prepare("INSERT INTO users (id, email, password_hash, name, status) VALUES (?, 'b@test.com', 'h', 'User B', 'ACTIVE')").run(userB);
      db.prepare("INSERT INTO accounts (id, name, status, owner_user_id, billing_email) VALUES (?, 'Tenant A', 'ACTIVE', ?, 'a@test.com')").run(accountA, userA);
      db.prepare("INSERT INTO accounts (id, name, status, owner_user_id, billing_email) VALUES (?, 'Tenant B', 'ACTIVE', ?, 'b@test.com')").run(accountB, userB);

      db.prepare(`
        INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb)
        VALUES ('node_test_1', 'reg_eu', 'ptero_1', 'Node 1', 'node1.fortless.net', 65536, 1048576)
      `).run();

      db.prepare(`
        INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, external_id, identifier, contract_status, node_id)
        VALUES (?, ?, 'item_1', 'PTERODACTYL', 'ptero_1', '101', 'srv101', 'ACTIVE', 'node_test_1')
      `).run(serviceId, accountA);
      db.prepare("INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, 1001, 'tenant_a', 'a@test.com', 'acct-a')").run(accountA);
    });

    it('enforces multi-tenant isolation: Tenant B cannot query or moderate Tenant A service', async () => {
      const pm = createPlayerManagerService({ db });

      // Tenant B tries to query Tenant A's service
      await expect(
        pm.getServerStatus({
          serviceId,
          accountId: accountB,
          userId: userB,
          role: 'OWNER',
        })
      ).rejects.toThrow(ConsoleAccessError);

      // Tenant B tries to kick a player
      await expect(
        pm.kickPlayer(
          {
            serviceId,
            accountId: accountB,
            userId: userB,
            role: 'OWNER',
          },
          { targetIdentifier: '1', targetName: 'Troll' }
        )
      ).rejects.toThrow(ConsoleAccessError);
    });

    it('returns honest UNSUPPORTED state for non-game services', async () => {
      const mockAdapter = new MockPteroAdapter('FiveM Server');
      const pm = createPlayerManagerService({
        db,
        adapter: mockAdapter,
        secret: 'test-keymint-secret-must-be-32-chars-long-012345',
      });

      const status = await pm.getServerStatus({
        serviceId,
        accountId: accountA,
        userId: userA,
        role: 'OWNER',
      });

      expect(status.supported).toBe(false);
      expect(status.state).toBe('UNSUPPORTED');
      expect(status.gameType).toBe('fivem');
      expect(status.players).toEqual([]);
      expect(status.error).toContain('FiveM');
    });

    it('queries and returns live player list for Source games', async () => {
      const mockAdapter = new MockPteroAdapter('Counter-Strike 2');
      const mockInfo = {
        name: 'Fortless Match Server',
        map: 'de_mirage',
        folder: 'cs2',
        game: 'Counter-Strike 2',
        players: 2,
        maxPlayers: 10,
        bots: 0,
        serverType: 'dedicated' as const,
        environment: 'linux' as const,
        visibility: 'public' as const,
        vac: true,
        version: '1.0',
        pingMs: 12,
      };
      const mockPlayers = [
        { index: 1, name: 'AWPer', score: 18, duration: 450 },
        { index: 2, name: 'Clutcher', score: 14, duration: 380 },
      ];

      const pm = createPlayerManagerService({
        db,
        adapter: mockAdapter,
        secret: 'test-keymint-secret-must-be-32-chars-long-012345',
        queryA2SInfoFn: async () => mockInfo,
        queryA2SPlayersFn: async () => mockPlayers,
      });

      const res = await pm.getServerStatus({
        serviceId,
        accountId: accountA,
        userId: userA,
        role: 'OWNER',
      });

      expect(res.supported).toBe(true);
      expect(res.state).toBe('ONLINE');
      expect(res.players.length).toBe(2);
      expect(res.players[0]!.name).toBe('AWPer');
      expect(res.info?.name).toBe('Fortless Match Server');
    });

    it('moderation kick and ban log to player_moderation_log and audit_events', async () => {
      let executedCommand = '';
      const mockAdapter = new MockPteroAdapter('Counter-Strike 2', 'rcon_password "TestSecretPass123"');
      const mockRcon: any = {
        connect: async () => {},
        execute: async (cmd: string) => {
          executedCommand = cmd;
          return 'Command executed';
        },
        disconnect: async () => {},
      };

      const pm = createPlayerManagerService({
        db,
        adapter: mockAdapter,
        secret: 'test-keymint-secret-must-be-32-chars-long-012345',
        rconClientFactory: () => mockRcon,
      });

      const ctx = {
        serviceId,
        accountId: accountA,
        userId: userA,
        role: 'OWNER',
      };

      // 1. Kick
      const kickRes = await pm.kickPlayer(ctx, {
        targetIdentifier: '5',
        targetName: 'BadActor',
        reason: 'Griefing teammates',
      });
      expect(kickRes.success).toBe(true);
      expect(executedCommand).toContain('kickid 5');

      // Check log
      const log = pm.getModerationHistory(ctx);
      expect(log.total).toBe(1);
      expect(log.records[0]!.action).toBe('KICK');
      expect(log.records[0]!.targetName).toBe('BadActor');
      expect(log.records[0]!.reason).toBe('Griefing teammates');

      // 2. Ban
      const banRes = await pm.banPlayer(ctx, {
        targetIdentifier: 'STEAM_0:1:99999',
        targetName: 'Hacker',
        durationMinutes: 1440,
        reason: 'Spinbot',
      });
      expect(banRes.success).toBe(true);
      expect(executedCommand).toContain('banid 1440');

      const logAfterBan = pm.getModerationHistory(ctx);
      expect(logAfterBan.total).toBe(2);
      expect(logAfterBan.records[0]!.action).toBe('BAN');
      expect(logAfterBan.records[0]!.durationMinutes).toBe(1440);
    });

    it('uses native Pterodactyl commands for Minecraft kick, ban and unban without RCON', async () => {
      const mockAdapter = new MockPteroAdapter('Paper Minecraft', 'enable-rcon=false\nrcon.port=25575\n');
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

      expect((await pm.kickPlayer(ctx, { targetIdentifier: 'Steve', targetName: 'Steve', reason: 'AFK' })).outcome).toBe('SUBMITTED');
      expect((await pm.banPlayer(ctx, { targetIdentifier: 'Alex', targetName: 'Alex', reason: 'Cheating' })).outcome).toBe('SUBMITTED');
      expect((await pm.unbanPlayer(ctx, { targetIdentifier: 'Alex', targetName: 'Alex' })).outcome).toBe('SUBMITTED');
      expect(mockAdapter.submittedCommands).toEqual(['kick Steve AFK', 'ban Alex Cheating', 'pardon Alex']);
      expect((await pm.getAdministration(ctx)).effectiveProtocol).toBe('PTERODACTYL_CONSOLE');
    });

    it('discovers disabled Minecraft RCON and keeps its distinct administration port', async () => {
      const mockAdapter = new MockPteroAdapter('Minecraft Java', 'server-port=25565\nenable-rcon=false\nrcon.port=25575\nrcon.password=secret-value\n');
      mockAdapter.allocationPorts = [25565, 25575];
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const status = await pm.getAdministration({ serviceId, accountId: accountA, userId: userA, role: 'OWNER' });
      expect(status.queryPort).toBe(25565);
      expect(status.selectedMethod).toBe('AUTOMATIC');
      expect(status.effectiveProtocol).toBe('PTERODACTYL_CONSOLE');
      expect(status.rconEnabled).toBe(false);
    });

    it('persists encrypted manual overrides without returning credentials and resets to automatic', async () => {
      const mockAdapter = new MockPteroAdapter('Counter-Strike 1.6', 'rcon_password "detected-secret"');
      mockAdapter.allocationPorts = [27015, 27020];
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };
      const saved = await pm.saveAdministration(ctx, { method: 'RCON', port: 27020, password: 'manual-secret-123' });
      expect(saved.status.administrationPort).toBe(27020);
      expect(saved.status.credentialsConfigured).toBe(true);
      expect(JSON.stringify(saved)).not.toContain('manual-secret-123');
      const row = db.prepare('SELECT encrypted_password FROM service_game_administration WHERE service_id=?').get(serviceId) as any;
      expect(row.encrypted_password).not.toContain('manual-secret-123');
      expect((await pm.resetAdministration(ctx)).selectedMethod).toBe('AUTOMATIC');
    });

    it('updates Minecraft RCON properties while preserving unrelated settings and creating recovery copy', async () => {
      const mockAdapter = new MockPteroAdapter('Minecraft Java', '# keep this comment\nmotd=Fortless\nenable-rcon=false\nrcon.port=25575\n');
      mockAdapter.allocationPorts = [25565, 25575];
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };
      const result = await pm.saveAdministration(ctx, { method: 'RCON', port: 25575, password: 'new-rcon-secret', syncToServer: true });
      expect(mockAdapter.copiedFiles).toEqual(['server.properties']);
      expect(mockAdapter.writtenFile?.content).toContain('# keep this comment');
      expect(mockAdapter.writtenFile?.content).toContain('motd=Fortless');
      expect(mockAdapter.writtenFile?.content).toContain('enable-rcon=true');
      expect(mockAdapter.writtenFile?.content).toContain('rcon.password=new-rcon-secret');
      expect(result.recoveryFile).toBe('server.properties.copy');
      expect(result.status.restartRequired).toBe(true);
    });

    it('reports an unknown native-command outcome instead of claiming success or retrying', async () => {
      const mockAdapter = new MockPteroAdapter('Paper Minecraft', 'enable-rcon=false\n');
      mockAdapter.commandTimeout = true;
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const result = await pm.kickPlayer({ serviceId, accountId: accountA, userId: 'usr_timeout', role: 'OWNER' }, { targetIdentifier: 'Steve', targetName: 'Steve' });
      expect(result.success).toBe(false);
      expect(result.outcome).toBe('UNKNOWN');
      expect(mockAdapter.submittedCommands).toHaveLength(1);
    });

    it('reports missing and incorrect RCON credentials with typed failures', async () => {
      const missingAdapter = new MockPteroAdapter('Counter-Strike 2', 'hostname "Fortless"');
      const missing = createPlayerManagerService({ db, adapter: missingAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      const missingCtx = { serviceId, accountId: accountA, userId: 'usr_missing_rcon', role: 'OWNER' };
      expect((await missing.getAdministration(missingCtx)).state).toBe('SETUP_REQUIRED');
      await expect(missing.kickPlayer(missingCtx, { targetIdentifier: '1', targetName: 'Player' })).rejects.toMatchObject({ code: 'RCON_NOT_CONFIGURED' });

      const badClient = { connect: async () => { throw new RconError('bad password', 'AUTH_FAILED', 401); }, execute: async () => '', disconnect: async () => {} };
      const incorrect = createPlayerManagerService({ db, adapter: missingAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345', rconClientFactory: () => badClient });
      await incorrect.saveAdministration(missingCtx, { method: 'RCON', port: 27015, password: 'incorrect-password' });
      await expect(incorrect.testAdministration(missingCtx)).rejects.toMatchObject({ code: 'AUTH_FAILED', statusCode: 401 });
    });

    it('dispatches CS 1.6 moderation using the GoldSrc transport and game allocation', async () => {
      const mockAdapter = new MockPteroAdapter('Counter-Strike 1.6', 'rcon_password "goldsrc-secret"');
      let transport = ''; let targetPort = 0; let command = '';
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345', rconClientFactory: (game, _host, port) => {
        transport = game; targetPort = port;
        return { connect: async () => {}, execute: async (value) => { command = value; return 'ok'; }, disconnect: async () => {} };
      } });
      await pm.kickPlayer({ serviceId, accountId: accountA, userId: 'usr_goldsrc', role: 'OWNER' }, { targetIdentifier: '7', targetName: 'Player' });
      expect(transport).toBe('goldsrc');
      expect(targetPort).toBe(27015);
      expect(command).toContain('kick #7');
    });

    it('prevents cross-account administration changes and unallocated RCON ports', async () => {
      const mockAdapter = new MockPteroAdapter('Counter-Strike 2');
      const pm = createPlayerManagerService({ db, adapter: mockAdapter, secret: 'test-keymint-secret-must-be-32-chars-long-012345' });
      await expect(pm.saveAdministration({ serviceId, accountId: accountB, userId: userB, role: 'OWNER' }, { method: 'RCON', port: 27015, password: 'safe-password' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(pm.saveAdministration({ serviceId, accountId: accountA, userId: userA, role: 'OWNER' }, { method: 'RCON', port: 29999, password: 'safe-password' })).rejects.toMatchObject({ code: 'RCON_PORT_NOT_ALLOCATED' });
    });

    it('enforces moderation rate limiting (max 10 actions/minute per user)', async () => {
      const mockAdapter = new MockPteroAdapter('Counter-Strike 2', 'rcon_password "Secret123"');
      const mockRcon: any = {
        connect: async () => {},
        execute: async () => 'ok',
        disconnect: async () => {},
      };

      const pm = createPlayerManagerService({
        db,
        adapter: mockAdapter,
        secret: 'test-keymint-secret-must-be-32-chars-long-012345',
        rconClientFactory: () => mockRcon,
      });

      const ctx = {
        serviceId,
        accountId: accountA,
        userId: 'usr_rapid_mod',
        role: 'OWNER',
      };

      // Perform 10 actions
      for (let i = 0; i < 10; i++) {
        await pm.kickPlayer(ctx, { targetIdentifier: `${i}`, targetName: `P${i}` });
      }

      // 11th action must fail with 429 RATE_LIMITED
      await expect(
        pm.kickPlayer(ctx, { targetIdentifier: '11', targetName: 'P11' })
      ).rejects.toThrow('Moderation rate limit exceeded');
    });

    it('records console commands with secret tokens redacted into console_command_history', () => {
      const pm = createPlayerManagerService({
        db,
        adapter: new MockPteroAdapter(),
        secret: 'test-keymint-secret-must-be-32-chars-long-012345',
      });

      const ctx = {
        serviceId,
        accountId: accountA,
        userId: userA,
        role: 'OWNER',
      };

      const record = pm.recordCommand(ctx, 'rcon_password supersecretpass');
      expect(record.commandRedacted).toBe('rcon_password "***REDACTED***"');
      expect(record.commandHash).toBeDefined();

      const history = pm.getCommandHistory(ctx);
      expect(history.length).toBe(1);
      expect(history[0]!.commandRedacted).toBe('rcon_password "***REDACTED***"');
      expect(history[0]!.delivered).toBe(true);
    });
  });
});
