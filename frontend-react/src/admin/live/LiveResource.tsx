import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, DataTable, EmptyState, Notice, Pagination, SearchField, Select, Skeleton, StatusBadge, type ColumnDef } from '@/design-system';
import { AdminPage } from '../components/Page';
import { adminRequest } from '../data/http';
import { useNav } from '../router';

type Row = Record<string, unknown>;
export interface LiveResourceConfig { title: string; description: string; endpoint: string; collection?: string; detail?: boolean; actions?: (payload: Row, reload: () => void) => ReactNode; rowActions?: (row: Row, reload: () => void) => ReactNode; detailPath?: (row: Row) => string;
  /** Server-side search (`q`), offset paging and filters. Requires an endpoint that returns { total, limit, offset }. */
  /** Replaces the generic detail body (keeps the page header and actions). */
  render?: (payload: Row, reload: () => void) => ReactNode;
  paged?: boolean;
  filters?: Array<{ param: string; label: string; options: Array<[value: string, label: string]> }>;
  /** Row actions for the tables that are nested groups of a detail payload (for example content articles). */
  groupRowActions?: Record<string, (row: Row, reload: () => void, payload: Row) => ReactNode>;
  groupDetailPath?: Record<string, (row: Row) => string> }
const BLOCKED_FIELD = /(secret|token|password|api.?key|metadata|raw)/i;
const STATUS_FIELD = /(^|_)(status|state)$/i;
const label = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const scalar = (value: unknown): string => value == null || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? `${value.length} records` : typeof value === 'object' ? 'See details' : String(value);

function statusTone(value: string): 'good' | 'warn' | 'bad' | 'info' | 'neutral' {
  const state = value.toUpperCase();
  if (['ACTIVE', 'RUNNING', 'PAID', 'COMPLETED', 'RESOLVED', 'DELIVERED', 'CONFIGURED', 'PUBLISHED', 'OPERATIONAL', 'SUCCEEDED'].includes(state)) return 'good';
  if (['FAILED', 'ERROR', 'OVERDUE', 'TERMINATED', 'REVOKED', 'CANCELLED', 'DEAD_LETTER', 'LOCKED', 'DEGRADED', 'OUTAGE'].includes(state)) return 'bad';
  if (['PENDING', 'WAITING', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'SUSPENDED', 'PAST_DUE', 'MAINTENANCE', 'NEEDS_MANUAL_REVIEW', 'NOT_CONFIGURED'].includes(state)) return 'warn';
  if (['PROCESSING', 'PROVISIONING', 'OPEN', 'DRAFT'].includes(state)) return 'info';
  return 'neutral';
}

function cell(key: string, value: unknown): ReactNode {
  const text = scalar(value);
  return STATUS_FIELD.test(key) && text !== '—' ? <StatusBadge tone={statusTone(text)}>{text.replaceAll('_', ' ')}</StatusBadge> : text;
}

function columnsFor(rows: Row[], actions?: (row: Row) => ReactNode): ColumnDef<Row, unknown>[] {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !BLOCKED_FIELD.test(key)).slice(0, 10);
  const columns: ColumnDef<Row, unknown>[] = keys.map((key, index) => ({ id: key, header: label(key), accessorFn: (row) => scalar(row[key]), cell: ({ row }) => cell(key, row.original[key]), meta: index === 0 ? { primary: true } : undefined }));
  if (actions) columns.push({ id: 'actions', header: 'Actions', cell: ({ row }) => actions(row.original), meta: { actions: true } });
  return columns;
}

export interface ListQuery { q: string; offset: number; filters: Record<string, string> }
/** Adds search, offset and filter parameters to an endpoint that may already carry its own query string. */
export function withQuery(endpoint: string, query?: ListQuery): string {
  if (!query) return endpoint;
  const url = new URL(endpoint, 'http://local');
  if (query.q.trim()) url.searchParams.set('q', query.q.trim()); else url.searchParams.delete('q');
  if (query.offset > 0) url.searchParams.set('offset', String(query.offset)); else url.searchParams.delete('offset');
  for (const [key, value] of Object.entries(query.filters)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
  return `${url.pathname}${url.search}`;
}

function useLiveResource(config: LiveResourceConfig, query?: ListQuery) {
  const [serial, setSerial] = useState(0);
  const [state, setState] = useState<{ payload?: Row; error?: string; loading: boolean }>({ loading: true });
  const endpoint = config.paged ? withQuery(config.endpoint, query) : config.endpoint;
  useEffect(() => {
    const controller = new AbortController();
    // Keep the previous page on screen while the next one loads, so searching and paging do not flash a skeleton.
    setState((previous) => ({ payload: previous.payload, loading: true }));
    adminRequest<unknown>(endpoint, { signal: controller.signal }).then((payload) => {
      if (!isRow(payload)) throw new Error('The Admin API response must be a JSON object.');
      setState({ payload, loading: false });
    }).catch((error) => { if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : 'Request failed.', loading: false }); });
    return () => controller.abort();
  }, [endpoint, serial]);
  const reload = useCallback(() => setSerial((value) => value + 1), []);
  return { ...state, reload };
}

function RecordTable({ title, rows, actions, onOpen }: { title: string; rows: Row[]; actions?: (row: Row) => ReactNode; onOpen?: (row: Row) => void }) {
  const columns = useMemo(() => columnsFor(rows, actions), [rows, actions]);
  return <Card><h2 className="mb-3 text-lg font-extrabold">{label(title)}</h2><DataTable data={rows} columns={columns} getRowId={(row) => String(row['id'] ?? row['key'] ?? JSON.stringify(row))} caption={label(title)} pageSize={10} hideSinglePagePager onRowClick={onOpen} empty={{ title: `No ${label(title).toLowerCase()}`, description: 'The authoritative API returned no records.' }} /></Card>;
}

export function LiveResource({ config }: { config: LiveResourceConfig }) {
  const navigate = useNav();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(q); setOffset(0); }, 300); return () => window.clearTimeout(timer); }, [q]);
  const resource = useLiveResource(config, { q: search, offset, filters });
  const collectionValue = resource.payload && config.collection ? resource.payload[config.collection] : undefined;
  const invalidCollection = resource.payload && config.collection && !Array.isArray(collectionValue) ? `The Admin API response is missing the expected “${config.collection}” collection.` : undefined;
  const rows = useMemo(() => Array.isArray(collectionValue) ? collectionValue.filter(isRow) : [], [collectionValue]);
  const columns = useMemo(() => columnsFor(rows, config.rowActions ? (row) => config.rowActions!(row, resource.reload) : undefined), [rows, config.rowActions, resource.reload]);

  if (resource.error || invalidCollection) return <AdminPage title={config.title} description={config.description}><EmptyState tone="error" icon="alert-circle" title={`Could not load ${config.title.toLowerCase()}`} description={resource.error ?? invalidCollection!} action={<Button variant="secondary" onClick={resource.reload}>Retry</Button>} /></AdminPage>;
  if (!resource.payload) return <div className="grid gap-4" aria-label={`Loading ${config.title}`}><Skeleton className="h-10 w-64" /><Skeleton className="h-72 w-full" /></div>;
  if (config.render) return <AdminPage title={config.title} description={config.description} actions={config.actions?.(resource.payload, resource.reload)}>{config.render(resource.payload, resource.reload)}</AdminPage>;
  if (config.detail || !config.collection) {
    const facts = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && (value == null || typeof value !== 'object'));
    const nested = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && isRow(value));
    const groups = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && Array.isArray(value));
    return <AdminPage title={config.title} description={config.description} actions={config.actions?.(resource.payload, resource.reload)}><div className="grid gap-4">
      {facts.length ? <Card><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{facts.map(([key, value]) => <div key={key}><dt className="text-[12px] font-bold uppercase tracking-wide text-ink3">{label(key)}</dt><dd className="mt-1 break-words font-semibold">{cell(key, value)}</dd></div>)}</dl></Card> : null}
      {nested.map(([group, value]) => <Card key={group}><h2 className="mb-3 text-lg font-extrabold">{label(group)}</h2><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(value as Row).filter(([key]) => !BLOCKED_FIELD.test(key)).map(([key, item]) => <div key={key}><dt className="text-[12px] font-bold uppercase tracking-wide text-ink3">{label(key)}</dt><dd className="mt-1 break-words font-semibold">{cell(key, item)}</dd></div>)}</dl></Card>)}
      {groups.map(([group, value]) => <RecordTable key={group} title={group} rows={(value as unknown[]).filter(isRow)} actions={config.groupRowActions?.[group] ? (row) => config.groupRowActions![group]!(row, resource.reload, resource.payload!) : undefined} onOpen={config.groupDetailPath?.[group] ? (row) => navigate(config.groupDetailPath![group]!(row)) : undefined} />)}
      {!facts.length && !nested.length && !groups.length ? <EmptyState icon="database" title="No details returned" description="The authoritative API returned an empty object." /> : null}
    </div></AdminPage>;
  }
  const total = Number(resource.payload['total'] ?? rows.length);
  const limit = Number(resource.payload['limit'] ?? 50) || 50;
  const from = total ? offset + 1 : 0;
  const to = Math.min(total, offset + rows.length);
  return <AdminPage title={config.title} description={config.description} actions={config.actions?.(resource.payload, resource.reload)}>
    <Notice tone="info" title="Live Fastify data">Loaded from the authoritative Admin API. Failed or malformed responses are never replaced with fixtures.</Notice>
    {config.paged ? <div className="mt-4 flex flex-wrap items-end gap-2">
      <SearchField value={q} onChange={(event) => setQ(event.target.value)} onClear={() => setQ('')} placeholder={`Search ${config.title.toLowerCase()} on the server`} className="min-w-0 flex-1 basis-60 sm:max-w-[360px]" />
      {(config.filters ?? []).map((filter) => <Select key={filter.param} label={filter.label} hideLabel className="w-auto min-w-40" value={filters[filter.param] || 'all'} onValueChange={(value) => { setFilters((current) => ({ ...current, [filter.param]: value && value !== 'all' ? value : '' })); setOffset(0); }} options={[{ value: 'all', label: `${filter.label}: all` }, ...filter.options.map(([value, text]) => ({ value, label: text }))]} />)}
      <span role="status" aria-live="polite" className="text-[13px] font-semibold text-ink3">{resource.loading ? 'Loading…' : total ? `${from}–${to} of ${total}` : 'No matching records'}</span>
    </div> : null}
    <div className="mt-4" aria-busy={resource.loading || undefined}><DataTable data={rows} columns={columns} getRowId={(row) => String(row['id'] ?? row['key'] ?? JSON.stringify(row))} caption={config.title} {...(config.paged ? {} : { searchable: true, searchPlaceholder: `Search ${config.title.toLowerCase()}` })} pageSize={config.paged ? limit : 15} hideSinglePagePager onRowClick={config.detailPath ? (row) => navigate(config.detailPath!(row)) : undefined} rowLabel={(row) => String(row['name'] ?? row['title'] ?? row['subject'] ?? row['id'] ?? 'record')} empty={{ title: `No ${config.title.toLowerCase()}`, description: search || Object.values(filters).some(Boolean) ? 'No record matches the current search or filters.' : 'The authoritative API returned no records.' }} /></div>
    {config.paged && total > limit ? <div className="mt-3"><Pagination page={Math.floor(offset / limit)} pageCount={Math.ceil(total / limit)} total={total} pageSize={limit} onPageChange={(page) => setOffset(page * limit)} /></div> : null}
  </AdminPage>;
}

export function LiveUnsupported({ title, path }: { title: string; path: string }) {
  return <AdminPage title={title} description="This React view has no authoritative backend contract yet."><EmptyState icon="alert-circle" title="Backend integration required" description={`${path} remains unavailable in live preview rather than displaying synthetic data or simulating a successful operation.`} /></AdminPage>;
}
