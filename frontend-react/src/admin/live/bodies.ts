import { toMinor, type Row } from './helpers';

/** Request bodies sent by the live admin forms. They are pure so the backend contract test (tests/react-admin-mutations.test.ts) can send exactly what the UI sends. */
type V = Record<string, string | undefined>;
const list = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const CURRENCIES = ['EUR', 'USD', 'RON'] as const;
export const INTERVALS = [['MONTHLY', 'Monthly'], ['QUARTERLY', 'Quarterly'], ['ANNUAL', 'Annual']] as const;
export const PRICE_KEYS = CURRENCIES.flatMap((c) => INTERVALS.map(([i]) => `${c}_${i}`));

export const productCreateBody = (v: V) => ({ categoryId: v['categoryId'], slug: v['slug'], name: v['name']?.trim(), description: v['description']?.trim() ?? '', providerType: v['providerType'], isPublished: false });
export const productEditBody = (v: V) => ({ categoryId: v['categoryId'], name: v['name']?.trim(), description: v['description']?.trim() ?? '', restrictions: { allowedCountries: list(v['countries']), maxServicesPerAccount: v['max'] ? Number(v['max']) : null, availableFrom: v['from'] ? `${v['from']}T00:00:00.000Z` : null, availableUntil: v['until'] ? `${v['until']}T00:00:00.000Z` : null, requiresVerifiedEmail: v['verified'] !== 'no' } });
export const planCreateBody = (productId: string, v: V) => ({
  productId, name: v['name']?.trim(),
  resourceSpecs: { memoryMb: Number(v['memoryMb']), cpuPct: Number(v['cpuPct']), diskMb: Number(v['diskMb']), databases: Number(v['databases'] || 0), backups: Number(v['backups'] || 0), ...(v['eggId'] ? { eggId: Number(v['eggId']) } : {}) },
  prices: PRICE_KEYS.filter((k) => v[k]?.trim()).map((k) => { const [currency, interval] = k.split('_') as [string, string]; return { currency, interval, priceMinorUnits: toMinor(v[k])!, setupFeeMinorUnits: 0 }; }),
});
export const couponBody = (v: V) => ({ code: v['code'], discountType: v['type'], discountValue: Math.trunc(Number(v['value'])), maxRedemptions: Math.trunc(Number(v['max'])), expiresAt: `${v['expires']}T23:59:59.000Z` });
export const billingProfileBody = (v: V) => ({ companyName: v['companyName']?.trim() || null, taxId: v['taxId']?.trim() || null, taxIdType: v['taxIdType']?.trim() || null, addressLine1: v['addressLine1']?.trim(), addressLine2: v['addressLine2']?.trim() || null, city: v['city']?.trim(), postalCode: v['postalCode']?.trim(), country: v['country'] });
export const routingBody = (v: V) => ({ assignedStaffId: v['staff'] === 'none' ? null : v['staff'], departmentId: v['department'] === 'none' ? null : v['department'], priority: v['priority'] });
export const departmentBody = (v: V) => ({ name: v['name']?.trim(), description: v['description']?.trim() ?? '' });
export const macroBody = (v: V) => ({ name: v['name']?.trim(), body: v['body']?.trim(), status: v['status'] === 'none' ? null : v['status'], departmentId: v['departmentId'] === 'none' ? null : v['departmentId'] });
export const templateBody = (v: V) => ({ subject: v['subject']?.trim(), text: v['text']?.trim(), html: v['html']?.trim() });
export const announcementEditBody = (v: V) => ({ slug: v['slug'], category: v['category'], kind: v['kind'], title: v['title']?.trim(), bodyMarkdown: v['body']?.trim(), isPublished: v['publication'] === 'PUBLISHED' });
export const categoryBody = (v: V) => ({ slug: v['slug'], name: v['name']?.trim(), description: v['description']?.trim() ?? '', sortOrder: Number(v['sortOrder']) });

export const OPTION_HELP = 'One option per line: key | Label | BOOLEAN or SELECT or INTEGER | required (yes/no) | price delta in minor units | SELECT: choices separated by ; | INTEGER: min..max';
export function parseOptions(textValue: string): { options?: Row[]; error?: string } {
  const out: Row[] = [];
  const lines = textValue.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const [n, line] of lines.entries()) {
    const [key = '', label = '', type = '', req = 'no', delta = '0', extra = ''] = line.split('|').map((x) => x.trim());
    if (!/^[a-z][a-zA-Z0-9_]{1,49}$/.test(key)) return { error: `Line ${n + 1}: key must start with a lowercase letter (2–50 letters, digits, underscore).` };
    if (label.length < 2) return { error: `Line ${n + 1}: label is required.` };
    if (!['BOOLEAN', 'SELECT', 'INTEGER'].includes(type)) return { error: `Line ${n + 1}: type must be BOOLEAN, SELECT or INTEGER.` };
    if (!/^\d{1,8}$/.test(delta)) return { error: `Line ${n + 1}: price delta must be a whole number of minor units.` };
    const config: Row = {};
    if (type === 'SELECT') { const choices = extra.split(';').map((c) => c.trim()).filter(Boolean); if (!choices.length) return { error: `Line ${n + 1}: SELECT needs choices separated by “;”.` }; config['choices'] = choices; }
    if (type === 'INTEGER' && extra) { const m = extra.match(/^(-?\d+)\.\.(-?\d+)$/); if (!m || Number(m[1]) > Number(m[2])) return { error: `Line ${n + 1}: use min..max with min ≤ max.` }; config['min'] = Number(m[1]); config['max'] = Number(m[2]); }
    out.push({ key, label, inputType: type, isRequired: req.toLowerCase() === 'yes', config, priceDeltaMinorUnits: Number(delta) });
  }
  if (out.length > 30) return { error: 'At most 30 options.' };
  return { options: out };
}
