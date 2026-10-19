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

export function seedInitialCatalog(
  db: Database.Database = getDatabase(),
  options: { publishDemonstrationCatalog?: boolean } = { publishDemonstrationCatalog: true }
): void {
  const existingCategory = db.prepare("SELECT id FROM categories WHERE id = 'cat_game_servers'").get();
  if (existingCategory) {
    return;
  }

  runInTransaction((trx) => {
    const demoEnabled = options.publishDemonstrationCatalog !== false;
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

    if (!demoEnabled) {
      trx.prepare('UPDATE regions SET is_active = 0 WHERE id IN (?, ?)').run(regFra, regLon);
      trx.prepare('UPDATE nodes SET maintenance_mode = 1 WHERE id IN (?, ?)').run(node1, node2);
    }

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

    if (!demoEnabled) {
      trx.prepare('UPDATE products SET is_published = 0 WHERE id IN (?, ?, ?)').run(prodMc, prodPal, prodBot);
    }

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

    // 5. Web & Cloud Apps
    const catApps = 'cat_web_apps';
    trx.prepare('INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(catApps, 'apps', 'Web & Cloud Apps', 'Containerized modern Node.js web apps with automated build & port management.', 3);

    const prodApp = 'prod_nodejs_app';
    trx.prepare(`
      INSERT OR IGNORE INTO products (id, category_id, slug, name, provider_type, is_published)
      VALUES (?, ?, 'nodejs-app', 'Node.js Web Application', 'PTERODACTYL', 1)
    `).run(prodApp, catApps);

    if (!demoEnabled) {
      trx.prepare('UPDATE products SET is_published = 0 WHERE id = ?').run(prodApp);
    }

    const plvStarter = 'plv_node_starter';
    trx.prepare(`
      INSERT OR IGNORE INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 1, 'Node.js Starter (1GB RAM)', ?, 'ACTIVE')
    `).run(plvStarter, prodApp, JSON.stringify({
      memoryMb: 1024,
      cpuPct: 100,
      diskMb: 10240,
      databases: 1,
      backups: 2,
      eggId: 15,
      dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20',
    }));

    trx.prepare(`
      INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 500, 0)
    `).run(generateId('prc'), plvStarter);

    const plvPro = 'plv_node_pro';
    trx.prepare(`
      INSERT OR IGNORE INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 2, 'Node.js Pro (2GB RAM)', ?, 'ACTIVE')
    `).run(plvPro, prodApp, JSON.stringify({
      memoryMb: 2048,
      cpuPct: 200,
      diskMb: 25600,
      databases: 2,
      backups: 5,
      eggId: 15,
      dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20',
    }));

    trx.prepare(`
      INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 1000, 0)
    `).run(generateId('prc'), plvPro);

    // 6. Cloud VPS Compute
    const catVps = 'cat_cloud_vps';
    trx.prepare(`
      INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order)
      VALUES (?, 'vps', 'Cloud VPS Compute', 'High-performance KVM virtual machines with dedicated vCPU, NVMe storage, and cloud-init guest OS automation.', 4)
    `).run(catVps);

    const prodVps = 'prod_kvm_vps';
    trx.prepare(`
      INSERT OR IGNORE INTO products (id, category_id, slug, name, provider_type, is_published)
      VALUES (?, ?, 'kvm-vps', 'KVM Cloud VPS', 'VPS', 1)
    `).run(prodVps, catVps);

    if (!demoEnabled) {
      trx.prepare('UPDATE products SET is_published = 0 WHERE id = ?').run(prodVps);
    }

    const plvMicro = 'plv_vps_micro';
    trx.prepare(`
      INSERT OR IGNORE INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 1, 'VPS Micro (1 vCPU, 2GB RAM, 40GB NVMe)', ?, 'ACTIVE')
    `).run(plvMicro, prodVps, JSON.stringify({
      memoryMb: 2048,
      cpuPct: 100,
      diskMb: 40960,
      databases: 1,
      backups: 1,
      vcpu: 1,
      cores: 1,
      osImage: 'debian-12-cloudinit',
      dedicatedIp: true,
    }));
    trx.prepare(`
      INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 800, 0)
    `).run(generateId('prc'), plvMicro);

    const plvStandard = 'plv_vps_standard';
    trx.prepare(`
      INSERT OR IGNORE INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 2, 'VPS Standard (2 vCPU, 4GB RAM, 80GB NVMe)', ?, 'ACTIVE')
    `).run(plvStandard, prodVps, JSON.stringify({
      memoryMb: 4096,
      cpuPct: 200,
      diskMb: 81920,
      databases: 2,
      backups: 2,
      vcpu: 2,
      cores: 2,
      osImage: 'debian-12-cloudinit',
      dedicatedIp: true,
    }));
    trx.prepare(`
      INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 1600, 0)
    `).run(generateId('prc'), plvStandard);

    const plvVpsPro = 'plv_vps_pro';
    trx.prepare(`
      INSERT OR IGNORE INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, 3, 'VPS Pro (4 vCPU, 8GB RAM, 160GB NVMe)', ?, 'ACTIVE')
    `).run(plvVpsPro, prodVps, JSON.stringify({
      memoryMb: 8192,
      cpuPct: 400,
      diskMb: 163840,
      databases: 4,
      backups: 4,
      vcpu: 4,
      cores: 4,
      osImage: 'debian-12-cloudinit',
      dedicatedIp: true,
    }));
    trx.prepare(`
      INSERT OR IGNORE INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
      VALUES (?, ?, 'EUR', 'MONTHLY', 3200, 0)
    `).run(generateId('prc'), plvVpsPro);
  }, db);
}

export interface VpsOptions {
  hostname: string;
  osImage?: 'debian-12' | 'ubuntu-22.04' | 'ubuntu-24.04' | 'almalinux-9';
  sshKey?: string;
  rootPassword?: string;
}

export function validateVpsOptions(options: unknown): { valid: boolean; error?: string; options?: VpsOptions } {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'VPS options are required.' };
  }
  const opt = options as Record<string, unknown>;
  const hostname = typeof opt.hostname === 'string' ? opt.hostname.trim().toLowerCase() : '';
  if (!hostname) {
    return { valid: false, error: 'VPS hostname is required.' };
  }

  if (hostname.length > 63 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(hostname)) {
    return { valid: false, error: 'Invalid hostname format. Must conform to RFC 1123.' };
  }

  const validOs = ['debian-12', 'ubuntu-22.04', 'ubuntu-24.04', 'almalinux-9'];
  const osImage = typeof opt.osImage === 'string' && validOs.includes(opt.osImage)
    ? (opt.osImage as VpsOptions['osImage'])
    : 'debian-12';

  const sshKey = typeof opt.sshKey === 'string' ? opt.sshKey.trim() : undefined;
  if (sshKey && !sshKey.startsWith('ssh-') && !sshKey.startsWith('ecdsa-')) {
    return { valid: false, error: 'SSH public key must begin with valid key type (e.g. ssh-ed25519 or ssh-rsa).' };
  }

  return {
    valid: true,
    options: {
      hostname,
      osImage,
      sshKey,
    },
  };
}

export interface WebAppOptions {
  repoUrl: string;
  branch?: string;
  buildCommand?: string;
  startCommand?: string;
  nodeVersion?: '18' | '20' | '22';
  appPort?: number;
}

export function validateWebAppOptions(options: unknown): { valid: boolean; error?: string; options?: WebAppOptions } {
  if (!options || typeof options !== 'object') {
    return { valid: false, error: 'Web app configuration is required.' };
  }
  const opt = options as Record<string, unknown>;
  const repoUrl = typeof opt.repoUrl === 'string' ? opt.repoUrl.trim() : '';
  if (!repoUrl) {
    return { valid: false, error: 'Git repository URL is required.' };
  }

  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS repository URLs are supported.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return { valid: false, error: 'Private and loopback repository URLs are forbidden.' };
    }
  } catch {
    return { valid: false, error: 'Invalid repository URL format.' };
  }

  const branch = typeof opt.branch === 'string' && opt.branch.trim() ? opt.branch.trim() : 'main';
  if (!/^[a-zA-Z0-9_\-\./]+$/.test(branch)) {
    return { valid: false, error: 'Invalid Git branch name.' };
  }

  const appPort = opt.appPort ? Number(opt.appPort) : 3000;
  if (isNaN(appPort) || appPort < 1024 || appPort > 65535) {
    return { valid: false, error: 'App port must be between 1024 and 65535.' };
  }

  return {
    valid: true,
    options: {
      repoUrl,
      branch,
      buildCommand: typeof opt.buildCommand === 'string' ? opt.buildCommand.trim().slice(0, 100) : 'npm install && npm run build',
      startCommand: typeof opt.startCommand === 'string' ? opt.startCommand.trim().slice(0, 100) : 'npm start',
      nodeVersion: opt.nodeVersion === '18' || opt.nodeVersion === '22' ? opt.nodeVersion : '20',
      appPort,
    },
  };
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

export function listCategories(db: Database.Database = getDatabase()) {
  return db.prepare(`
    SELECT id, slug, name, description, sort_order
    FROM categories
    WHERE is_active = 1
    ORDER BY sort_order ASC, name ASC
  `).all();
}

export function listProducts(options: { categorySlug?: string; includeUnpublished?: boolean } = {}, db: Database.Database = getDatabase()) {
  let query = `
    SELECT p.id, p.slug, p.name, p.provider_type, p.is_published, p.created_at,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE (? OR p.is_published = 1)
  `;
  const params: (number | string)[] = [options.includeUnpublished ? 1 : 0];

  if (options.categorySlug) {
    query += ' AND c.slug = ?';
    params.push(options.categorySlug);
  }

  query += ' ORDER BY c.sort_order ASC, p.name ASC';
  return db.prepare(query).all(...params);
}

export interface AdminCatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  providerType: string;
  isPublished: boolean;
  category: { id: string; slug: string; name: string };
  restrictions: { allowedCountries: string[]; maxServicesPerAccount: number | null; availableFrom: string | null; availableUntil: string | null; requiresVerifiedEmail: boolean } | null;
  plans: Array<{
    id: string;
    version: number;
    name: string;
    status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
    resources: PlanResourceSpec;
    prices: PlanPrice[];
    options: Array<{ id: string; key: string; label: string; inputType: string; isRequired: boolean; config: Record<string, unknown>; priceDeltaMinorUnits: number }>;
  }>;
}

/** Staff catalog read model, including drafts and retired immutable versions. */
export function listAdminCatalog(db: Database.Database = getDatabase()): AdminCatalogProduct[] {
  const products = db.prepare(`
    SELECT p.id, p.slug, p.name, p.description, p.provider_type, p.is_published,
           psr.allowed_countries, psr.max_services_per_account, psr.available_from, psr.available_until, psr.requires_verified_email,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_sales_restrictions psr ON psr.product_id = p.id
    ORDER BY c.sort_order ASC, p.name ASC
  `).all() as Array<{
    id: string; slug: string; name: string; description: string; provider_type: string; is_published: number;
    allowed_countries: string | null; max_services_per_account: number | null; available_from: string | null; available_until: string | null; requires_verified_email: number | null;
    category_id: string; category_slug: string; category_name: string;
  }>;

  const plans = db.prepare(`
    SELECT id, product_id, version, name, resource_specs, status
    FROM plan_versions
    ORDER BY product_id ASC, version DESC
  `).all() as Array<{
    id: string; product_id: string; version: number; name: string;
    resource_specs: string; status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  }>;
  const prices = db.prepare(`
    SELECT plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units
    FROM plan_prices
    ORDER BY currency ASC, interval ASC
  `).all() as Array<{
    plan_version_id: string; currency: string; interval: PlanPrice['interval'];
    price_minor_units: number; setup_fee_minor_units: number;
  }>;

  const configurableOptions = db.prepare(`SELECT id, plan_version_id, option_key, label, input_type, is_required, config_json, price_delta_minor_units
    FROM plan_configurable_options ORDER BY plan_version_id, sort_order, label`).all() as any[];
  const optionMap = new Map<string, AdminCatalogProduct['plans'][number]['options']>();
  for (const option of configurableOptions) {
    const values = optionMap.get(option.plan_version_id) || [];
    values.push({ id: option.id, key: option.option_key, label: option.label, inputType: option.input_type, isRequired: Boolean(option.is_required), config: JSON.parse(option.config_json), priceDeltaMinorUnits: option.price_delta_minor_units });
    optionMap.set(option.plan_version_id, values);
  }

  const priceMap = new Map<string, PlanPrice[]>();
  for (const price of prices) {
    const values = priceMap.get(price.plan_version_id) || [];
    values.push({
      currency: price.currency,
      interval: price.interval,
      priceMinorUnits: price.price_minor_units,
      setupFeeMinorUnits: price.setup_fee_minor_units,
    });
    priceMap.set(price.plan_version_id, values);
  }

  const planMap = new Map<string, AdminCatalogProduct['plans']>();
  for (const plan of plans) {
    const values = planMap.get(plan.product_id) || [];
    values.push({
      id: plan.id,
      version: plan.version,
      name: plan.name,
      status: plan.status,
      resources: JSON.parse(plan.resource_specs) as PlanResourceSpec,
      prices: priceMap.get(plan.id) || [],
      options: optionMap.get(plan.id) || [],
    });
    planMap.set(plan.product_id, values);
  }

  return products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    providerType: product.provider_type,
    isPublished: Boolean(product.is_published),
    restrictions: product.allowed_countries === null ? null : {
      allowedCountries: JSON.parse(product.allowed_countries) as string[],
      maxServicesPerAccount: product.max_services_per_account,
      availableFrom: product.available_from,
      availableUntil: product.available_until,
      requiresVerifiedEmail: Boolean(product.requires_verified_email),
    },
    category: {
      id: product.category_id,
      slug: product.category_slug,
      name: product.category_name,
    },
    plans: planMap.get(product.id) || [],
  }));
}

export function getProductDetail(slug: string, db: Database.Database = getDatabase()) {
  const product = db.prepare(`
    SELECT p.id, p.slug, p.name, p.provider_type, p.is_published, p.created_at,
           c.id AS category_id, c.slug AS category_slug, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ?
  `).get(slug) as { id: string; slug: string; name: string; provider_type: string; is_published: number } | undefined;

  if (!product) return null;

  const planVersions = db.prepare(`
    SELECT id, version, name, resource_specs, status, created_at
    FROM plan_versions
    WHERE product_id = ? AND status = 'ACTIVE'
    ORDER BY version ASC
  `).all(product.id) as { id: string; version: number; name: string; resource_specs: string; status: string }[];

  const plansWithPrices = planVersions.map((pv) => {
    const prices = db.prepare(`
      SELECT currency, interval, price_minor_units, setup_fee_minor_units
      FROM plan_prices
      WHERE plan_version_id = ?
    `).all(pv.id) as PlanPrice[];

    return {
      id: pv.id,
      version: pv.version,
      name: pv.name,
      resources: JSON.parse(pv.resource_specs) as PlanResourceSpec,
      prices,
    };
  });

  return { ...product, plans: plansWithPrices };
}

export function listRegionsWithCapacity(db: Database.Database = getDatabase()) {
  const regions = db.prepare(`
    SELECT r.id, r.code, r.name, r.country,
           count(n.id) as total_nodes,
           coalesce(sum(case when n.maintenance_mode = 0 then 1 else 0 end), 0) as available_nodes,
           coalesce(sum(n.max_memory_mb), 0) as total_memory_mb,
           coalesce(sum(n.allocated_memory_mb), 0) as allocated_memory_mb,
           coalesce(sum(n.max_disk_mb), 0) as total_disk_mb,
           coalesce(sum(n.allocated_disk_mb), 0) as allocated_disk_mb
    FROM regions r
    LEFT JOIN nodes n ON n.region_id = r.id
    WHERE r.is_active = 1
    GROUP BY r.id
    ORDER BY r.name ASC
  `).all() as Array<{
    id: string;
    code: string;
    name: string;
    country: string;
    total_nodes: number;
    available_nodes: number;
    total_memory_mb: number;
    allocated_memory_mb: number;
    total_disk_mb: number;
    allocated_disk_mb: number;
  }>;

  return regions.map((r) => {
    const memoryAvailableMb = Math.max(0, r.total_memory_mb - r.allocated_memory_mb);
    const diskAvailableMb = Math.max(0, r.total_disk_mb - r.allocated_disk_mb);
    const isSoldOut = r.available_nodes === 0 || memoryAvailableMb < 1024 || diskAvailableMb < 5120;
    return {
      ...r,
      memoryAvailableMb,
      diskAvailableMb,
      isSoldOut,
    };
  });
}

export function reserveCapacity(
  params: { planVersionId: string; regionId?: string; cartItemId: string; ttlMinutes?: number },
  db: Database.Database = getDatabase()
): { reservationId: string; nodeId: string; expiresAt: string } {
  return runInTransaction((trx) => {
    // 1. Get required resource specs
    const plan = trx.prepare('SELECT id, resource_specs, status FROM plan_versions WHERE id = ?').get(params.planVersionId) as {
      id: string;
      resource_specs: string;
      status: string;
    } | undefined;

    if (!plan || plan.status !== 'ACTIVE') {
      throw new Error(`Plan version ${params.planVersionId} is not active for allocation.`);
    }

    const resources = JSON.parse(plan.resource_specs) as PlanResourceSpec;
    const requiredMemory = resources.memoryMb;
    const requiredDisk = resources.diskMb;

    // 2. Find eligible node with headroom
    let nodeQuery = `
      SELECT id, region_id, max_memory_mb, allocated_memory_mb, max_disk_mb, allocated_disk_mb
      FROM nodes
      WHERE maintenance_mode = 0
        AND (max_memory_mb - allocated_memory_mb) >= ?
        AND (max_disk_mb - allocated_disk_mb) >= ?
    `;
    const queryParams: (number | string)[] = [requiredMemory, requiredDisk];

    if (params.regionId) {
      nodeQuery += ' AND region_id = ?';
      queryParams.push(params.regionId);
    }

    nodeQuery += ' ORDER BY (max_memory_mb - allocated_memory_mb) DESC LIMIT 1';

    const eligibleNode = trx.prepare(nodeQuery).get(...queryParams) as {
      id: string;
      region_id: string;
      max_memory_mb: number;
      allocated_memory_mb: number;
      max_disk_mb: number;
      allocated_disk_mb: number;
    } | undefined;

    if (!eligibleNode) {
      throw new Error(params.regionId ? 'Capacity sold out in requested region.' : 'No infrastructure capacity currently available.');
    }

    // 3. Atomically update allocated counters
    trx.prepare(`
      UPDATE nodes
      SET allocated_memory_mb = allocated_memory_mb + ?,
          allocated_disk_mb = allocated_disk_mb + ?
      WHERE id = ?
    `).run(requiredMemory, requiredDisk, eligibleNode.id);

    // 4. Create capacity reservation
    const reservationId = generateId('res');
    const ttlMinutes = params.ttlMinutes ?? 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    trx.prepare(`
      INSERT INTO capacity_reservations (id, node_id, plan_version_id, cart_item_id, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'RESERVED')
    `).run(reservationId, eligibleNode.id, params.planVersionId, params.cartItemId, expiresAt);

    return { reservationId, nodeId: eligibleNode.id, expiresAt };
  }, db);
}

export function releaseCapacity(cartItemId: string, db: Database.Database = getDatabase()): boolean {
  return runInTransaction((trx) => {
    const reservation = trx.prepare(`
      SELECT cr.id, cr.node_id, cr.status, pv.resource_specs
      FROM capacity_reservations cr
      JOIN plan_versions pv ON pv.id = cr.plan_version_id
      WHERE cr.cart_item_id = ?
    `).get(cartItemId) as { id: string; node_id: string; status: string; resource_specs: string } | undefined;

    if (!reservation || reservation.status !== 'RESERVED') {
      return false;
    }

    const resources = JSON.parse(reservation.resource_specs) as PlanResourceSpec;

    trx.prepare(`
      UPDATE nodes
      SET allocated_memory_mb = max(0, allocated_memory_mb - ?),
          allocated_disk_mb = max(0, allocated_disk_mb - ?)
      WHERE id = ?
    `).run(resources.memoryMb, resources.diskMb, reservation.node_id);

    trx.prepare("UPDATE capacity_reservations SET status = 'RELEASED' WHERE id = ?").run(reservation.id);
    return true;
  }, db);
}

export function sweepExpiredReservations(db: Database.Database = getDatabase()): number {
  return runInTransaction((trx) => {
    const expired = trx.prepare(`
      SELECT cr.id, cr.node_id, pv.resource_specs
      FROM capacity_reservations cr
      JOIN plan_versions pv ON pv.id = cr.plan_version_id
      WHERE cr.status = 'RESERVED' AND cr.expires_at < datetime('now', 'utc')
    `).all() as { id: string; node_id: string; resource_specs: string }[];

    for (const res of expired) {
      const resources = JSON.parse(res.resource_specs) as PlanResourceSpec;
      trx.prepare(`
        UPDATE nodes
        SET allocated_memory_mb = max(0, allocated_memory_mb - ?),
            allocated_disk_mb = max(0, allocated_disk_mb - ?)
        WHERE id = ?
      `).run(resources.memoryMb, resources.diskMb, res.node_id);

      trx.prepare("UPDATE capacity_reservations SET status = 'RELEASED' WHERE id = ?").run(res.id);
    }

    return expired.length;
  }, db);
}

export interface CouponRule {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  maxRedemptions: number;
  redemptionsCount: number;
  expiresAt: string;
  isActive: boolean;
}

export function createCoupon(
  params: {
    code: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number;
    maxRedemptions: number;
    expiresAt: string;
  },
  db: Database.Database = getDatabase()
): CouponRule {
  if (params.discountValue <= 0) throw new Error('Discount value must be positive.');
  if (params.discountType === 'PERCENTAGE' && params.discountValue > 100) throw new Error('Percentage discount cannot exceed 100%.');
  if (params.maxRedemptions <= 0) throw new Error('Max redemptions must be greater than zero.');

  const id = generateId('cpn');
  const code = params.code.trim().toUpperCase();

  db.prepare(`
    INSERT INTO coupon_rules (id, code, discount_type, discount_value, max_redemptions, redemptions_count, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?, 0, ?, 1)
  `).run(id, code, params.discountType, params.discountValue, params.maxRedemptions, params.expiresAt);

  return {
    id,
    code,
    discountType: params.discountType,
    discountValue: params.discountValue,
    maxRedemptions: params.maxRedemptions,
    redemptionsCount: 0,
    expiresAt: params.expiresAt,
    isActive: true,
  };
}

export function validateCoupon(
  code: string,
  accountId: string,
  subtotalMinorUnits: number,
  db: Database.Database = getDatabase()
): { coupon: CouponRule; discountMinorUnits: number } {
  const normalized = code.trim().toUpperCase();
  const row = db.prepare(`
    SELECT id, code, discount_type, discount_value, max_redemptions, redemptions_count, expires_at, is_active
    FROM coupon_rules
    WHERE code = ?
  `).get(normalized) as {
    id: string;
    code: string;
    discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discount_value: number;
    max_redemptions: number;
    redemptions_count: number;
    expires_at: string;
    is_active: number;
  } | undefined;

  if (!row || !row.is_active) {
    throw new Error('Invalid or inactive coupon code.');
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('This coupon has expired.');
  }

  const prior = db.prepare('SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND account_id = ?').get(row.id, accountId);
  if (prior) {
    throw new Error('This coupon has already been redeemed by your workspace.');
  }

  if (row.redemptions_count >= row.max_redemptions) {
    throw new Error('Coupon usage limit reached.');
  }

  let discountMinorUnits = 0;
  if (row.discount_type === 'PERCENTAGE') {
    discountMinorUnits = Math.round((subtotalMinorUnits * row.discount_value) / 100);
  } else {
    discountMinorUnits = Math.min(subtotalMinorUnits, row.discount_value);
  }

  return {
    coupon: {
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxRedemptions: row.max_redemptions,
      redemptionsCount: row.redemptions_count,
      expiresAt: row.expires_at,
      isActive: Boolean(row.is_active),
    },
    discountMinorUnits,
  };
}

export function redeemCouponAtomic(
  couponId: string,
  accountId: string,
  orderId: string,
  db: Database.Database = getDatabase()
): void {
  runInTransaction((trx) => {
    const updated = trx.prepare(`
      UPDATE coupon_rules
      SET redemptions_count = redemptions_count + 1
      WHERE id = ? AND redemptions_count < max_redemptions AND is_active = 1
    `).run(couponId);

    if (updated.changes === 0) {
      throw new Error('Coupon cannot be redeemed (limit reached or inactive).');
    }

    trx.prepare(`
      INSERT INTO coupon_redemptions (id, coupon_id, account_id, order_id)
      VALUES (?, ?, ?, ?)
    `).run(generateId('cpr'), couponId, accountId, orderId);
  }, db);
}

export function cancelCouponRedemptionAtomic(
  orderId: string,
  db: Database.Database = getDatabase()
): void {
  runInTransaction((trx) => {
    const redemptions = trx.prepare('SELECT id, coupon_id FROM coupon_redemptions WHERE order_id = ?').all(orderId) as Array<{ id: string; coupon_id: string }>;
    for (const r of redemptions) {
      trx.prepare('UPDATE coupon_rules SET redemptions_count = MAX(0, redemptions_count - 1) WHERE id = ?').run(r.coupon_id);
      trx.prepare('DELETE FROM coupon_redemptions WHERE id = ?').run(r.id);
    }
  }, db);
}

export function listCoupons(db: Database.Database = getDatabase()): CouponRule[] {
  const rows = db.prepare('SELECT * FROM coupon_rules ORDER BY expires_at ASC, code ASC').all() as Array<{
    id: string;
    code: string;
    discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discount_value: number;
    max_redemptions: number;
    redemptions_count: number;
    expires_at: string;
    is_active: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    maxRedemptions: r.max_redemptions,
    redemptionsCount: r.redemptions_count,
    expiresAt: r.expires_at,
    isActive: Boolean(r.is_active),
  }));
}

export function createProduct(
  data: { categoryId: string; slug: string; name: string; description?: string; providerType: 'PTERODACTYL' | 'CPANEL' | 'REGISTRAR' | 'VPS'; isPublished?: boolean },
  db: Database.Database = getDatabase()
): { id: string } {
  const id = generateId('prd');
  db.prepare(`
    INSERT INTO products (id, category_id, slug, name, description, provider_type, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.categoryId, data.slug, data.name, data.description || '', data.providerType, data.isPublished ? 1 : 0);
  return { id };
}

export function updateProductPublishStatus(
  productId: string,
  isPublished: boolean,
  db: Database.Database = getDatabase()
): void {
  db.prepare('UPDATE products SET is_published = ? WHERE id = ?').run(isPublished ? 1 : 0, productId);
}

export function createPlanVersion(
  data: { productId: string; name: string; resourceSpecs: PlanResourceSpec; prices: PlanPrice[] },
  db: Database.Database = getDatabase()
): { planVersionId: string; version: number } {
  return runInTransaction((trx) => {
    const maxVersionRow = trx.prepare('SELECT max(version) as max_v FROM plan_versions WHERE product_id = ?').get(data.productId) as { max_v: number | null };
    const nextVersion = (maxVersionRow?.max_v ?? 0) + 1;
    const planVersionId = generateId('plv');

    trx.prepare(`
      INSERT INTO plan_versions (id, product_id, version, name, resource_specs, status)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    `).run(planVersionId, data.productId, nextVersion, data.name, JSON.stringify(data.resourceSpecs));

    for (const prc of data.prices) {
      trx.prepare(`
        INSERT INTO plan_prices (id, plan_version_id, currency, interval, price_minor_units, setup_fee_minor_units)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(generateId('prc'), planVersionId, prc.currency, prc.interval, prc.priceMinorUnits, prc.setupFeeMinorUnits ?? 0);
    }

    return { planVersionId, version: nextVersion };
  }, db);
}

export function updatePlanStatus(
  planVersionId: string,
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED',
  db: Database.Database = getDatabase()
): void {
  db.prepare('UPDATE plan_versions SET status = ? WHERE id = ?').run(status, planVersionId);
}
