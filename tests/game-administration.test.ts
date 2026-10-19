import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import {
  createPlayerManagerService,
} from '../src/modules/player-manager/index.js';
import { runPostProvisionTasks } from '../src/modules/deployment/tasks.js';
import { PterodactylHttpAdapter, ProviderNetworkError } from '../src/modules/provisioning/adapter.js';

class MockPteroAdapter extends PterodactylHttpAdapter {
  eggName = 'Paper';
  fileMap: Map<string, string> = new Map();
  submittedCommands: string[] = [];
  allocationPorts = [25565, 25575];
  commandTimeout = false;
  writtenFiles: Array<{ path: string; content: string }> = [];
  copiedFiles: string[] = [];

  constructor(egg = 'Paper', initialFiles: Record<string, string> = {}) {
    super({ panelUrl: 'https://panel.example.test', apiKey: 'test_token_1234567890' });
    this.eggName = egg;
    for (const [k, v] of Object.entries(initialFiles)) {
      this.fileMap.set(k, v);
    }
  }

  override async getServerEggName() {
    return this.eggName;
  }

  override async mintAccountClientKey() {
    return 'ptlc_test_client_key_01234567890123456789';
  }

  override async assignServerOwner() {
    return false;
  }

  override async readFile(_externalId: string, path: string) {
    if (this.fileMap.has(path)) {
      return this.fileMap.get(path)!;
    }
    throw new Error(`File not found: ${path}`);
  }

  override async writeFile(_externalId: string, path: string, content: string) {
    this.writtenFiles.push({ path, content });
    this.fileMap.set(path, content);
  }

  override async copyFile(_externalId: string, path: string) {
    this.copiedFiles.push(path);
    if (this.fileMap.has(path)) {
      this.fileMap.set(`${path}.copy`, this.fileMap.get(path)!);
    }
  }

  override async clientServerCall(_externalId: string, _key: string, _method: any, subpath: string, body?: any) {
    if (subpath === '/network/allocations') {
      return {
        data: this.allocationPorts.map((port, index) => ({
          attributes: {
            id: index + 1,
            ip: '203.0.113.10',
            ip_alias: 'games.example.test',
            port,
            is_default: index === 0,
          },
        })),
      };
    }
    if (subpath === '/command') {
      this.submittedCommands.push(String(body?.command ?? ''));
      if (this.commandTimeout) {
        throw new ProviderNetworkError('timeout');
      }
      return {};
    }
    return {};
  }
}

describe('Mandatory Game Administration & Auto-Provisioning (20 Invariants)', () => {
  let db: Database.Database;
  const SECRET = 'test-keymint-secret-must-be-32-chars-long-012345';
  const accountA = 'acc_tenant_a';
  const accountB = 'acc_tenant_b';
  const userA = 'usr_tenant_a';
  const userB = 'usr_tenant_b';
  const serviceId = 'srv_game_01';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    runMigrations(db);
    db.pragma('foreign_keys = OFF');

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
      VALUES (?, ?, 'item_1', 'PTERODACTYL', 'ptero_1', '1001', 'ident-1001', 'ACTIVE', 'node_test_1')
    `).run(serviceId, accountA);
    db.prepare("INSERT INTO panel_users (account_id, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, 1001, 'tenant_a', 'a@test.com', 'acct-a')").run(accountA);
  });

  afterEach(() => {
    db.close();
  });

  // 1. New Minecraft deployment without RCON
  it('1. New Minecraft deployment defaults to native console without forcing RCON', async () => {
    const adapter = new MockPteroAdapter('Paper');
    const spec: any = {
      workloadId: 'minecraft',
      setupMode: 'QUICK',
      softwareId: 'paper',
      softwareVersion: 'latest',
      presetId: 'vanilla-plus',
      selectedAddons: [],
      serverName: 'MC Server',
      planVersionId: 'plv_mc',
      regionId: 'reg_eu',
      environmentVariables: {},
    };

    await runPostProvisionTasks(serviceId, '1001', accountA, spec, adapter, db);

    const adminRow = db.prepare('SELECT * FROM service_game_administration WHERE service_id = ?').get(serviceId) as any;
    expect(adminRow).toBeDefined();
    expect(adminRow.selected_method).toBe('NATIVE_CONSOLE');

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const admin = await pm.getAdministration({ serviceId, accountId: accountA, userId: userA, role: 'OWNER' });
    expect(admin.selectedMethod).toBe('NATIVE_CONSOLE');
    expect(admin.effectiveProtocol).toBe('PTERODACTYL_CONSOLE');
    expect(admin.rconEnabled).toBeFalsy();
    expect(admin.state).toBe('AVAILABLE');
  });

  // 2. Native Minecraft Kick/Ban through Pterodactyl console
  it('2. Native Minecraft Kick/Ban dispatches commands via Pterodactyl without RCON', async () => {
    const adapter = new MockPteroAdapter('Paper');
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const kickRes = await pm.kickPlayer(ctx, { targetIdentifier: 'Steve', targetName: 'Steve', reason: 'AFK' });
    const banRes = await pm.banPlayer(ctx, { targetIdentifier: 'Alex', targetName: 'Alex', reason: 'Cheating', durationMinutes: 0 });

    expect(kickRes.success).toBe(true);
    expect(banRes.success).toBe(true);
    expect(adapter.submittedCommands).toContain('kick Steve AFK');
    expect(adapter.submittedCommands).toContain('ban Alex Cheating');
  });

  // 3. Minecraft with explicitly enabled RCON
  it('3. Minecraft with explicitly enabled RCON configures RCON properties', async () => {
    const adapter = new MockPteroAdapter('Minecraft Java', {
      'server.properties': 'server-port=25565\nmotd=Fortless\nenable-rcon=false\n',
    });
    adapter.allocationPorts = [25565, 25575];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const saved = await pm.saveAdministration(ctx, {
      method: 'RCON',
      port: 25575,
      password: 'explicit-rcon-pass',
      syncToServer: true,
    });

    expect(saved.status.selectedMethod).toBe('RCON');
    expect(saved.status.administrationPort).toBe(25575);
    expect(adapter.copiedFiles).toContain('server.properties');
    expect(adapter.writtenFiles.some((f) => f.path === 'server.properties' && f.content.includes('enable-rcon=true'))).toBe(true);
  });

  // 4. Minecraft RCON using a secondary port
  it('4. Minecraft RCON uses a secondary allocated port and validates allocation', async () => {
    const adapter = new MockPteroAdapter('Paper');
    adapter.allocationPorts = [25565, 25580]; // Primary 25565, secondary 25580
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    // Attempting unallocated port 29999 fails validation
    await expect(pm.saveAdministration(ctx, { method: 'RCON', port: 29999, password: 'valid-password-123' }))
      .rejects.toMatchObject({ code: 'RCON_PORT_NOT_ALLOCATED' });

    // Using valid secondary port succeeds
    const res = await pm.saveAdministration(ctx, { method: 'RCON', port: 25580, password: 'valid-password-123' });
    expect(res.status.administrationPort).toBe(25580);
  });

  // 5. New CS 1.6 deployment with generated RCON credentials
  it('5. New CS 1.6 deployment generates RCON credentials and writes to cstrike/server.cfg using game port', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': 'hostname "Fortless CS"\nmp_timelimit 30\n',
    });
    adapter.allocationPorts = [27015];

    const spec: any = {
      workloadId: 'cs16',
      setupMode: 'QUICK',
      softwareId: 'rehlds',
      softwareVersion: 'latest',
      presetId: 'classic-pub',
      selectedAddons: [],
      serverName: 'CS 1.6 Pub',
      planVersionId: 'plv_cs16',
      regionId: 'reg_eu',
      environmentVariables: {},
    };

    await runPostProvisionTasks(serviceId, '1001', accountA, spec, adapter, db);

    const written = adapter.writtenFiles.find((f) => f.path === 'cstrike/server.cfg');
    expect(written).toBeDefined();
    expect(written!.content).toContain('hostname "CS 1.6 Pub"');
    expect(written!.content).toContain('rcon_password "');

    const adminRow = db.prepare('SELECT * FROM service_game_administration WHERE service_id = ?').get(serviceId) as any;
    expect(adminRow).toBeDefined();
    expect(adminRow.selected_method).toBe('AUTOMATIC');
    expect(adminRow.encrypted_password).toBeDefined();

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const admin = await pm.getAdministration({ serviceId, accountId: accountA, userId: userA, role: 'OWNER' });
    expect(admin.administrationPort).toBe(27015);
  });

  // 6. Existing CS 1.6 server with RCON already configured
  it('6. Existing CS 1.6 server with RCON already configured adopts it without overwriting', async () => {
    const existingCfg = 'hostname "My Clan Server"\nrcon_password "PreExistingClanSecret"\n';
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': existingCfg,
    });
    adapter.allocationPorts = [27015];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const admin = await pm.getAdministration(ctx);
    expect(admin.state).toBe('AVAILABLE');
    expect(admin.credentialsConfigured).toBe(true);
    expect(admin.administrationPort).toBe(27015);
    // Verified that file was NOT rewritten
    expect(adapter.writtenFiles).toHaveLength(0);
  });

  // 7. Existing Minecraft server without RCON
  it('7. Existing Minecraft server without RCON defaults to ready native console', async () => {
    const adapter = new MockPteroAdapter('Paper', {
      'server.properties': 'server-port=25565\nenable-rcon=false\n',
    });
    adapter.allocationPorts = [25565];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const admin = await pm.getAdministration(ctx);
    expect(admin.state).toBe('AVAILABLE');
    expect(admin.effectiveProtocol).toBe('PTERODACTYL_CONSOLE');
    expect(admin.rconEnabled).toBe(false);
  });

  // 8. Server with missing administration credentials
  it('8. Server needing RCON with missing credentials triggers SETUP_REQUIRED', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 2', {
      'game/csgo/cfg/server.cfg': 'hostname "CS2 Server"\n// no rcon configured\n',
    });
    adapter.allocationPorts = [27015];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const admin = await pm.getAdministration(ctx);
    expect(admin.state).toBe('SETUP_REQUIRED');
    expect(admin.credentialsConfigured).toBe(false);
  });

  // 9. Manual administration configuration
  it('9. Manual administration configuration updates DB with encrypted password', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6');
    adapter.allocationPorts = [27015];
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const res = await pm.saveAdministration(ctx, {
      method: 'RCON',
      port: 27015,
      password: 'super-safe-manual-pw',
    });

    expect(res.status.selectedMethod).toBe('RCON');
    expect(res.status.credentialsConfigured).toBe(true);

    const row = db.prepare('SELECT encrypted_password FROM service_game_administration WHERE service_id = ?').get(serviceId) as any;
    expect(row.encrypted_password).not.toBe('super-safe-manual-pw');
    expect(row.encrypted_password).toBeDefined();
  });

  // 10. Reset to automatic detection
  it('10. Reset to automatic detection restores default capability state', async () => {
    const adapter = new MockPteroAdapter('Paper');
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    await pm.saveAdministration(ctx, { method: 'RCON', port: 25575, password: 'strong-password-123' });
    const reset = await pm.resetAdministration(ctx);
    expect(reset.selectedMethod).toBe('AUTOMATIC');
  });

  // 11. Game-port changes
  it('11. Game-port changes update effective administration port for GoldSrc', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': 'rcon_password "pwd123"\n',
    });
    adapter.allocationPorts = [27025];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const admin = await pm.getAdministration({ serviceId, accountId: accountA, userId: userA, role: 'OWNER' });
    expect(admin.queryPort).toBe(27025);
    expect(admin.administrationPort).toBe(27025);
  });

  // 12. Egg changes
  it('12. Egg changes trigger capability rediscovery', async () => {
    const adapter = new MockPteroAdapter('Paper');
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    let admin = await pm.getAdministration(ctx);
    expect(admin.gameProtocol).toBe('minecraft');
    expect(admin.effectiveProtocol).toBe('PTERODACTYL_CONSOLE');

    // Switch egg to Counter-Strike 1.6
    adapter.eggName = 'Counter-Strike 1.6';
    adapter.fileMap.set('cstrike/server.cfg', 'rcon_password "cssecret"\n');
    adapter.allocationPorts = [25565];

    admin = await pm.getAdministration(ctx);
    expect(admin.gameProtocol).toBe('goldsrc');
    expect(admin.effectiveProtocol).toBe('GOLDSRC_RCON');
  });

  // 13. Server restart preserving credentials
  it('13. Server restart preserves credentials without re-generating new password', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': 'rcon_password "preserved-pw"\n',
    });
    adapter.allocationPorts = [27015];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    await pm.getAdministration(ctx);
    const row1 = db.prepare('SELECT encrypted_password FROM service_game_administration WHERE service_id = ?').get(serviceId) as any;

    // Simulate service reload
    db.prepare("UPDATE services SET updated_at = datetime('now', 'utc') WHERE id = ?").run(serviceId);

    await pm.getAdministration(ctx);
    const row2 = db.prepare('SELECT encrypted_password FROM service_game_administration WHERE service_id = ?').get(serviceId) as any;

    expect(row1.encrypted_password).toBe(row2.encrypted_password);
  });

  // 14. Configuration file changes preserve unrelated settings and comments
  it('14. Configuration file changes preserve unrelated settings and comments with backup copy', async () => {
    const original = `# Main config\nhostname "Fortless Pro"\nsv_lan 0\n// comment\nmp_roundtime 2\n`;
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': original,
    });
    adapter.allocationPorts = [27015];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const autoResult = await pm.autoConfigureAdministration(ctx);
    expect(autoResult.success).toBe(true);
    expect(adapter.copiedFiles).toContain('cstrike/server.cfg');

    const updated = adapter.fileMap.get('cstrike/server.cfg')!;
    expect(updated).toContain('# Main config');
    expect(updated).toContain('hostname "Fortless Pro"');
    expect(updated).toContain('sv_lan 0');
    expect(updated).toContain('// comment');
    expect(updated).toContain('rcon_password "');
  });

  // 15. Failed post-install configuration
  it('15. Failed post-install configuration does not invent fake success', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6');
    // Force write failure
    adapter.writeFile = async () => {
      throw new Error('Disk full');
    };

    const spec: any = {
      workloadId: 'cs16',
      setupMode: 'QUICK',
      softwareId: 'rehlds',
      softwareVersion: 'latest',
      presetId: 'classic-pub',
      selectedAddons: [],
      serverName: 'CS 1.6',
      planVersionId: 'plv_cs16',
      regionId: 'reg_eu',
      environmentVariables: {},
    };

    const tasks = await runPostProvisionTasks(serviceId, '1001', accountA, spec, adapter, db);
    const failedTask = tasks.find((t) => t.status === 'FAILED');
    expect(failedTask).toBeDefined();
    expect(failedTask!.errorMessage).toBe('Disk full');
    expect(tasks.some((t) => t.status === 'COMPLETED' && t.taskName.includes('Configure CS 1.6'))).toBe(false);
  });

  // 16. Worker retry and provider timeout handling
  it('16. Provider network timeout reports UNKNOWN outcome rather than false success or duplicate retry', async () => {
    const adapter = new MockPteroAdapter('Paper');
    adapter.commandTimeout = true;

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const result = await pm.kickPlayer(ctx, { targetIdentifier: 'Steve', targetName: 'Steve' });
    expect(result.success).toBe(false);
    expect(result.outcome).toBe('UNKNOWN');
    expect(adapter.submittedCommands).toHaveLength(1); // Never retry blind
  });

  // 17. Service ownership and authorization checks
  it('17. Service ownership and authorization checks prevent cross-tenant access', async () => {
    const adapter = new MockPteroAdapter('Paper');
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });

    // Tenant B attempts to access Tenant A's service
    const crossCtx = { serviceId, accountId: accountB, userId: userB, role: 'OWNER' };
    await expect(pm.getAdministration(crossCtx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(pm.autoConfigureAdministration(crossCtx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // 18. Secret leakage prevention
  it('18. Secret leakage prevention: RCON passwords never returned in API payloads or audit events', async () => {
    const adapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': 'rcon_password "SuperSecretToken999"\n',
    });
    adapter.allocationPorts = [27015];

    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    const admin = await pm.getAdministration(ctx);
    const jsonOutput = JSON.stringify(admin);
    expect(jsonOutput).not.toContain('SuperSecretToken999');

    // Auto configure
    const auto = await pm.autoConfigureAdministration(ctx);
    expect(JSON.stringify(auto)).not.toContain('SuperSecretToken999');

    // Check audit events
    const auditRows = db.prepare('SELECT metadata FROM audit_events WHERE resource_id = ?').all(serviceId) as any[];
    for (const row of auditRows) {
      expect(row.metadata).not.toContain('SuperSecretToken999');
    }
  });

  // 19. Network restrictions and allocation validation
  it('19. Network restrictions reject unallocated ports and SSRF targets', async () => {
    const adapter = new MockPteroAdapter('Paper');
    adapter.allocationPorts = [25565]; // Only 25565 is allocated
    const pm = createPlayerManagerService({ db, adapter, secret: SECRET });
    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };

    // Port 80 (HTTP) or 22 (SSH) not in server allocations
    await expect(pm.saveAdministration(ctx, { method: 'RCON', port: 80, password: 'pass' }))
      .rejects.toMatchObject({ code: 'RCON_PORT_NOT_ALLOCATED' });
    await expect(pm.saveAdministration(ctx, { method: 'RCON', port: 22, password: 'pass' }))
      .rejects.toMatchObject({ code: 'RCON_PORT_NOT_ALLOCATED' });
  });

  // 20. Player Manager using the resolved administration method
  it('20. Player Manager performs actions using the resolved administration method', async () => {
    // Test that for CS 1.6 it uses GoldSrc RCON client, and for Minecraft it uses native console
    const csAdapter = new MockPteroAdapter('Counter-Strike 1.6', {
      'cstrike/server.cfg': 'rcon_password "cs_pw"\n',
    });
    csAdapter.allocationPorts = [27015];

    let executedCommand = '';
    let executedTransport = '';
    const pm = createPlayerManagerService({
      db,
      adapter: csAdapter,
      secret: SECRET,
      rconClientFactory: (game) => ({
        connect: async () => {},
        execute: async (cmd) => {
          executedTransport = game;
          executedCommand = cmd;
          return 'ok';
        },
        disconnect: async () => {},
      }),
    });

    const ctx = { serviceId, accountId: accountA, userId: userA, role: 'OWNER' };
    const kickRes = await pm.kickPlayer(ctx, { targetIdentifier: '4', targetName: 'Troll' });
    expect(kickRes.success).toBe(true);
    expect(executedTransport).toBe('goldsrc');
    expect(executedCommand).toContain('kick #4');
  });
});
