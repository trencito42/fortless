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
    totalMinorUnits: number;
  }[];
  validUntil: string;
  signature: string;
}

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

  // B2B Reverse-Charge (EU Member States with valid Tax ID)
  if (isB2B && taxId && taxId.trim().length > 5 && normalizedCountry !== 'DE') {
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
      SELECT pp.price_minor_units
      FROM plan_prices pp
      JOIN plan_versions pv ON pv.id = pp.plan_version_id
      WHERE pp.plan_version_id = ? AND pp.currency = 'EUR' AND pp.interval = ? AND pv.status = 'ACTIVE'
    `).get(item.planVersionId, interval) as { price_minor_units: number } | undefined;

    if (!priceRow) {
      throw new Error(`Plan version ${item.planVersionId} is not available for purchase on interval ${interval}.`);
    }

    const lineTotal = priceRow.price_minor_units * item.quantity;
    subtotal += lineTotal;

    lines.push({
      planVersionId: item.planVersionId,
      quantity: item.quantity,
      interval,
      regionId: item.regionId,
      unitPriceMinorUnits: priceRow.price_minor_units,
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
      INSERT INTO quote_lines (id, quote_id, plan_version_id, quantity, unit_price_minor_units, total_minor_units)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId('qln'), quoteId, line.planVersionId, line.quantity, line.unitPriceMinorUnits, line.totalMinorUnits);
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
    })),
    validUntil: quoteRow.valid_until,
  };

  const signature = signQuoteData(quoteData);
  return { ...quoteData, signature };
}
