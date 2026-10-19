import type Database from 'better-sqlite3';

/**
 * FTL-PROV-202: pick the node for a new service.
 *
 * Only nodes of the ordered region are considered. A node with enough free memory and disk is preferred; if the region
 * is full, the least-loaded node of the SAME region is returned so a paid order is never moved to another datacenter.
 * The provisioning worker re-checks capacity at reservation time and puts the operation in manual review instead of
 * overcommitting, so returning a full node is safe. When the region has no usable node at all the caller must fail.
 */
export function pickNodeForService(
  db: Database.Database,
  regionId: string,
  memoryMb: number,
  diskMb: number
): { id: string; hasCapacity: boolean } | null {
  const fits = db.prepare(`
    SELECT id FROM nodes
    WHERE region_id = ? AND maintenance_mode = 0
      AND (allocated_memory_mb + ?) <= max_memory_mb
      AND (allocated_disk_mb + ?) <= max_disk_mb
    ORDER BY allocated_memory_mb ASC, id ASC
    LIMIT 1
  `).get(regionId, memoryMb, diskMb) as { id: string } | undefined;
  if (fits) return { id: fits.id, hasCapacity: true };

  const sameRegion = db.prepare(`
    SELECT id FROM nodes WHERE region_id = ? AND maintenance_mode = 0 ORDER BY allocated_memory_mb ASC, id ASC LIMIT 1
  `).get(regionId) as { id: string } | undefined;
  return sameRegion ? { id: sameRegion.id, hasCapacity: false } : null;
}
