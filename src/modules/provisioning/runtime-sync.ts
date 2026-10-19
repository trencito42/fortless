import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { PterodactylHttpAdapter, ProviderError } from './adapter.js';
import { withAccountClientKey } from './console.js';
import { ensureAccountPanelAccess, resolvePanelUserId } from './panel-link.js';
import { queueEmail } from '../email/outbox.js';

// Wings states that map to a stable runtime state. Transitional states (starting, stopping) leave the row as is.
const STATE_MAP: Record<string, 'RUNNING' | 'STOPPED'> = { running: 'RUNNING', offline: 'STOPPED' };

/** Services someone is looking at right now are polled often; the rest only occasionally. */
const HOT_MS = 10 * 60 * 1000;
export const HOT_INTERVAL_S = 30;
export const COLD_INTERVAL_S = 300;
const CONCURRENCY = 5;
const hot = new Map<string, number>();

/** Called when a customer opens a service (usage, console), so it is polled at the fast rate for a while. */
export function touchService(serviceId: string, now = Date.now()): void {
  hot.set(serviceId, now);
  if (hot.size > 5000) for (const [id, t] of hot) if (now - t > HOT_MS) hot.delete(id);
}
export const resetHotServices = () => hot.clear();

interface ActiveService { id: string; account_id: string; external_id: string; runtime_state: string; last_checked_at: string | null }

function activeServices(db: Database.Database): ActiveService[] {
  return db.prepare(`
    SELECT s.id, s.account_id, s.external_id, COALESCE(sos.runtime_state, 'UNKNOWN') AS runtime_state, sos.last_checked_at
    FROM services s LEFT JOIN service_observed_states sos ON sos.service_id = s.id
    WHERE s.provider_type = 'PTERODACTYL' AND s.contract_status = 'ACTIVE' AND s.external_id IS NOT NULL
  `).all() as ActiveService[];
}

const ageSeconds = (utc: string | null, now: number) => (utc ? (now - Date.parse(utc.replace(' ', 'T') + 'Z')) / 1000 : Infinity);

/**
 * Refreshes service_observed_states from the panel so lists and dashboards match the live state instead of the
 * last action a user clicked. Services viewed recently are refreshed every 30 s, the rest every 5 minutes,
 * with a small fixed concurrency so a large fleet cannot flood the panel.
 */
export async function syncRuntimeStates(adapter: PterodactylHttpAdapter, db: Database.Database, secret: string, now = Date.now()): Promise<number> {
  const due = activeServices(db).filter((svc) => {
    const interval = svc.runtime_state === 'INSTALLING' || now - (hot.get(svc.id) ?? 0) < HOT_MS ? HOT_INTERVAL_S : COLD_INTERVAL_S;
    return ageSeconds(svc.last_checked_at, now) >= interval - 1;
  });

  let updated = 0;
  const one = async (svc: ActiveService) => {
    try {
      const usage = await withAccountClientKey(svc.account_id, adapter, db, secret, (key) => adapter.getResourceUsage(svc.external_id, key));
      const next = STATE_MAP[usage.state];
      db.prepare("UPDATE service_observed_states SET last_checked_at = datetime('now', 'utc') WHERE service_id = ?").run(svc.id);
      if (!next) return;
      if (svc.runtime_state === 'INSTALLING') {
        updated += completeReinstall(db, svc, next, usage);
        return;
      }
      updated += db.prepare("UPDATE service_observed_states SET runtime_state = ? WHERE service_id = ? AND runtime_state != ?").run(next, svc.id, next).changes;
    } catch (err) {
      // Only an Application API 404 proves the server was removed from the panel; client API errors prove nothing.
      if (err instanceof ProviderError && err.statusCode === 404 && await adapter.serverExists(svc.external_id).then((e) => !e, () => false)) {
        updated += markProviderMissing(db, svc);
        return;
      }
      console.error(`[RuntimeSync] ${svc.id}:`, (err as Error).name, (err as Error).message);
    }
  };
  for (let i = 0; i < due.length; i += CONCURRENCY) await Promise.all(due.slice(i, i + CONCURRENCY).map(one));
  return updated;
}

function completeReinstall(
  db: Database.Database,
  svc: ActiveService,
  runtimeState: 'RUNNING' | 'STOPPED',
  usage: { state: string; cpuPct: number; memoryBytes: number; diskBytes: number; uptimeMs: number }
): number {
  const pending = db.prepare(`
    SELECT requested.id
    FROM audit_events requested
    WHERE requested.resource_id = ?
      AND requested.action = 'service.settings.reinstall'
      AND NOT EXISTS (
        SELECT 1 FROM audit_events completed
        WHERE completed.resource_id = requested.resource_id
          AND completed.action = 'service.settings.reinstall_completed'
          AND datetime(completed.created_at) >= datetime(requested.created_at)
      )
    ORDER BY requested.created_at DESC
    LIMIT 1
  `).get(svc.id) as { id: string } | undefined;
  if (!pending) {
    return db.prepare("UPDATE service_observed_states SET runtime_state = ?, raw_metrics = ? WHERE service_id = ? AND runtime_state != ?")
      .run(runtimeState, JSON.stringify(usage), svc.id, runtimeState).changes;
  }

  return db.transaction(() => {
    const detail = db.prepare(`
      SELECT u.email AS recipient,
             COALESCE(json_extract(oi.custom_options, '$.serverName'), pv.name, 'Hosting service') AS service_name,
             COALESCE(n.fqdn, 'Open Fortless to view the connection address') AS address,
             COALESCE(r.name, 'Fortless Cloud') AS region
      FROM services s
      JOIN accounts a ON a.id = s.account_id
      JOIN users u ON u.id = a.owner_user_id
      LEFT JOIN order_items oi ON oi.id = s.order_item_id
      LEFT JOIN plan_versions pv ON pv.id = oi.plan_version_id
      LEFT JOIN nodes n ON n.id = s.node_id
      LEFT JOIN regions r ON r.id = n.region_id
      WHERE s.id = ?
    `).get(svc.id) as { recipient: string; service_name: string; address: string; region: string };
    const emailId = queueEmail(db, {
      recipient: detail.recipient,
      template: 'service_ready',
      payload: { serviceName: detail.service_name, address: detail.address, region: detail.region },
    });
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
      VALUES (?, ?, 'SYSTEM', 'service.settings.reinstall_completed', 'service', ?, ?, ?)
    `).run(
      `aud_${crypto.randomUUID()}`, svc.account_id, svc.id, `corr_${crypto.randomUUID()}`,
      JSON.stringify({ requestAuditId: pending.id, emailQueued: Boolean(emailId), runtimeState })
    );
    return db.prepare(`
      UPDATE service_observed_states
      SET runtime_state = ?, last_checked_at = datetime('now', 'utc'), raw_metrics = ?
      WHERE service_id = ? AND runtime_state = 'INSTALLING'
    `).run(runtimeState, JSON.stringify(usage), svc.id).changes;
  })();
}

/** Flags a service whose server no longer exists on the panel. It is never terminated or refunded automatically. */
function markProviderMissing(db: Database.Database, svc: { id: string; account_id: string }): number {
  const res = db.prepare(`
    UPDATE service_observed_states
    SET runtime_state = 'ERROR', last_checked_at = datetime('now', 'utc'), raw_metrics = '{"reason":"PROVIDER_RESOURCE_MISSING"}'
    WHERE service_id = ? AND runtime_state != 'ERROR'
  `).run(svc.id);
  if (res.changes > 0) {
    db.prepare(`
      INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
      VALUES (?, ?, 'SYSTEM', 'service.provider_missing', 'service', ?, ?, '{"reason":"Server no longer exists on the panel"}')
    `).run(`aud_${crypto.randomUUID()}`, svc.account_id, svc.id, `corr_${crypto.randomUUID()}`);
  }
  return res.changes;
}

export interface ReconcileResult { checked: number; missing: number; drifted: number; membersRevoked: number }

/**
 * Compares Fortless with the panel using batch calls: one listing per 100 servers (existence and limits) and one
 * subuser listing per shared service. Limit drift and missing servers are recorded for staff, never auto-"fixed".
 */
export async function reconcileWithPanel(adapter: PterodactylHttpAdapter, db: Database.Database, secret: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, missing: 0, drifted: 0, membersRevoked: 0 };
  const services = db.prepare(`
    SELECT s.id, s.account_id, s.external_id, sdc.cpu_limit_pct, sdc.memory_limit_mb, sdc.disk_limit_mb, sos.raw_metrics
    FROM services s
    LEFT JOIN service_desired_configs sdc ON sdc.service_id = s.id
    LEFT JOIN service_observed_states sos ON sos.service_id = s.id
    WHERE s.provider_type = 'PTERODACTYL' AND s.contract_status = 'ACTIVE' AND s.external_id IS NOT NULL
  `).all() as Array<{ id: string; account_id: string; external_id: string; cpu_limit_pct: number | null; memory_limit_mb: number | null; disk_limit_mb: number | null; raw_metrics: string | null }>;
  if (!services.length) return result;

  const panel = new Map((await adapter.listServers()).map((p) => [String(p.id), p]));
  for (const svc of services) {
    result.checked++;
    const p = panel.get(svc.external_id);
    if (!p) {
      // The listing is authoritative only when the direct lookup agrees.
      if (await adapter.serverExists(svc.external_id).then((e) => !e, () => false)) result.missing += markProviderMissing(db, svc);
      continue;
    }
    if (svc.memory_limit_mb === null) continue;
    const diffs: Record<string, { expected: number; actual: number }> = {};
    if (p.limits.memoryMb !== svc.memory_limit_mb) diffs['memoryMb'] = { expected: svc.memory_limit_mb, actual: p.limits.memoryMb };
    if (svc.cpu_limit_pct !== null && p.limits.cpuPct !== svc.cpu_limit_pct) diffs['cpuPct'] = { expected: svc.cpu_limit_pct, actual: p.limits.cpuPct };
    if (svc.disk_limit_mb !== null && p.limits.diskMb !== svc.disk_limit_mb) diffs['diskMb'] = { expected: svc.disk_limit_mb, actual: p.limits.diskMb };
    let previous: Record<string, unknown> = {};
    try { previous = JSON.parse(svc.raw_metrics || '{}'); } catch { /* ignore */ }
    const drift = Object.keys(diffs).length ? diffs : undefined;
    if (JSON.stringify(previous['drift'] ?? null) !== JSON.stringify(drift ?? null)) {
      const next = { ...previous }; if (drift) next['drift'] = drift; else delete next['drift'];
      db.prepare('UPDATE service_observed_states SET raw_metrics = ? WHERE service_id = ?').run(JSON.stringify(next), svc.id);
      if (drift) {
        result.drifted++;
        db.prepare(`
          INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
          VALUES (?, ?, 'SYSTEM', 'service.limits_drift', 'service', ?, ?, ?)
        `).run(`aud_${crypto.randomUUID()}`, svc.account_id, svc.id, `corr_${crypto.randomUUID()}`, JSON.stringify(drift));
      }
    }
  }

  // Shared users removed directly on the panel lose their access in Fortless too.
  const shared = db.prepare(`
    SELECT DISTINCT s.id, s.account_id, s.external_id FROM services s
    JOIN service_members m ON m.service_id = s.id WHERE s.contract_status = 'ACTIVE' AND s.external_id IS NOT NULL AND m.panel_subuser_uuid IS NOT NULL
  `).all() as Array<{ id: string; account_id: string; external_id: string }>;
  for (const svc of shared) {
    if (!panel.has(svc.external_id)) continue;
    try {
      const res = await withAccountClientKey(svc.account_id, adapter, db, secret, (key) => adapter.clientServerCall(svc.external_id, key, 'GET', '/users'));
      // NEW-389: a reply without a user list is an error, not "everyone was removed". Members are only revoked when two
      //          consecutive reads both lack them.
      if (!Array.isArray(res?.data)) throw new Error('The panel returned an unexpected sub-user listing; no member was changed.');
      const confirm = await withAccountClientKey(svc.account_id, adapter, db, secret, (key) => adapter.clientServerCall(svc.external_id, key, 'GET', '/users'));
      if (!Array.isArray(confirm?.data)) throw new Error('The panel returned an unexpected sub-user listing; no member was changed.');
      const live = new Set<string>([...res.data, ...confirm.data].map((u: any) => String(u.attributes?.uuid)));
      const members = db.prepare('SELECT id, user_id, panel_subuser_uuid FROM service_members WHERE service_id = ? AND panel_subuser_uuid IS NOT NULL').all(svc.id) as Array<{ id: string; user_id: string; panel_subuser_uuid: string }>;
      for (const m of members) {
        if (live.has(m.panel_subuser_uuid)) continue;
        db.prepare('DELETE FROM service_members WHERE id = ?').run(m.id);
        result.membersRevoked++;
        db.prepare(`
          INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
          VALUES (?, ?, 'SYSTEM', 'service.member.revoked_on_panel', 'service', ?, ?, ?)
        `).run(`aud_${crypto.randomUUID()}`, svc.account_id, svc.id, `corr_${crypto.randomUUID()}`, JSON.stringify({ userId: m.user_id }));
      }
    } catch (err) {
      console.error(`[Reconcile] members of ${svc.id}:`, (err as Error).name, (err as Error).message);
    }
  }
  return result;
}

export class RelinkError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) { super(message); this.name = 'RelinkError'; }
}

/**
 * Staff action: point a service at a server that was recreated on the panel under another id. The server must exist,
 * must not already belong to another service, and is handed to the account's own panel user.
 */
export async function relinkService(
  params: { serviceId: string; panelServerId: unknown; actorUserId: string; ipAddress?: string; confirmTakeover?: boolean },
  adapter: PterodactylHttpAdapter,
  db: Database.Database
): Promise<{ externalId: string; identifier: string }> {
  const id = Number(params.panelServerId);
  if (!Number.isInteger(id) || id <= 0) throw new RelinkError('Enter the numeric panel server id.', 'INVALID_INPUT', 400);
  const svc = db.prepare('SELECT id, account_id, external_id, identifier, contract_status, provider_type FROM services WHERE id = ?').get(params.serviceId) as
    { id: string; account_id: string; external_id: string | null; identifier: string | null; contract_status: string; provider_type: string } | undefined;
  if (!svc) throw new RelinkError('Service not found', 'NOT_FOUND', 404);
  if (svc.provider_type !== 'PTERODACTYL' || svc.contract_status === 'TERMINATED') throw new RelinkError('This service cannot be relinked.', 'NOT_RELINKABLE', 409);
  const clash = db.prepare('SELECT id FROM services WHERE external_id = ? AND id != ?').get(String(id), svc.id);
  if (clash) throw new RelinkError('That panel server is already linked to another service.', 'ALREADY_LINKED', 409);
  const server = await adapter.getServerSummary(id);
  if (!server) throw new RelinkError('No such server on the panel.', 'NOT_FOUND_ON_PANEL', 404);

  // Prepare and verify provider ownership before committing local DB update (NEW-322)
  const panelUserId = await resolvePanelUserId(svc.account_id, adapter, db);
  if (!panelUserId) {
    throw new RelinkError('Failed to resolve panel user for service account.', 'PANEL_USER_MISSING', 502);
  }
  if (server.userId !== panelUserId) {
    // NEW-388: never hand a server that belongs to someone else to this customer by accident.
    const holder = db.prepare("SELECT account_id FROM panel_users WHERE panel_user_id = ? AND provider_type = 'PTERODACTYL'").get(server.userId) as { account_id: string } | undefined;
    if (holder && holder.account_id !== svc.account_id) {
      throw new RelinkError('That panel server belongs to a different customer account.', 'OWNED_BY_OTHER_ACCOUNT', 409);
    }
    if (!params.confirmTakeover) {
      throw new RelinkError(`That panel server is owned by panel user ${server.userId}, who is not linked to this account. Repeat with confirmation to take it over.`, 'TAKEOVER_CONFIRMATION_REQUIRED', 409);
    }
  }

  const oldExternal = svc.external_id;
  const intent = (action: string, extra: Record<string, unknown>) => db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'STAFF', ?, 'service', ?, ?, ?, ?)
  `).run(`aud_${crypto.randomUUID()}`, svc.account_id, params.actorUserId, action, svc.id, params.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`, JSON.stringify({ from: oldExternal, to: String(id), ...extra }));
  // The intent is recorded before the first provider call, so a failure half way still leaves a trace.
  intent('service.relink_requested', { previousPanelOwner: server.userId, takeover: server.userId !== panelUserId });
  if (server.userId !== panelUserId) {
    await adapter.assignServerOwner(String(id), panelUserId);
  }
  await ensureAccountPanelAccess(svc.account_id, adapter, db);

  // Provider steps are done; the local change and its audit event are one transaction.
  db.transaction(() => {
    db.prepare("UPDATE services SET external_id = ?, identifier = ?, updated_at = datetime('now', 'utc') WHERE id = ?").run(String(id), server.identifier, svc.id);
    db.prepare("UPDATE service_observed_states SET runtime_state = 'UNKNOWN', raw_metrics = '{}', last_checked_at = datetime('now', 'utc', '-1 day') WHERE service_id = ?").run(svc.id);
    intent('service.relinked', {});
  })();
  return { externalId: String(id), identifier: server.identifier };
}
