import { useMemo, useState } from 'react';
import { ActionMenu, Button, Card, DataTable, EmptyState, FilterBuilder, IconButton, Notice, SegmentedControl, Select, applyFilters, type ColumnDef, type FilterField, type FilterRule, type MenuEntry } from '@/design-system';
import { useApi, useApiQuery } from '../data/DataProvider';
import { ApiError } from '../data/api';
import { useNavigate } from '../router';
import { PageHeader } from '../components/PageHeader';
import { ServiceStateBadge, WorkloadIcon } from '../components/bits';
import { mb, money, date } from '../format';
import { WORKLOAD_LABEL, type ServiceRow } from '../domain/types';

type Quick = 'all' | 'running' | 'stopped' | 'attention';
type Sort = 'name' | 'state' | 'ram' | 'renews';
const NEEDS = new Set(['error', 'suspended']);

const valueOf = (s: ServiceRow, f: string): unknown => ({ workload: s.workload, provider: s.provider, region: s.regionId, plan: s.planId, ram: s.resources.ramLimitMb, tag: (s.tags ?? []).join(' ') } as Record<string, unknown>)[f];

/** Why a power action is unavailable for a row, or null when it is allowed. Legitimate provider limits are explained, not hidden. */
const powerBlock = (_s: ServiceRow): string | null => 'Power controls are not wired in this read-only migration slice.';

export default function Services() {
  const nav = useNavigate();
  const api = useApi();
  const res = useApiQuery((a) => a.listServices());
  const [quick, setQuick] = useState<Quick>('all');
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<Sort>('name');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const fields = useMemo<FilterField[]>(() => {
    const services = res.status === 'ready' ? res.data : [];
    const options = (pairs: Array<[string, string]>) => [...new Map(pairs).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
    return [
      { id: 'workload', label: 'Workload', type: 'select', options: options(services.map((s) => [s.workload, WORKLOAD_LABEL[s.workload]])) },
      { id: 'provider', label: 'Provider', type: 'select', options: options(services.map((s) => [s.provider, s.provider === 'PTERODACTYL' ? 'Game & app hosting' : s.provider === 'PROXMOX' ? 'Virtual machine' : 'Web hosting'])) },
      { id: 'region', label: 'Region', type: 'select', options: options(services.map((s) => [s.regionId, s.regionName])) },
      { id: 'plan', label: 'Plan', type: 'select', options: options(services.map((s) => [s.planId, s.planName])) },
      { id: 'ram', label: 'Memory limit (MB)', type: 'number' },
      { id: 'tag', label: 'Tag', type: 'text' },
    ];
  }, [res]);

  const power = async (s: ServiceRow, a: 'start' | 'stop' | 'restart' | 'kill') => {
    setError(undefined); setBusy(s.id);
    try { await api.power(s.id, a); } catch (e) { setError(`Could not ${a} ${s.name}: ${e instanceof ApiError || e instanceof Error ? e.message : 'the request failed.'}`); } finally { setBusy(undefined); }
  };

  const rows = useMemo(() => {
    if (res.status !== 'ready') return [];
    let r = res.data;
    if (quick === 'running') r = r.filter((s) => s.state === 'running');
    if (quick === 'stopped') r = r.filter((s) => s.state === 'offline');
    if (quick === 'attention') r = r.filter((s) => NEEDS.has(s.state));
    r = applyFilters(r, rules, fields, valueOf);
    const order = { error: 0, suspended: 1, installing: 2, starting: 3, stopping: 3, running: 4, offline: 5 } as Record<string, number>;
    return [...r].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'state' ? (order[a.state] ?? 9) - (order[b.state] ?? 9) : sort === 'ram' ? b.resources.ramLimitMb - a.resources.ramLimitMb : (a.renewsOn ?? '9').localeCompare(b.renewsOn ?? '9'));
  }, [res, quick, rules, sort, fields]);
  const counts = res.status === 'ready' ? { running: res.data.filter((s) => s.state === 'running').length, stopped: res.data.filter((s) => s.state === 'offline').length, attention: res.data.filter((s) => NEEDS.has(s.state)).length } : null;

  const entries = (s: ServiceRow): MenuEntry[] => {
    const block = powerBlock(s); const vm = s.provider === 'PROXMOX';
    const go = (tab: string) => () => nav(`/app/services/${s.id}/${tab}`);
    return [
      { id: 'open', label: 'Open', icon: 'arrow-up-right-01', onSelect: () => nav(`/app/services/${s.id}`) },
      { id: 'console', label: 'Console', icon: 'terminal', onSelect: go('console'), disabled: !!block || vm, disabledReason: vm ? 'Virtual machines use the provider console.' : block ?? undefined },
      { id: 'files', label: 'Files', icon: 'folder-01', onSelect: go('files'), disabled: !!block || vm, disabledReason: vm ? 'Virtual machines have no file manager.' : block ?? undefined },
      { id: 'backups', label: 'Backups', icon: 'archive-01', onSelect: go('backups') },
      { kind: 'separator', id: 's1' },
      { id: 'restart', label: 'Restart', icon: 'replay', disabled: !!block || s.state !== 'running', disabledReason: block ?? 'Only a running server can restart.', onSelect: () => void power(s, 'restart') },
      { id: 'kill', label: 'Force stop (kill)', icon: 'power', tone: 'danger', disabled: !!block || !['running', 'starting', 'stopping'].includes(s.state), disabledReason: block ?? 'Nothing is running.', onSelect: () => void power(s, 'kill') },
      { kind: 'separator', id: 's2' },
      { id: 'ticket', label: 'Contact support', icon: 'message-01', onSelect: () => nav(`/app/support/new?service=${s.id}`) },
    ];
  };

  const quickActions = (s: ServiceRow) => {
    const block = powerBlock(s);
    const canStart = !block && (s.state === 'offline' || s.state === 'error');
    const canStop = !block && ['running', 'starting'].includes(s.state);
    return (
      <div className="flex items-center gap-1.5">
        <IconButton label={`Start ${s.name}`} icon="play" size="sm" variant="secondary" disabled={!canStart || busy === s.id} onClick={() => void power(s, 'start')} />
        <IconButton label={`Stop ${s.name}`} icon="stop" size="sm" variant="secondary" disabled={!canStop || busy === s.id} onClick={() => void power(s, 'stop')} />
        <ActionMenu label={`More actions for ${s.name}`} entries={entries(s)} align="end" />
      </div>
    );
  };

  const columns: ColumnDef<ServiceRow, unknown>[] = [
    { accessorKey: 'name', header: 'Service', meta: { primary: true }, cell: (c) => { const s = c.row.original; return (
      <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => nav(`/app/services/${s.id}`)}>
        <WorkloadIcon workload={s.workload} />
        <span className="min-w-0"><span className="block truncate font-bold hover:text-accent-ink">{s.name}</span><span className="block truncate text-[13px] text-ink3">{WORKLOAD_LABEL[s.workload]} · {s.engine}</span></span>
      </button>); } },
    { accessorKey: 'state', header: 'Status', cell: (c) => <div className="grid gap-1"><ServiceStateBadge state={c.row.original.state} />{c.row.original.note ? <span className="max-w-[22ch] text-[12.5px] leading-snug text-ink3">{c.row.original.note}</span> : null}</div> },
    { id: 'where', header: 'Region', accessorFn: (s) => s.regionName, cell: (c) => <span>{c.row.original.regionName}<span className="block text-[13px] text-ink3">{c.row.original.planName}</span></span> },
    { id: 'usage', header: 'Allocated resources', enableSorting: false, cell: (c) => { const s = c.row.original; return <span className="text-ink3">{mb(s.resources.ramLimitMb)} RAM · {mb(s.resources.diskLimitMb)} disk</span>; } },
    { id: 'players', header: 'Players', accessorFn: (s) => s.players?.online ?? -1, meta: { numeric: true, hideOnMobile: true }, cell: (c) => (c.row.original.players ? `${c.row.original.players.online} / ${c.row.original.players.max}` : '—') },
    { id: 'renews', header: 'Renews', accessorFn: (s) => s.renewsOn ?? '', cell: (c) => (c.row.original.renewsOn ? <span>{date(c.row.original.renewsOn)}{c.row.original.price ? <span className="block text-[13px] text-ink3">{money(c.row.original.price)}</span> : null}</span> : '—') },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false, enableHiding: false, meta: { actions: true }, cell: (c) => quickActions(c.row.original) },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader title="Servers & instances" description="Every game server, bot, app and VM on your account." actions={<Button variant="primary" leadingIcon="add-01" onClick={() => nav('/app/deploy')}>Deploy new</Button>} />
      {error ? <Notice tone="bad" title="Action failed" action={<Button size="sm" variant="secondary" onClick={() => setError(undefined)}>Dismiss</Button>}>{error}</Notice> : null}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Quick> aria-label="Show" value={quick} onValueChange={setQuick} options={[{ value: 'all', label: counts ? `All ${res.status === 'ready' ? res.data.length : ''}` : 'All' }, { value: 'running', label: counts ? `Running ${counts.running}` : 'Running' }, { value: 'stopped', label: counts ? `Stopped ${counts.stopped}` : 'Stopped' }, { value: 'attention', label: counts ? `Attention ${counts.attention}` : 'Attention' }]} />
        <Button variant={showFilters || rules.length ? 'subtle' : 'secondary'} leadingIcon="filter" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>Filters{rules.length ? ` (${rules.length})` : ''}</Button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Select label="Sort by" hideLabel className="w-44" value={sort} onValueChange={(v) => v && setSort(v as Sort)} options={[{ value: 'name', label: 'Sort: name' }, { value: 'state', label: 'Sort: needs attention first' }, { value: 'ram', label: 'Sort: memory' }, { value: 'renews', label: 'Sort: next renewal' }]} />
          <SegmentedControl<'table' | 'cards'> aria-label="Layout" value={view} onValueChange={setView} options={[{ value: 'table', label: 'List', icon: 'table', iconOnlyOnMobile: true }, { value: 'cards', label: 'Cards', icon: 'layout-grid', iconOnlyOnMobile: true }]} />
        </div>
      </div>
      {showFilters ? <Card pad="sm"><FilterBuilder fields={fields} rules={rules} onRulesChange={setRules} /></Card> : null}

      {res.status === 'error' ? (
        <EmptyState tone="error" icon="alert-circle" title="Could not load your services" description={res.error} action={<Button variant="secondary" onClick={res.reload}>Retry</Button>} />
      ) : res.status === 'ready' && res.data.length > 0 && rows.length === 0 ? (
        <EmptyState icon="search-01" title="No services match" description="Change or clear the filters to see more." action={<Button variant="secondary" onClick={() => { setRules([]); setQuick('all'); }}>Clear filters</Button>} />
      ) : view === 'cards' && res.status === 'ready' && rows.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => (
            <li key={s.id}>
              <Card className="grid h-full gap-3">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => nav(`/app/services/${s.id}`)}><WorkloadIcon workload={s.workload} /><span className="min-w-0"><span className="block truncate font-bold">{s.name}</span><span className="block truncate text-[13px] text-ink3">{s.engine}</span></span></button>
                  <ServiceStateBadge state={s.state} />
                </div>
                <p className="text-[13px] text-ink3">{s.note ?? `${mb(s.resources.ramLimitMb)} RAM · ${mb(s.resources.diskLimitMb)} disk · ${s.regionName}`}</p>
                <div className="mt-auto flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-ink3">{s.regionName} · {s.planName}</span>{quickActions(s)}</div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          data={rows} columns={columns} getRowId={(s) => s.id} caption="Your services" loading={res.status === 'loading'} searchable searchPlaceholder="Search by name, engine or region" columnPicker pageSize={10}
          selectable rowLabel={(s) => s.name}
          bulkActions={(sel) => (
            <>
              <Button size="sm" variant="secondary" leadingIcon="play" disabled={sel.every((s) => !!powerBlock(s) || s.state === 'running')} onClick={() => sel.filter((s) => !powerBlock(s) && s.state !== 'running').forEach((s) => void power(s, 'start'))}>Start</Button>
              <Button size="sm" variant="secondary" leadingIcon="stop" disabled={sel.every((s) => !!powerBlock(s) || s.state !== 'running')} onClick={() => sel.filter((s) => !powerBlock(s) && s.state === 'running').forEach((s) => void power(s, 'stop'))}>Stop</Button>
            </>
          )}
          empty={{ title: 'No services yet', description: 'Deploy a Minecraft server, a CS server, a Discord bot or an app. It is ready in a few minutes.', action: <Button variant="primary" onClick={() => nav('/app/deploy')}>Deploy a service</Button> }}
        />
      )}
    </div>
  );
}
