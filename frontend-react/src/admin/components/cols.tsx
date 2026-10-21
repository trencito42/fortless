import type { ReactNode } from 'react';
import type { ColumnDef } from '@/design-system';

interface ColOpts<T> {
  /** Sort key. Without it the column is not sortable. */
  sort?: (r: T) => string | number;
  numeric?: boolean;
  primary?: boolean;
  hideOnMobile?: boolean;
  /** Start hidden; the column picker can show it. */
  hidden?: boolean;
  label?: string;
}
/** Compact column builder: `col('name', 'Name', (r) => r.name, { sort: (r) => r.name })`. */
export function col<T>(id: string, header: string, cell: (r: T) => ReactNode, o: ColOpts<T> = {}): ColumnDef<T, unknown> {
  return {
    id, header, accessorFn: (r) => (o.sort ? o.sort(r) : ''), enableSorting: !!o.sort, cell: ({ row }) => cell(row.original),
    meta: { label: o.label ?? header, ...(o.numeric ? { numeric: true } : {}), ...(o.primary ? { primary: true } : {}), ...(o.hideOnMobile ? { hideOnMobile: true } : {}) },
    ...(o.hidden ? { enableHiding: true } : {}),
  } as ColumnDef<T, unknown>;
}

/** Keeps short values (dates, ages) on one line inside table cells. */
export const nw = (v: ReactNode) => <span className="whitespace-nowrap">{v}</span>;
