/**
 * Disposable Fastify for the live React Admin browser tests: temp database, seeded OWNER with a verified session, no provider, payments or email.
 * A tiny control server exposes the session token and a step-up switch to the test only. Never run this against real data.
 *   FORTLESS_PREVIEW_BACKEND=http://127.0.0.1:4184 FORTLESS_PREVIEW_ORIGIN=http://127.0.0.1:4184 vite --port 4185
 */
import http from 'node:http';

const API = 4184; const CONTROL = 4186;
process.env['APP_ORIGIN'] = `http://127.0.0.1:${API}`;
process.env['ALLOWED_ORIGINS'] = `http://127.0.0.1:${API}`;
process.env['FORTLESS_REACT_ADMIN_PREVIEW'] = '1';
const { makeHarness } = await import('../../tests/helpers/harness.js');
const { createTicket } = await import('../../src/modules/support/tickets.js');

const h = await makeHarness();
const owner = h.user('live_owner', { staff: 'OWNER' });
const customer = h.user('live_customer');
h.db.prepare("UPDATE users SET name = 'Live Customer', email = 'live.customer@example.test' WHERE id = ?").run(customer.id);
h.db.prepare("UPDATE accounts SET name = 'Live Customer GmbH' WHERE id = ?").run(customer.accountId);
for (let i = 0; i < 55; i++) h.user(`live_bulk_${i}`);
const ticket = createTicket({ accountId: customer.accountId, userId: customer.id, subject: 'Live contract ticket', message: 'Please help with my server', priority: 'NORMAL', ipAddress: '127.0.0.1' } as never, h.db) as { id?: string; ticketId?: string };
h.db.prepare("INSERT INTO announcement_categories (id, slug, name, description, sort_order) VALUES ('anc_live', 'live-news', 'Live news', '', 1)").run();
h.db.prepare("INSERT INTO announcements (id, slug, category, kind, title, body_markdown, is_published, created_by_user_id) VALUES ('ann_live', 'live-announcement', 'live-news', 'NEWS', 'Live announcement', 'Hello', 0, ?)").run(owner.id);

await h.app.listen({ host: '127.0.0.1', port: API });
const roleTokens = new Map<string, string>();
const control = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  const roleMatch = req.url?.match(/^\/session\/([A-Z_]+)$/);
  if (roleMatch) { const role = roleMatch[1]!; if (!roleTokens.has(role)) roleTokens.set(role, h.user(`live_${role.toLowerCase()}`, { staff: role }).token); return void res.end(JSON.stringify({ token: roleTokens.get(role) })); }
  if (req.url === '/session') return void res.end(JSON.stringify({ token: owner.token, accountId: customer.accountId, ticketId: ticket.id ?? ticket.ticketId, health: true }));
  if (req.url === '/step-up' && req.method === 'POST') { h.stepUp(owner.id); return void res.end('{"ok":true}'); }
  if (req.url === '/step-up-clear' && req.method === 'POST') { h.db.prepare('UPDATE sessions SET step_up_verified_at = NULL WHERE user_id = ?').run(owner.id); return void res.end('{"ok":true}'); }
  if (req.url === '/query' && req.method === 'POST') { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { const { sql } = JSON.parse(b) as { sql: string }; if (!/^\s*select\s/i.test(sql)) throw new Error('read-only'); res.end(JSON.stringify(h.db.prepare(sql).all())); } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String(e) })); } }); return; }
  res.statusCode = 404; res.end('{}');
});
control.listen(CONTROL, '127.0.0.1');
const close = async () => { control.close(); await h.close(); process.exit(0); };
process.on('SIGTERM', close); process.on('SIGINT', close);
console.log('live admin test server ready');
