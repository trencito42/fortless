import { useMemo } from 'react';
import { defineStory, type Scenario } from '../types';
import { AppShell } from '@/design-system';
import { FORTLESS_NAV, TABS } from './navigation';
import { ServiceDetailView, createDemoPorts, type DemoOptions } from '@/views/service-detail';

const NOTE = 'DEMONSTRATION: served by the in-memory demo adapter. No network, no real server.';

function Demo({ opts, tab, shell, id = 'demo-1' }: { opts?: DemoOptions; tab?: React.ComponentProps<typeof ServiceDetailView>['tab']; shell?: boolean; id?: string }) {
  const ports = useMemo(() => createDemoPorts({ latency: 120, ...opts }), [opts]);
  const view = <ServiceDetailView serviceId={id} ports={ports} tab={tab} demoNotice="Demonstration data. Nothing on this page reaches a real server." />;
  if (!shell) return <div className="mx-auto max-w-6xl p-4 sm:p-6">{view}</div>;
  return (
    <AppShell nav={FORTLESS_NAV} currentId="services" tabs={TABS} onNavigate={() => {}} user={{ name: 'Alex Morgan', initials: 'AM', role: 'Owner' }}>
      {view}
    </AppShell>
  );
}

const sc = (name: string, opts: DemoOptions, extra: Partial<Scenario> & { tab?: React.ComponentProps<typeof ServiceDetailView>['tab']; shell?: boolean; id?: string } = {}): Scenario => {
  const { tab, shell, id, ...rest } = extra;
  return { name, note: NOTE, render: () => <Demo opts={opts} tab={tab} shell={shell} id={id} />, ...rest };
};

export const viewStories = [
  defineStory({
    id: 'service-detail', title: 'Service Detail', category: 'Views', layer: 'View',
    purpose: 'Real Service Detail view: header with power controls, permission-driven tabs (overview, console, players, files, game, databases, schedules, backups, network, startup, allocation, settings, users, activity), Easy/Advanced modes.',
    source: 'Fortless services pages (capabilities only, not visuals) + 9 target screenshots; contracts in src/views/service-detail/contracts.ts',
    variants: ['owner', 'viewer', 'operator', 'admin', 'loading', 'error', 'unsupported provider', 'not configured', 'offline', 'suspended', '404'],
    props: ['serviceId', 'ports: ServiceDetailPorts (HTTP adapter in production, demo adapter here)', 'tab / onTabChange (controlled)', 'demoNotice'],
    a11y: 'Tabs with roving focus, labelled regions, alerts for failures, dialogs with focus management.',
    responsive: 'Header wraps, tab list scrolls, tables collapse to lists at narrow widths.',
    status: 'implemented',
    gaps: 'Demo adapter only; production wiring and live end-to-end verification are not done.',
    scenarios: [
      sc('Owner (running)', { as: 'owner' }),
      sc('Owner inside AppShell', { as: 'owner' }, { shell: true, fullBleed: true }),
      sc('Viewer (read-only)', { as: 'viewer' }),
      sc('Operator', { as: 'operator' }),
      sc('Admin', { as: 'admin' }),
      sc('Loading (slow)', { latency: 60000 }),
      sc('Service API failing', { failing: { service: { status: 502, code: 'PROVIDER_ERROR', message: 'The panel could not be reached.' } } }),
      sc('Unsupported provider (no console/files)', { providerType: 'PROXMOX', capabilities: { console: false, files: false, game: false, backups: false, databases: false, schedules: false } }),
      sc('Provider not configured', { platform: 'not-configured' }),
      sc('Offline server', { runtime: 'OFFLINE' }),
      sc('Suspended contract', { contract: 'SUSPENDED' }),
      sc('Console refused', { consoleError: { status: 501, code: 'CONSOLE_UNSUPPORTED', message: 'This provider does not support a live console.' } }, { tab: 'console' }),
      sc('No game profile', { game: 'none' }, { tab: 'game' }),
      sc('Empty data', { empty: true }, { tab: 'files' }),
      sc('Files tab', {}, { tab: 'files' }),
      sc('Players tab', {}, { tab: 'players' }),
      sc('Backups tab', {}, { tab: 'backups' }),
      sc('Settings tab', {}, { tab: 'settings' }),
    ],
  }),
];
