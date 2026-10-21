import type { Category, Coupon, Plan, PlanPrice, Product, PriceRule, ProviderEgg, Currency, BillingInterval } from '../types';
import { iso, DAY } from '../lib/format';

export const categories: Category[] = [
  { id: 'cat_games', slug: 'game-servers', name: 'Game servers', order: 1 },
  { id: 'cat_bots', slug: 'bots-apps', name: 'Bots & apps', order: 2 },
  { id: 'cat_vps', slug: 'vps', name: 'Virtual servers', order: 3 },
];
const open = { allowedCountries: [] as string[], maxServicesPerAccount: null as number | null, requiresVerifiedEmail: false };
export const products: Product[] = [
  { id: 'prd_minecraft', slug: 'minecraft-java', name: 'Minecraft Java', description: 'Paper, Fabric, Forge and vanilla servers with one-click modpacks.', providerType: 'PTERODACTYL', isPublished: true, categoryId: 'cat_games', restrictions: { ...open, requiresVerifiedEmail: true } },
  { id: 'prd_cs2', slug: 'counter-strike-2', name: 'Counter-Strike 2', description: 'Dedicated CS2 servers, 128 tick option, workshop maps.', providerType: 'PTERODACTYL', isPublished: true, categoryId: 'cat_games', restrictions: { ...open, requiresVerifiedEmail: true, maxServicesPerAccount: 5 } },
  { id: 'prd_cs16', slug: 'counter-strike-16', name: 'Counter-Strike 1.6', description: 'Classic CS 1.6 with AMX Mod X and FastDL.', providerType: 'PTERODACTYL', isPublished: true, categoryId: 'cat_games', restrictions: open },
  { id: 'prd_discord', slug: 'discord-bot-hosting', name: 'Discord bot hosting', description: 'Node.js and Python bots with 24/7 uptime.', providerType: 'PTERODACTYL', isPublished: true, categoryId: 'cat_bots', restrictions: open },
  { id: 'prd_nodejs', slug: 'nodejs-apps', name: 'Node.js apps', description: 'Small web apps and APIs with a managed domain.', providerType: 'PTERODACTYL', isPublished: true, categoryId: 'cat_bots', restrictions: open },
  { id: 'prd_vps', slug: 'vps-kvm', name: 'KVM VPS', description: 'Planned: full-root virtual servers. Not sellable until a VPS provider adapter exists.', providerType: 'NONE', isPublished: false, categoryId: 'cat_vps', restrictions: open },
];

const cur: Currency[] = ['EUR', 'USD', 'RON'];
const fx: Record<Currency, number> = { EUR: 1, USD: 1.08, RON: 4.97 };
const prices = (eurMonthly: number, setup = 0): PlanPrice[] => cur.flatMap((currency) => (['MONTHLY', 'QUARTERLY', 'ANNUAL'] as BillingInterval[]).map((interval) => {
  const m = interval === 'MONTHLY' ? 1 : interval === 'QUARTERLY' ? 3 * 0.95 : 12 * 0.85;
  const cents = Math.round(eurMonthly * 100 * fx[currency] * m);
  return { currency, interval, priceMinorUnits: currency === 'RON' ? Math.round(cents / 100) * 100 : Math.round(cents / 10) * 10 - 1, setupFeeMinorUnits: Math.round(setup * 100 * fx[currency]) };
}));
const optMinecraft = [{ id: 'opt_mc_ver', key: 'version', label: 'Server software', inputType: 'select' as const, isRequired: true, priceDeltaMinorUnits: 0 }, { id: 'opt_mc_bk', key: 'extra_backups', label: 'Extra backup slots (+3)', inputType: 'number' as const, isRequired: false, priceDeltaMinorUnits: 150 }];
const plan = (id: string, productId: string, name: string, eur: number, mem: number, cpu: number, disk: number, db: number, bk: number, egg: number, regions: string[], extra: Partial<Plan> = {}): Plan => ({
  id, productId, version: 1, name, status: 'ACTIVE', resources: { memoryMb: mem, cpuPct: cpu, diskMb: disk, databases: db, backups: bk, eggId: egg, dockerImage: 'ghcr.io/pterodactyl/yolks:java_21' },
  prices: prices(eur), options: productId === 'prd_minecraft' ? optMinecraft : [], regions, capacityLimit: null, ...extra,
});
const EU = ['fra', 'ams', 'buc', 'hel'];
export const plans: Plan[] = [
  plan('pln_mc_pebble', 'prd_minecraft', 'Pebble 1 GB', 4.99, 1024, 100, 10240, 0, 1, 3, EU),
  plan('pln_mc_stone', 'prd_minecraft', 'Stone 2 GB', 8.99, 2048, 150, 20480, 1, 2, 3, EU),
  plan('pln_mc_iron', 'prd_minecraft', 'Iron 4 GB', 16.99, 4096, 200, 40960, 2, 3, 3, [...EU, 'ash'], { version: 2 }),
  { ...plan('pln_mc_iron_v1', 'prd_minecraft', 'Iron 4 GB', 15.99, 4096, 200, 40960, 2, 3, 3, EU), status: 'RETIRED', version: 1 },
  plan('pln_mc_diamond', 'prd_minecraft', 'Diamond 8 GB', 32.99, 8192, 300, 81920, 3, 5, 3, [...EU, 'ash'], { capacityLimit: 40 }),
  plan('pln_cs2_casual', 'prd_cs2', 'CS2 Casual 10 slots', 9.99, 2048, 200, 51200, 0, 1, 5, EU),
  plan('pln_cs2_pro', 'prd_cs2', 'CS2 Pro 24 slots', 19.99, 4096, 300, 102400, 1, 2, 5, ['fra', 'ams', 'ash']),
  { ...plan('pln_cs2_128', 'prd_cs2', 'CS2 128-tick Draft', 29.99, 6144, 400, 102400, 1, 2, 5, ['fra']), status: 'DRAFT' },
  plan('pln_cs16_classic', 'prd_cs16', 'Classic 16 slots', 3.99, 512, 100, 5120, 0, 0, 6, EU),
  plan('pln_bot_nano', 'prd_discord', 'Bot Nano', 1.99, 256, 50, 2048, 0, 0, 7, EU),
  plan('pln_bot_plus', 'prd_discord', 'Bot Plus', 3.99, 512, 100, 5120, 1, 1, 7, EU),
  plan('pln_node_s', 'prd_nodejs', 'App S', 2.99, 512, 100, 5120, 1, 1, 8, EU),
  plan('pln_node_m', 'prd_nodejs', 'App M', 5.99, 1024, 150, 10240, 2, 2, 8, EU),
];
export const planById = Object.fromEntries(plans.map((p) => [p.id, p]));
export const productById = Object.fromEntries(products.map((p) => [p.id, p]));
export const priceOf = (planId: string, currency: Currency, interval: BillingInterval) => planById[planId]?.prices.find((p) => p.currency === currency && p.interval === interval)?.priceMinorUnits ?? 0;

export const eggs: ProviderEgg[] = [
  { id: 3, name: 'Paper', nest: 'Minecraft', dockerImage: 'ghcr.io/pterodactyl/yolks:java_21', mappedPlans: ['pln_mc_pebble', 'pln_mc_stone', 'pln_mc_iron', 'pln_mc_diamond'], compatible: true },
  { id: 4, name: 'Forge', nest: 'Minecraft', dockerImage: 'ghcr.io/pterodactyl/yolks:java_17', mappedPlans: [], compatible: true, note: 'Available as a user option, no dedicated plan.' },
  { id: 5, name: 'Counter-Strike 2', nest: 'Source Engine', dockerImage: 'ghcr.io/pterodactyl/games:source', mappedPlans: ['pln_cs2_casual', 'pln_cs2_pro', 'pln_cs2_128'], compatible: true },
  { id: 6, name: 'Counter-Strike 1.6', nest: 'Source Engine', dockerImage: 'ghcr.io/pterodactyl/games:source', mappedPlans: ['pln_cs16_classic'], compatible: true },
  { id: 7, name: 'Generic Node.js bot', nest: 'Software', dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20', mappedPlans: ['pln_bot_nano', 'pln_bot_plus'], compatible: true },
  { id: 8, name: 'Node.js app', nest: 'Software', dockerImage: 'ghcr.io/pterodactyl/yolks:nodejs_20', mappedPlans: ['pln_node_s', 'pln_node_m'], compatible: true },
  { id: 9, name: 'Rust', nest: 'Rust', dockerImage: 'ghcr.io/pterodactyl/games:rust', mappedPlans: [], compatible: false, note: 'No Fortless product maps this egg.' },
  { id: 10, name: 'Terraria (TShock)', nest: 'Terraria', dockerImage: 'ghcr.io/pterodactyl/yolks:dotnet_6', mappedPlans: [], compatible: false, note: 'Image tag changed upstream; revalidate before mapping.' },
];

export const coupons: Coupon[] = [
  { id: 'cpn_welcome10', code: 'WELCOME10', discountType: 'PERCENTAGE', discountValue: 10, maxRedemptions: 500, redemptionsCount: 183, expiresAt: iso(120 * DAY), isActive: true, appliesTo: 'First order, all game servers' },
  { id: 'cpn_summer5', code: 'SUMMER5', discountType: 'FIXED_AMOUNT', discountValue: 500, currency: 'EUR', maxRedemptions: 200, redemptionsCount: 200, expiresAt: iso(-20 * DAY), isActive: false, appliesTo: 'Any plan, EUR only' },
  { id: 'cpn_clan20', code: 'CLAN20', discountType: 'PERCENTAGE', discountValue: 20, maxRedemptions: 50, redemptionsCount: 12, expiresAt: iso(60 * DAY), isActive: true, appliesTo: 'Counter-Strike products' },
  { id: 'cpn_bf26', code: 'BLACKFRIDAY26', discountType: 'PERCENTAGE', discountValue: 30, maxRedemptions: 1000, redemptionsCount: 0, expiresAt: iso(70 * DAY), isActive: false, appliesTo: 'Scheduled · not yet active' },
  { id: 'cpn_ron15', code: 'ACASA15', discountType: 'FIXED_AMOUNT', discountValue: 1500, currency: 'RON', maxRedemptions: 300, redemptionsCount: 41, expiresAt: iso(90 * DAY), isActive: true, appliesTo: 'RON orders only' },
];

export const priceRules: PriceRule[] = [
  { id: 'prl_eur', name: 'EUR base pricing', kind: 'currency', description: 'Source of truth for plan prices. Other currencies are set explicitly, not converted at checkout.', value: 'EUR · tax excluded', status: 'active', scope: 'All plans' },
  { id: 'prl_usd', name: 'USD list prices', kind: 'currency', description: 'Rounded to .99, reviewed quarterly against the EUR base.', value: 'EUR × 1.08, rounded', status: 'active', scope: 'All plans' },
  { id: 'prl_ron', name: 'RON list prices', kind: 'currency', description: 'Includes RON-specific rounding to full lei.', value: 'EUR × 4.97, rounded', status: 'active', scope: 'All plans' },
  { id: 'prl_quarter', name: 'Quarterly cycle discount', kind: 'cycle', description: 'Three months for the price of 2.85.', value: '5% off', status: 'active', scope: 'Quarterly cycle' },
  { id: 'prl_annual', name: 'Annual cycle discount', kind: 'cycle', description: 'Twelve months for the price of 10.2.', value: '15% off', status: 'active', scope: 'Annual cycle' },
  { id: 'prl_vat_table', name: 'VAT by billing country', kind: 'tax', description: 'Rate table used by the quote engine (src/modules/pricing/quote.ts): DE 19%, FR 20%, ES 21%, IT 22%, NL 21%, BE 21%, AT 20%, GB 20%, US 0%; any other country 19%.', value: 'Country table, half-up rounding', status: 'active', scope: 'All customers' },
  { id: 'prl_reverse', name: 'EU reverse charge', kind: 'tax', description: 'B2B with a valid-format VAT id outside DE is charged 0%; staff verification of the id is tracked on the billing profile.', value: '0% with valid VAT id', status: 'active', scope: 'EU business customers' },
  { id: 'prl_vat_us', name: 'US sales tax', kind: 'tax', description: 'Not collected. Needs a tax-provider decision before a US launch.', value: '—', status: 'draft', scope: 'US customers' },
  { id: 'prl_loyal', name: 'Loyalty discount', kind: 'discount', description: 'Automatic 5% after 12 active months.', value: '5% off', status: 'draft', scope: 'Active customers' },
];
