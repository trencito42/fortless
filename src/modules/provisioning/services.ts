import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { PterodactylHttpAdapter, type ProviderAdapter } from './adapter.js';
import { allows, getServiceAccess, permissionList } from './service-access.js';
import { config } from '../../config/index.js';
import { withAccountClientKey } from './console.js';
import { getProviderAdapter } from '../outbox/worker.js';

export interface ServiceAccessInfo {
  kind: 'ACCOUNT' | 'MEMBER';
  preset: string | null;
  permissions: string[];
  sharedBy: string | null;
}

export interface ProviderCapabilities {
  console: boolean;
  files: boolean;
  game: boolean;
  databases: boolean;
  schedules: boolean;
  backups: boolean;
  network: boolean;
  startup: boolean;
  settings: boolean;
  users: boolean;
  power: boolean;
}

export function getProviderCapabilities(providerType: string): ProviderCapabilities {
  switch (providerType?.toUpperCase()) {
    case 'PTERODACTYL':
      return {
        console: true,
        files: true,
        game: true,
        databases: true,
        schedules: true,
        backups: true,
        network: true,
        startup: true,
        settings: true,
        users: true,
        power: true,
      };
    case 'CPANEL':
      return {
        console: false,
        files: false,
        game: false,
        databases: false,
        schedules: false,
        backups: false,
        network: false,
        startup: false,
        settings: true,
        users: true,
        power: false,
      };
    case 'PROXMOX':
      return {
        console: false,
        files: false,
        game: false,
        databases: false,
        schedules: false,
        backups: true,
        network: true,
        startup: false,
        settings: true,
        users: true,
        power: true,
      };
    default:
      return {
        console: false,
        files: false,
        game: false,
        databases: false,
        schedules: false,
        backups: false,
        network: false,
        startup: false,
        settings: true,
        users: true,
        power: false,
      };
  }
}

export interface ServiceDetail {
  access: ServiceAccessInfo;
  id: string;
  accountId: string;
  orderItemId: string;
  providerType: string;
  providerCapabilities?: ProviderCapabilities;
  externalId: string | null;
  identifier: string | null;
  contractStatus: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'TERMINATED';
  nodeId: string;
  nodeName: string;
  nodeFqdn: string;
  regionId: string;
  regionName: string;
  regionCode: string;
  planName: string;
  planVersionId: string;
  desiredConfig: {
    cpuLimitPct: number;
    memoryLimitMb: number;
    diskLimitMb: number;
    startupCommand: string | null;
  } | null;
  observedState: {
    runtimeState: 'RUNNING' | 'STOPPED' | 'INSTALLING' | 'ERROR' | 'OFFLINE' | 'UNKNOWN';
    lastCheckedAt: string;
  } | null;
  auditTrail: Array<{
    id: string;
    action: string;
    actorType: string;
    createdAt: string;
    metadata: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returns tenant-isolated full technical and commercial detail for a service.
 */
export function getServiceDetail(
  serviceId: string,
  accountId: string,
  db: Database.Database = getDatabase(),
  viewer?: { userId: string; role?: string }
): ServiceDetail {
  const row = db.prepare(`
    SELECT s.id, s.account_id, s.order_item_id, s.provider_type, s.external_id, s.identifier,
           s.contract_status, s.node_id, s.created_at, s.updated_at,
           n.name as node_name, n.fqdn as node_fqdn,
           r.id as region_id, r.name as region_name, r.code as region_code,
           pv.name as plan_name, pv.id as plan_version_id,
           sdc.cpu_limit_pct, sdc.memory_limit_mb, sdc.disk_limit_mb, sdc.startup_command,
           sos.runtime_state, sos.last_checked_at
    FROM services s
    JOIN nodes n ON n.id = s.node_id
    JOIN regions r ON r.id = n.region_id
    JOIN order_items oi ON oi.id = s.order_item_id
    JOIN plan_versions pv ON pv.id = oi.plan_version_id
    LEFT JOIN service_desired_configs sdc ON sdc.service_id = s.id
    LEFT JOIN service_observed_states sos ON sos.service_id = s.id
    WHERE s.id = ?
  `).get(serviceId) as any;

  const access = row ? getServiceAccess(db, { serviceId, accountId, userId: viewer?.userId ?? '', role: viewer?.role }) : undefined;
  if (!row || !access) {
    throw new Error('Service not found');
  }

  const audits = db.prepare(`
    SELECT id, action, actor_type, created_at, metadata
    FROM audit_events
    WHERE account_id = ?
      AND ((resource_type = 'service' AND resource_id = ?)
        OR (resource_type = 'order' AND resource_id = (SELECT order_id FROM order_items WHERE id = ?)))
    ORDER BY created_at DESC, rowid DESC
    LIMIT 20
  `).all(row.account_id, serviceId, row.order_item_id) as Array<{
    id: string;
    action: string;
    actor_type: string;
    created_at: string;
    metadata: string;
  }>;

  return {
    id: row.id,
    accountId: row.account_id,
    orderItemId: row.order_item_id,
    providerType: row.provider_type,
    providerCapabilities: getProviderCapabilities(row.provider_type),
    externalId: row.external_id,
    identifier: row.identifier,
    contractStatus: row.contract_status,
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeFqdn: row.node_fqdn,
    regionId: row.region_id,
    regionName: row.region_name,
    regionCode: row.region_code,
    planName: row.plan_name,
    planVersionId: row.plan_version_id,
    desiredConfig: row.cpu_limit_pct ? {
      cpuLimitPct: row.cpu_limit_pct,
      memoryLimitMb: row.memory_limit_mb,
      diskLimitMb: row.disk_limit_mb,
      startupCommand: row.startup_command,
    } : null,
    observedState: row.runtime_state ? {
      runtimeState: row.runtime_state,
      lastCheckedAt: row.last_checked_at,
    } : null,
    auditTrail: audits.map((a) => ({
      id: a.id,
      action: a.action,
      actorType: a.actor_type,
      createdAt: a.created_at,
      metadata: a.metadata,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    access: {
      kind: access.kind,
      preset: access.preset,
      permissions: permissionList(access),
      sharedBy: access.kind === 'MEMBER' ? ((db.prepare('SELECT name FROM accounts WHERE id = ?').get(row.account_id) as { name: string } | undefined)?.name ?? null) : null,
    },
  };
}

/**
 * Executes a customer power action with strict tenant isolation, status checks, and audit logging.
 */
export async function executeServicePowerAction(
  params: {
    serviceId: string;
    accountId: string;
    userId: string;
    role?: string;
    action: 'START' | 'STOP' | 'RESTART' | 'KILL';
    ipAddress?: string;
  },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase()
): Promise<{ success: boolean; runtimeState: string }> {
  const access = getServiceAccess(db, params);
  if (!access) throw new Error('Service not found');
  const needed = params.action === 'START' ? 'control.start' : params.action === 'RESTART' ? 'control.restart' : 'control.stop';
  if (!allows(access, needed)) throw new Error('You do not have permission to do this.');
  const service = access.service;

  if (service.contract_status !== 'ACTIVE') {
    throw new Error(`Service cannot receive power commands in ${service.contract_status} status`);
  }

  if (!service.external_id) {
    throw new Error('Service is still provisioning and not ready for power actions');
  }

  // Execute on provider
  if (adapter instanceof PterodactylHttpAdapter && config.PTERODACTYL_KEYMINT_SECRET) {
    const externalId = service.external_id;
    await withAccountClientKey(params.accountId, adapter, db, config.PTERODACTYL_KEYMINT_SECRET,
      (key) => adapter.powerAction(externalId, params.action, key));
  } else {
    await adapter.powerAction(service.external_id, params.action);
  }

  const newRuntime = params.action === 'STOP' || params.action === 'KILL' ? 'STOPPED' : 'RUNNING';

  runInTransaction((trx) => {
    // Only a stop is recorded right away. A start may still crash, so START/RESTART wait for the live state.
    if (params.action === 'STOP' || params.action === 'KILL') {
      trx.prepare(`
        UPDATE service_observed_states
        SET runtime_state = ?, last_checked_at = datetime('now', 'utc')
        WHERE service_id = ?
      `).run(newRuntime, service.id);
    }

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, ?, 'USER', 'service.power', 'service', ?, ?, ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      service.account_id,
      params.userId,
      service.id,
      params.ipAddress || '127.0.0.1',
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ action: params.action, runtimeState: newRuntime })
    );
  }, db);

  return { success: true, runtimeState: newRuntime };
}

/**
 * Suspends an active service (e.g. for non-payment or staff intervention).
 */
export async function suspendService(
  params: {
    serviceId: string;
    reason: string;
    actorUserId?: string;
    actorType?: 'STAFF' | 'SYSTEM';
    /** Why the service is suspended; a successful payment lifts only BILLING suspensions (NEW-355). */
    category?: 'BILLING' | 'STAFF' | 'DISPUTE';
  },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase()
): Promise<void> {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(params.serviceId) as any;
  if (!service) throw new Error('Service not found');

  if (service.contract_status === 'TERMINATED') {
    throw new Error('Cannot suspend a terminated service');
  }

  if (service.external_id) {
    await adapter.suspend(service.external_id);
  }

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE services
      SET contract_status = 'SUSPENDED', suspension_reason = ?, updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(params.category ?? (params.actorType === 'STAFF' ? 'STAFF' : null), service.id);

    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = 'STOPPED', last_checked_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(service.id);

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, 'service.suspend', 'service', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      service.account_id,
      params.actorUserId || null,
      params.actorType || 'STAFF',
      service.id,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ reason: params.reason })
    );
  }, db);
}

/**
 * Unsuspends a suspended service upon balance settlement or staff clearance.
 */
export async function unsuspendService(
  params: {
    serviceId: string;
    actorUserId?: string;
    actorType?: 'STAFF' | 'SYSTEM';
  },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase()
): Promise<void> {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(params.serviceId) as any;
  if (!service) throw new Error('Service not found');

  if (service.contract_status !== 'SUSPENDED') {
    throw new Error(`Service is in ${service.contract_status} state, not SUSPENDED`);
  }

  if (service.external_id) {
    await adapter.unsuspend(service.external_id);
  }

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE services
      SET contract_status = 'ACTIVE', suspension_reason = NULL, updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(service.id);

    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = 'STOPPED', last_checked_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(service.id);

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, 'service.unsuspend', 'service', ?, '127.0.0.1', ?, '{}', datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      service.account_id,
      params.actorUserId || null,
      params.actorType || 'STAFF',
      service.id,
      `corr_${crypto.randomUUID()}`
    );
  }, db);
}

/**
 * Destructively terminates a service, calls provider deletion, releases node allocation,
 * and updates database status to TERMINATED.
 */
/**
 * NEW-357: node capacity is reserved by the provisioning worker and only counts once the CREATE operation succeeded.
 * A service that never got that far (paid but not provisioned, failed, refunded early) holds nothing to release.
 */
export function capacityIsHeld(db: Database.Database, serviceId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM provision_operations WHERE service_id = ? AND operation_type = 'CREATE' AND status = 'SUCCEEDED'").get(serviceId));
}

export async function terminateService(
  params: {
    serviceId: string;
    reason: string;
    actorUserId?: string;
    actorType?: 'STAFF' | 'SYSTEM' | 'USER';
  },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase()
): Promise<void> {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(params.serviceId) as any;
  if (!service) throw new Error('Service not found');

  const existingTerminateOp = db.prepare(`
    SELECT status FROM provision_operations WHERE service_id = ? AND operation_type = 'TERMINATE'
  `).get(params.serviceId) as { status: string } | undefined;

  if (service.contract_status === 'TERMINATED' && existingTerminateOp?.status === 'SUCCEEDED') {
    return; // Already terminated and capacity released idempotently
  }

  if (service.external_id) {
    try {
      await adapter.terminate(service.external_id);
    } catch (err: unknown) {
      const msg = String((err as Error)?.message || '');
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const isNotFound = statusCode === 404 || msg.includes('404') || msg.toLowerCase().includes('not found');
      if (!isNotFound) {
        // Provider call failed with a non-404 error (network timeout, 5xx, auth failure, etc.)
        // Do NOT mark TERMINATED and do NOT release node capacity!
        db.prepare(`
          UPDATE service_observed_states
          SET runtime_state = 'ERROR', last_checked_at = datetime('now', 'utc')
          WHERE service_id = ?
        `).run(service.id);

        db.prepare(`
          INSERT INTO audit_events (
            id, account_id, actor_user_id, actor_type, action, resource_type,
            resource_id, ip_address, correlation_id, metadata, created_at
          ) VALUES (?, ?, ?, ?, 'service.terminate_failed', 'service', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
        `).run(
          `aud_${crypto.randomUUID()}`,
          service.account_id,
          params.actorUserId || null,
          params.actorType || 'STAFF',
          service.id,
          `corr_${crypto.randomUUID()}`,
          JSON.stringify({ error: (err as Error).message, reason: params.reason, externalId: service.external_id })
        );

        throw err;
      }
    }
  }

  const desired = db.prepare('SELECT * FROM service_desired_configs WHERE service_id = ?').get(service.id) as {
    memory_limit_mb: number;
    disk_limit_mb: number;
  } | undefined;

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE services
      SET contract_status = 'TERMINATED', updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(service.id);

    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = 'OFFLINE', last_checked_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(service.id);

    // Release node capacity exactly once (NEW-343)
    const op = trx.prepare(`
      SELECT id, status FROM provision_operations 
      WHERE service_id = ? AND operation_type = 'TERMINATE'
    `).get(service.id) as { id: string; status: string } | undefined;

    if (!op || op.status !== 'SUCCEEDED') {
      if (desired && service.node_id && capacityIsHeld(trx, service.id)) {
        trx.prepare(`
          UPDATE nodes
          SET allocated_memory_mb = MAX(0, allocated_memory_mb - ?),
              allocated_disk_mb = MAX(0, allocated_disk_mb - ?)
          WHERE id = ?
        `).run(desired.memory_limit_mb, desired.disk_limit_mb, service.node_id);
      }

      if (!op) {
        trx.prepare(`
          INSERT INTO provision_operations (id, service_id, operation_type, status, idempotency_key, correlation_id, attempt_count, created_at, updated_at)
          VALUES (?, ?, 'TERMINATE', 'SUCCEEDED', ?, ?, 1, datetime('now', 'utc'), datetime('now', 'utc'))
        `).run(`pop_${crypto.randomUUID()}`, service.id, `idem_${service.id}_terminate`, `corr_${crypto.randomUUID()}`);
      } else {
        trx.prepare(`
          UPDATE provision_operations
          SET status = 'SUCCEEDED', updated_at = datetime('now', 'utc')
          WHERE id = ?
        `).run(op.id);
      }
    }

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, 'service.terminate', 'service', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      service.account_id,
      params.actorUserId || null,
      params.actorType || 'STAFF',
      service.id,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ reason: params.reason })
    );
  }, db);
}

export const ACTIVITY_CATEGORIES = {
  power: ['service.power'],
  files: ['service.file.write', 'service.file.mkdir', 'service.file.delete', 'service.file.rename', 'service.file.archive', 'service.file.unarchive', 'service.file.copy', 'service.file.move', 'service.file.chmod', 'service.file.pull'],
  backups: ['service.backup.create', 'service.backup.delete', 'service.backup.lock', 'service.backup.restore'],
  network: ['service.network.assign', 'service.network.notes', 'service.network.primary', 'service.network.remove'],
  settings: ['service.startup.variable', 'service.startup.image', 'service.settings.rename', 'service.settings.reinstall'],
  game: ['service.mod.install', 'service.game.icon'],
  databases: ['service.database.create', 'service.database.rotate', 'service.database.delete'],
  schedules: ['service.schedule.create', 'service.schedule.update', 'service.schedule.delete', 'service.schedule.execute', 'service.schedule.task_add', 'service.schedule.task_update', 'service.schedule.task_delete'],
  lifecycle: ['service.created', 'service.provisioned', 'service.provision_failed', 'service.suspend', 'service.unsuspend', 'service.terminate', 'service.owner_assigned', 'service.provider_missing'],
} as const;
export type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES | 'billing' | 'all';
export const ACTIVITY_PAGE_SIZE = 15;
const RANGE_DAYS: Record<string, number> = { '1': 1, '7': 7, '30': 30 };

/**
 * Customer-facing activity for one service. Only an explicit allowlist of actions is listed, so internal
 * noise (console tokens, signed URL requests, key minting) never shows up. Always scoped to the account.
 */
export function listServiceActivity(
  params: { serviceId: string; accountId: string; userId?: string; role?: string; category?: string; range?: string; q?: string; page?: number },
  db: Database.Database = getDatabase()
): { events: Array<{ id: string; action: string; actorType: string; createdAt: string; metadata: string }>; total: number; page: number; pageSize: number } {
  const access = getServiceAccess(db, { serviceId: params.serviceId, accountId: params.accountId, userId: params.userId ?? '', role: params.role });
  if (!access || !allows(access, 'activity.read')) throw new Error('Service not found');
  const svc = { order_item_id: access.service.order_item_id };
  const ownerAccountId = access.service.account_id;

  const category = (params.category ?? 'all') as ActivityCategory;
  const serviceActions: string[] =
    category === 'all' ? Object.values(ACTIVITY_CATEGORIES).flat()
    : category === 'billing' ? []
    : [...(ACTIVITY_CATEGORIES[category as keyof typeof ACTIVITY_CATEGORIES] ?? [])];
  const includeOrders = category === 'all' || category === 'billing';

  const where: string[] = [];
  const args: unknown[] = [ownerAccountId];
  const branches: string[] = [];
  if (serviceActions.length) {
    branches.push(`(resource_type = 'service' AND resource_id = ? AND action IN (${serviceActions.map(() => '?').join(',')}))`);
    args.push(params.serviceId, ...serviceActions);
  }
  if (includeOrders) {
    branches.push(`(resource_type = 'order' AND resource_id = (SELECT order_id FROM order_items WHERE id = ?))`);
    args.push(svc.order_item_id);
  }
  if (!branches.length) return { events: [], total: 0, page: 1, pageSize: ACTIVITY_PAGE_SIZE };
  where.push(`(${branches.join(' OR ')})`);

  const days = RANGE_DAYS[params.range ?? ''];
  if (days) { where.push("created_at >= datetime('now', 'utc', ?)"); args.push(`-${days} days`); }
  const q = (params.q ?? '').trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    where.push("(action LIKE ? ESCAPE '\\' OR metadata LIKE ? ESCAPE '\\')");
    args.push(like, like);
  }

  const base = `FROM audit_events WHERE account_id = ? AND ${where.join(' AND ')}`;
  const total = (db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...args) as { c: number }).c;
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(params.page ?? 1) || 1), pages);
  const rows = db.prepare(`SELECT id, action, actor_type, created_at, metadata ${base} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...args, ACTIVITY_PAGE_SIZE, (page - 1) * ACTIVITY_PAGE_SIZE) as Array<{ id: string; action: string; actor_type: string; created_at: string; metadata: string }>;
  return {
    events: rows.map((r) => ({ id: r.id, action: r.action, actorType: r.actor_type, createdAt: r.created_at, metadata: r.metadata })),
    total, page, pageSize: ACTIVITY_PAGE_SIZE,
  };
}
