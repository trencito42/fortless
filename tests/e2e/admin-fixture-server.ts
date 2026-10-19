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

import { execFileSync } from 'node:child_process';

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
const legacyEditorBundle = execFileSync('git', ['show', 'HEAD:public/assets/editor-ui.js'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 2_000_000 });
app.get('/__e2e/editor-legacy.js', async (_request, reply) => reply.type('application/javascript').send(legacyEditorBundle));
app.get('/__e2e/editor', async (request, reply) => {
  const legacy = (request.query as { legacy?: string }).legacy === '1';
  const longLine = `horizontal-marker ${'x'.repeat(600)} needle-long-line`;
  const content = Array.from({ length: 5105 }, (_, index) => index === 8 ? 'needle first result' : index === 2500 ? longLine : index === 5001 ? 'needle final result' : `setting.${index}=value-${index}`).join('\n');
  return reply.type('text/html').send(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/petal-app.css"><link rel="stylesheet" href="/assets/app-ui.css"><style>body{margin:0;padding:20px;background:var(--bg);color:var(--ink);font-family:var(--font)}#editor{height:680px;overflow:hidden;border-radius:22px}.qa-head{margin-bottom:12px}</style></head><body><div class="qa-head row"><button id="large" class="btn s pri">Large file</button><button id="small" class="btn s">Small file</button><span id="dirty" class="pill">Saved</span></div><div id="editor" class="card"></div><script src="${legacy ? '/__e2e/editor-legacy.js' : '/assets/editor-ui.js'}"></script><script>const host=document.getElementById('editor');const dirty=document.getElementById('dirty');const ed=FortlessEditor.mountEditor(host,{onDirty:(_,v)=>{dirty.textContent=v?'Unsaved':'Saved';dirty.className='pill '+(v?'warn':'good')},onSave:()=>{dirty.textContent='Saved';dirty.className='pill good'}});const large=${JSON.stringify(content)};ed.open('large.properties',large);document.getElementById('large').onclick=()=>ed.show('large.properties');document.getElementById('small').onclick=()=>{if(!ed.value('small.txt'))ed.open('small.txt','one\\ntwo needle\\nthree\\nfour\\nfive\\nsix\\nseven\\neight\\nnine\\nten');else ed.show('small.txt')};</script></body></html>`);
});
app.get('/__e2e/player-admin', async (_request, reply) => reply.type('text/html').send(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/petal-app.css"><link rel="stylesheet" href="/assets/app-ui.css"><style>body{margin:0;padding:20px;background:var(--bg);color:var(--ink);font-family:var(--font)}</style></head><body><main class="col"><section class="card flat server-tool-card" data-testid="administration-status"><div class="ch"><span class="tile good"><svg class="ic"><use href="#i-settings"/></svg></span><div class="tx"><h3>Game administration</h3><p>Minecraft Java · Fortless sends authorized commands through the native server console. RCON is not required.</p></div></div><div class="server-tool-actions"><span class="pill good d">Native Console · available</span><button class="btn s">Configure</button></div></section><section class="card"><div class="ch"><div class="tx"><h3>Live Players</h3><p>Real-time game server status and connected player administration.</p></div><button class="btn s">Refresh</button></div><div class="alert info"><div><b>Sampled player list</b><span>Minecraft Server List Ping may return only part of the roster, so moderation is disabled here to avoid targeting the wrong player.</span></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Player</th><th>Identifier</th><th>Connected</th></tr></thead><tbody><tr><td>Steve</td><td><code>sampled</code></td><td>12m</td></tr></tbody></table></div></section></main></body></html>`));
app.get('/__e2e/admin-session', async (_request, reply) => {
  reply.setCookie('fortless_session', token, { path: '/', httpOnly: true, secure: false, sameSite: 'lax' });
  return reply.redirect('/admin');
});
await app.listen({ host: '127.0.0.1', port: 3022 });

const shutdown = () => app.close().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
