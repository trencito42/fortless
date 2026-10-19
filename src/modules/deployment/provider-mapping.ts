import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import type { ProviderAdapter, PterodactylInventory } from '../provisioning/adapter.js';
import { PterodactylHttpAdapter } from '../provisioning/adapter.js';
import { getWorkloadDefinition } from './registry.js';

export class EggMappingError extends Error {
  constructor(message: string, public readonly code: string = 'EGG_MAPPING_NOT_FOUND', public readonly statusCode = 422) {
    super(message);
    this.name = 'EggMappingError';
  }
}

export interface ResolvedEggTarget {
  eggId: number;
  nestId?: number;
  dockerImage?: string;
  startupCommand?: string;
  environmentDefaults: Record<string, string>;
  isVerified: boolean;
  source: 'DATABASE_OVERRIDE' | 'PROVIDER_INVENTORY' | 'PLAN_SPEC';
}

const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedInventory: { inventory: PterodactylInventory; at: number } | null = null;

export async function getCachedProviderInventory(adapter: ProviderAdapter): Promise<PterodactylInventory | null> {
  if (!(adapter instanceof PterodactylHttpAdapter)) return null;
  const now = Date.now();
  if (cachedInventory && now - cachedInventory.at < INVENTORY_CACHE_TTL_MS) {
    return cachedInventory.inventory;
  }
  try {
    const inventory = await adapter.getInventory();
    cachedInventory = { inventory, at: now };
    return inventory;
  } catch (err) {
    // If provider API fails, return cached even if stale, or null
    return cachedInventory?.inventory ?? null;
  }
}

export async function resolveEggForWorkload(
  adapter: ProviderAdapter,
  workloadId: string,
  softwareId: string,
  db: Database.Database = getDatabase()
): Promise<ResolvedEggTarget> {
  const workload = getWorkloadDefinition(workloadId);
  if (!workload) {
    throw new EggMappingError(`Unknown workload "${workloadId}". Cannot resolve runtime egg.`, 'UNKNOWN_WORKLOAD', 400);
  }

  if (!workload.supported) {
    throw new EggMappingError(workload.unsupportedReason || `Workload "${workload.name}" is not supported for deployment on this cluster.`, 'WORKLOAD_UNSUPPORTED', 422);
  }

  const software = workload.softwareOptions.find((s) => s.id === softwareId);
  if (!software) {
    throw new EggMappingError(`Software option "${softwareId}" not recognized for workload "${workloadId}".`, 'INVALID_SOFTWARE_OPTION', 400);
  }

  // 1. Check explicit verified mapping in database table `provider_egg_mappings`
  const dbRow = db.prepare(`
    SELECT resolved_egg_id, resolved_nest_id, default_docker_image, default_startup, environment_defaults, is_verified
    FROM provider_egg_mappings
    WHERE workload_id = ? AND software_id = ?
  `).get(workloadId, softwareId) as {
    resolved_egg_id: number | null;
    resolved_nest_id: number | null;
    default_docker_image: string | null;
    default_startup: string | null;
    environment_defaults: string;
    is_verified: number;
  } | undefined;

  if (dbRow && dbRow.resolved_egg_id && dbRow.is_verified === 1) {
    let envDefaults: Record<string, string> = {};
    try { envDefaults = JSON.parse(dbRow.environment_defaults || '{}'); } catch {}
    return {
      eggId: dbRow.resolved_egg_id,
      nestId: dbRow.resolved_nest_id ?? undefined,
      dockerImage: dbRow.default_docker_image || software.defaultImage,
      startupCommand: dbRow.default_startup || undefined,
      environmentDefaults: envDefaults,
      isVerified: true,
      source: 'DATABASE_OVERRIDE',
    };
  }

  // 2. Query actual Pterodactyl Provider Inventory
  const inventory = await getCachedProviderInventory(adapter);
  if (inventory && inventory.eggs?.length) {
    const pattern = new RegExp(software.eggNamePattern, 'i');
    const matchedEgg = inventory.eggs.find((e) => pattern.test(e.name));

    if (matchedEgg) {
      // Upsert into provider_egg_mappings for high-speed subsequent lookups
      db.prepare(`
        INSERT INTO provider_egg_mappings (id, workload_id, software_id, egg_name_pattern, resolved_egg_id, resolved_nest_id, default_docker_image, is_verified, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'utc'))
        ON CONFLICT(workload_id, software_id) DO UPDATE SET
          resolved_egg_id = excluded.resolved_egg_id,
          resolved_nest_id = excluded.resolved_nest_id,
          default_docker_image = excluded.default_docker_image,
          is_verified = 1,
          updated_at = datetime('now', 'utc')
      `).run(
        `pem_${workloadId}_${softwareId}`,
        workloadId,
        softwareId,
        software.eggNamePattern,
        matchedEgg.id,
        matchedEgg.nestId,
        matchedEgg.dockerImage || software.defaultImage
      );

      return {
        eggId: matchedEgg.id,
        nestId: matchedEgg.nestId,
        dockerImage: matchedEgg.dockerImage || software.defaultImage,
        environmentDefaults: {},
        isVerified: true,
        source: 'PROVIDER_INVENTORY',
      };
    }
  }

  // 3. Fail-Closed: Never silently fall back to Minecraft or an unrelated runtime
  throw new EggMappingError(
    `No verified Pterodactyl egg mapping could be resolved for ${workload.name} (${software.name}). Deployment cannot proceed until an administrator maps this software on the panel.`,
    'EGG_MAPPING_NOT_FOUND',
    422
  );
}
