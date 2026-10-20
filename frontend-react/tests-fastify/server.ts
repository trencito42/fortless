import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortless-react-fastify-'));
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_PATH'] = path.join(tempDir, 'integration.db');
process.env['SESSION_SECRET'] = 'fastify-react-integration-secret-0123456789abcdef';
process.env['FORTLESS_DEV_SECRET_FILE'] = path.join(tempDir, 'dev-secret');
process.env['FORTLESS_REACT_CUSTOMER_UI'] = 'true';
process.env['PAYMENTS_MODE'] = 'disabled';
process.env['PROVIDER_MODE'] = 'disabled';
process.env['EMAIL_MODE'] = 'disabled';
process.env['APP_ORIGIN'] = 'http://127.0.0.1:4183';
process.env['ALLOWED_ORIGINS'] = 'http://127.0.0.1:4183';

const [{ getDatabase }, { SCHEMA_SQL }, { runMigrations }, { seedInitialCatalog }, { registerUser }, { buildServer }] = await Promise.all([
  import('../../src/database/index.js'), import('../../src/database/schema.js'), import('../../src/database/migrations.js'),
  import('../../src/modules/catalog/catalog.js'), import('../../src/modules/identity/auth.js'), import('../../src/server.js'),
]);

const db = getDatabase();
db.exec(SCHEMA_SQL); runMigrations(db); seedInitialCatalog(db); db.pragma('foreign_keys = OFF');
const user = registerUser({ email: 'browser@example.test', password: 'Browser-Test-Password-123!', name: 'Browser Owner', ipAddress: '127.0.0.1', userAgent: 'playwright' }, db);
db.prepare("UPDATE users SET status = 'ACTIVE', email_verified_at = datetime('now') WHERE id = ?").run(user.user.id);
const node = db.prepare('SELECT id FROM nodes LIMIT 1').get() as { id: string };
db.prepare("INSERT INTO quotes (id, account_id, currency, subtotal_minor_units, tax_minor_units, total_minor_units, tax_calculation_snapshot, valid_until, status) VALUES ('quo_browser', ?, 'EUR', 1000, 190, 1190, '{}', datetime('now', '+1 hour'), 'CONVERTED')").run(user.account.id);
db.prepare("INSERT INTO orders (id, account_id, quote_id, status, currency, total_minor_units, idempotency_key) VALUES ('ord_browser', ?, 'quo_browser', 'COMPLETED', 'EUR', 1190, 'browser_order')").run(user.account.id);
db.prepare("INSERT INTO order_items (id, order_id, plan_version_id, region_id, custom_options, fulfillment_status) VALUES ('ori_browser', 'ord_browser', 'plv_mc_4gb', 'reg_fra_1', '{\"serverName\":\"Integration Minecraft\"}', 'FULFILLED')").run();
db.prepare("INSERT INTO services (id, account_id, order_item_id, provider_type, provider_instance_id, identifier, contract_status, node_id) VALUES ('svc_browser', ?, 'ori_browser', 'PTERODACTYL', 'test', 'browser01', 'ACTIVE', ?)").run(user.account.id, node.id);
db.prepare("INSERT INTO service_desired_configs (service_id, plan_version_id, cpu_limit_pct, memory_limit_mb, disk_limit_mb) VALUES ('svc_browser', 'plv_mc_4gb', 200, 4096, 20480)").run();
db.prepare("INSERT INTO service_observed_states (service_id, runtime_state) VALUES ('svc_browser', 'RUNNING')").run();

const app = buildServer();
app.get('/__test__/health', async () => ({ ok: true }));
await app.listen({ host: '127.0.0.1', port: 4183 });

const close = async () => { await app.close(); fs.rmSync(tempDir, { recursive: true, force: true }); process.exit(0); };
process.on('SIGTERM', close); process.on('SIGINT', close);
