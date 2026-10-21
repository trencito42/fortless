import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, DataTable, EmptyState, Notice, Skeleton, StatusBadge, type ColumnDef } from '@/design-system';
import { AdminPage } from '../components/Page';
import { adminRequest } from '../data/http';
import { useNav } from '../router';

type Row = Record<string, unknown>;
export interface LiveResourceConfig { title: string; description: string; endpoint: string; collection?: string; detail?: boolean; actions?: (payload: Row, reload: () => void) => ReactNode; rowActions?: (row: Row, reload: () => void) => ReactNode; detailPath?: (row: Row) => string }
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

function useLiveResource(config: LiveResourceConfig) {
  const [serial, setSerial] = useState(0);
  const [state, setState] = useState<{ payload?: Row; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    adminRequest<unknown>(config.endpoint, { signal: controller.signal }).then((payload) => {
      if (!isRow(payload)) throw new Error('The Admin API response must be a JSON object.');
      setState({ payload });
    }).catch((error) => { if (!controller.signal.aborted) setState({ error: error instanceof Error ? error.message : 'Request failed.' }); });
    return () => controller.abort();
  }, [config.endpoint, serial]);
  const reload = useCallback(() => setSerial((value) => value + 1), []);
  return { ...state, reload };
}

function RecordTable({ title, rows }: { title: string; rows: Row[] }) {
  const columns = useMemo(() => columnsFor(rows), [rows]);
  return <Card><h2 className="mb-3 text-lg font-extrabold">{label(title)}</h2><DataTable data={rows} columns={columns} getRowId={(row) => String(row['id'] ?? row['key'] ?? JSON.stringify(row))} caption={label(title)} pageSize={10} empty={{ title: `No ${label(title).toLowerCase()}`, description: 'The authoritative API returned no records.' }} /></Card>;
}

export function LiveResource({ config }: { config: LiveResourceConfig }) {
  const navigate = useNav();
  const resource = useLiveResource(config);
  const collectionValue = resource.payload && config.collection ? resource.payload[config.collection] : undefined;
  const invalidCollection = resource.payload && config.collection && !Array.isArray(collectionValue) ? `The Admin API response is missing the expected “${config.collection}” collection.` : undefined;
  const rows = useMemo(() => Array.isArray(collectionValue) ? collectionValue.filter(isRow) : [], [collectionValue]);
  const columns = useMemo(() => columnsFor(rows, config.rowActions ? (row) => config.rowActions!(row, resource.reload) : undefined), [rows, config.rowActions, resource.reload]);

  if (resource.error || invalidCollection) return <AdminPage title={config.title} description={config.description}><EmptyState tone="error" icon="alert-circle" title={`Could not load ${config.title.toLowerCase()}`} description={resource.error ?? invalidCollection!} action={<Button variant="secondary" onClick={resource.reload}>Retry</Button>} /></AdminPage>;
  if (!resource.payload) return <div className="grid gap-4" aria-label={`Loading ${config.title}`}><Skeleton className="h-10 w-64" /><Skeleton className="h-72 w-full" /></div>;
  if (config.detail || !config.collection) {
    const facts = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && (value == null || typeof value !== 'object'));
    const nested = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && isRow(value));
    const groups = Object.entries(resource.payload).filter(([key, value]) => !BLOCKED_FIELD.test(key) && Array.isArray(value));
    return <AdminPage title={config.title} description={config.description} actions={config.actions?.(resource.payload, resource.reload)}><div className="grid gap-4">
      {facts.length ? <Card><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{facts.map(([key, value]) => <div key={key}><dt className="text-[12px] font-bold uppercase tracking-wide text-ink3">{label(key)}</dt><dd className="mt-1 break-words font-semibold">{cell(key, value)}</dd></div>)}</dl></Card> : null}
      {nested.map(([group, value]) => <Card key={group}><h2 className="mb-3 text-lg font-extrabold">{label(group)}</h2><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(value as Row).filter(([key]) => !BLOCKED_FIELD.test(key)).map(([key, item]) => <div key={key}><dt className="text-[12px] font-bold uppercase tracking-wide text-ink3">{label(key)}</dt><dd className="mt-1 break-words font-semibold">{cell(key, item)}</dd></div>)}</dl></Card>)}
      {groups.map(([group, value]) => <RecordTable key={group} title={group} rows={(value as unknown[]).filter(isRow)} />)}
      {!facts.length && !nested.length && !groups.length ? <EmptyState icon="database" title="No details returned" description="The authoritative API returned an empty object." /> : null}
    </div></AdminPage>;
  }
  return <AdminPage title={config.title} description={config.description}><Notice tone="info" title="Live Fastify data">Loaded from the authoritative Admin API. Failed or malformed responses are never replaced with fixtures.</Notice><div className="mt-4"><DataTable data={rows} columns={columns} getRowId={(row) => String(row['id'] ?? row['key'] ?? JSON.stringify(row))} caption={config.title} searchable searchPlaceholder={`Search ${config.title.toLowerCase()}`} pageSize={15} onRowClick={config.detailPath ? (row) => navigate(config.detailPath!(row)) : undefined} rowLabel={(row) => String(row['name'] ?? row['title'] ?? row['subject'] ?? row['id'] ?? 'record')} empty={{ title: `No ${config.title.toLowerCase()}`, description: 'The authoritative API returned no records.' }} /></div></AdminPage>;
}

export function LiveUnsupported({ title, path }: { title: string; path: string }) {
  return <AdminPage title={title} description="This React view has no authoritative backend contract yet."><EmptyState icon="alert-circle" title="Backend integration required" description={`${path} remains unavailable in live preview rather than displaying synthetic data or simulating a successful operation.`} /></AdminPage>;
}
