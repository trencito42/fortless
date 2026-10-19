// Isolated visual-test server. It never reads the development/production database or provider credentials.
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3022';
process.env['HOST'] = '127.0.0.1';
process.env['APP_ORIGIN'] = 'http://127.0.0.1:3022';
process.env['ALLOWED_ORIGINS'] = 'http://127.0.0.1:3022';
process.env['DATABASE_PATH'] = ':memory:';
process.env['SESSION_SECRET'] = 'admin-visual-fixture-secret-0123456789abcdef';
process.env['EMAIL_MODE'] = 'disabled';
process.env['PAYMENTS_MODE'] = 'disabled';
process.env['PROVIDER_MODE'] = 'disabled';
process.env['SMTP_HOST'] = '';
process.env['SMTP_USER'] = '';
process.env['SMTP_PASSWORD'] = '';
process.env['EMAIL_PASSWORD'] = '';
process.env['STRIPE_SECRET_KEY'] = '';
process.env['STRIPE_WEBHOOK_SECRET'] = '';
process.env['PTERODACTYL_PANEL_URL'] = '';
process.env['PTERODACTYL_API_KEY'] = '';
process.env['PTERODACTYL_CLIENT_API_KEY'] = '';
process.env['PTERODACTYL_KEYMINT_SECRET'] = '';
process.env['BACKUP_INTERVAL_HOURS'] = '0';

const [{ getDatabase }, { SCHEMA_SQL }, { runMigrations }, { seedInitialCatalog }, { createSessionForUser }, { buildServer }] = await Promise.all([
  import('../../src/database/index.js'),
  import('../../src/database/schema.js'),
  import('../../src/database/migrations.js'),
  import('../../src/modules/catalog/catalog.js'),
  import('../../src/modules/identity/auth.js'),
  import('../../src/server.js'),
]);

const db = getDatabase();
db.exec(SCHEMA_SQL);
runMigrations(db);
seedInitialCatalog(db, { publishDemonstrationCatalog: true });
db.prepare("INSERT INTO users (id, email, password_hash, name, status, email_verified_at) VALUES ('usr_visual_owner', 'admin.fixture@example.test', 'fixture-no-login', 'Visual QA Owner', 'ACTIVE', datetime('now','utc'))").run();
db.prepare("INSERT INTO accounts (id, name, owner_user_id, billing_email) VALUES ('acc_visual', 'Fortless Visual Fixture', 'usr_visual_owner', 'billing.fixture@example.test')").run();
db.prepare("INSERT INTO memberships (id, account_id, user_id, role) VALUES ('mem_visual', 'acc_visual', 'usr_visual_owner', 'OWNER')").run();
db.prepare("INSERT INTO staff_memberships (user_id, role, status) VALUES ('usr_visual_owner', 'OWNER', 'ACTIVE')").run();
db.prepare("INSERT INTO mfa_factors (id, user_id, type, secret_encrypted, is_confirmed) VALUES ('mfa_visual', 'usr_visual_owner', 'TOTP', 'fixture-only', 1)").run();
db.prepare(`INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
  VALUES ('aud_visual', 'acc_visual', 'usr_visual_owner', 'STAFF', 'fixture.visual_review_started', 'account', 'acc_visual', '127.0.0.1', 'cor_visual', '{"source":"isolated E2E fixture"}')`).run();

const token = createSessionForUser('usr_visual_owner', '127.0.0.1', 'Playwright visual fixture', true, db);
db.prepare("UPDATE sessions SET step_up_verified_at = datetime('now','utc') WHERE user_id = 'usr_visual_owner'").run();
const app = buildServer();
app.get('/__e2e/admin-session', async (_request, reply) => {
  reply.setCookie('fortless_session', token, { path: '/', httpOnly: true, secure: false, sameSite: 'lax' });
  return reply.redirect('/admin');
});
await app.listen({ host: '127.0.0.1', port: 3022 });

const shutdown = () => app.close().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
