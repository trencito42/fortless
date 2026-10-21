export type Row = Record<string, unknown>;
export const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const rowsOf = (value: unknown): Row[] => (Array.isArray(value) ? value.filter(isRow) : []);
export const text = (value: unknown, fallback = ''): string => (value == null ? fallback : String(value));
/** "12.50" → 1250. Strict: at most two decimals, no signs or separators. Returns null when the text is not a valid amount. */
export function toMinor(input: string | undefined): number | null {
  const value = (input ?? '').trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole = '0', cents = ''] = value.split('.');
  return Number(whole) * 100 + Number(cents.padEnd(2, '0'));
}
export const fromMinor = (minor: unknown) => (Number.isFinite(Number(minor)) ? (Number(minor) / 100).toFixed(2) : '');
