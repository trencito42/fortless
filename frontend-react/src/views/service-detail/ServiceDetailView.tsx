import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Breadcrumbs, Button, EmptyState, Notice, SegmentedControl, Skeleton, StatusBadge } from '@/design-system';
import { ServerPowerToolbar, serverStatus, type PowerAction } from '@/features';
import { useResource } from '../shared/useResource';
import { gateFor, lifecycleReason, tabsFor } from './access';
import { ServiceProvider, useService, type ServiceCtx } from './context';
import { useLiveChannel } from './live';
import { liveToState, mapService } from './mappers';
import { SectionNav } from './SectionNav';
import { ADVANCED_TABS, TAB_LABELS, TAB_ORDER, type TabId, type ViewMode } from './model';
import { ServiceApiError, type ServiceDetailPorts } from './ports';
import { ActivityTab } from './tabs/ActivityTab';
import { AllocationTab } from './tabs/AllocationTab';
import { BackupsTab } from './tabs/BackupsTab';
import { ConsoleTab } from './tabs/ConsoleTab';
import { DatabasesTab } from './tabs/DatabasesTab';
import { FastDlTab } from './tabs/FastDlTab';
import { FilesTab } from './tabs/FilesTab';
import { GameTab } from './tabs/GameTab';
import { NetworkTab } from './tabs/NetworkTab';
import { OverviewTab } from './tabs/OverviewTab';
import { PlayersTab } from './tabs/PlayersTab';
import { SchedulesTab } from './tabs/SchedulesTab';
import { SettingsTab } from './tabs/SettingsTab';
import { StartupTab } from './tabs/StartupTab';
import { UsersTab } from './tabs/UsersTab';
import type { PlatformCapabilitiesDto } from './contracts';

export interface ServiceDetailViewProps {
  serviceId: string;
  ports: ServiceDetailPorts;
  /** Controlled tab, for routers. Omit to let the view keep it. */
  tab?: TabId;
  onTabChange?: (tab: TabId) => void;
  /** Where "Services" in the breadcrumb goes. Omit and the crumb is plain text. */
  onNavigateServices?: () => void;
  /** Set by the Workbench so nobody mistakes demonstration data for a real server. */
  demoNotice?: string;
}

const modeKey = (id: string) => `fortless_service_mode_${id}`; // same key as the shipped app, so a person's choice carries over
const readMode = (id: string): ViewMode | null => { try { const v = localStorage.getItem(modeKey(id)); return v === 'advanced' || v === 'easy' ? v : null; } catch { return null; } };
const writeMode = (id: string, m: ViewMode) => { try { localStorage.setItem(modeKey(id), m); } catch { /* storage blocked: the choice just is not remembered */ } };

const CONTENT: Record<TabId, (p: { platform: PlatformCapabilitiesDto | null }) => ReactNode> = {
  overview: (p) => <OverviewTab platform={p.platform} />, console: () => <ConsoleTab />, players: () => <PlayersTab />, files: () => <FilesTab />, fastdl: () => <FastDlTab />, game: () => <GameTab />,
  databases: () => <DatabasesTab />, schedules: () => <SchedulesTab />, backups: () => <BackupsTab />, network: () => <NetworkTab />, startup: () => <StartupTab />,
  settings: () => <SettingsTab />, users: () => <UsersTab />, allocation: () => <AllocationTab />, activity: () => <ActivityTab />,
};

function Header({ onNavigateServices, platform }: { onNavigateServices?: () => void; platform: PlatformCapabilitiesDto | null }) {
  const { summary, live, detail, ports, id, can, refresh } = useService();
  const [power, setPower] = useState<string>();
  const state = liveToState(live.powerState) ?? summary.state;
  const st = serverStatus[state];
  const lifecycle = detail.contractStatus === 'ACTIVE' ? null : {
    label: detail.contractStatus === 'PAST_DUE' ? 'Past due' : detail.contractStatus[0] + detail.contractStatus.slice(1).toLowerCase(),
    tone: detail.contractStatus === 'PAST_DUE' || detail.contractStatus === 'SUSPENDED' ? 'warn' as const : detail.contractStatus === 'TERMINATED' ? 'bad' as const : 'neutral' as const,
  };
  const caps = detail.providerCapabilities;
  const showPower = caps ? caps.power : detail.providerType !== 'CPANEL';
  const providerOff = platform ? !platform.provisioning.enabled : false;
  const allowed = { start: can('control.start'), restart: can('control.restart'), stop: can('control.stop'), kill: can('control.stop') };
  const anyControl = allowed.start || allowed.restart || allowed.stop;
  const why = lifecycleReason(detail) ?? (providerOff ? 'The infrastructure provider is not configured, so power controls are off.' : !anyControl ? 'Your access level cannot control power.' : undefined);
  const run = useCallback(async (a: PowerAction) => {
    setPower(undefined);
    const r = await ports.service.power(id, a.toUpperCase() as 'START' | 'STOP' | 'RESTART' | 'KILL');
    void r; refresh();
  }, [ports, id, refresh]);
  return (
    <header className="grid gap-4">
      <Breadcrumbs crumbs={[{ id: 'services', label: 'Services', current: false }, { id: 'svc', label: summary.name, current: true }]} onNavigate={() => onNavigateServices?.()} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 grid gap-2">
          <div>{lifecycle ? <StatusBadge tone={lifecycle.tone}>{lifecycle.label}</StatusBadge> : <StatusBadge tone={st.tone} live={st.live}>{st.label}</StatusBadge>}</div>
          <h1 className="font-display text-[28px] leading-tight font-extrabold tracking-tight [overflow-wrap:anywhere]">{summary.name}</h1>
          <p className="text-ink3">{summary.nodeName} ({summary.regionName}) · {summary.identifier ? `Provider ID ${summary.identifier}` : 'Provisioning'}</p>
        </div>
        {showPower ? <ServerPowerToolbar hideStatus state={state} serverName={summary.name} onPower={run} onError={(a, e) => setPower(`Could not ${a} the server: ${e instanceof Error ? e.message : 'the request failed.'}`)} disabledReason={why} allowed={allowed} /> : null}
      </div>
      {power ? <Notice tone="bad" action={<Button size="sm" variant="secondary" onClick={() => setPower(undefined)}>Dismiss</Button>}>{power}</Notice> : null}
    </header>
  );
}

function Loaded({ props, ctxBase, platform }: { props: ServiceDetailViewProps; ctxBase: Omit<ServiceCtx, 'live'>; platform: PlatformCapabilitiesDto | null }) {
  const { ports, serviceId } = props;
  const consoleGate = gateFor('console', { service: ctxBase.detail, platform: platform ?? undefined });
  const live = useLiveChannel(ports, serviceId, consoleGate.open, ctxBase.can('control.console'));
  const ctx: ServiceCtx = useMemo(() => ({ ...ctxBase, live }), [ctxBase, live]);

  const input = useMemo(() => ({ service: ctxBase.detail, platform: platform ?? undefined }), [ctxBase.detail, platform]);
  const [internalTab, setInternalTab] = useState<TabId>('overview');
  const [mode, setMode] = useState<ViewMode>(() => readMode(serviceId) ?? 'easy');
  const requested = props.tab ?? internalTab;
  // Probes decide which workload-specific sections exist: apps and bots have no game profile, and FastDL exists only for engines that support it.
  const gameOn = tabsFor(input, ['game']).some((t) => t.gate.open);
  const fastOn = tabsFor(input, ['fastdl']).some((t) => t.gate.open);
  const gameProbe = useResource((s) => (gameOn ? ports.game.info(serviceId, s) : Promise.resolve(null)), [ports, serviceId, gameOn]);
  const fastProbe = useResource((s) => (fastOn ? ports.fastdl.status(serviceId, s) : Promise.resolve(null)), [ports, serviceId, fastOn]);
  const hidden = useMemo(() => {
    const h = new Set<TabId>();
    if (gameProbe.status === 'ready' && gameProbe.data && gameProbe.data.profile === null) { h.add('game'); h.add('players'); }
    if (fastProbe.status === 'ready' && fastProbe.data && !fastProbe.data.supported) h.add('fastdl');
    return h;
  }, [gameProbe, fastProbe]);
  const available = useMemo(() => tabsFor(input, TAB_ORDER, hidden), [input, hidden]);
  const visible = available.filter((t) => mode === 'advanced' || !ADVANCED_TABS.has(t.id) || t.id === requested);
  const active: TabId = visible.some((t) => t.id === requested) ? requested : 'overview';
  const select = (t: TabId) => { setInternalTab(t); props.onTabChange?.(t); };
  useEffect(() => { writeMode(serviceId, mode); }, [serviceId, mode]);

  const gate = available.find((t) => t.id === active)?.gate;
  const items = visible.map((t) => ({ id: t.id, blocked: t.gate.open ? undefined : t.gate.reason }));
  const panel: ReactNode = gate && !gate.open
    ? <Notice tone="warn" title={`${TAB_LABELS[active]} is not available right now`}>{gate.reason}</Notice>
    : CONTENT[active]({ platform });
  return (
    <ServiceProvider value={ctx}>
      <div className="grid gap-6">
        {props.demoNotice ? <Notice tone="info" title="Demonstration data">{props.demoNotice}</Notice> : null}
        <div className="grid gap-4">
          <Header onNavigateServices={props.onNavigateServices} platform={platform} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl aria-label="Service view" size="sm" value={mode} onValueChange={setMode} options={[{ value: 'easy', label: 'Easy' }, { value: 'advanced', label: 'Advanced' }]} />
            {platform && !platform.provisioning.enabled ? <StatusBadge tone="warn">Provider controls unavailable</StatusBadge> : null}
          </div>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
          <SectionNav items={items} active={active} onSelect={select} />
          <section aria-label={TAB_LABELS[active]} data-tab-panel={active} className="min-w-0"><h2 className="sr-only">{TAB_LABELS[active]}</h2>{panel}</section>
        </div>
      </div>
    </ServiceProvider>
  );
}

/**
 * The Fortless service page, composed from the UI kit. All data arrives through `ports`; nothing here fetches, and the design
 * system knows nothing about this view. Tabs follow the real access model (provider capability, then permission, then
 * lifecycle), and every group of data has its own loading, empty, error and "not allowed" state.
 */
export function ServiceDetailView(props: ServiceDetailViewProps) {
  const { ports, serviceId } = props;
  const svc = useResource((s) => ports.service.get(serviceId, s), [ports, serviceId]);
  const plat = useResource((s) => ports.platform.capabilities(s), [ports]);
  const platform = plat.status === 'ready' ? plat.data : null;
  const refresh = svc.refresh;
  const detail = svc.status === 'ready' ? svc.data : null;
  const base = useMemo<Omit<ServiceCtx, 'live'> | null>(() => detail ? ({
    id: serviceId, ports, detail, summary: mapService(detail), refresh, can: (p: string) => detail.access.permissions.includes(p),
  }) : null, [detail, serviceId, ports, refresh]);

  if (svc.status === 'loading') return <div role="status" aria-label="Loading service" aria-busy="true" className="grid gap-4"><Skeleton className="h-6 w-full max-w-48" /><Skeleton className="h-10 w-full max-w-80" /><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (svc.status === 'error' || !base) {
    const notFound = svc.status === 'error' && svc.cause instanceof ServiceApiError && svc.cause.status === 404;
    return notFound
      ? <EmptyState icon="server" title="Service not found" description="It may have been removed, or you may not have access to it." action={props.onNavigateServices ? <Button variant="secondary" onClick={props.onNavigateServices}>Back to services</Button> : undefined} />
      : <Notice tone="bad" title="Could not load this service" action={<Button size="sm" variant="secondary" onClick={svc.reload}>Retry</Button>}>{svc.status === 'error' ? svc.error : 'Something went wrong.'}</Notice>;
  }
  return <Loaded props={props} ctxBase={base} platform={platform} />;
}
