import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { PterodactylHttpAdapter, type ProviderAdapter } from './adapter.js';

export async function resolvePanelUserId(
  accountId: string,
  adapter: ProviderAdapter,
  db: Database.Database
): Promise<number | undefined> {
  if (!(adapter instanceof PterodactylHttpAdapter)) return undefined;

  const linked = db.prepare("SELECT panel_user_id FROM panel_users WHERE account_id = ? AND provider_type = 'PTERODACTYL'")
    .get(accountId) as { panel_user_id: number } | undefined;
  if (linked) return linked.panel_user_id;

  const owner = db.prepare(`
    SELECT u.email, u.name FROM accounts a JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?
  `).get(accountId) as { email: string; name: string } | undefined;
  if (!owner) throw new Error(`Account ${accountId} has no owner to link a panel user to`);

  const correlationTag = `fortless_acc_${accountId}`;
  const parts = owner.name.trim().split(/\s+/);
  const created = await adapter.ensurePanelUser({
    correlationTag,
    email: owner.email,
    username: `fl_${accountId.replace(/^acc_/, '').slice(0, 16)}`,
    firstName: (parts[0] || 'Fortless').slice(0, 100),
    lastName: (parts.slice(1).join(' ') || 'Customer').slice(0, 100),
  });

  db.prepare(`
    INSERT INTO panel_users (account_id, provider_type, panel_user_id, panel_username, panel_email, correlation_tag)
    VALUES (?, 'PTERODACTYL', ?, ?, ?, ?)
    ON CONFLICT(account_id) DO NOTHING
  `).run(accountId, created.panelUserId, created.username, created.email, correlationTag);
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
    VALUES (?, ?, 'SYSTEM', 'panel_user.linked', 'account', ?, ?, ?)
  `).run(`aud_${crypto.randomUUID()}`, accountId, accountId, correlationTag, JSON.stringify({ panelUserId: created.panelUserId }));

  return created.panelUserId;
}

/**
 * Ensure the account has a panel user and that every provisioned server it owns belongs to that user.
 * Idempotent: servers already owned by the panel user are left untouched.
 */
export async function ensureAccountPanelAccess(
  accountId: string,
  adapter: ProviderAdapter,
  db: Database.Database = getDatabase()
): Promise<number | undefined> {
  const panelUserId = await resolvePanelUserId(accountId, adapter, db);
  if (panelUserId === undefined || !(adapter instanceof PterodactylHttpAdapter)) return panelUserId;

  const services = db.prepare(`
    SELECT id, external_id FROM services
    WHERE account_id = ? AND provider_type = 'PTERODACTYL' AND external_id IS NOT NULL
  `).all(accountId) as { id: string; external_id: string }[];

  for (const svc of services) {
    const moved = await adapter.assignServerOwner(svc.external_id, panelUserId);
    if (moved) {
      db.prepare(`
        INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
        VALUES (?, ?, 'SYSTEM', 'service.owner_assigned', 'service', ?, ?, ?)
      `).run(`aud_${crypto.randomUUID()}`, accountId, svc.id, `corr_${crypto.randomUUID()}`, JSON.stringify({ panelUserId }));
    }
  }
  return panelUserId;
}
