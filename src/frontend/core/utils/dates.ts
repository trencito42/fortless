export function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  let str = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    str = `${str.replace(' ', 'T')}Z`;
  }
  const dateObj = new Date(str);
  if (isNaN(dateObj.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dateObj);
}
