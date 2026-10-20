import type { ServerState } from '@/features';

export type TabId = 'overview' | 'console' | 'players' | 'files' | 'game' | 'fastdl' | 'databases' | 'schedules' | 'backups' | 'network' | 'startup' | 'settings' | 'users' | 'allocation' | 'activity';
export type ViewMode = 'easy' | 'advanced';

export const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview', console: 'Console', players: 'Players', files: 'Files', game: 'Game', fastdl: 'FastDL', databases: 'Databases', schedules: 'Schedules',
  backups: 'Backups', network: 'Network', startup: 'Startup', settings: 'Settings', users: 'Users', allocation: 'Allocation', activity: 'Activity',
};
export const TAB_ORDER: TabId[] = ['overview', 'console', 'players', 'files', 'game', 'fastdl', 'databases', 'schedules', 'backups', 'network', 'startup', 'settings', 'users', 'allocation', 'activity'];
/** Same split as the shipped app (`advancedKeys` in pages/services/index.ts): these tabs only show in Advanced mode. */
/** Sections are grouped, not laid out as one 15-item tab bar: a left rail on large screens, a section picker below. */
export const TAB_GROUPS: ReadonlyArray<{ id: string; label: string; tabs: readonly TabId[] }> = [
  { id: 'monitor', label: 'Monitor', tabs: ['overview', 'console', 'activity'] },
  { id: 'manage', label: 'Manage', tabs: ['players', 'game', 'fastdl', 'files', 'startup'] },
  { id: 'data', label: 'Data and automation', tabs: ['databases', 'backups', 'schedules'] },
  { id: 'access', label: 'Access and settings', tabs: ['network', 'allocation', 'users', 'settings'] },
];
export const TAB_ICON: Record<TabId, string> = {
  overview: 'dashboard-square-01', console: 'terminal', activity: 'history', players: 'user-group', game: 'layers-01', fastdl: 'cloud-upload', files: 'folder-01', startup: 'rocket-01',
  databases: 'database', backups: 'archive-01', schedules: 'clock-01', network: 'globe-02', allocation: 'cpu', users: 'user-add-01', settings: 'settings-01',
};
export const ADVANCED_TABS: ReadonlySet<TabId> = new Set<TabId>(['databases', 'schedules', 'network', 'startup', 'settings', 'users', 'allocation']);

/** What the header and Overview need, derived from GET /services/:id by `mapService`. */
export interface ServiceSummary {
  id: string;
  /** planName, as in the shipped header. */
  name: string;
  state: ServerState;
  contractStatus: string;
  nodeName: string;
  nodeFqdn: string;
  regionName: string;
  regionCode: string;
  providerType: string;
  identifier: string | null;
  createdAt: string;
  limits: { memoryMb: number; cpuPct: number; diskMb: number } | null;
  accessKind: 'ACCOUNT' | 'MEMBER';
  sharedBy: string | null;
}
