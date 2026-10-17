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

export async function processOutboxQueue(
  adapter: ProviderAdapter = defaultAdapter,
  db: Database.Database = getDatabase()
): Promise<number> {
  // 0. Recover stale PROCESSING events whose lease expired (> 5 minutes old)
  db.prepare(`
    UPDATE outbox_events
    SET status = 'PENDING',
        retry_count = retry_count + 1,
        scheduled_at = datetime('now', 'utc')
    WHERE status = 'PROCESSING'
      AND scheduled_at <= datetime('now', '-5 minutes', 'utc')
  `).run();

  const pendingEvents = db.prepare(`
    SELECT * FROM outbox_events
    WHERE status = 'PENDING' AND scheduled_at <= datetime('now', 'utc')
    ORDER BY created_at ASC
    LIMIT 10
  `).all() as ({
    id: string;
    event_type: string;
    aggregate_id: string;
    payload: string;
    retry_count: number;
  })[];

  let processedCount = 0;

  for (const event of pendingEvents) {
    db.prepare("UPDATE outbox_events SET status = 'PROCESSING', scheduled_at = datetime('now', 'utc') WHERE id = ?").run(event.id);

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

      db.prepare("UPDATE outbox_events SET status = 'COMPLETED' WHERE id = ?").run(event.id);
      processedCount++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newRetries = event.retry_count + 1;

      if (newRetries >= 3 || errMsg.includes('Insufficient capacity') || errMsg.includes('maintenance mode')) {
        db.prepare(`
          UPDATE outbox_events
          SET status = 'DEAD_LETTER', retry_count = ?
          WHERE id = ?
        `).run(newRetries, event.id);

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
        db.prepare(`
          UPDATE outbox_events
          SET status = 'PENDING',
              retry_count = ?,
              scheduled_at = datetime('now', '+5 seconds')
          WHERE id = ?
        `).run(newRetries, event.id);
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
    customOptions?: { serverName?: string };
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
      const provisionRes = await adapter.provision({
        serviceId,
        name: payload.customOptions?.serverName || plan.name,
        memoryMb: resources.memoryMb,
        cpuPct: resources.cpuPct,
        diskMb: resources.diskMb,
        databases: resources.databases || 1,
        backups: resources.backups || 2,
        eggId: resources.eggId || 1,
        environmentVariables: {},
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
