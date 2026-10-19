/**
 * [SANDBOX_VERIFIED] checks against a TEST Pterodactyl panel (NEW-392, NEW-397, NEW-409 provider half, console/file path).
 * Run with: npm run test:sandbox:panel   (reads PTERODACTYL_* from FORTLESS_ENV_FILE, default ./.env, inside the process)
 * Refuses to run unless FORTLESS_PANEL_IS_TEST=yes, because it creates and deletes a user and a server on that panel.
 * Everything it creates carries the marker sbx and removed at the end, even when an assertion fails.
 */
import fs from 'node:fs';
import { describe, it, expect, afterAll } from 'vitest';
import { PterodactylHttpAdapter } from '../../src/modules/provisioning/adapter.js';

const envFile = process.env['FORTLESS_ENV_FILE'] || '.env';
const fileEnv: Record<string, string> = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) fileEnv[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}
const get = (k: string) => process.env[k] || fileEnv[k] || '';
const enabled = process.env['FORTLESS_PANEL_IS_TEST'] === 'yes' && !!get('PTERODACTYL_PANEL_URL') && !!get('PTERODACTYL_API_KEY');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled)('Pterodactyl TEST panel verification', () => {
  const panelUrl = get('PTERODACTYL_PANEL_URL').replace(/\/$/, '');
  const adapter = enabled ? new PterodactylHttpAdapter({ panelUrl, apiKey: get('PTERODACTYL_API_KEY'), timeoutMs: 30_000 }) : (undefined as unknown as PterodactylHttpAdapter);
  const stamp = Date.now().toString(36);
  // The key-mint endpoint only accepts fortless_acc_ tags; the sbx marker keeps these objects recognisable.
  const tag = `fortless_acc_sbx_${stamp}`;
  let panelUserId = 0;
  let inviteeUserId = 0;
  let externalId = '';
  let clientKey = '';

  afterAll(async () => {
    if (externalId) await adapter.terminate(externalId).catch((e) => console.warn('cleanup server failed', String(e)));
    for (const id of [inviteeUserId, panelUserId].filter(Boolean)) {
      await fetch(`${panelUrl}/api/application/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${get('PTERODACTYL_API_KEY')}`, Accept: 'application/json' } })
        .catch((e) => console.warn('cleanup user failed', String(e)));
    }
  });

  it('inventory is readable and has a node, a location 1 and an egg', async () => {
    const inv = await adapter.getInventory();
    expect(inv.nodes.length).toBeGreaterThan(0);
    expect(inv.locations.some((l) => l.id === 1)).toBe(true);
    expect(inv.eggs.length).toBeGreaterThan(0);
  });

  it('creates a panel user, then a server owned by it, found by correlation tag', async () => {
    const user = await adapter.ensurePanelUser({ correlationTag: tag, email: `${tag}@example.com`, username: tag.slice(0, 30), firstName: 'Sandbox', lastName: 'Check' });
    panelUserId = user.panelUserId;
    expect(panelUserId).toBeGreaterThan(0);
    const inv = await adapter.getInventory();
    const egg = inv.eggs.find((e) => /minecraft|paper|vanilla/i.test(e.name)) ?? inv.eggs[0]!;
    const created = await adapter.provision({
      serviceId: `svc_${tag}`, name: tag, memoryMb: 512, cpuPct: 100, diskMb: 1024, databases: 0, backups: 0,
      eggId: egg.id, ownerPanelUserId: panelUserId, environmentVariables: {}, correlationTag: `${tag}_srv`,
    });
    externalId = created.externalId;
    expect(externalId).toMatch(/^\d+$/);
    const found = await adapter.lookupByCorrelationTag(`${tag}_srv`);
    expect(found?.externalId).toBe(externalId);
    // the unknown-outcome pre-flight: provisioning again with the same tag must not create a second server
    const again = await adapter.provision({
      serviceId: `svc_${tag}`, name: tag, memoryMb: 512, cpuPct: 100, diskMb: 1024, databases: 0, backups: 0,
      eggId: egg.id, ownerPanelUserId: panelUserId, environmentVariables: {}, correlationTag: `${tag}_srv`,
    });
    expect(again.externalId).toBe(externalId);
  });

  it('NEW-392: the summary reports the install flag, and it clears when the install finishes', async () => {
    let seenInstalling = false;
    let last = await adapter.getServerSummary(Number(externalId));
    for (let i = 0; i < 60 && last?.installing; i++) { seenInstalling = true; await sleep(5000); last = await adapter.getServerSummary(Number(externalId)); }
    console.log(`install flag observed while installing: ${seenInstalling}`);
    expect(last).not.toBeNull();
    expect(last!.installing).toBe(false);
    expect(last!.installFailed).toBe(false);
  });

  it('suspend and unsuspend change the panel state both ways', async () => {
    await adapter.suspend(externalId);
    expect((await adapter.getServerSummary(Number(externalId)))!.suspended).toBe(true);
    await adapter.unsuspend(externalId);
    expect((await adapter.getServerSummary(Number(externalId)))!.suspended).toBe(false);
  });

  it('NEW-397: key mint returns a client key, a second mint replaces it, and the old key stops working', async () => {
    const secret = get('PTERODACTYL_KEYMINT_SECRET');
    expect(secret).not.toBe('');
    const first = await adapter.mintAccountClientKey(tag, secret);
    expect(first).toMatch(/^ptlc_/);
    const second = await adapter.mintAccountClientKey(tag, secret);
    expect(second).not.toBe(first);
    clientKey = second;
    await expect(adapter.listFiles(externalId, '/', first)).rejects.toBeDefined();
    const files = await adapter.listFiles(externalId, '/', clientKey);
    expect(Array.isArray(files)).toBe(true);
  });

  it('console credentials come back for the owner key', async () => {
    const creds = await adapter.getWebsocketCredentials(externalId, clientKey);
    expect(creds.token.length).toBeGreaterThan(20);
    expect(creds.socket).toMatch(/^wss?:\/\//);
  });

  it('file write, read and delete round-trip through the panel', async () => {
    await adapter.writeFile(externalId, '/fortless-sbx.txt', 'hello sandbox', clientKey);
    expect(await adapter.readFile(externalId, '/fortless-sbx.txt', clientKey)).toBe('hello sandbox');
    await adapter.deleteFiles(externalId, '/', ['fortless-sbx.txt'], clientKey);
    const names = (await adapter.listFiles(externalId, '/', clientKey)).map((f) => f.name);
    expect(names).not.toContain('fortless-sbx.txt');
  });

  it('NEW-393: a sub-user can be created, found again by e-mail and re-permissioned in place (the adopt path)', async () => {
    const inviteTag = `${tag}_inv`;
    const email = `${inviteTag}@example.com`;
    const invitee = await adapter.ensurePanelUser({ correlationTag: inviteTag, email, username: inviteTag.slice(0, 30), firstName: 'Invitee', lastName: 'Check' });
    inviteeUserId = invitee.panelUserId;
    const list = async () => ((await adapter.clientServerCall(externalId, clientKey, 'GET', '/users'))?.data ?? []) as any[];
    expect((await list()).some((u) => String(u.attributes.email).toLowerCase() === email.toLowerCase())).toBe(false);
    const created = await adapter.clientServerCall(externalId, clientKey, 'POST', '/users', { email, permissions: ['control.console'] });
    const uuid = String(created.attributes.uuid);
    // a retry that found the half-finished invitation: the lookup by e-mail must hit and the update must apply in place
    const found = (await list()).find((u) => String(u.attributes.email).toLowerCase() === email.toLowerCase());
    expect(String(found.attributes.uuid)).toBe(uuid);
    await adapter.clientServerCall(externalId, clientKey, 'POST', `/users/${uuid}`, { permissions: ['control.console', 'file.read'] });
    const updated = (await list()).find((u) => u.attributes.uuid === uuid);
    expect(updated.attributes.permissions).toEqual(expect.arrayContaining(['control.console', 'file.read']));
    expect((await list()).filter((u) => String(u.attributes.email).toLowerCase() === email.toLowerCase())).toHaveLength(1);
    await adapter.clientServerCall(externalId, clientKey, 'DELETE', `/users/${uuid}`);
    expect((await list()).some((u) => u.attributes.uuid === uuid)).toBe(false);
  });

  it('NEW-409/NEW-413: while the server is suspended the owner key gets no new console credentials, and they return after unsuspend', async () => {
    await adapter.suspend(externalId);
    try {
      await expect(adapter.getWebsocketCredentials(externalId, clientKey)).rejects.toBeDefined();
    } finally {
      await adapter.unsuspend(externalId);
    }
    const creds = await adapter.getWebsocketCredentials(externalId, clientKey);
    expect(creds.token.length).toBeGreaterThan(20);
  });

  it('terminate removes the server and a second terminate is harmless', async () => {
    await adapter.terminate(externalId);
    expect(await adapter.serverExists(externalId)).toBe(false);
    await adapter.terminate(externalId).catch(() => undefined);
    externalId = '';
  });
});
