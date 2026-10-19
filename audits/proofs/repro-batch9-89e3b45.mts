/**
 * Local reproductions for NEW-369, NEW-376, NEW-389, NEW-399/NEW-408, NEW-404 and NEW-409.
 * Reviewed commit 89e3b45. Uses a throw-away SQLite file in the OS temp directory, a fake provider adapter and
 * Fastify's in-process inject(); it never opens ./data, reads .env or contacts a network.
 * Run from the repository root: npx tsx audits/proofs/repro-batch9-89e3b45.mts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortless-repro-'));
process.env['DATABASE_PATH'] = path.join(dir, 'repro.db');
process.env['SESSION_SECRET'] = 'repro-session-secret-0123456789abcdef0123456789';
process.env['NODE_ENV'] = 'test';
process.env['EMAIL_MODE'] = 'disabled';
process.env['FORTLESS_DEV_SECRET_FILE'] = path.join(dir, 'dev-secret');

const { getDatabase } = await import('../../src/database/index.js');
const { SCHEMA_SQL } = await import('../../src/database/schema.js');
const { runMigrations } = await import('../../src/database/migrations.js');
const { createSessionForUser } = await import('../../src/modules/identity/auth.js');
const { buildServer } = await import('../../src/server.js');
const { PterodactylHttpAdapter } = await import('../../src/modules/provisioning/adapter.js');
const { reconcileWithPanel } = await import('../../src/modules/provisioning/runtime-sync.js');
const { encryptClientKey } = await import('../../src/modules/provisioning/console.js');
const { getServiceAccess, PERMISSION_PRESETS } = await import('../../src/modules/provisioning/service-access.js');
const { updateAccountStatus } = await import('../../src/modules/admin/read-model.js');

const db = getDatabase();
db.exec(SCHEMA_SQL);
runMigrations(db);
db.pragma('foreign_keys = OFF'); // seed rows without building the whole catalog graph

const user = (id: string) => db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES (?, ?, 'x', ?, 'ACTIVE', '2026-01-01')").run(id, `${id}@example.test`, id);
const account = (id: string, owner: string) => db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email, created_at) VALUES (?, ?, ?, 'b@example.test', '2026-01-01 00:00:00')").run(id, id, owner);
const member = (acc: string, u: string, role: string) => db.prepare('INSERT INTO memberships (id, account_id, user_id, role) VALUES (?, ?, ?, ?)').run(`mem_${acc}_${u}`, acc, u, role);

user('u_owner'); user('u_viewer'); user('u_staff'); user('u_shared'); user('u_target');
account('acc_a', 'u_owner'); account('acc_s', 'u_staff'); account('acc_b', 'u_shared'); account('acc_t', 'u_target');
member('acc_a', 'u_owner', 'OWNER'); member('acc_a', 'u_viewer', 'VIEWER'); member('acc_s', 'u_staff', 'OWNER'); member('acc_b', 'u_shared', 'OWNER'); member('acc_t', 'u_target', 'OWNER');

const app = buildServer();
await app.ready();

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, token: string, body?: unknown) {
  const csrf = (await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).json().csrfToken as string;
  return app.inject({ method, url, payload: body as object | undefined, headers: { cookie: `fortless_session=${token}; fortless_csrf=${csrf}`, 'x-csrf-token': csrf, 'content-type': 'application/json' } });
}

// NEW-369: a VIEWER creates a DNS zone and a record. The routes only call requireAuth.
const viewer = createSessionForUser('u_viewer', '127.0.0.1', 'repro', true, db);
const zone = await call('POST', '/api/v1/domains/zones', viewer, { domainName: 'victim-example.com', autoRenew: true, whoisPrivacy: true, periodYears: 1 });
console.log(`NEW-369 VIEWER create zone -> HTTP ${zone.statusCode}`);
if (zone.statusCode === 201) {
  const zoneId = zone.json().zone?.id ?? zone.json().id;
  const rec = await call('POST', `/api/v1/domains/zones/${zoneId}/records`, viewer, { recordType: 'A', name: '@', content: '203.0.113.9', ttl: 300 });
  console.log(`NEW-369 VIEWER create A record -> HTTP ${rec.statusCode}`);
}

// NEW-399 / NEW-408: the same VIEWER downloads the account activity export, which includes a staff-written reason.
db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
  VALUES ('aud_repro1', 'acc_a', 'u_staff', 'STAFF', 'account.status_changed', 'account', 'acc_a', '198.51.100.7', 'cor_repro1', ?)`).run(JSON.stringify({ from: 'ACTIVE', to: 'FLAGGED_FRAUD', reason: 'INTERNAL-NOTE chargeback ring suspected' }));
const exp = await call('GET', '/api/v1/activity/export', viewer);
console.log(`NEW-399 VIEWER activity export -> HTTP ${exp.statusCode}, contains staff reason: ${exp.body.includes('INTERNAL-NOTE')}`);
const inv = await call('GET', '/api/v1/invoices', viewer);
console.log(`NEW-408 VIEWER list invoices -> HTTP ${inv.statusCode}`);

// NEW-376: the only active OWNER removes their own staff access through POST /admin/staff (PATCH refuses self-change).
db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES ('u_staff', 'OWNER', 'ACTIVE')").run();
db.prepare("INSERT INTO mfa_factors (id, user_id, type, secret_encrypted, is_confirmed) VALUES ('mfa_repro', 'u_staff', 'TOTP', 'x', 1)").run();
const staffToken = createSessionForUser('u_staff', '127.0.0.1', 'repro', true, db);
db.prepare('UPDATE sessions SET step_up_verified_at = ? WHERE user_id = ?').run(new Date().toISOString(), 'u_staff');
const post = await call('POST', '/api/v1/admin/staff', staffToken, { email: 'u_staff@example.test', role: 'AUDITOR', status: 'REVOKED', reason: 'repro reason' });
const row = db.prepare("SELECT role, status FROM staff_memberships WHERE user_id = 'u_staff'").get();
const activeOwners = (db.prepare("SELECT COUNT(*) c FROM staff_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'").get() as { c: number }).c;
console.log(`NEW-376 POST self-demote/revoke -> HTTP ${post.statusCode}, staff row now ${JSON.stringify(row)}, active OWNERs left: ${activeOwners}`);

// NEW-389: reconcile deletes every shared member when the panel answers /users with a body that has no data array.
class Fake extends PterodactylHttpAdapter {
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'app-key' }); }
  override async listServers() { return [{ id: 'ext1', limits: { memoryMb: 1024, cpuPct: 100, diskMb: 1024 } }] as never; }
  override async clientServerCall() { return {}; } // e.g. a 200 with an unexpected body
}
db.prepare("INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, max_disk_mb) VALUES ('node1', 'reg1', 'inst', 'n', 'n.example.test', 1024, 1024)").run();
db.prepare(`INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, external_id, identifier, contract_status, node_id)
  VALUES ('svc1', 'acc_a', 'oi1', 'PTERODACTYL', 'inst', 'ext1', 'abc12345', 'ACTIVE', 'node1')`).run();
db.prepare("INSERT INTO panel_client_keys (account_id, encrypted_key) VALUES ('acc_a', ?)").run(encryptClientKey('ptlc_repro_key'));
db.prepare("INSERT INTO service_members (id, service_id, user_id, preset, panel_subuser_uuid, invited_by_user_id) VALUES ('smem1', 'svc1', 'u_shared', 'viewer', 'sub-uuid-1', 'u_owner')").run();
const before = (db.prepare('SELECT COUNT(*) c FROM service_members').get() as { c: number }).c;
const res = await reconcileWithPanel(new Fake(), db, 'k'.repeat(40));
const after = (db.prepare('SELECT COUNT(*) c FROM service_members').get() as { c: number }).c;
console.log(`NEW-389 members before=${before} after=${after} membersRevoked=${res.membersRevoked}`);

// NEW-409: locking the owning account does not touch the service or the shared member's access.
updateAccountStatus({ accountId: 'acc_a', status: 'FLAGGED_FRAUD', reason: 'repro lock', actorUserId: 'u_staff', ipAddress: '127.0.0.1' }, db);
const svc = db.prepare("SELECT contract_status FROM services WHERE id = 'svc1'").get() as { contract_status: string };
db.prepare("INSERT INTO service_members (id, service_id, user_id, preset, panel_subuser_uuid, invited_by_user_id) VALUES ('smem3', 'svc1', 'u_shared', 'viewer', 'sub-uuid-3', 'u_owner')").run(); // re-share after NEW-389 removed the first row
const access = getServiceAccess(db, { serviceId: 'svc1', accountId: 'acc_b', userId: 'u_shared', role: 'OWNER' });
console.log(`NEW-409 account FLAGGED_FRAUD: service contract_status=${svc.contract_status}, shared member access kind=${access?.kind ?? 'none'}`);

// NEW-404: the "viewer" share preset.
console.log(`NEW-404 viewer preset includes control.console: ${PERMISSION_PRESETS.viewer.includes('control.console' as never)}, file.read-content: ${PERMISSION_PRESETS.viewer.includes('file.read-content' as never)}`);

await app.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
