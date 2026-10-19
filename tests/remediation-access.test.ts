import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../src/database/schema.js';
import { runMigrations } from '../src/database/migrations.js';
import { seedInitialCatalog } from '../src/modules/catalog/catalog.js';
import { registerUser } from '../src/modules/identity/auth.js';
import { PterodactylHttpAdapter } from '../src/modules/provisioning/adapter.js';
import { resolvePanelUserId, secureLegacyPanelEmail, panelEmailFor, PANEL_EMAIL_DOMAIN } from '../src/modules/provisioning/panel-link.js';

let db: Database.Database;
beforeEach(() => { db = new Database(':memory:'); db.pragma('foreign_keys = ON'); db.exec(SCHEMA_SQL); runMigrations(db); seedInitialCatalog(db); });
afterEach(() => db.close());

class FakePanel extends PterodactylHttpAdapter {
  created: Array<{ email: string }> = [];
  updated: Array<{ id: number; email: string }> = [];
  constructor() { super({ panelUrl: 'https://panel.example.test', apiKey: 'k' }); }
  override async ensurePanelUser(spec: { correlationTag: string; email: string; username: string }) {
    this.created.push({ email: spec.email });
    return { panelUserId: 77, username: spec.username, email: spec.email };
  }
  override async updatePanelUserEmail(id: number, email: string) { this.updated.push({ id, email }); }
}

describe('access remediation', () => {
  it('SSO-01: new panel users get the reserved undeliverable address, never the owner mailbox', async () => {
    const u = registerUser({ email: 'owner@example.com', password: 'Password12345!', name: 'Owner One', ipAddress: '127.0.0.1', userAgent: 't' }, db);
    const panel = new FakePanel();
    await resolvePanelUserId(u.account.id, panel, db);
    expect(panel.created[0]!.email).toBe(panelEmailFor(u.account.id));
    expect(panel.created[0]!.email.endsWith(`@${PANEL_EMAIL_DOMAIN}`)).toBe(true);
    expect(panel.created[0]!.email).not.toContain('owner@example.com');
  });

  it('SSO-01: a legacy panel user with the real mailbox is moved to the reserved address and the SSO email follows', async () => {
    const u = registerUser({ email: 'legacy@example.com', password: 'Password12345!', name: 'Legacy User', ipAddress: '127.0.0.1', userAgent: 't' }, db);
    db.prepare("INSERT INTO panel_users (account_id, provider_type, panel_user_id, panel_username, panel_email, correlation_tag) VALUES (?, 'PTERODACTYL', 5, 'fl_x', 'legacy@example.com', ?)").run(u.account.id, `fortless_acc_${u.account.id}`);
    const panel = new FakePanel();
    expect(await secureLegacyPanelEmail(u.account.id, panel, db)).toBe(true);
    expect(panel.updated).toEqual([{ id: 5, email: panelEmailFor(u.account.id) }]);
    expect((db.prepare('SELECT panel_email e FROM panel_users WHERE account_id = ?').get(u.account.id) as any).e).toBe(panelEmailFor(u.account.id));
    expect(await secureLegacyPanelEmail(u.account.id, panel, db)).toBe(false);
    expect(panel.updated).toHaveLength(1);
  });
});
