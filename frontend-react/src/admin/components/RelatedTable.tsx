import type { ReactNode } from 'react';
import { DataTable, type ColumnDef } from '@/design-system';

/** Small embedded table for a detail-page tab: sorted, paged, with its own empty state. */
export function RelatedTable<T>({ rows, columns, getRowId, caption, empty = 'Nothing to show.', pageSize = 8, onRowClick, rowLabel }: { rows: T[]; columns: ColumnDef<T, unknown>[]; getRowId: (r: T) => string; caption: string; empty?: ReactNode; pageSize?: number; onRowClick?: (r: T) => void; rowLabel?: (r: T) => string }) {
  return <DataTable data={rows} columns={columns} getRowId={getRowId} caption={caption} pageSize={pageSize} onRowClick={onRowClick} rowLabel={rowLabel} hideSinglePagePager empty={{ title: typeof empty === 'string' ? empty : 'Nothing here', description: typeof empty === 'string' ? undefined : empty }} />;
}
