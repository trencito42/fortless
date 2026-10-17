import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { type ProviderAdapter, MockPterodactylAdapter } from '../provisioning/adapter.js';

let defaultAdapter: ProviderAdapter = new MockPterodactylAdapter();

export function setProviderAdapter(adapter: ProviderAdapter): void {
  defaultAdapter = adapter;
}

export function getProviderAdapter(): ProviderAdapter {
  return defaultAdapter;
}

export interface OutboxWorkerOptions {
  workerId?: string;
  leaseDurationMs?: number;
  batchSize?: number;
  maxRetries?: number;
}

export async function processOutboxQueue(
  adapter: ProviderAdapter = defaultAdapter,
  db: Database.Database = getDatabase(),
  options: OutboxWorkerOptions = {}
): Promise<number> {
  const workerId = options.workerId || `worker_${crypto.randomBytes(8).toString('hex')}`;
  const leaseDurationMs = options.leaseDurationMs || 60_000;
  const batchSize = options.batchSize || 10;
  const maxRetries = options.maxRetries || 5;

  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  // 0. Recover stale/crashed PROCESSING events whose lease expired
  db.prepare(`
    UPDATE outbox_events
    SET status = 'PENDING',
        lease_token = NULL,
        lease_expires_at = NULL,
        retry_count = retry_count + 1,
        scheduled_at = datetime('now', 'utc')
    WHERE status = 'PROCESSING'
      AND (
        (lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc'))
        OR
        (lease_expires_at IS NULL AND scheduled_at <= datetime('now', '-5 minutes', 'utc'))
      )
  `).run();

  // 1. Atomically claim a batch of pending events in an exclusive transaction
  const claimedEvents = db.transaction(() => {
    const candidates = db.prepare(`
      SELECT id FROM outbox_events
      WHERE (
        status = 'PENDING' AND scheduled_at <= datetime('now', 'utc')
      ) OR (
        status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc')
      )
      ORDER BY created_at ASC
      LIMIT ?
    `).all(batchSize) as { id: string }[];

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`
      UPDATE outbox_events
      SET status = 'PROCESSING',
          lease_token = ?,
          lease_expires_at = ?,
          scheduled_at = datetime('now', 'utc')
      WHERE id IN (${placeholders})
        AND (
          status = 'PENDING'
          OR (status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now', 'utc'))
        )
    `).run(workerId, leaseExpiresAt, ...ids);

    return db.prepare(`
      SELECT * FROM outbox_events
      WHERE lease_token = ? AND status = 'PROCESSING'
      ORDER BY created_at ASC
    `).all(workerId) as ({
      id: string;
      event_type: string;
      aggregate_id: string;
      payload: string;
      retry_count: number;
      lease_token: string;
    })[];
  })();

  let processedCount = 0;

  for (const event of claimedEvents) {
    try {
      if (event.event_type === 'service.provision.v1') {
        await executeProvisioningSaga(event.aggregate_id, JSON.parse(event.payload), adapter, db);
      } else if (event.event_type === 'service.suspend.v1') {
        const service = db.prepare('SELECT external_id FROM services WHERE id = ?').get(event.aggregate_id) as { external_id: string } | undefined;
        if (service?.external_id) {
          await adapter.suspend(service.external_id);
        }
      } else if (event.event_type === 'service.terminate.v1') {
        const service = db.prepare('SELECT external_id FROM services WHERE id = ?').get(event.aggregate_id) as { external_id: string } | undefined;
        if (service?.external_id) {
          await adapter.terminate(service.external_id);
        }
      }

      db.prepare(`
        UPDATE outbox_events
        SET status = 'COMPLETED',
            lease_token = NULL,
            lease_expires_at = NULL
        WHERE id = ? AND lease_token = ?
      `).run(event.id, workerId);
      processedCount++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newRetries = event.retry_count + 1;
      const isDeadLetter = newRetries >= maxRetries || errMsg.includes('Insufficient capacity') || errMsg.includes('maintenance mode');

      if (isDeadLetter) {
        db.prepare(`
          UPDATE outbox_events
          SET status = 'DEAD_LETTER',
              retry_count = ?,
              last_error = ?,
              lease_token = NULL,
              lease_expires_at = NULL
          WHERE id = ? AND lease_token = ?
        `).run(newRetries, errMsg, event.id, workerId);

        db.prepare(`
          UPDATE services
          SET contract_status = 'SUSPENDED'
          WHERE id = ?
        `).run(event.aggregate_id);

        db.prepare(`
          UPDATE service_observed_states
          SET runtime_state = 'ERROR'
          WHERE service_id = ?
        `).run(event.aggregate_id);

        db.prepare(`
          UPDATE provision_operations
          SET status = 'NEEDS_MANUAL_REVIEW', last_error = ?, updated_at = datetime('now', 'utc')
          WHERE service_id = ?
        `).run(errMsg, event.aggregate_id);
      } else {
        const backoffSeconds = Math.min(300, 5 * Math.pow(2, Math.max(0, newRetries - 1)));
        db.prepare(`
          UPDATE outbox_events
          SET status = 'PENDING',
              retry_count = ?,
              last_error = ?,
              lease_token = NULL,
              lease_expires_at = NULL,
              scheduled_at = datetime('now', '+' || ? || ' seconds')
          WHERE id = ? AND lease_token = ?
        `).run(newRetries, errMsg, backoffSeconds, event.id, workerId);
      }
    }
  }

  return processedCount;
}

async function executeProvisioningSaga(
  serviceId: string,
  payload: {
    serviceId: string;
    accountId: string;
    orderItemId: string;
    planVersionId: string;
    nodeId: string;
    customOptions?: {
      serverName?: string;
      repoUrl?: string;
      branch?: string;
      buildCommand?: string;
      startCommand?: string;
      appPort?: number;
      nodeVersion?: string;
    };
  },
  adapter: ProviderAdapter,
  db: Database.Database
): Promise<void> {
  // 1. Fetch Plan Specs
  const plan = db.prepare(`
    SELECT pv.name, pv.resource_specs
    FROM plan_versions pv
    WHERE pv.id = ?
  `).get(payload.planVersionId) as { name: string; resource_specs: string };

  const resources = JSON.parse(plan.resource_specs);
  const correlationTag = `fortless_svc_${serviceId}`;

  // 1b. Node Capacity and Maintenance Verification
  const node = db.prepare(`
    SELECT id, name, max_memory_mb, allocated_memory_mb, max_disk_mb, allocated_disk_mb, maintenance_mode
    FROM nodes WHERE id = ?
  `).get(payload.nodeId) as {
    id: string;
    name: string;
    max_memory_mb: number;
    allocated_memory_mb: number;
    max_disk_mb: number;
    allocated_disk_mb: number;
    maintenance_mode: number;
  } | undefined;

  // Initialize or update provision operation
  const existingOp = db.prepare('SELECT id FROM provision_operations WHERE service_id = ?').get(serviceId);
  if (!existingOp) {
    db.prepare(`
      INSERT INTO provision_operations (id, service_id, operation_type, status, idempotency_key, correlation_id, attempt_count, created_at, updated_at)
      VALUES (?, ?, 'CREATE', 'IN_PROGRESS', ?, ?, 1, datetime('now', 'utc'), datetime('now', 'utc'))
    `).run(`pop_${crypto.randomUUID()}`, serviceId, `idem_${serviceId}_create`, correlationTag);
  } else {
    db.prepare(`
      UPDATE provision_operations
      SET status = 'IN_PROGRESS', attempt_count = attempt_count + 1, updated_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(serviceId);
  }

  if (node && node.maintenance_mode === 1) {
    db.prepare(`
      UPDATE provision_operations
      SET status = 'NEEDS_MANUAL_REVIEW', last_error = 'Node is in maintenance mode', updated_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(serviceId);
    throw new Error(`Node ${node.name} is in maintenance mode`);
  }

  if (node && (node.allocated_memory_mb + resources.memoryMb > node.max_memory_mb || node.allocated_disk_mb + resources.diskMb > node.max_disk_mb)) {
    db.prepare(`
      UPDATE provision_operations
      SET status = 'NEEDS_MANUAL_REVIEW', last_error = 'Insufficient capacity on node', updated_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(serviceId);
    throw new Error(`Insufficient capacity on node ${node.name}`);
  }

  // 2. Pre-flight Lookup: Check if provider already has this server (Recovery check)
  const existingOnProvider = await adapter.lookupByCorrelationTag(correlationTag);
  let externalId: string;
  let identifier: string;

  if (existingOnProvider) {
    externalId = existingOnProvider.externalId;
    identifier = existingOnProvider.identifier;
  } else {
    try {
      const envVars: Record<string, string> = {};
      if (payload.customOptions?.repoUrl) envVars.GIT_REPO = payload.customOptions.repoUrl;
      if (payload.customOptions?.branch) envVars.GIT_BRANCH = payload.customOptions.branch;
      if (payload.customOptions?.buildCommand) envVars.BUILD_CMD = payload.customOptions.buildCommand;
      if (payload.customOptions?.startCommand) envVars.START_CMD = payload.customOptions.startCommand;
      if (payload.customOptions?.appPort) envVars.SERVER_PORT = String(payload.customOptions.appPort);
      if (payload.customOptions?.nodeVersion) envVars.NODE_VERSION = String(payload.customOptions.nodeVersion);

      const provisionRes = await adapter.provision({
        serviceId,
        name: payload.customOptions?.serverName || plan.name,
        memoryMb: resources.memoryMb,
        cpuPct: resources.cpuPct,
        diskMb: resources.diskMb,
        databases: resources.databases || 1,
        backups: resources.backups || 2,
        eggId: resources.eggId || 1,
        dockerImage: resources.dockerImage,
        environmentVariables: envVars,
        correlationTag,
      });
      externalId = provisionRes.externalId;
      identifier = provisionRes.identifier;
    } catch (provisionErr) {
      // 3. Timeout Recovery Saga:
      // If error occurred (e.g. timeout), do NOT assume failure! Query provider by correlation tag.
      const discovered = await adapter.lookupByCorrelationTag(correlationTag);
      if (discovered) {
        externalId = discovered.externalId;
        identifier = discovered.identifier;
      } else {
        // Truly failed or unreachable
        throw provisionErr;
      }
    }
  }

  // 4. Update Database
  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE services
      SET external_id = ?, identifier = ?, contract_status = 'ACTIVE'
      WHERE id = ?
    `).run(externalId, identifier, serviceId);

    trx.prepare(`
      UPDATE service_observed_states
      SET runtime_state = 'RUNNING', last_checked_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(serviceId);

    trx.prepare(`
      UPDATE order_items
      SET fulfillment_status = 'FULFILLED'
      WHERE id = ?
    `).run(payload.orderItemId);

    // Atomically allocate capacity on the node
    if (payload.nodeId) {
      trx.prepare(`
        UPDATE nodes
        SET allocated_memory_mb = allocated_memory_mb + ?,
            allocated_disk_mb = allocated_disk_mb + ?
        WHERE id = ?
      `).run(resources.memoryMb, resources.diskMb, payload.nodeId);
    }

    trx.prepare(`
      UPDATE provision_operations
      SET status = 'SUCCEEDED', updated_at = datetime('now', 'utc')
      WHERE service_id = ?
    `).run(serviceId);

    // If all items for order fulfilled, mark order COMPLETED
    const item = trx.prepare('SELECT order_id FROM order_items WHERE id = ?').get(payload.orderItemId) as { order_id: string };
    const pendingItems = trx.prepare("SELECT count(*) as count FROM order_items WHERE order_id = ? AND fulfillment_status != 'FULFILLED'").get(item.order_id) as { count: number };

    if (pendingItems.count === 0) {
      trx.prepare("UPDATE orders SET status = 'COMPLETED', updated_at = datetime('now', 'utc') WHERE id = ?").run(item.order_id);
    }
  }, db);
}
