import { useMemo, useState, type ReactNode } from 'react';
import { ActionMenu, Button, Card, CardHeader, DataTable, DescriptionList, Dialog, DialogClose, EmptyState, LoadingButton, Notice, Select, StatusBadge, Textarea, type ColumnDef } from '@/design-system';
import { useOp, type OpResult } from './ops';

export interface RosterPlayer { id: string; name: string; /** What the game uses to target this player (name, Steam ID...). */ identifier: string; score?: number; connectedSeconds?: number; pingMs?: number }
export interface RosterInfo { name?: string; map?: string; version?: string; pingMs?: number; players: number; maxPlayers: number }
export interface ModerationRow { id: string; action: 'KICK' | 'BAN' | 'UNBAN'; targetName: string; targetIdentifier: string; reason?: string | null; durationMinutes?: number | null; createdAt: string }
export type RosterStatus = 'online' | 'offline' | 'unsupported' | 'error';

export interface PlayerRosterProps {
  status: RosterStatus;
  /** Plain-language reason for offline / unsupported / error states. */
  message?: string;
  info?: RosterInfo;
  /** How trustworthy the list is. SAMPLED and BEST_EFFORT lists can miss players. */
  reliability?: 'AUTHORITATIVE' | 'SAMPLED' | 'BEST_EFFORT';
  players: RosterPlayer[];
  /** What the game's admin channel can do (from the administration status). */
  capabilities: { kick: boolean; ban: boolean; unban: boolean };
  /** Whether the viewer holds player.moderate. */
  canModerate: boolean;
  loading?: boolean; error?: string; onRetry?: () => void;
  onKick: (p: RosterPlayer, reason?: string) => Promise<OpResult>;
  onBan: (p: RosterPlayer, o: { reason?: string; durationMinutes?: number }) => Promise<OpResult>;
  onUnban: (row: ModerationRow) => Promise<OpResult>;
  history: ModerationRow[]; historyLoading?: boolean; historyError?: string; onHistoryRetry?: () => void;
  /** Administration status / setup, rendered by the view (it owns those calls). */
  administration?: ReactNode;
}

const DURATIONS = [{ value: '0', label: 'Permanent' }, { value: '60', label: '1 hour' }, { value: '1440', label: '1 day' }, { value: '10080', label: '7 days' }, { value: '43200', label: '30 days' }];
const dur = (s?: number) => (s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const lenText = (m?: number | null) => (m ? DURATIONS.find((d) => d.value === String(m))?.label ?? `${m} min` : 'Permanent');

/** Live players with kick and ban, server facts, reliability warnings and the moderation history. Capability-driven: buttons that the game cannot do are not offered. */
export function PlayerRoster(p: PlayerRosterProps) {
  const op = useOp();
  const [dlg, setDlg] = useState<{ kind: 'kick' | 'ban'; player: RosterPlayer } | null>(null);
  const [reason, setReason] = useState(''); const [length, setLength] = useState('0');
  const moderate = p.canModerate;
  const columns = useMemo<ColumnDef<RosterPlayer, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Player', meta: { primary: true } },
    { accessorKey: 'score', header: 'Score', meta: { numeric: true }, cell: (c) => c.row.original.score ?? '—' },
    { accessorKey: 'connectedSeconds', header: 'Connected', cell: (c) => dur(c.row.original.connectedSeconds) },
    { accessorKey: 'pingMs', header: 'Ping', meta: { numeric: true }, cell: (c) => (c.row.original.pingMs != null ? `${c.row.original.pingMs} ms` : '—') },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: (c) => {
      const pl = c.row.original;
      const entries = [
        ...(p.capabilities.kick ? [{ id: 'kick', label: 'Kick', onSelect: () => { setReason(''); setDlg({ kind: 'kick', player: pl }); } }] : []),
        ...(p.capabilities.ban ? [{ id: 'ban', label: 'Ban', tone: 'danger' as const, onSelect: () => { setReason(''); setLength('0'); setDlg({ kind: 'ban', player: pl }); } }] : []),
      ];
      return moderate && entries.length ? <ActionMenu label={`Actions for ${pl.name}`} entries={entries} /> : <span className="text-ink4">—</span>;
    } },
  ], [moderate, p.capabilities.kick, p.capabilities.ban]);
  const histCols = useMemo<ColumnDef<ModerationRow, unknown>[]>(() => [
    { accessorKey: 'createdAt', header: 'When', meta: { primary: true }, cell: (c) => when(c.row.original.createdAt) },
    { accessorKey: 'action', header: 'Action', cell: (c) => <StatusBadge tone={c.row.original.action === 'BAN' ? 'bad' : c.row.original.action === 'UNBAN' ? 'good' : 'warn'} dot={false}>{c.row.original.action === 'BAN' ? 'Ban' : c.row.original.action === 'UNBAN' ? 'Unban' : 'Kick'}</StatusBadge> },
    { accessorKey: 'targetName', header: 'Player' },
    { id: 'detail', header: 'Details', cell: (c) => { const r = c.row.original; return [r.action === 'BAN' ? lenText(r.durationMinutes) : '', r.reason ?? ''].filter(Boolean).join(' · ') || '—'; } },
    { id: 'a', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: (c) => {
      const r = c.row.original;
      return moderate && p.capabilities.unban && r.action === 'BAN'
        ? <Button size="sm" variant="secondary" disabled={op.busy !== null} onClick={() => void op.run('unban', () => p.onUnban(r), `${r.targetName} was unbanned.`)}>Unban<span className="sr-only"> {r.targetName}</span></Button> : null;
    } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [moderate, p.capabilities.unban, op.busy]);

  const confirm = async () => {
    if (!dlg) return;
    const { kind, player } = dlg; const r = reason.trim() || undefined;
    const ok = kind === 'kick'
      ? await op.run('kick', () => p.onKick(player, r), `${player.name} was kicked.`)
      : await op.run('ban', () => p.onBan(player, { reason: r, durationMinutes: Number(length) || undefined }), `${player.name} was banned.`);
    if (ok) setDlg(null);
  };

  const blocked = p.status === 'unsupported' || p.status === 'offline' || p.status === 'error';
  return (
    <div className="grid gap-4">
      {p.administration}
      {op.feedback}
      {p.status === 'unsupported' ? <Card pad="lg"><EmptyState icon="user-group" title="Player tools are not available for this game" description={p.message ?? 'This game has no query or admin channel Fortless can use. The console still works.'} /></Card> : null}
      {p.status === 'offline' ? <Card pad="lg"><EmptyState icon="power" title="Server is offline" description={p.message ?? 'Start the server to see who is playing.'} /></Card> : null}
      {p.status === 'error' ? <Notice tone="bad" action={p.onRetry ? <Button size="sm" variant="secondary" onClick={p.onRetry}>Retry</Button> : undefined}>{p.message ?? 'The server could not be queried.'}</Notice> : null}
      {!blocked ? (
        <Card pad="lg" className="grid gap-4">
          <CardHeader title="Players online" description={p.info ? `${p.info.players} of ${p.info.maxPlayers}` : `${p.players.length} listed`} />
          {p.info ? <DescriptionList columns={2} items={[
            ...(p.info.name ? [{ label: 'Server', value: p.info.name }] : []), ...(p.info.map ? [{ label: 'Map', value: p.info.map }] : []),
            ...(p.info.version ? [{ label: 'Version', value: p.info.version }] : []), ...(p.info.pingMs != null ? [{ label: 'Query latency', value: `${p.info.pingMs} ms` }] : []),
          ]} /> : null}
          {p.reliability && p.reliability !== 'AUTHORITATIVE' ? <Notice tone="warn">{p.reliability === 'SAMPLED' ? 'This game only reports a sample of players, so the list can be incomplete.' : 'This list is a best effort and can be incomplete or out of date.'}</Notice> : null}
          {!moderate ? <Notice tone="info">Your access level can view players but not moderate them.</Notice> : !p.capabilities.kick && !p.capabilities.ban ? <Notice tone="info">The admin channel for this game cannot kick or ban yet. Finish the setup above to enable moderation.</Notice> : null}
          <DataTable data={p.players} columns={columns} getRowId={(x) => x.id} caption="Players online" loading={p.loading} error={p.error} onRetry={p.onRetry} searchable searchPlaceholder="Search players" pageSize={10} empty={{ title: 'Nobody is online', description: 'Players appear here while they are connected.' }} />
        </Card>
      ) : null}
      <Card pad="lg" className="grid gap-3">
        <CardHeader title="Moderation history" description="Kicks, bans and unbans made from Fortless." />
        <DataTable data={p.history} columns={histCols} getRowId={(x) => x.id} caption="Moderation history" loading={p.historyLoading} error={p.historyError} onRetry={p.onHistoryRetry} pageSize={8} empty={{ title: 'No moderation yet', description: 'Actions you take here are recorded.' }} />
      </Card>
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} title={dlg ? `${dlg.kind === 'kick' ? 'Kick' : 'Ban'} ${dlg.player.name}?` : ''} description={dlg?.kind === 'ban' ? 'They will not be able to rejoin until unbanned or the ban ends.' : 'They are disconnected now and can rejoin.'}
        footer={<><DialogClose render={<Button variant="secondary">Cancel</Button>} /><LoadingButton variant={dlg?.kind === 'ban' ? 'danger' : 'primary'} onClick={confirm}>{dlg?.kind === 'ban' ? 'Ban player' : 'Kick player'}</LoadingButton></>}>
        <div className="grid gap-4">
          {dlg?.kind === 'ban' ? <Select label="Ban length" options={DURATIONS} value={length} onValueChange={(v) => v && setLength(v)} /> : null}
          <Textarea label="Reason" description="Optional. Shown to the player where the game supports it." value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
