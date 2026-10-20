import type { FileEntry } from '@/design-system';
import type {
  AuditEvent, BackupItem, ConfigSection, ConfigValues, Extension, ManagedSchedule, ModerationRow, RosterInfo, RosterPlayer, ServerResources, ServerState,
  ServiceInvitation, ServiceMember, StartupConfig,
} from '@/features';
import type * as C from './contracts';
import type { ServiceSummary } from './model';

/** Pure DTO -> kit-props functions. No I/O, no React, unit-testable. This is the only place wire shapes meet the design system. */

export function runtimeToState(rs: C.RuntimeState | undefined, _contract?: C.ContractStatus): ServerState {
  switch (rs) { case 'RUNNING': return 'running'; case 'STOPPED': case 'OFFLINE': return 'offline'; case 'INSTALLING': return 'installing'; case 'ERROR': return 'error'; default: return 'unknown'; }
}
/** Wings `status` event / usage state, which is more current than the stored runtime. */
export function liveToState(s: string | null | undefined): ServerState | null {
  switch ((s ?? '').toLowerCase()) { case 'running': return 'running'; case 'starting': return 'starting'; case 'stopping': return 'stopping'; case 'offline': return 'offline'; default: return null; }
}

export function mapService(d: C.ServiceDetailDto): ServiceSummary {
  return {
    id: d.id, name: d.planName || d.id, state: runtimeToState(d.observedState?.runtimeState), contractStatus: d.contractStatus,
    nodeName: d.nodeName, nodeFqdn: d.nodeFqdn, regionName: d.regionName, regionCode: d.regionCode, providerType: d.providerType, identifier: d.identifier,
    createdAt: d.createdAt, accessKind: d.access.kind, sharedBy: d.access.sharedBy,
    limits: d.desiredConfig ? { memoryMb: d.desiredConfig.memoryLimitMb, cpuPct: d.desiredConfig.cpuLimitPct, diskMb: d.desiredConfig.diskLimitMb } : null,
  };
}

export const statsToResources = (s: C.WingsStats): ServerResources => ({
  cpuPercent: s.cpu_absolute, memoryBytes: s.memory_bytes, memoryLimitBytes: s.memory_limit_bytes || undefined, diskBytes: s.disk_bytes,
  networkRxBytes: s.network?.rx_bytes, networkTxBytes: s.network?.tx_bytes, uptimeSeconds: s.uptime != null ? Math.floor(s.uptime / 1000) : undefined,
});
export const usageToResources = (u: C.UsageDto): ServerResources | null => !u.available ? null : ({
  cpuPercent: u.usage.cpuPct, memoryBytes: u.usage.memoryBytes, diskBytes: u.usage.diskBytes, uptimeSeconds: Math.floor(u.usage.uptimeMs / 1000),
});

export const isoDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const bytes = (b: number) => b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export const mapFiles = (l: C.FileListDto): FileEntry[] => l.entries.map((e) => ({ name: e.name, kind: e.isFile ? 'file' : 'folder', size: e.isFile ? e.size : undefined, modified: isoDate(e.modifiedAt) }));
export const pathToDir = (segments: string[]) => '/' + segments.join('/');
export const joinPath = (segments: string[], name: string) => pathToDir([...segments, name]);

export const mapBackups = (l: C.BackupListDto): BackupItem[] => l.backups.map((b) => ({
  id: b.uuid, name: b.name, size: b.bytes ? bytes(b.bytes) : undefined, created: isoDate(b.createdAt), locked: b.locked,
  state: !b.successful ? 'failed' : b.completedAt ? 'ready' : 'creating',
}));

export const mapSchedules = (l: C.ScheduleListDto): ManagedSchedule[] => l.schedules.map((s) => ({
  id: s.id, name: s.name, cron: s.cron, active: s.active, processing: s.processing, onlyWhenOnline: s.onlyWhenOnline,
  lastRun: s.lastRunAt ? isoDate(s.lastRunAt) : undefined, nextRun: s.nextRunAt ? isoDate(s.nextRunAt) : undefined, tasks: s.tasks,
}));

export const mapMembers = (m: C.MembersDto): { members: ServiceMember[]; invitations: ServiceInvitation[] } => ({
  members: m.members.map((x) => ({ id: x.id, name: x.name, email: x.email, preset: x.preset })),
  invitations: m.invitations.map((i) => ({ id: i.id, email: i.email, preset: i.preset, expires: isoDate(i.expiresAt) })),
});

export function mapPlayers(s: C.ServerStatusDto): { status: 'online' | 'offline' | 'unsupported' | 'error'; players: RosterPlayer[]; info?: RosterInfo } {
  const status = s.state === 'ONLINE' ? 'online' : s.state === 'OFFLINE' ? 'offline' : s.state === 'UNSUPPORTED' || !s.supported ? 'unsupported' : 'error';
  return {
    status,
    players: s.players.map((p) => ({ id: `${p.index}:${p.steamId ?? p.name}`, name: p.name, identifier: p.steamId ?? p.name, score: p.score, connectedSeconds: Math.round(p.duration), pingMs: p.ping })),
    info: s.info ? { name: s.info.name, map: s.info.map, version: s.info.version, pingMs: s.info.pingMs, players: s.info.players, maxPlayers: s.info.maxPlayers } : undefined,
  };
}
export const mapModeration = (h: C.ModerationHistoryDto): ModerationRow[] => h.records.map((r) => ({ id: r.id, action: r.action, targetName: r.targetName, targetIdentifier: r.targetIdentifier, reason: r.reason, durationMinutes: r.durationMinutes, createdAt: r.createdAt }));

const toSection = (fields: C.ConfigFieldDto[]): ConfigSection[] => {
  const groups = new Map<string, ConfigSection>();
  for (const f of fields) {
    const title = f.group || 'General';
    const sec = groups.get(title) ?? { id: title.toLowerCase().replace(/\W+/g, '-'), title, fields: [] };
    const base = { key: f.key, label: f.label, description: f.description };
    sec.fields.push(
      f.type === 'bool' ? { ...base, type: 'switch' }
        : f.type === 'int' ? { ...base, type: 'number', min: f.min, max: f.max }
        : f.type === 'enum' ? { ...base, type: 'select', options: f.options ?? [] }
        : { ...base, type: 'text', maxLength: f.maxLength });
    groups.set(title, sec);
  }
  return [...groups.values()];
};
export function mapGameConfig(info: Extract<C.GameInfoDto, { profile: C.GameInfoDto['profile'] & object }>): { sections: ConfigSection[]; initial: ConfigValues } {
  const initial: ConfigValues = {};
  for (const f of info.profile.schema) {
    const raw = info.values[f.key] ?? f.default;
    if (raw === undefined) continue;
    initial[f.key] = f.type === 'bool' ? raw === 'true' : f.type === 'int' ? Number(raw) : raw;
  }
  return { sections: toSection(info.profile.schema), initial };
}

export const mapMods = (r: C.ModSearchDto, installed: Set<string>): Extension[] => r.hits.map((h) => ({
  id: h.projectId, name: h.title, description: h.description, iconUrl: h.iconUrl ?? undefined, state: installed.has(h.title.toLowerCase()) || installed.has(h.slug.toLowerCase()) ? 'installed' : 'available',
}));
/** File names look like "Chunky-Paper-1.3.jar". A catalog hit counts as installed when a jar name starts with its slug or title. */
export const installedKeys = (r: C.InstalledModsDto): Set<string> => {
  const keys = new Set<string>();
  for (const f of r.files) { const base = f.name.replace(/\.jar$/i, '').toLowerCase(); keys.add(base); keys.add(base.split(/[-_ ]\d/)[0]!); keys.add(base.split('-')[0]!); }
  return keys;
};

export const mapStartup = (d: C.StartupDto, dockerImage: string): { initial: StartupConfig; images: { value: string; label: string }[] } => ({
  initial: { command: d.command, dockerImage, variables: d.variables.map((v) => ({ key: v.key, label: v.name, description: v.description, value: v.value, editable: v.editable, required: /(^|\|)required(\||$)/.test(v.rules) })) },
  images: Object.entries(d.images).map(([label, value]) => ({ value, label })),
});

/** Audit rows keep the stored action name; metadata is JSON and is shown as key/value, never interpreted. */
export function mapActivity(events: C.ActivityEventDto[]): AuditEvent[] {
  return events.map((e) => {
    let meta: Record<string, unknown> = {};
    try { const m = JSON.parse(e.metadata) as unknown; if (m && typeof m === 'object' && !Array.isArray(m)) meta = m as Record<string, unknown>; } catch { /* keep empty */ }
    const ip = typeof meta['ip'] === 'string' ? meta['ip'] : undefined;
    return {
      id: e.id, at: e.createdAt, actor: e.actorType === 'USER' ? 'You or a teammate' : e.actorType === 'SYSTEM' ? 'Fortless' : e.actorType === 'STAFF' ? 'Fortless support' : e.actorType,
      action: e.action, target: typeof meta['name'] === 'string' ? meta['name'] : typeof meta['path'] === 'string' ? meta['path'] : '—', outcome: /fail/i.test(e.action) ? 'failed' : 'success', ip,
      details: Object.entries(meta).filter(([k, v]) => k !== 'ip' && ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 8).map(([k, v]) => ({ label: k, value: String(v) })),
    };
  });
}
