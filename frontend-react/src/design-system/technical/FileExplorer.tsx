import { useMemo } from 'react';
import { Icon } from '../icons/Icon';
import { Breadcrumbs } from '../navigation/Breadcrumbs';
import { ActionMenu } from '../actions/ActionMenu';
import { DataTable, type ColumnDef } from '../data/DataTable';
import type { MenuEntry } from '../actions/menu-types';

export interface FileEntry { name: string; kind: 'file' | 'folder'; size?: number; modified?: string }

const fmt = (b?: number) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

export interface FileExplorerProps {
  /** Current directory as segments, e.g. ["plugins", "config"]. */
  path: string[];
  entries: FileEntry[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onNavigate: (path: string[]) => void;
  onOpenFile: (entry: FileEntry) => void;
  /** Row actions (rename, delete, download…). Wire them to your API. */
  actionsFor?: (entry: FileEntry) => MenuEntry[];
  toolbar?: React.ReactNode;
}

/** Directory listing: breadcrumb path, folders first, open/navigate, per-row actions. Cards on phones through DataTable. */
export function FileExplorer({ path, entries, loading, error, onRetry, onNavigate, onOpenFile, actionsFor, toolbar }: FileExplorerProps) {
  const open = (e: FileEntry) => (e.kind === 'folder' ? onNavigate([...path, e.name]) : onOpenFile(e));
  const sorted = useMemo(() => [...entries].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)), [entries]);
  const columns = useMemo<ColumnDef<FileEntry, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Name', meta: { primary: true }, cell: (c) => { const e = c.row.original; return <button type="button" onClick={() => open(e)} className="flex items-center gap-2.5 rounded-sm font-bold hover:text-accent"><Icon name={e.kind === 'folder' ? 'folder-01' : 'file-01'} size={18} className="text-ink3" />{e.name}</button>; } },
    { accessorKey: 'size', header: 'Size', meta: { numeric: true }, cell: (c) => fmt(c.row.original.size) },
    { accessorKey: 'modified', header: 'Modified', cell: (c) => c.row.original.modified ?? '—' },
    ...(actionsFor ? [{ id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: (c: { row: { original: FileEntry } }) => <ActionMenu label={`Actions for ${c.row.original.name}`} entries={actionsFor(c.row.original)} /> } as ColumnDef<FileEntry, unknown>] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [path, actionsFor]);

  const crumbs = [{ id: '-1', label: 'Files', current: path.length === 0 }, ...path.map((p, i) => ({ id: String(i), label: p, current: i === path.length - 1 }))];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs crumbs={crumbs} onNavigate={(id) => onNavigate(path.slice(0, Number(id) + 1))} />
        {toolbar}
      </div>
      <DataTable data={sorted} columns={columns} getRowId={(e) => e.name} caption={`Files in /${path.join('/')}`} loading={loading} error={error} onRetry={onRetry} pageSize={50} empty={{ title: 'This folder is empty', description: 'Upload files or create a folder.' }} />
    </div>
  );
}
