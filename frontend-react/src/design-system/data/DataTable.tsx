import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Skeleton } from '../primitives/Skeleton';
import { EmptyState } from '../primitives/EmptyState';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Checkbox } from '../forms/Choice';
import { SearchField } from '../forms/TextField';
import { ActionMenu } from '../actions/ActionMenu';
import { BulkActionBar } from '../actions/BulkActionBar';
import { Pagination } from './Pagination';
import { useMediaQuery } from './useMediaQuery';

export type { ColumnDef } from '@tanstack/react-table';

/** Column meta understood by DataTable. */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Heading used in the column picker and in mobile cards. Defaults to the header string. */
    label?: string;
    /** Hide this column in mobile cards (it is still in the table). */
    hideOnMobile?: boolean;
    /** Right-align numbers. */
    numeric?: boolean;
    /** Column is the card title on mobile. */
    primary?: boolean;
    /** Row actions column (menu or buttons). Never shown as a label/value pair; on phones it sits next to the card title so it stays reachable. */
    actions?: boolean;
  }
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  /** Accessible table name. */
  caption: string;
  loading?: boolean;
  /** Caps the table height (CSS value, e.g. "28rem") and keeps the header row visible while the body scrolls. */
  maxHeight?: string;
  /** Request failed. Shows a retry state instead of an empty table. */
  error?: string;
  onRetry?: () => void;
  /** Shown when there are no rows at all (not when a search matches nothing). */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  selectable?: boolean;
  /** Rendered in the floating bar while rows are selected. */
  bulkActions?: (selected: T[]) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  columnPicker?: boolean;
  pageSize?: number;
  /** Row click (and Enter on the row's primary link cell is up to the cell). */
  onRowClick?: (row: T) => void;
  /** Custom mobile card. Default: primary column as title plus label/value pairs. */
  mobileCard?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  /** Makes rows expandable. The returned panel is rendered full width under the row (desktop) or inside the card (mobile). */
  renderExpanded?: (row: T) => ReactNode;
  /** Human name of a row for assistive tech (expand button, selection). Defaults to the row id. */
  rowLabel?: (row: T) => string;
  /** Hide the pager when everything fits on one page (small embedded tables). */
  hideSinglePagePager?: boolean;
}

/**
 * Data table over TanStack Table: sorting, global search, column visibility, selection, pagination.
 * Below md it renders cards instead of a horizontally scrolling grid. Sorting and filtering are client-side,
 * so pass server-paginated data only when the dataset fits that model.
 */
export function DataTable<T>({ data, columns, getRowId, caption, loading, error, onRetry, empty, selectable, bulkActions, searchable, searchPlaceholder = 'Search', columnPicker, pageSize = 10, maxHeight, onRowClick, mobileCard, toolbar, renderExpanded, rowLabel, hideSinglePagePager }: DataTableProps<T>) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tableId = useId();
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, globalFilter: filter, rowSelection: selection, columnVisibility: visibility, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: (v) => { setFilter(v); setPagination((p) => ({ ...p, pageIndex: 0 })); },
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: setPagination,
    enableRowSelection: !!selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const rows = table.getRowModel().rows;
  const filteredTotal = table.getFilteredRowModel().rows.length;
  const leafColumns = table.getAllLeafColumns();
  const label = (id: string, header: unknown, meta?: { label?: string }) => meta?.label ?? (typeof header === 'string' ? header : id);

  const pickerEntries = useMemo(
    () => leafColumns.filter((c) => c.getCanHide()).map((c) => ({ kind: 'checkbox' as const, id: c.id, label: label(c.id, c.columnDef.header, c.columnDef.meta), checked: c.getIsVisible(), onCheckedChange: (v: boolean) => c.toggleVisibility(v) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafColumns, visibility],
  );

  if (error) return <EmptyState tone="error" title="Could not load this list" description={error} action={onRetry ? <Button variant="secondary" leadingIcon="refresh" onClick={onRetry}>Try again</Button> : undefined} />;

  if (loading) return <SkeletonTable columns={isDesktop ? Math.min(columns.length, 5) : 2} rows={Math.min(pageSize, 5)} label={`Loading ${caption}`} />;

  if (data.length === 0) {
    return <EmptyState title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} />;
  }

  const colCount = table.getVisibleLeafColumns().length + (selectable ? 1 : 0) + (renderExpanded ? 1 : 0);
  const toggleButton = (rowId: string, name: string) => (
    <IconButton label={`${expanded[rowId] ? 'Collapse' : 'Expand'} details for ${name}`} icon={expanded[rowId] ? 'arrow-down-01' : 'arrow-right-01'} variant="ghost" size="sm" aria-expanded={!!expanded[rowId]} aria-controls={`${tableId}-${rowId}`} onClick={(e) => { e.stopPropagation(); toggle(rowId); }} />
  );

  const selectAll = selectable ? (
    <Checkbox label={<span className="sr-only">Select all rows on this page</span>} checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onCheckedChange={(v) => table.toggleAllPageRowsSelected(v)} />
  ) : null;

  return (
    <div className="grid gap-3">
      {searchable || columnPicker || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? <SearchField value={filter} onChange={(e) => table.setGlobalFilter(e.target.value)} onClear={() => table.setGlobalFilter('')} placeholder={searchPlaceholder} className="min-w-0 flex-1 sm:max-w-[320px]" /> : null}
          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {columnPicker && isDesktop ? <ActionMenu label="Choose columns" entries={pickerEntries} trigger={<Button variant="secondary" size="sm" leadingIcon="layout-grid">Columns</Button>} /> : null}
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="search-01" title="No matches" description={`Nothing matches “${filter}”.`} action={<Button variant="secondary" onClick={() => table.setGlobalFilter('')}>Clear search</Button>} />
      ) : isDesktop ? (
        <div className={cn('relative rounded-lg bg-s1', maxHeight ? 'overflow-auto' : 'overflow-x-auto')} style={maxHeight ? { maxHeight } : undefined} tabIndex={maxHeight ? 0 : undefined} role={maxHeight ? 'region' : undefined} aria-label={maxHeight ? `${caption} (scrollable)` : undefined}>
          <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
            <caption className="sr-only">{caption}</caption>
            <thead className={maxHeight ? 'sticky top-0 z-10 bg-s1 shadow-[0_1px_0_var(--s3)]' : undefined}>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="text-ink3">
                  {renderExpanded ? <th scope="col" className="w-12 py-3 pl-2"><span className="sr-only">Details</span></th> : null}
                  {selectable ? <th scope="col" className="w-12 py-3 pl-4">{selectAll}</th> : null}
                  {hg.headers.map((h) => {
                    const sort = h.column.getIsSorted();
                    const numeric = h.column.columnDef.meta?.numeric;
                    return (
                      <th key={h.id} scope="col" aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : h.column.getCanSort() ? 'none' : undefined} className={cn('px-4 py-3 text-[12.5px] font-bold', numeric && 'text-right')}>
                        {h.isPlaceholder ? null : h.column.getCanSort() ? (
                          <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn('inline-flex items-center gap-1 rounded-sm hover:text-ink', numeric && 'flex-row-reverse')}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icon name={sort === 'asc' ? 'arrow-up-01' : sort === 'desc' ? 'arrow-down-01' : 'arrow-up-down'} size={14} className={sort ? 'text-accent' : 'opacity-60'} />
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                <tr data-selected={r.getIsSelected() || undefined} onClick={onRowClick ? () => onRowClick(r.original) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r.original); } } : undefined} className={cn('odd:bg-s2/50 data-[selected]:bg-accent-bg', onRowClick && 'cursor-pointer outline-none hover:bg-s2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent')}>
                  {renderExpanded ? <td className="py-2 pl-2" onClick={(e) => e.stopPropagation()}>{toggleButton(r.id, rowLabel ? rowLabel(r.original) : r.id)}</td> : null}
                  {selectable ? (
                    <td className="py-2 pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox label={<span className="sr-only">Select {rowLabel ? rowLabel(r.original) : `row ${r.id}`}</span>} checked={r.getIsSelected()} onCheckedChange={(v) => r.toggleSelected(v)} />
                    </td>
                  ) : null}
                  {r.getVisibleCells().map((c) => (
                    <td key={c.id} className={cn('px-4 py-3 align-middle', c.column.columnDef.meta?.numeric && 'text-right tabular-nums')}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                  ))}
                </tr>
                {renderExpanded && expanded[r.id] ? <tr id={`${tableId}-${r.id}`} className="bg-s2"><td colSpan={colCount} className="px-4 py-4">{renderExpanded(r.original)}</td></tr> : null}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sr-only"><tr><td colSpan={colCount}>{filteredTotal} rows</td></tr></tfoot>
          </table>
        </div>
      ) : (
        <ul aria-label={caption} className="grid gap-2">
          {selectable ? <li className="flex items-center rounded-lg bg-s1 px-4 py-2">{selectAll}<span className="ml-2 text-[13.5px] font-semibold text-ink3">Select all on this page</span></li> : null}
          {rows.map((r) => {
            const cells = r.getVisibleCells();
            const isActions = (c: (typeof cells)[number]) => !!c.column.columnDef.meta?.actions || c.column.id === 'a' || c.column.id === 'actions';
            const actionCell = cells.find(isActions);
            const data = cells.filter((c) => !isActions(c));
            const primary = data.find((c) => c.column.columnDef.meta?.primary) ?? data[0];
            const rest = data.filter((c) => c !== primary && !c.column.columnDef.meta?.hideOnMobile);
            return (
              <li key={r.id} data-selected={r.getIsSelected() || undefined} className="rounded-lg bg-s1 p-4 data-[selected]:bg-accent-bg">
                {mobileCard ? mobileCard(r.original) : (
                  <div className="grid gap-2.5">
                    <div className="flex items-start gap-3">
                      {selectable ? <Checkbox label={<span className="sr-only">Select {rowLabel ? rowLabel(r.original) : `row ${r.id}`}</span>} checked={r.getIsSelected()} onCheckedChange={(v) => r.toggleSelected(v)} /> : null}
                      <div className="min-w-0 flex-1 font-bold">{primary ? flexRender(primary.column.columnDef.cell, primary.getContext()) : null}</div>
                      {onRowClick ? <IconButton label={`Open ${rowLabel ? rowLabel(r.original) : `row ${r.id}`}`} icon="arrow-right-01" variant="ghost" size="sm" onClick={() => onRowClick(r.original)} /> : null}
                      {renderExpanded ? toggleButton(r.id, rowLabel ? rowLabel(r.original) : r.id) : null}
                      {actionCell ? <div className="-my-1 -mr-1 shrink-0">{flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}</div> : null}
                    </div>
                    <dl className="grid gap-1.5">
                      {rest.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-3">
                          <dt className="text-[13px] font-semibold text-ink3">{label(c.column.id, c.column.columnDef.header, c.column.columnDef.meta)}</dt>
                          <dd className="min-w-0 text-right font-semibold">{flexRender(c.column.columnDef.cell, c.getContext())}</dd>
                        </div>
                      ))}
                    </dl>
                    {renderExpanded && expanded[r.id] ? <div id={`${tableId}-${r.id}`} className="rounded-md bg-s2 p-3">{renderExpanded(r.original)}</div> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filteredTotal > 0 && !(hideSinglePagePager && table.getPageCount() <= 1) ? <Pagination page={pagination.pageIndex} pageCount={table.getPageCount()} onPageChange={(p) => table.setPageIndex(p)} total={filteredTotal} pageSize={pagination.pageSize} /> : null}

      {selectable && bulkActions ? (
        <BulkActionBar count={selected.length} onClear={() => table.resetRowSelection()}>{bulkActions(selected)}</BulkActionBar>
      ) : null}
    </div>
  );
}

export function SkeletonTable({ columns = 4, rows = 5, label = 'Loading' }: { columns?: number; rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="grid gap-2 rounded-lg bg-s1 p-4">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, c) => <Skeleton key={c} className="h-9" />)}
        </div>
      ))}
    </div>
  );
}
