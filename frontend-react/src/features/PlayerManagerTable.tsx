import { useMemo, useState } from 'react';
import { ActionMenu, Avatar, DataTable, StatusBadge, type ColumnDef } from '@/design-system';

export interface Player { id: string; name: string; online: boolean; op: boolean; banned: boolean; lastSeen?: string }

export interface PlayerManagerTableProps {
  players: Player[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** Runs a server command or panel call. The UI waits for it before showing the next state. */
  onAction: (action: 'op' | 'deop' | 'kick' | 'ban' | 'pardon', player: Player) => void | Promise<void>;
  /** Players cannot be listed while the server is offline: pass the reason to explain the empty state. */
  unavailableReason?: string;
}

/** Whitelist/op/ban management. Actions depend on player state; ban and kick are tone "danger". */
export function PlayerManagerTable({ players, loading, error, onRetry, onAction, unavailableReason }: PlayerManagerTableProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const confirmText = { op: 'is now an operator', deop: 'is no longer an operator', kick: 'was kicked', ban: 'was banned', pardon: 'was unbanned' } as const;
  /** One action at a time. The outcome is announced: success as status, failure as alert with the player's name. */
  const run = async (action: Parameters<PlayerManagerTableProps['onAction']>[0], p: Player) => {
    if (pending) return;
    setPending(p.id); setFailure(null); setDone(null);
    try { await onAction(action, p); setDone(`${p.name} ${confirmText[action]}.`); }
    catch (e) { setFailure(`Could not update ${p.name}: ${e instanceof Error ? e.message : 'the request failed.'}`); }
    finally { setPending(null); }
  };
  const columns = useMemo<ColumnDef<Player, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Player', meta: { primary: true }, cell: (c) => <span className="inline-flex items-center gap-2.5"><Avatar initials={c.row.original.name.slice(0, 2).toUpperCase()} size="sm" tone="ink" /><b>{c.row.original.name}</b></span> },
    { id: 'status', header: 'Status', accessorFn: (p) => (p.banned ? 'banned' : p.online ? 'online' : 'offline'), cell: (c) => { const p = c.row.original; return <span className="inline-flex gap-1.5">{p.banned ? <StatusBadge tone="bad">Banned</StatusBadge> : <StatusBadge tone={p.online ? 'good' : 'neutral'}>{p.online ? 'Online' : 'Offline'}</StatusBadge>}{p.op ? <StatusBadge tone="violet" dot={false}>Operator</StatusBadge> : null}</span>; } },
    { accessorKey: 'lastSeen', header: 'Last seen', cell: (c) => c.row.original.lastSeen ?? '—' },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, cell: (c) => { const p = c.row.original; return (
      <ActionMenu label={pending === p.id ? `Updating ${p.name}` : `Actions for ${p.name}`} entries={pending ? [{ id: 'busy', label: 'Working…', disabled: true }] : [
        p.op ? { id: 'deop', label: 'Remove operator', onSelect: () => void run('deop', p) } : { id: 'op', label: 'Make operator', onSelect: () => void run('op', p) },
        { id: 'kick', label: 'Kick', disabled: !p.online, disabledReason: 'Player is not online', onSelect: () => void run('kick', p) },
        { kind: 'separator', id: 's' },
        p.banned ? { id: 'pardon', label: 'Unban', onSelect: () => void run('pardon', p) } : { id: 'ban', label: 'Ban', tone: 'danger', onSelect: () => void run('ban', p) },
      ]} />
    ); } },
    // run only reads `pending` and `onAction`; listing it would rebuild the columns on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [pending, onAction]);
  return (
    <div className="grid gap-3">
      {failure ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">{failure}</p> : null}
      {done ? <p role="status" className="rounded-md bg-good-bg px-4 py-2.5 font-semibold text-good">{done}</p> : null}
      <DataTable data={players} columns={columns} getRowId={(p) => p.id} caption="Players" loading={loading} error={error} onRetry={onRetry} searchable searchPlaceholder="Search players" pageSize={10} empty={{ title: unavailableReason ? 'Players are unavailable' : 'No players yet', description: unavailableReason ?? 'Players appear here after they join.' }} />
    </div>
  );
}
