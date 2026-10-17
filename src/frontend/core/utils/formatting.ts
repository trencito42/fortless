export function money(minorUnits: number | string | null | undefined, currency = 'EUR'): string {
  const val = Number(minorUnits) || 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(val / 100);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'B'}`;
}

export function compactId(value: unknown): string {
  const text = String(value || '—');
  return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}
