import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  WORKLOAD_DEFINITIONS,
  getWorkloadDefinition,
  listWorkloads,
  validateDeploymentSpec,
  DeploymentValidationError,
  resolveEggForWorkload,
  EggMappingError,
  runPostProvisionTasks,
  type DeploymentSpecification,
} from '../src/modules/deployment/index.js';
import { PterodactylHttpAdapter } from '../src/modules/provisioning/adapter.js';

class MockPteroInventoryAdapter extends PterodactylHttpAdapter {
  writtenFiles: Array<{ path: string; content: string }> = [];

  constructor() {
    super({ panelUrl: 'https://panel.example.test', apiKey: 'test_token_1234567890' });
  }

  override async getInventory() {
    return {
      checkedAt: new Date().toISOString(),
      locations: [{ id: 1, short: 'fra', long: 'Frankfurt' }],
      nodes: [{ id: 1, name: 'node-1', locationId: 1, fqdn: 'node1.test', memoryMb: 65536, diskMb: 1048576, allocatedMemoryMb: 0, allocatedDiskMb: 0, maintenanceMode: false }],
      nests: [
        { id: 1, name: 'Minecraft', author: 'support@pterodactyl.io' },
        { id: 2, name: 'Source Engine', author: 'support@pterodactyl.io' },
        { id: 3, name: 'Generic', author: 'support@pterodactyl.io' },
      ],
      eggs: [
        { id: 101, nestId: 1, name: 'Paper', dockerImage: 'ghcr.io/pterodactyl/yolks:java_17' },
        { id: 102, nestId: 1, name: 'Fabric', dockerImage: 'ghcr.io/pterodactyl/yolks:java_17' },
        { id: 103, nestId: 1, name: 'Minecraft Java', dockerImage: 'ghcr.io/pterodactyl/yolks:java_17' },
        { id: 201, nestId: 2, name: 'Counter-Strike 1.6', dockerImage: 'ghcr.io/parkervcp/games:source' },
        { id: 202, nestId: 2, name: 'Counter-Strike 2', dockerImage: 'ghcr.io/parkervcp/steamcmd:debian' },
        { id: 301, nestId: 3, name: 'Discord Bot Node.js', dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20' },
        { id: 302, nestId: 3, name: 'Discord Bot Python', dockerImage: 'ghcr.io/pterodactyl/yolks:python_3.11' },
        { id: 303, nestId: 3, name: 'NodeJS App', dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20' },
      ],
    };
  }

  override async assignServerOwner() { return false; }
  override async mintAccountClientKey() { return 'ptlc_test_key_123456'; }
  override async writeFile(_externalId: string, path: string, content: string) {
    this.writtenFiles.push({ path, content });
  }
}

describe('Universal Deployment Experience & Workload Registry', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    db.pragma('foreign_keys = OFF');
  });

  describe('Workload Catalog & Definitions', () => {
    it('provides structured workloads across all mandatory categories', () => {
      const all = listWorkloads();
      expect(all.length).toBeGreaterThanOrEqual(6);

      const games = listWorkloads('game-servers');
      expect(games.some((g) => g.id === 'minecraft')).toBe(true);
      expect(games.some((g) => g.id === 'cs16')).toBe(true);
      expect(games.some((g) => g.id === 'cs2')).toBe(true);
      expect(games.some((g) => g.id === 'fivem')).toBe(true);

      const bots = listWorkloads('discord-bots');
      expect(bots.some((b) => b.id === 'discord-bot')).toBe(true);

      const apps = listWorkloads('apps');
      expect(apps.some((a) => a.id === 'nodejs-app')).toBe(true);
    });

    it('explicitly reports unsupported workloads fail-closed without fake success', () => {
      const fivem = getWorkloadDefinition('fivem');
      expect(fivem).toBeDefined();
      expect(fivem!.supported).toBe(false);
      expect(fivem!.unsupportedReason).toContain('FiveM requires dedicated Cfx.re license');

      const redis = getWorkloadDefinition('redis');
      expect(redis!.supported).toBe(false);
      expect(redis!.unsupportedReason).toContain('not enabled');
    });
  });

  describe('Deployment Specification Validation', () => {
    it('validates Minecraft Paper Quick Setup: clean instance, zero optional addons', () => {
      const spec: Partial<DeploymentSpecification> = {
        workloadId: 'minecraft',
        setupMode: 'QUICK',
        softwareId: 'paper',
        softwareVersion: '1.20.4',
        selectedAddons: ['essentialsx', 'worldedit'], // Should be cleared in Quick setup
        serverName: 'Survival SMP',
      };

      const res = validateDeploymentSpec(spec);
      expect(res.valid).toBe(true);
      expect(res.spec.selectedAddons).toEqual([]);
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.spec.eulaAccepted).toBe(true);
    });

    it('validates Minecraft Custom Setup with compatible plugins and EULA check', () => {
      const validCustom: Partial<DeploymentSpecification> = {
        workloadId: 'minecraft',
        setupMode: 'CUSTOM',
        softwareId: 'paper',
        softwareVersion: '1.20.4',
        selectedAddons: ['essentialsx', 'vault'],
        eulaAccepted: true,
        serverName: 'Vault SMP',
      };

      const res = validateDeploymentSpec(validCustom);
      expect(res.valid).toBe(true);
      expect(res.spec.selectedAddons).toEqual(['essentialsx', 'vault']);

      // Fails if Vault is selected without EssentialsX (dependency missing)
      const missingDep: Partial<DeploymentSpecification> = {
        ...validCustom,
        selectedAddons: ['vault'],
      };
      expect(() => validateDeploymentSpec(missingDep)).toThrow(DeploymentValidationError);

      // Fails if EULA is unaccepted in Custom mode
      const unacceptedEula: Partial<DeploymentSpecification> = {
        ...validCustom,
        eulaAccepted: false,
      };
      expect(() => validateDeploymentSpec(unacceptedEula)).toThrow(DeploymentValidationError);
    });

    it('blocks mixing Spigot/Bukkit plugins onto Forge or Fabric pure mod loaders', () => {
      const invalidModLoader: Partial<DeploymentSpecification> = {
        workloadId: 'minecraft',
        setupMode: 'CUSTOM',
        softwareId: 'fabric',
        softwareVersion: '1.20.4',
        selectedAddons: ['essentialsx'],
        eulaAccepted: true,
        serverName: 'Fabric Modded',
      };

      expect(() => validateDeploymentSpec(invalidModLoader)).toThrow(DeploymentValidationError);
    });

    it('validates CS 1.6 Classic mode without unwanted addons', () => {
      const csClassic: Partial<DeploymentSpecification> = {
        workloadId: 'cs16',
        setupMode: 'QUICK',
        softwareId: 'rehlds',
        softwareVersion: 'latest-stable',
        serverName: 'Classic 5v5 Public',
        cs16Config: {
          environment: 'rehlds',
          maxPlayers: 24,
          startingMap: 'de_dust2',
          gameMode: 'classic',
        },
      };

      const res = validateDeploymentSpec(csClassic);
      expect(res.valid).toBe(true);
      expect(res.spec.selectedAddons).toEqual([]);
    });

    it('enforces dependency requirements for CS 1.6 Deathmatch mode', () => {
      const csDeathmatch: Partial<DeploymentSpecification> = {
        workloadId: 'cs16',
        setupMode: 'CUSTOM',
        softwareId: 'rehlds',
        softwareVersion: 'latest-stable',
        presetId: 'deathmatch',
        selectedAddons: ['metamod', 'amxmodx', 'csdm', 'spawn-protection'],
        serverName: 'CSDM Respawn FFA',
        cs16Config: {
          environment: 'rehlds',
          maxPlayers: 32,
          startingMap: 'de_inferno',
          gameMode: 'deathmatch',
        },
      };

      const res = validateDeploymentSpec(csDeathmatch);
      expect(res.valid).toBe(true);

      // Fails if CSDM is selected without metamod & amxmodx
      const missingMetamod: Partial<DeploymentSpecification> = {
        ...csDeathmatch,
        selectedAddons: ['csdm'],
      };
      expect(() => validateDeploymentSpec(missingMetamod)).toThrow(DeploymentValidationError);
    });

    it('rejects SSRF loopback and private IP repository URLs on Discord bots and Web Apps', () => {
      const ssrfBot: Partial<DeploymentSpecification> = {
        workloadId: 'discord-bot',
        setupMode: 'CUSTOM',
        softwareId: 'nodejs',
        serverName: 'My Malicious Bot',
        gitSource: {
          repoUrl: 'http://169.254.169.254/latest/meta-data/',
        },
        botConfig: {
          deploymentPath: 'github',
        },
      };

      expect(() => validateDeploymentSpec(ssrfBot)).toThrow(DeploymentValidationError);

      const loopbackApp: Partial<DeploymentSpecification> = {
        workloadId: 'nodejs-app',
        setupMode: 'CUSTOM',
        softwareId: 'nodejs',
        serverName: 'Loopback App',
        gitSource: {
          repoUrl: 'http://127.0.0.1:3000/repo.git',
        },
      };

      expect(() => validateDeploymentSpec(loopbackApp)).toThrow(DeploymentValidationError);
    });

    it('rejects unsupported workloads immediately during validation', () => {
      const unsupported: Partial<DeploymentSpecification> = {
        workloadId: 'fivem',
        serverName: 'RP Server',
      };
      expect(() => validateDeploymentSpec(unsupported)).toThrow(DeploymentValidationError);
    });
  });

  describe('Dynamic Provider Egg Resolution', () => {
    it('resolves actual Pterodactyl egg IDs dynamically from inventory without hardcoding', async () => {
      const adapter = new MockPteroInventoryAdapter();

      const mcTarget = await resolveEggForWorkload(adapter, 'minecraft', 'paper', db);
      expect(mcTarget.eggId).toBe(101);
      expect(mcTarget.isVerified).toBe(true);

      const csTarget = await resolveEggForWorkload(adapter, 'cs16', 'rehlds', db);
      expect(csTarget.eggId).toBe(201);

      const botTarget = await resolveEggForWorkload(adapter, 'discord-bot', 'nodejs', db);
      expect(botTarget.eggId).toBe(301);
    });

    it('caches resolved mappings in database for fast lookup and allows admin overrides', async () => {
      const adapter = new MockPteroInventoryAdapter();

      // First call inserts into provider_egg_mappings
      await resolveEggForWorkload(adapter, 'minecraft', 'paper', db);

      // Verify row exists
      const row = db.prepare('SELECT resolved_egg_id, is_verified FROM provider_egg_mappings WHERE workload_id = ? AND software_id = ?')
        .get('minecraft', 'paper') as { resolved_egg_id: number; is_verified: number };
      expect(row.resolved_egg_id).toBe(101);
      expect(row.is_verified).toBe(1);

      // Admin manual override in DB takes precedence
      db.prepare('UPDATE provider_egg_mappings SET resolved_egg_id = 999 WHERE workload_id = ? AND software_id = ?')
        .run('minecraft', 'paper');

      const overridden = await resolveEggForWorkload(adapter, 'minecraft', 'paper', db);
      expect(overridden.eggId).toBe(999);
      expect(overridden.source).toBe('DATABASE_OVERRIDE');
    });

    it('fails closed when an egg mapping cannot be resolved on provider', async () => {
      const adapter = new MockPteroInventoryAdapter();
      // FiveM has no software options in registry
      await expect(resolveEggForWorkload(adapter, 'fivem', 'fivem', db)).rejects.toThrow(EggMappingError);
    });
  });

  describe('Post-Provisioning Tasks & Configuration Persistence', () => {
    it('applies Minecraft eula.txt and writes server properties upon provisioning', async () => {
      const adapter = new MockPteroInventoryAdapter();
      const spec: DeploymentSpecification = {
        workloadId: 'minecraft',
        setupMode: 'CUSTOM',
        softwareId: 'paper',
        softwareVersion: '1.20.4',
        selectedAddons: [],
        serverName: 'Fortless Craft',
        planVersionId: 'plv_mc_4gb',
        regionId: 'reg_fra_1',
        environmentVariables: {},
        eulaAccepted: true,
        serverProperties: {
          difficulty: 'hard',
          gamemode: 'survival',
          motd: 'Welcome to Fortless Craft!',
          'max-players': '25',
        },
      };

      const tasks = await runPostProvisionTasks('srv_mc_01', '1001', 'acct_01', spec, adapter, db);
      expect(tasks.some((t) => t.taskName.includes('Minecraft EULA') && t.status === 'COMPLETED')).toBe(true);
      expect(tasks.some((t) => t.taskName.includes('Server Properties') && t.status === 'COMPLETED')).toBe(true);

      expect(adapter.writtenFiles.some((f) => f.path === 'eula.txt' && f.content.includes('eula=true'))).toBe(true);
      expect(adapter.writtenFiles.some((f) => f.path === 'server.properties' && f.content.includes('motd=Welcome to Fortless Craft!'))).toBe(true);

      // Verify spec persisted in service_deployment_specs table
      const specRow = db.prepare('SELECT workload_id, setup_mode, spec_json FROM service_deployment_specs WHERE service_id = ?')
        .get('srv_mc_01') as { workload_id: string; setup_mode: string; spec_json: string };
      expect(specRow.workload_id).toBe('minecraft');
      expect(specRow.setup_mode).toBe('CUSTOM');
      expect(specRow.spec_json).toContain('Fortless Craft');
    });

    it('initializes CS 1.6 server.cfg with proper GoldSrc settings', async () => {
      const adapter = new MockPteroInventoryAdapter();
      const spec: DeploymentSpecification = {
        workloadId: 'cs16',
        setupMode: 'QUICK',
        softwareId: 'rehlds',
        softwareVersion: 'latest-stable',
        selectedAddons: [],
        serverName: 'Fortless CS 1.6 Public',
        planVersionId: 'plv_cs16',
        regionId: 'reg_fra_1',
        environmentVariables: {},
        cs16Config: {
          environment: 'rehlds',
          maxPlayers: 24,
          startingMap: 'de_dust2',
          gameMode: 'classic',
        },
      };

      await runPostProvisionTasks('srv_cs_01', '1002', 'acct_01', spec, adapter, db);
      const cfgFile = adapter.writtenFiles.find((f) => f.path === 'cstrike/server.cfg');
      expect(cfgFile).toBeDefined();
      expect(cfgFile!.content).toContain('hostname "Fortless CS 1.6 Public"');
      expect(cfgFile!.content).toContain('maxplayers 24');
    });

    it('initializes Discord Bot starter template with masked token handling', async () => {
      const adapter = new MockPteroInventoryAdapter();
      const spec: DeploymentSpecification = {
        workloadId: 'discord-bot',
        setupMode: 'CUSTOM',
        softwareId: 'nodejs',
        softwareVersion: '20',
        presetId: 'starter',
        selectedAddons: [],
        serverName: 'Fortless Assistant Bot',
        planVersionId: 'plv_bot',
        regionId: 'reg_fra_1',
        environmentVariables: {},
        botConfig: {
          tokenSecret: 'MTAxMDIwMzAzNDA1.GgHhIi.JjKkLl',
          packageManager: 'npm',
          runtimeVersion: '20',
          deploymentPath: 'starter',
        },
      };

      await runPostProvisionTasks('srv_bot_01', '1003', 'acct_01', spec, adapter, db);
      expect(adapter.writtenFiles.some((f) => f.path === '.env' && f.content.includes('DISCORD_TOKEN='))).toBe(true);
      expect(adapter.writtenFiles.some((f) => f.path === 'package.json' && f.content.includes('discord.js'))).toBe(true);
      expect(adapter.writtenFiles.some((f) => f.path === 'index.js' && f.content.includes('Client'))).toBe(true);
    });

    it('creates informative README for blank Discord bot without claiming false operational status', async () => {
      const adapter = new MockPteroInventoryAdapter();
      const spec: DeploymentSpecification = {
        workloadId: 'discord-bot',
        setupMode: 'QUICK',
        softwareId: 'nodejs',
        softwareVersion: '20',
        presetId: 'blank',
        selectedAddons: [],
        serverName: 'Blank Node Bot',
        planVersionId: 'plv_bot',
        regionId: 'reg_fra_1',
        environmentVariables: {},
        botConfig: {
          deploymentPath: 'blank',
        },
      };

      await runPostProvisionTasks('srv_bot_blank', '1004', 'acct_01', spec, adapter, db);
      const readme = adapter.writtenFiles.find((f) => f.path === 'README.md');
      expect(readme).toBeDefined();
      expect(readme!.content).toContain('empty runtime');
      expect(readme!.content).toContain('Upload your bot code');
    });
  });
});
