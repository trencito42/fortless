/**
 * NEW-400: a cell that starts with = + - @ (or a tab/CR) is run as a formula by spreadsheet programs. Such values are
 * prefixed with an apostrophe so they stay text, then quoted as usual.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');
