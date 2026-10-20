import { useEffect, useState } from 'react';
import { Button, ButtonGroup, Card, CardHeader, CopyField, EmptyState, MetricCard, NumberField, Notice, Pagination, SegmentedControl, Select, StatusBadge, Switch, TextField } from '@/design-system';
import { useOp } from '@/features';
import type { FastDlCompression, FastDlManifestItemDto, FastDlStatusDto } from '../contracts';
import { useService } from '../context';
import { useResource } from '../../shared/useResource';
import { ResourceView } from '../../shared/ResourceView';

const size = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`);
const ago = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Never');
const GB = 1073741824;
const STATE: Record<FastDlManifestItemDto['status'], { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: string }> = { SYNCED: { tone: 'good', label: 'Synced' }, PENDING: { tone: 'warn', label: 'Pending' }, FAILED: { tone: 'bad', label: 'Failed' }, DELETED: { tone: 'neutral', label: 'Removed' } };

function Manifest() {
  const { id, ports } = useService();
  const [page, setPage] = useState(0); const [search, setSearch] = useState(''); const [q, setQ] = useState(''); const [status, setStatus] = useState<string | null>('');
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);
  const res = useResource((s) => ports.fastdl.manifest(id, { page: page + 1, limit: 8, search: q || undefined, status: status || undefined }, s), [id, ports, page, q, status]);
  return (
    <Card pad="lg" className="grid gap-4">
      <CardHeader title="Synced files" description="Everything players can download over HTTP." />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <TextField label="Search files" hideLabel placeholder="Search by path" leadingIcon="search-01" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Status" hideLabel value={status} onValueChange={(v) => { setStatus(v ?? ''); setPage(0); }} options={[{ value: '', label: 'All statuses' }, { value: 'SYNCED', label: 'Synced' }, { value: 'PENDING', label: 'Pending' }, { value: 'FAILED', label: 'Failed' }]} />
      </div>
      <ResourceView res={res} reload={res.reload} label="Loading files">
        {(m) => m.items.length === 0 ? <EmptyState icon="cloud-upload" title={q || status ? 'No files match' : 'Nothing synced yet'} description={q || status ? 'Change the search or status filter.' : 'Run a sync to publish your maps, models and sounds.'} /> : (
          <>
            <ul aria-label="Synced files" className="grid divide-y divide-ink/10">
              {m.items.map((f) => (
                <li key={f.id} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_6rem] sm:items-center sm:gap-4">
                  <span className="min-w-0"><span className="block truncate font-mono text-[13.5px] font-semibold">{f.filePath}</span>{f.lastError ? <span className="block text-[13px] text-bad">{f.lastError}</span> : null}</span>
                  <span className="text-[13px] text-ink3 sm:text-right">{size(f.fileSize)}</span>
                  <span className="text-[13px] text-ink3 sm:text-right">{f.isCompressed ? `${size(f.compressedSize)} bz2` : 'raw'}</span>
                  <span className="sm:justify-self-end"><StatusBadge tone={STATE[f.status].tone}>{STATE[f.status].label}</StatusBadge></span>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={m.totalPages} onPageChange={setPage} total={m.total} pageSize={m.limit} />
          </>
        )}
      </ResourceView>
    </Card>
  );
}

function Loaded({ s, reload }: { s: FastDlStatusDto; reload: () => void }) {
  const { id, ports, can } = useService();
  const op = useOp();
  const canWrite = can('file.update');
  const cfg = s.config!; const stats = s.stats!; const job = s.activeJob;
  const [auto, setAuto] = useState(cfg.autoSync); const [mode, setMode] = useState<FastDlCompression>(cfg.compressionMode); const [quotaGb, setQuotaGb] = useState<number | null>(Math.round((cfg.quotaBytes / GB) * 10) / 10);
  const dirty = auto !== cfg.autoSync || mode !== cfg.compressionMode || Math.round((quotaGb ?? 0) * GB) !== cfg.quotaBytes;
  // While a job runs the page polls; the server skips the expensive live read in that case.
  useEffect(() => { if (!job) return; const t = setInterval(reload, 1500); return () => clearInterval(t); }, [job, reload]);
  const none = canWrite ? undefined : 'Your access level can view FastDL but not change it.';
  const failed = stats.totalFiles >= 0 ? 0 : 0;
  void failed;
  const url = s.publicDownloadUrl ?? '';
  const cvar = s.profile ? s.profile.cvarTemplate.replace('{url}', url) : '';

  return (
    <div className="grid gap-4">
      {op.feedback}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Files published" value={stats.totalFiles} icon="files-01" hint={`${size(stats.totalOriginalBytes)} original`} />
        <MetricCard label="Storage used" value={size(stats.totalStoredBytes)} icon="cloud" hint={`${stats.percentUsed}% of ${size(stats.quotaBytes)}`} />
        <MetricCard label="Last sync" value={cfg.lastSyncAt ? ago(cfg.lastSyncAt).slice(0, 10) : 'Never'} icon="clock-01" hint={cfg.lastSyncAt ? ago(cfg.lastSyncAt) : 'Run your first sync'} />
        <MetricCard label="Server config" value={stats.cvarConfigured ? 'Connected' : 'Not set'} icon="plug-01" hint={stats.cvarConfigured ? 'sv_downloadurl points here' : 'Players still use slow downloads'} />
      </div>

      <Card pad="lg" className="grid gap-4">
        <CardHeader title="Sync" description="Copies maps, models and sounds from your server to the download host." actions={job ? <StatusBadge tone="warn" live>Syncing</StatusBadge> : undefined} />
        {job ? (
          <div className="grid gap-2" role="status" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-s3" role="progressbar" aria-label="Sync progress" aria-valuemin={0} aria-valuemax={job.totalFiles} aria-valuenow={job.processedFiles}><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${job.totalFiles ? (job.processedFiles / job.totalFiles) * 100 : 0}%` }} /></div>
            <p className="text-[13.5px] text-ink2">{job.processedFiles} of {job.totalFiles} files{job.currentFile ? <> · <span className="font-mono">{job.currentFile}</span></> : null}</p>
          </div>
        ) : null}
        <ButtonGroup aria-label="Sync actions">
          <Button variant="primary" leadingIcon="refresh" disabled={!canWrite || !!job} onClick={() => void op.run('sync', async () => { await ports.fastdl.sync(id); reload(); }, 'Sync started.')}>Sync now</Button>
          <Button variant="secondary" leadingIcon="cancel-01" disabled={!canWrite || !job} onClick={() => void op.run('cancel', async () => { await ports.fastdl.cancel(id); reload(); }, 'Sync cancelled.')}>Cancel</Button>
          <Button variant="secondary" leadingIcon="replay" disabled={!canWrite || !!job} onClick={() => void op.run('retry', async () => { await ports.fastdl.retry(id); reload(); }, 'Retrying failed files.')}>Retry failed</Button>
        </ButtonGroup>
        {none ? <p className="text-[13px] text-ink3">{none}</p> : null}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card pad="lg" className="grid gap-4">
          <CardHeader title="Connect your server" description="Players need your server to tell their game where to download from." />
          <CopyField label="Download URL" value={url} />
          <CopyField label={`Line for ${s.profile?.configFile ?? 'server.cfg'}`} value={cvar} />
          {stats.cvarConfigured ? <Notice tone="good">Your server config already points to this URL{cfg.cvarBackupPath ? `. A backup of the previous file is at ${cfg.cvarBackupPath}.` : '.'}</Notice> : null}
          <Button variant={stats.cvarConfigured ? 'secondary' : 'primary'} disabled={!canWrite} loading={op.busy === 'cvar'} onClick={() => void op.run('cvar', async () => { await ports.fastdl.configureCvar(id); reload(); }, 'server.cfg updated. Restart the map to apply it.')}>{stats.cvarConfigured ? 'Write the line again' : 'Add the line to server.cfg for me'}</Button>
        </Card>
        <Card pad="lg" className="grid gap-4">
          <CardHeader title="Settings" />
          <Switch label="Sync automatically" description="Publish new files shortly after you upload them." checked={auto} onCheckedChange={setAuto} disabled={!canWrite} />
          <div className="grid gap-1.5"><p className="text-[13px] font-bold text-ink2">Compression</p>
            <SegmentedControl<FastDlCompression> aria-label="Compression" value={mode} onValueChange={setMode} disabled={!canWrite} options={[{ value: 'bz2', label: 'bz2' }, { value: 'both', label: 'Both' }, { value: 'raw', label: 'None' }]} />
            <p className="text-[13px] text-ink3">bz2 downloads fastest for players. Keep raw copies only if your engine needs them.</p></div>
          <NumberField label="Storage quota" unit="GB" min={0.1} max={50} step={0.5} value={quotaGb} onValueChange={setQuotaGb} disabled={!canWrite} />
          <Button variant="primary" disabled={!canWrite || !dirty || quotaGb === null} loading={op.busy === 'save'} onClick={() => void op.run('save', async () => { await ports.fastdl.saveSettings(id, { autoSync: auto, compressionMode: mode, quotaBytes: Math.round((quotaGb ?? 0) * GB) }); reload(); }, 'FastDL settings saved.')}>Save settings</Button>
        </Card>
      </div>
      <Manifest />
    </div>
  );
}

/** FastDL: HTTP downloads of maps and models for GoldSrc and Source servers. Unsupported engines get an explanation, not an error. */
export function FastDlTab() {
  const { id, ports } = useService();
  const res = useResource((s) => ports.fastdl.status(id, s), [id, ports]);
  return (
    <ResourceView res={res} reload={res.reload} label="Loading FastDL">
      {(s) => !s.supported || !s.config || !s.stats
        ? <Card pad="lg"><EmptyState icon="cloud-upload" title="FastDL is not available for this server" description={s.reason ?? 'This game engine does not support HTTP downloads.'} /></Card>
        : <Loaded s={s} reload={res.refresh} />}
    </ResourceView>
  );
}
