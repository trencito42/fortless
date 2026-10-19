import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/index.js';
import { config } from '../../config/index.js';
import { generateId } from '../identity/auth.js';

export interface QuoteRequestItem {
  planVersionId: string;
  quantity: number;
  interval?: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  regionId?: string;
  customOptions?: Record<string, unknown>;
}

export interface TaxEvidence {
  country: string;
  isB2B: boolean;
  taxId?: string;
  taxRateBasisPoints: number; // e.g. 1900 for 19.00%
  jurisdiction: string;
}

export interface QuoteSnapshot {
  id: string;
  accountId: string;
  currency: string;
  subtotalMinorUnits: number;
  discountMinorUnits?: number;
  couponCode?: string;
  taxMinorUnits: number;
  totalMinorUnits: number;
  taxEvidence: TaxEvidence;
  lines: {
    planVersionId: string;
    quantity: number;
    interval?: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
    regionId?: string;
    unitPriceMinorUnits: number;
    setupFeeMinorUnits?: number;
    totalMinorUnits: number;
  }[];
  validUntil: string;
  signature: string;
}

/** Set by staff (admin billing profile) after the tax id was checked; only this value permits reverse charge. */
export const VERIFIED_TAX_ID_TYPE = 'EU_VAT_VERIFIED';

const VAT_RATES: Record<string, number> = {
  DE: 1900,
  FR: 2000,
  ES: 2100,
  IT: 2200,
  NL: 2100,
  BE: 2100,
  AT: 2000,
  GB: 2000,
  US: 0,
};

export function resolveTaxRate(country: string, isB2B: boolean, taxId?: string): TaxEvidence {
  const normalizedCountry = country.toUpperCase();

  // B2B Reverse-Charge (EU Member States with valid Tax ID format)
  // Must match EU VAT format: 2-letter country prefix + 6 to 12 alphanumeric characters
  const isValidVat = (id: string) => /^[A-Z]{2}[0-9A-Za-z+*.]{6,12}$/.test(id.trim());
  if (isB2B && taxId && isValidVat(taxId) && normalizedCountry !== 'DE') {
    return {
      country: normalizedCountry,
      isB2B: true,
      taxId: taxId.trim(),
      taxRateBasisPoints: 0,
      jurisdiction: 'EU_REVERSE_CHARGE',
    };
  }

  const rate = VAT_RATES[normalizedCountry] ?? 1900; // Default domestic VAT if unlisted
  return {
    country: normalizedCountry,
    isB2B,
    taxId,
    taxRateBasisPoints: rate,
    jurisdiction: `VAT_${normalizedCountry}`,
  };
}

export function computeTaxMinorUnits(subtotalMinorUnits: number, taxRateBasisPoints: number): number {
  if (taxRateBasisPoints <= 0) return 0;
  // Half-up banker's rounding: (subtotal * rate + 5000) / 10000
  return Math.floor((subtotalMinorUnits * taxRateBasisPoints + 5000) / 10000);
}

export function signQuoteData(data: Omit<QuoteSnapshot, 'signature'>): string {
  const payload = JSON.stringify({
    id: data.id,
    accountId: data.accountId,
    subtotal: data.subtotalMinorUnits,
    discount: data.discountMinorUnits ?? 0,
    coupon: data.couponCode ?? null,
    tax: data.taxMinorUnits,
    total: data.totalMinorUnits,
    validUntil: data.validUntil,
  });
  return crypto.createHmac('sha256', config.SESSION_SECRET).update(payload).digest('hex');
}

export function createQuote(
  accountId: string,
  items: QuoteRequestItem[],
  billingCountry: string,
  isB2B = false,
  taxId?: string,
  couponCodeOrDb?: string | Database.Database,
  explicitDb?: Database.Database
): QuoteSnapshot {
  let couponCode: string | undefined = undefined;
  let db: Database.Database;

  if (typeof couponCodeOrDb === 'string') {
    couponCode = couponCodeOrDb;
    db = explicitDb ?? getDatabase();
  } else if (couponCodeOrDb && typeof couponCodeOrDb === 'object') {
    db = couponCodeOrDb;
  } else {
    db = explicitDb ?? getDatabase();
  }

  if (!items || items.length === 0) {
    throw new Error('Quote must contain at least one item.');
  }

  let subtotal = 0;
  const lines: QuoteSnapshot['lines'] = [];

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Item quantity must be a positive integer.');
    }
    if (item.quantity > 50) {
      throw new Error('Maximum quantity per order item is 50.');
    }

    const interval = item.interval ?? 'MONTHLY';
    const priceRow = db.prepare(`
      SELECT pp.price_minor_units, coalesce(pp.setup_fee_minor_units, 0) as setup_fee_minor_units, p.id AS product_id
      FROM plan_prices pp
      JOIN plan_versions pv ON pv.id = pp.plan_version_id
      JOIN products p ON p.id = pv.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE pp.plan_version_id = ? AND pp.currency = 'EUR' AND pp.interval = ?
        AND pv.status = 'ACTIVE'
        AND p.is_published = 1
        AND c.is_active = 1
    `).get(item.planVersionId, interval) as { price_minor_units: number; setup_fee_minor_units: number; product_id: string } | undefined;

    if (!priceRow) {
      throw new Error(`Plan version ${item.planVersionId} is not available for purchase on interval ${interval}.`);
    }

    const restriction = db.prepare(`SELECT allowed_countries, max_services_per_account, available_from, available_until, requires_verified_email
      FROM product_sales_restrictions WHERE product_id = ?`).get(priceRow.product_id) as any;
    if (restriction) {
      const now = Date.now();
      if (restriction.available_from && new Date(restriction.available_from).getTime() > now) throw new Error('This product is not available for sale yet.');
      if (restriction.available_until && new Date(restriction.available_until).getTime() < now) throw new Error('This product is no longer available for sale.');
      const countries = JSON.parse(restriction.allowed_countries || '[]') as string[];
      if (countries.length && !countries.includes(billingCountry.toUpperCase())) throw new Error('This product is not available in the selected billing country.');
      if (restriction.requires_verified_email) {
        const verified = db.prepare('SELECT u.email_verified_at FROM accounts a JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?').get(accountId) as { email_verified_at: string | null } | undefined;
        if (!verified?.email_verified_at) throw new Error('A verified account email is required for this product.');
      }
      if (restriction.max_services_per_account) {
        const existing = db.prepare(`SELECT count(*) AS count FROM services s JOIN order_items oi ON oi.id = s.order_item_id JOIN plan_versions pv ON pv.id = oi.plan_version_id
          WHERE s.account_id = ? AND pv.product_id = ? AND s.contract_status != 'TERMINATED'`).get(accountId, priceRow.product_id) as { count: number };
        if (existing.count + item.quantity > restriction.max_services_per_account) throw new Error('This product has reached its per-account purchase limit.');
      }
    }

    let optionDelta = 0;
    const configuredOptions = db.prepare(`SELECT option_key, label, input_type, is_required, config_json, price_delta_minor_units
      FROM plan_configurable_options WHERE plan_version_id = ? ORDER BY sort_order, label`).all(item.planVersionId) as any[];
    for (const option of configuredOptions) {
      const value = item.customOptions?.[option.option_key];
      if (option.is_required && (value === undefined || value === null || value === '')) throw new Error(`${option.label} is required.`);
      if (value === undefined || value === null || value === '') continue;
      const configValue = JSON.parse(option.config_json || '{}') as { choices?: string[]; min?: number; max?: number };
      if (option.input_type === 'BOOLEAN' && typeof value !== 'boolean') throw new Error(`${option.label} must be true or false.`);
      if (option.input_type === 'SELECT' && (typeof value !== 'string' || !configValue.choices?.includes(value))) throw new Error(`${option.label} has an invalid selection.`);
      if (option.input_type === 'INTEGER' && (!Number.isInteger(value) || (configValue.min !== undefined && Number(value) < configValue.min) || (configValue.max !== undefined && Number(value) > configValue.max))) throw new Error(`${option.label} is outside the allowed range.`);
      if (option.input_type !== 'BOOLEAN' || value === true) optionDelta += Number(option.price_delta_minor_units || 0);
    }

    const setupFee = (priceRow.setup_fee_minor_units || 0) * item.quantity;
    const unitPrice = priceRow.price_minor_units + optionDelta;
    const lineTotal = (unitPrice * item.quantity) + setupFee;
    subtotal += lineTotal;

    lines.push({
      planVersionId: item.planVersionId,
      quantity: item.quantity,
      interval,
      regionId: item.regionId,
      unitPriceMinorUnits: unitPrice,
      setupFeeMinorUnits: setupFee,
      totalMinorUnits: lineTotal,
    });
  }

  let discountMinorUnits = 0;
  let validatedCouponCode: string | undefined = undefined;

  if (couponCode && couponCode.trim()) {
    const couponRow = db.prepare(`
      SELECT id, code, discount_type, discount_value, max_redemptions, redemptions_count, expires_at, is_active
      FROM coupon_rules
      WHERE code = ?
    `).get(couponCode.trim().toUpperCase()) as {
      id: string;
      code: string;
      discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
      discount_value: number;
      max_redemptions: number;
      redemptions_count: number;
      expires_at: string;
      is_active: number;
    } | undefined;

    if (!couponRow || !couponRow.is_active) {
      throw new Error('Invalid or inactive coupon code.');
    }
    if (new Date(couponRow.expires_at).getTime() < Date.now()) {
      throw new Error('This coupon has expired.');
    }
    const prior = db.prepare('SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND account_id = ?').get(couponRow.id, accountId);
    if (prior) {
      throw new Error('This coupon has already been redeemed by your workspace.');
    }

    if (couponRow.redemptions_count >= couponRow.max_redemptions) {
      throw new Error('Coupon usage limit reached.');
    }

    if (couponRow.discount_type === 'PERCENTAGE') {
      discountMinorUnits = Math.round((subtotal * couponRow.discount_value) / 100);
    } else {
      discountMinorUnits = Math.min(subtotal, couponRow.discount_value);
    }
    validatedCouponCode = couponRow.code;
  }

  const taxableAmount = Math.max(0, subtotal - discountMinorUnits);
  const taxEvidence = resolveTaxRate(billingCountry, isB2B, taxId);
  const taxAmount = computeTaxMinorUnits(taxableAmount, taxEvidence.taxRateBasisPoints);
  const totalAmount = taxableAmount + taxAmount;

  const quoteId = generateId('quo');
  const validUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute TTL

  const snapshotMeta = {
    taxEvidence,
    discountMinorUnits,
    couponCode: validatedCouponCode,
  };

  const quoteData: Omit<QuoteSnapshot, 'signature'> = {
    id: quoteId,
    accountId,
    currency: 'EUR',
    subtotalMinorUnits: subtotal,
    discountMinorUnits,
    couponCode: validatedCouponCode,
    taxMinorUnits: taxAmount,
    totalMinorUnits: totalAmount,
    taxEvidence,
    lines,
    validUntil,
  };

  const signature = signQuoteData(quoteData);

  // Persist to database
  db.prepare(`
    INSERT INTO quotes (id, account_id, currency, subtotal_minor_units, tax_minor_units, total_minor_units, tax_calculation_snapshot, valid_until, status)
    VALUES (?, ?, 'EUR', ?, ?, ?, ?, ?, 'OPEN')
  `).run(quoteId, accountId, subtotal, taxAmount, totalAmount, JSON.stringify(snapshotMeta), validUntil);

  for (const line of lines) {
    db.prepare(`
      INSERT INTO quote_lines (id, quote_id, plan_version_id, quantity, unit_price_minor_units, total_minor_units, interval, region_id, setup_fee_minor_units)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId('qln'), quoteId, line.planVersionId, line.quantity, line.unitPriceMinorUnits, line.totalMinorUnits, line.interval ?? 'MONTHLY', line.regionId ?? null, line.setupFeeMinorUnits ?? 0);
  }

  return { ...quoteData, signature };
}

export function verifyQuote(quoteId: string, accountId: string, db: Database.Database = getDatabase()): QuoteSnapshot {
  const quoteRow = db.prepare('SELECT * FROM quotes WHERE id = ? AND account_id = ?').get(quoteId, accountId) as ({
    id: string;
    account_id: string;
    currency: string;
    subtotal_minor_units: number;
    tax_minor_units: number;
    total_minor_units: number;
    tax_calculation_snapshot: string;
    valid_until: string;
    status: 'OPEN' | 'CONVERTED' | 'EXPIRED';
  }) | undefined;

  if (!quoteRow) {
    throw new Error('Quote not found or does not belong to this account.');
  }

  if (quoteRow.status !== 'OPEN') {
    throw new Error(`Quote is already ${quoteRow.status.toLowerCase()}. Please generate a new quote.`);
  }

  if (new Date(quoteRow.valid_until).getTime() < Date.now()) {
    db.prepare("UPDATE quotes SET status = 'EXPIRED' WHERE id = ?").run(quoteId);
    throw new Error('Quote has expired (15-minute TTL). Please request a fresh quote.');
  }

  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ?').all(quoteId) as ({
    plan_version_id: string;
    quantity: number;
    unit_price_minor_units: number;
    total_minor_units: number;
    interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
    region_id: string | null;
    setup_fee_minor_units: number;
  })[];

  const rawMeta = JSON.parse(quoteRow.tax_calculation_snapshot) as Record<string, unknown>;
  const taxEvidence = (rawMeta.taxEvidence ?? rawMeta) as TaxEvidence;
  const discountMinorUnits = typeof rawMeta.discountMinorUnits === 'number' ? rawMeta.discountMinorUnits : 0;
  const couponCode = typeof rawMeta.couponCode === 'string' ? rawMeta.couponCode : undefined;

  const quoteData: Omit<QuoteSnapshot, 'signature'> = {
    id: quoteRow.id,
    accountId: quoteRow.account_id,
    currency: quoteRow.currency,
    subtotalMinorUnits: quoteRow.subtotal_minor_units,
    discountMinorUnits,
    couponCode,
    taxMinorUnits: quoteRow.tax_minor_units,
    totalMinorUnits: quoteRow.total_minor_units,
    taxEvidence,
    lines: lines.map((l) => ({
      planVersionId: l.plan_version_id,
      quantity: l.quantity,
      unitPriceMinorUnits: l.unit_price_minor_units,
      totalMinorUnits: l.total_minor_units,
      // FTL-BILL-201 / NEW-305 / NEW-315: what the customer was quoted must come back unchanged at checkout.
      interval: l.interval,
      regionId: l.region_id ?? undefined,
      setupFeeMinorUnits: l.setup_fee_minor_units,
    })),
    validUntil: quoteRow.valid_until,
  };

  const signature = signQuoteData(quoteData);
  return { ...quoteData, signature };
}
