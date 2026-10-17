import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';

export type ComponentStatus = 'OPERATIONAL' | 'DEGRADED' | 'PARTIAL_OUTAGE' | 'MAJOR_OUTAGE' | 'MAINTENANCE';
export type IncidentStatus = 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED';
export type IncidentImpact = 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface SystemComponent {
  id: string;
  name: string;
  slug: string;
  groupName: string;
  status: ComponentStatus;
  orderIndex: number;
  updatedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: IncidentStatus;
  message: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface PublicStatusResponse {
  indicator: 'OPERATIONAL' | 'DEGRADED' | 'MAJOR_OUTAGE' | 'MAINTENANCE';
  headline: string;
  components: SystemComponent[];
  activeIncidents: Incident[];
  pastIncidents: Incident[];
  generatedAt: string;
}

export function getPublicSystemStatus(db: Database.Database = getDatabase()): PublicStatusResponse {
  const componentRows = db.prepare(`
    SELECT id, name, slug, group_name, status, order_index, updated_at
    FROM system_components
    ORDER BY order_index ASC
  `).all() as any[];

  const components: SystemComponent[] = componentRows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    groupName: r.group_name,
    status: r.status as ComponentStatus,
    orderIndex: r.order_index,
    updatedAt: r.updated_at,
  }));

  const incidentRows = db.prepare(`
    SELECT id, title, impact, status, created_at, updated_at, resolved_at
    FROM incidents
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as any[];

  const allUpdates = db.prepare(`
    SELECT id, incident_id, status, message, created_at
    FROM incident_updates
    ORDER BY created_at ASC
  `).all() as any[];

  const updatesByIncident = new Map<string, IncidentUpdate[]>();
  for (const u of allUpdates) {
    if (!updatesByIncident.has(u.incident_id)) {
      updatesByIncident.set(u.incident_id, []);
    }
    updatesByIncident.get(u.incident_id)!.push({
      id: u.id,
      incidentId: u.incident_id,
      status: u.status,
      message: u.message,
      createdAt: u.created_at,
    });
  }

  const incidents: Incident[] = incidentRows.map((r) => ({
    id: r.id,
    title: r.title,
    impact: r.impact as IncidentImpact,
    status: r.status as IncidentStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    updates: updatesByIncident.get(r.id) || [],
  }));

  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const pastIncidents = incidents.filter((i) => i.status === 'RESOLVED');

  // Compute overall status indicator
  let indicator: 'OPERATIONAL' | 'DEGRADED' | 'MAJOR_OUTAGE' | 'MAINTENANCE' = 'OPERATIONAL';
  let headline = 'All Systems Operational';

  const hasMajorOutage = components.some((c) => c.status === 'MAJOR_OUTAGE') || activeIncidents.some((i) => i.impact === 'CRITICAL');
  const hasPartialOrDegraded = components.some((c) => ['DEGRADED', 'PARTIAL_OUTAGE'].includes(c.status)) || activeIncidents.some((i) => ['MINOR', 'MAJOR'].includes(i.impact));
  const hasMaintenance = components.some((c) => c.status === 'MAINTENANCE');

  if (hasMajorOutage) {
    indicator = 'MAJOR_OUTAGE';
    headline = 'Major Platform Outage';
  } else if (hasPartialOrDegraded) {
    indicator = 'DEGRADED';
    headline = 'Degraded System Performance';
  } else if (hasMaintenance) {
    indicator = 'MAINTENANCE';
    headline = 'Scheduled Maintenance in Progress';
  }

  return {
    indicator,
    headline,
    components,
    activeIncidents,
    pastIncidents,
    generatedAt: new Date().toISOString(),
  };
}

export function createIncident(
  data: {
    title: string;
    impact: IncidentImpact;
    status: IncidentStatus;
    message: string;
    affectedComponentIds?: string[];
    affectedComponentStatus?: ComponentStatus;
  },
  actorUserId: string,
  db: Database.Database = getDatabase()
): Incident {
  const incidentId = `inc_${crypto.randomUUID()}`;
  const updateId = `inm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  runInTransaction((trx) => {
    trx.prepare(`
      INSERT INTO incidents (id, title, impact, status, created_at, updated_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      incidentId,
      data.title,
      data.impact,
      data.status,
      now,
      now,
      data.status === 'RESOLVED' ? now : null
    );

    trx.prepare(`
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(updateId, incidentId, data.status, data.message, now);

    if (data.affectedComponentIds && data.affectedComponentIds.length && data.affectedComponentStatus) {
      const stmt = trx.prepare(`
        UPDATE system_components
        SET status = ?, updated_at = datetime('now', 'utc')
        WHERE id = ?
      `);
      for (const compId of data.affectedComponentIds) {
        stmt.run(data.affectedComponentStatus, compId);
      }
    }

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, NULL, ?, 'STAFF', 'incident.create', 'incident', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      actorUserId,
      incidentId,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ title: data.title, impact: data.impact, status: data.status })
    );
  }, db);

  return {
    id: incidentId,
    title: data.title,
    impact: data.impact,
    status: data.status,
    createdAt: now,
    updatedAt: now,
    resolvedAt: data.status === 'RESOLVED' ? now : null,
    updates: [
      {
        id: updateId,
        incidentId,
        status: data.status,
        message: data.message,
        createdAt: now,
      },
    ],
  };
}

export function updateIncident(
  incidentId: string,
  data: {
    status: IncidentStatus;
    message: string;
    impact?: IncidentImpact;
  },
  actorUserId: string,
  db: Database.Database = getDatabase()
): IncidentUpdate {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
  if (!incident) throw new Error('Incident not found');

  const updateId = `inm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const isResolved = data.status === 'RESOLVED';

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE incidents
      SET status = ?,
          impact = COALESCE(?, impact),
          updated_at = ?,
          resolved_at = CASE WHEN ? THEN ? ELSE resolved_at END
      WHERE id = ?
    `).run(data.status, data.impact || null, now, isResolved ? 1 : 0, now, incidentId);

    trx.prepare(`
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(updateId, incidentId, data.status, data.message, now);

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, NULL, ?, 'STAFF', 'incident.update', 'incident', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      actorUserId,
      incidentId,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ status: data.status, message: data.message, impact: data.impact })
    );
  }, db);

  return {
    id: updateId,
    incidentId,
    status: data.status,
    message: data.message,
    createdAt: now,
  };
}

export function updateComponentStatus(
  componentId: string,
  status: ComponentStatus,
  actorUserId: string,
  db: Database.Database = getDatabase()
): void {
  const comp = db.prepare('SELECT * FROM system_components WHERE id = ?').get(componentId) as any;
  if (!comp) throw new Error('System component not found');

  runInTransaction((trx) => {
    trx.prepare(`
      UPDATE system_components
      SET status = ?, updated_at = datetime('now', 'utc')
      WHERE id = ?
    `).run(status, componentId);

    trx.prepare(`
      INSERT INTO audit_events (
        id, account_id, actor_user_id, actor_type, action, resource_type,
        resource_id, ip_address, correlation_id, metadata, created_at
      ) VALUES (?, NULL, ?, 'STAFF', 'system_component.update', 'system_component', ?, '127.0.0.1', ?, ?, datetime('now', 'utc'))
    `).run(
      `aud_${crypto.randomUUID()}`,
      actorUserId,
      componentId,
      `corr_${crypto.randomUUID()}`,
      JSON.stringify({ previousStatus: comp.status, newStatus: status })
    );
  }, db);
}
