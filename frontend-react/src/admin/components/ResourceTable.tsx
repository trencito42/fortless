import { useMemo, useState, type ReactNode } from 'react';
import {
  ActionMenu, Button, DataTable, Dialog, FilterBuilder, IconButton, SearchField, Select, Tabs, TextField, isActiveRule, applyFilters,
  type ColumnDef, type FilterField, type FilterRule, type MenuEntry,
} from '@/design-system';
import { useSession } from '../session';
import { useToast } from '../toast';
import { ADMIN_NOW, DAY } from '../lib/format';

export interface FilterSpec<T> { id: string; label: string; options: Array<{ value: string; label: string }>; test: (row: T, value: string) => boolean }
export interface SegmentSpec<T> { value: string; label: string; test: (row: T) => boolean }
interface SavedView { id: string; name: string; segment: string; filters: Record<string, string>; search: string; rules: FilterRule[]; range: string }

export interface ResourceTableProps<T> {
  tableId: string;
  caption: string;
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (r: T) => string;
  rowLabel?: (r: T) => string;
  segments?: SegmentSpec<T>[];
  defaultSegment?: string;
  filters?: FilterSpec<T>[];
  /** Text that the search box matches (lower-cased internally). */
  searchText?: (r: T) => string;
  searchPlaceholder?: string;
  advanced?: { fields: FilterField[]; getValue: (r: T, field: string) => unknown };
  /** Adds a date range filter (any / 24h / 7d / 30d / 90d) over this timestamp. */
  dateField?: { label: string; get: (r: T) => string };
  bulkActions?: (selected: T[]) => ReactNode;
  onRowClick?: (r: T) => void;
  rowActions?: (r: T) => MenuEntry[];
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  pageSize?: number;
  toolbar?: ReactNode;
  columnPicker?: boolean;
  mobileCard?: (r: T) => ReactNode;
  maxHeight?: string;
}

const RANGES = [{ value: 'any', label: 'Any time' }, { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }];
const rangeMs: Record<string, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };
const storeKey = (id: string) => `fl-admin-views:${id}`;
const loadViews = (id: string): SavedView[] => { try { return JSON.parse(localStorage.getItem(storeKey(id)) ?? '[]') as SavedView[]; } catch { return []; } };
const saveViews = (id: string, v: SavedView[]) => { try { localStorage.setItem(storeKey(id), JSON.stringify(v)); } catch { /* storage unavailable: views last for this tab only */ } };

/**
 * The admin list pattern: segment tabs with live counts, select filters, date range, advanced rule builder, saved views, search, then the
 * shared DataTable (sorting, paging, column picker, selection, mobile cards). Filtering is client-side over demo data. The global
 * "Preview state" switch in the header forces loading / error / empty so those states can be reviewed on every list.
 */
export function ResourceTable<T>(p: ResourceTableProps<T>) {
  const { previewState, setPreviewState } = useSession();
  const toast = useToast();
  const [segment, setSegment] = useState(p.defaultSegment ?? p.segments?.[0]?.value ?? 'all');
  const [fv, setFv] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [range, setRange] = useState('any');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(p.tableId));
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');

  const seg = p.segments?.find((s) => s.value === segment);
  const counts = useMemo(() => Object.fromEntries((p.segments ?? []).map((s) => [s.value, p.rows.filter(s.test).length])), [p.segments, p.rows]);

  const filtered = useMemo(() => {
    let r = p.rows;
    if (seg) r = r.filter(seg.test);
    for (const f of p.filters ?? []) { const v = fv[f.id]; if (v && v !== 'all') r = r.filter((x) => f.test(x, v)); }
    if (p.dateField && range !== 'any') { const min = ADMIN_NOW - (rangeMs[range] ?? 0); r = r.filter((x) => Date.parse(p.dateField!.get(x)) >= min); }
    if (p.advanced) r = applyFilters(r, rules, p.advanced.fields, p.advanced.getValue);
    const q = search.trim().toLowerCase();
    if (q && p.searchText) r = r.filter((x) => p.searchText!(x).toLowerCase().includes(q));
    return r;
  }, [p.rows, p.filters, p.dateField, p.advanced, p.searchText, seg, fv, range, rules, search]);

  const activeCount = Object.values(fv).filter((v) => v && v !== 'all').length + (range !== 'any' ? 1 : 0) + rules.filter(isActiveRule).length + (search.trim() ? 1 : 0);
  const clearAll = () => { setFv({}); setSearch(''); setRules([]); setRange('any'); setSegment(p.defaultSegment ?? p.segments?.[0]?.value ?? 'all'); };

  const columns = useMemo(() => {
    if (!p.rowActions) return p.columns;
    const col: ColumnDef<T, unknown> = { id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: ({ row }) => <ActionMenu label={`Actions for ${p.rowLabel ? p.rowLabel(row.original) : p.getRowId(row.original)}`} entries={p.rowActions!(row.original)} /> };
    return [...p.columns, col];
  }, [p.columns, p.rowActions, p.rowLabel, p.getRowId]);

  const applyView = (v: SavedView) => { setSegment(v.segment); setFv(v.filters); setSearch(v.search); setRules(v.rules); setRange(v.range); };
  const persist = (next: SavedView[]) => { setViews(next); saveViews(p.tableId, next); };
  const saveCurrent = () => {
    const name = viewName.trim(); if (!name) return;
    persist([...views, { id: `v${Date.now().toString(36)}`, name, segment, filters: fv, search, rules, range }]);
    setSaving(false); setViewName(''); toast({ tone: 'good', title: `Saved view “${name}”`, description: 'Stored in this browser only.' });
  };

  const viewEntries: MenuEntry[] = [
    { id: 'default', label: 'Default view', onSelect: clearAll },
    ...views.map((v): MenuEntry => ({ id: v.id, label: v.name, onSelect: () => applyView(v) })),
    { id: 'sep', kind: 'separator' },
    { id: 'save', label: 'Save current view…', icon: 'add-01', onSelect: () => setSaving(true) },
    ...(views.length ? [{ id: 'rm', label: 'Delete all saved views', tone: 'danger' as const, onSelect: () => persist([]) }] : []),
  ];

  const data = previewState === 'empty' ? [] : filtered;
  const noMatches = p.rows.length > 0 && filtered.length === 0 && previewState === 'normal';

  return (
    <div className="grid gap-3">
      {p.segments ? (
        <Tabs label={`${p.caption} segments`} value={segment} onValueChange={setSegment} items={p.segments.map((s) => ({ value: s.value, label: s.label, badge: counts[s.value] }))} />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        {p.searchText ? <SearchField value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder={p.searchPlaceholder ?? 'Search'} className="min-w-0 flex-1 basis-56 sm:max-w-[340px]" /> : null}
        {(p.filters ?? []).map((f) => (
          <Select key={f.id} label={f.label} hideLabel className="w-auto min-w-36" value={fv[f.id] ?? 'all'} onValueChange={(v) => setFv((s) => ({ ...s, [f.id]: v ?? 'all' }))} options={[{ value: 'all', label: `${f.label}: all` }, ...f.options]} />
        ))}
        {p.dateField ? <Select label={p.dateField.label} hideLabel className="w-auto min-w-36" value={range} onValueChange={(v) => setRange(v ?? 'any')} options={RANGES.map((r) => ({ value: r.value, label: r.value === 'any' ? `${p.dateField!.label}: any` : r.label }))} /> : null}
        {p.advanced ? <Button variant={showAdvanced || rules.length ? 'subtle' : 'secondary'} size="sm" leadingIcon="filter-horizontal" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((s) => !s)}>Advanced{rules.length ? ` (${rules.filter(isActiveRule).length})` : ''}</Button> : null}
        <ActionMenu label="Saved views" entries={viewEntries} trigger={<Button variant="secondary" size="sm" leadingIcon="layout-grid">Views</Button>} />
        {activeCount > 0 ? <Button variant="ghost" size="sm" onClick={clearAll}>Clear filters ({activeCount})</Button> : null}
        <div className="ml-auto flex items-center gap-2">{p.toolbar}</div>
      </div>
      {showAdvanced && p.advanced ? <FilterBuilder fields={p.advanced.fields} rules={rules} onRulesChange={setRules} /> : null}
      <p role="status" className="text-[13px] font-semibold text-ink3">{previewState === 'normal' ? `${filtered.length} of ${p.rows.length} ${filtered.length === 1 ? 'row' : 'rows'}${activeCount ? ' match the current filters' : ''}` : `Preview state: ${previewState}`}</p>
      <DataTable<T>
        data={data}
        columns={columns}
        getRowId={p.getRowId}
        caption={p.caption}
        rowLabel={p.rowLabel}
        loading={previewState === 'loading'}
        {...(previewState === 'error' ? { error: 'The preview error state was forced from the header. No request failed.' } : {})}
        onRetry={() => setPreviewState('normal')}
        selectable={!!p.bulkActions}
        bulkActions={p.bulkActions}
        pageSize={p.pageSize ?? 15}
        columnPicker={p.columnPicker ?? true}
        onRowClick={p.onRowClick}
        mobileCard={p.mobileCard}
        maxHeight={p.maxHeight}
        empty={noMatches ? { title: 'Nothing matches these filters', description: 'Loosen a filter or clear them all.', action: <Button variant="secondary" onClick={clearAll}>Clear filters</Button> } : (p.empty ?? { title: 'Nothing here yet' })}
      />
      <Dialog open={saving} onOpenChange={setSaving} title="Save current view" description="Saves the segment, filters, date range and search. Stored in this browser only." footer={<><Button variant="ghost" onClick={() => setSaving(false)}>Cancel</Button><Button variant="primary" disabled={!viewName.trim()} onClick={saveCurrent}>Save view</Button></>}>
        <div className="grid gap-3">
          <TextField label="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={40} />
          {views.length ? <ul className="grid gap-1" aria-label="Existing saved views">{views.map((v) => <li key={v.id} className="flex items-center justify-between rounded-md bg-s2 px-3 py-1.5"><span className="font-semibold">{v.name}</span><IconButton label={`Delete view ${v.name}`} icon="delete-02" size="sm" variant="danger" onClick={() => persist(views.filter((x) => x.id !== v.id))} /></li>)}</ul> : null}
        </div>
      </Dialog>
    </div>
  );
}
