import type Database from 'better-sqlite3';
import { getDatabase, runInTransaction } from '../../database/index.js';
import { generateId } from '../identity/auth.js';

export interface PlanResourceSpec {
  memoryMb: number;
  cpuPct: number;
  diskMb: number;
  databases: number;
  backups: number;
  eggId?: number;
  dockerImage?: string;
}

export interface PlanPrice {
  currency: string;
  interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  priceMinorUnits: number;
  setupFeeMinorUnits: number;
}

export interface PublishedPlan {
  planVersionId: string;
  productId: string;
  productSlug: string;
  productName: string;
  categorySlug: string;
  categoryName: string;
  planName: string;
  version: number;
  resources: PlanResourceSpec;
  prices: PlanPrice[];
}

export function seedInitialCatalog(db: Database.Database = getDatabase()): void {
  const existingCategory = db.prepare('SELECT id FROM categories LIMIT 1').get();
  if (existingCategory) {
    return;
  }

  runInTransaction((trx) => {
    // 1. Categories
    const catGame = 'cat_game_servers';
    const catBots = 'cat_discord_bots';
    trx.prepare('INSERT INTO categories (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(catGame, 'game-servers', 'Game Servers', 'High-performance dedicated gaming nodes with automated deployment.', 1);
    trx.prepare('INSERT INTO categories (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(catBots, 'discord-bots', 'Discord Bot Hosting', 'Isolated continuous application containers for modern bots.', 2);

    // 2. Regions & Nodes
    const regFra = 'reg_fra_1';
    const regLon = 'reg_lon_1';
    trx.prepare('INSERT INTO regions (id, code, name, country) VALUES (?, ?, ?, ?)')
      .run(regFra, 'fra-1', 'Frankfurt, Germany', 'DE');
    trx.prepare('INSERT INTO regions (id, code, name, country) VALUES (?, ?, ?, ?)')
      .run(regLon, 'lon-1', 'London, UK', 'GB');

    const node1 = 'node_fra_01';
    const node2 = 'node_lon_01';
    trx.prepare(`
      INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, allocated_memory_mb, max_disk_mb, allocated_disk_mb)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)
    `).run(node1, regFra, 'pterodactyl_primary', 'fra-node-01.fortless.net', 'fra-node-01.fortless.net', 131072, 1048576);
    trx.prepare(`
      INSERT INTO nodes (id, region_id, provider_instance_id, name, fqdn, max_memory_mb, allocated_memory_mb, max_disk_mb, allocated_disk_mb)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)
    `).run(node2, regLon, 'pterodactyl_primary', 'lon-node-01.fortless.net', 'lon-node-01.fortless.net', 65536, 524288);

    // 3. Products
    const prodMc = 'prod_minecraft';
    const prodPal = 'prod_palworld';
    const prodBot = 'prod_bot_node';

    trx.prepare(`
      INSERT INTO products (id, category_id, slug, name, provider_type, is_published)
      VALUES (?, ?, 'minecraft', 'Minecraft Server Hosting', 'PTERODACTYL', 1)
    `).run(prodMc, catGame);

    trx.prepare(`
      INSERT INTO products (id, category_id, slug, name, provider_type, is_published)
      VALUES (?, ?, 'palworld', 'Palworld Server Hosting', 'PTERODACTYL', 1)
    `).run(prodPal, catGame);

    trx.prepare(`
      INSERT INTO products (id, category_id, slug, name, provider_type, is_published)
      VALUES (?, ?, 'discord-bot', 'Discord Bot Container', 'PTERODACTYL', 1)
    `).run(prodBot, catBots);

    // 4. Plan Versions & Prices
    // Minecraft 4GB
    const plvMc4 = 'plv_mc_4gb';
    trx.prepare(`
      INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 1, 'Minecraft Standard (4GB RAM)', ?, 'ACTIVE')
    `).run(plvMc4, prodMc, JSON.stringify({ memoryMb: 4096, cpuPct: 200, diskMb: 30720, databases: 2, backups: 3, eggId: 1 }));

    trx.prepare(`
      INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 1200, 0)
    `).run(generateId('prc'), plvMc4);

    // Minecraft 8GB
    const plvMc8 = 'plv_mc_8gb';
    trx.prepare(`
      INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 2, 'Minecraft Performance (8GB RAM)', ?, 'ACTIVE')
    `).run(plvMc8, prodMc, JSON.stringify({ memoryMb: 8192, cpuPct: 400, diskMb: 61440, databases: 5, backups: 5, eggId: 1 }));

    trx.prepare(`
      INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 2400, 0)
    `).run(generateId('prc'), plvMc8);

    // Discord Bot Standard
    const plvBot = 'plv_bot_std';
    trx.prepare(`
      INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 1, 'Discord Bot Standard (1GB RAM)', ?, 'ACTIVE')
    `).run(plvBot, prodBot, JSON.stringify({ memoryMb: 1024, cpuPct: 100, diskMb: 10240, databases: 1, backups: 2, eggId: 5 }));

    trx.prepare(`
      INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 400, 0)
    `).run(generateId('prc'), plvBot);
  }, db);
}

export function getPublishedPlans(db: Database.Database = getDatabase()): PublishedPlan[] {
  const rows = db.prepare(`
    SELECT
      pv.id as plan_version_id,
      pv.version,
      pv.name as plan_name,
      pv.resource_specs,
      p.id as product_id,
      p.slug as product_slug,
      p.name as product_name,
      c.slug as category_slug,
      c.name as category_name
    FROM plan_versions pv
    JOIN products p ON p.id = pv.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE pv.status = 'ACTIVE' AND p.is_published = 1 AND c.is_active = 1
    ORDER BY c.sort_order ASC, pv.version ASC
  `).all() as ({
    plan_version_id: string;
    version: number;
    plan_name: string;
    resource_specs: string;
    product_id: string;
    product_slug: string;
    product_name: string;
    category_slug: string;
    category_name: string;
  })[];

  const planIds = rows.map((r) => r.plan_version_id);
  if (planIds.length === 0) return [];

  const prices = db.prepare(`
    SELECT plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units
    FROM plan_prices
    WHERE plan_version_id IN (${planIds.map(() => '?').join(',')})
  `).all(...planIds) as ({
    plan_version_id: string;
    currency: string;
    interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
    price_minor_units: number;
    setup_fee_minor_units: number;
  })[];

  const priceMap = new Map<string, PlanPrice[]>();
  for (const p of prices) {
    const list = priceMap.get(p.plan_version_id) || [];
    list.push({
      currency: p.currency,
      interval: p.interval,
      priceMinorUnits: p.price_minor_units,
      setupFeeMinorUnits: p.setup_fee_minor_units,
    });
    priceMap.set(p.plan_version_id, list);
  }

  return rows.map((r) => ({
    planVersionId: r.plan_version_id,
    productId: r.product_id,
    productSlug: r.product_slug,
    productName: r.product_name,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
    planName: r.plan_name,
    version: r.version,
    resources: JSON.parse(r.resource_specs) as PlanResourceSpec,
    prices: priceMap.get(r.plan_version_id) || [],
  }));
}
