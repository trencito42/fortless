import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { type ProviderAdapter } from './adapter.js';
import { getProviderAdapter } from '../outbox/worker.js';

export interface ServiceDetail {
  id: string;
  accountId: string;
  orderItemId: string;
  providerType: string;
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
  db: Database.Database = getDatabase()
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
    WHERE s.id = ? AND s.account_id = ?
  `).get(serviceId, accountId) as any;

  if (!row) {
    throw new Error('Service not found');
  }

  const audits = db.prepare(`
    SELECT id, action, actor_type, created_at, metadata
    FROM audit_events
    WHERE resource_type = 'service' AND resource_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(serviceId) as Array<{
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
    action: 'START' | 'STOP' | 'RESTART' | 'KILL';
    ipAddress?: string;
  },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase()
): Promise<{ success: boolean; runtimeState: string }> {
  const service = db.prepare(`
    SELECT id, external_id, identifier, contract_status, account_id
    FROM services
    WHERE id = ? AND account_id = ?
  `).get(params.serviceId, params.accountId) as ({
    id: string;
    external_id: string | null;
    identifier: string | null;
    contract_status: string;
    account_id: string;
  }) | undefined;

  if (!service) {
    throw new Error('Service not found');
  }

  if (service.contract_status !== 'ACTIVE') {
    throw new Error(`Service cannot receive power commands in ${service.contract_status} status`);
  }

  if (!service.external_id) {
    throw new Error('Service is still provisioning and not ready for power actions');
  }

  // Execute on provider
  await adapter.powerAction(service.external_id, params.action);

  const newRuntime = params.action === 'STOP' || params.action === 'KILL' ? 'STOPPED' : 'RUNNING';

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = ?, last_checked_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(newRuntime, service.id);

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
      SET contract_status = 'SUSPENDED', updated_at = datetime('now', 'utc')
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
      SET contract_status = 'ACTIVE', updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(service.id);

    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = 'RUNNING', last_checked_at = datetime('now', 'utc')
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

  if (service.contract_status === 'TERMINATED') {
    return; // Already terminated idempotently
  }

  if (service.external_id) {
    try {
      await adapter.terminate(service.external_id);
    } catch (err: unknown) {
      // If server does not exist remotely, proceed to clean up local state
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

    // Release node capacity
    if (desired && service.node_id) {
      trx.prepare(`
        UPDATE nodes
        SET allocated_memory_mb = MAX(0, allocated_memory_mb - ?),
            allocated_disk_mb = MAX(0, allocated_disk_mb - ?)
        WHERE id = ?
      `).run(desired.memory_limit_mb, desired.disk_limit_mb, service.node_id);
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
