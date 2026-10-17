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
      }

      db.prepare("UPDATE outbox_events SET status = 'COMPLETED' WHERE id = ?").run(event.id);
      processedCount++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newRetries = event.retry_count + 1;

      if (newRetries >= 3) {
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
          SET status = 'FAILED', last_error = ?, updated_at = datetime('now', 'utc')
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

    // If all items for order fulfilled, mark order COMPLETED
    const item = trx.prepare('SELECT order_id FROM order_items WHERE id = ?').get(payload.orderItemId) as { order_id: string };
    const pendingItems = trx.prepare("SELECT count(*) as count FROM order_items WHERE order_id = ? AND fulfillment_status != 'FULFILLED'").get(item.order_id) as { count: number };

    if (pendingItems.count === 0) {
      trx.prepare("UPDATE orders SET status = 'COMPLETED', updated_at = datetime('now', 'utc') WHERE id = ?").run(item.order_id);
    }
  }, db);
}
