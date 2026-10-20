import type * as C from './contracts';

/**
 * The only way the Service Detail view reaches data. One method per real route (see `api-map.ts` for the route behind each).
 * Ports speak the backend's wire contracts; the HTTP adapter is a thin transport, the sample adapter returns the same shapes.
 * The view never sees fetch, CSRF, WebSockets or Pterodactyl: Fortless stays the only intermediary and the browser only ever
 * holds a short-lived, server-scoped Wings token.
 *
 * Every method rejects with a `ServiceApiError`. Reads take an AbortSignal; writes are never aborted.
 */
export class ServiceApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code?: C.ServiceErrorCode) {
    super(message);
    this.name = 'ServiceApiError';
  }
  /** Reasons that will not fix themselves on retry (provider off, no permission, service suspended...). */
  get terminal(): boolean { return this.status === 401 || this.status === 403 || this.status === 404 || this.status === 501 || this.status === 503 || ['PROVIDER_NOT_CONFIGURED', 'KEYMINT_NOT_CONFIGURED', 'CONSOLE_UNSUPPORTED', 'SERVICE_NOT_ACTIVE', 'SERVICE_PROVISIONING', 'FORBIDDEN', 'PANEL_USER_MISSING'].includes(this.code ?? ''); }
}
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export type ConsoleStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'denied' | 'error';
export interface ConsoleHandlers {
  onLine: (text: string) => void;
  onStatus: (status: ConsoleStatus, detail?: string) => void;
  /** Wings `status` event: running, starting, stopping, offline. */
  onPowerState?: (state: string) => void;
  onStats?: (stats: C.WingsStats) => void;
}
export interface ConsoleConnection { send: (command: string) => Promise<void>; close: () => void }

export interface UploadHandle { promise: Promise<void>; cancel: () => void }

type R<T> = (id: string, signal: AbortSignal) => Promise<T>;

export interface ServiceDetailPorts {
  /** Level 2. Public route; a failure is reported as "unknown", never as ready. */
  platform: { capabilities: (signal: AbortSignal) => Promise<C.PlatformCapabilitiesDto> };
  service: {
    get: R<C.ServiceDetailDto>;
    power: (id: string, action: C.PowerSignal) => Promise<C.PowerResultDto>;
    usage: R<C.UsageDto>;
    /** Redacted-log AI triage. Rejects with AI_NOT_CONFIGURED (503) when the instance has no AI adapter. */
    diagnose: (id: string, recentLogs?: string) => Promise<C.DiagnosticReportDto>;
    activity: (id: string, q: { category?: C.ActivityCategory; range?: '1' | '7' | '30'; q?: string; page?: number }, signal: AbortSignal) => Promise<C.ActivityPageDto>;
  };
  console: {
    connect: (id: string, handlers: ConsoleHandlers) => ConsoleConnection;
    history: R<C.CommandHistoryDto>;
    recordCommand: (id: string, command: string, delivered: boolean) => Promise<void>;
  };
  files: {
    list: (id: string, dir: string, signal: AbortSignal) => Promise<C.FileListDto>;
    read: (id: string, path: string, signal: AbortSignal) => Promise<C.FileContentDto>;
    write: (id: string, path: string, content: string) => Promise<C.MutationDto>;
    createFolder: (id: string, dir: string, name: string) => Promise<C.MutationDto>;
    remove: (id: string, dir: string, names: string[]) => Promise<C.MutationDto>;
    rename: (id: string, dir: string, from: string, to: string) => Promise<C.MutationDto>;
    move: (id: string, dir: string, name: string, destDir: string) => Promise<C.MutationDto>;
    copy: (id: string, path: string) => Promise<C.MutationDto>;
    archive: (id: string, dir: string, names: string[]) => Promise<C.ArchiveDto>;
    unarchive: (id: string, dir: string, file: string) => Promise<C.MutationDto>;
    chmod: (id: string, dir: string, names: string[], mode: string) => Promise<C.MutationDto>;
    pull: (id: string, dir: string, url: string, filename?: string) => Promise<C.MutationDto>;
    /** Signed Wings URL minted by Fortless (file.create / file.read-content). The browser then talks to the node directly. */
    downloadUrl: (id: string, path: string) => Promise<string>;
    upload: (id: string, dir: string, file: File, onProgress: (pct: number) => void) => UploadHandle;
  };
  players: {
    status: R<C.ServerStatusDto>;
    kick: (id: string, body: C.KickBody) => Promise<unknown>;
    ban: (id: string, body: C.BanBody) => Promise<unknown>;
    unban: (id: string, body: Pick<C.KickBody, 'targetIdentifier' | 'targetName'>) => Promise<unknown>;
    history: (id: string, page: number, limit: number, signal: AbortSignal) => Promise<C.ModerationHistoryDto>;
    administration: R<{ status: C.GameAdministrationStatusDto }>;
    detect: (id: string) => Promise<{ status: C.GameAdministrationStatusDto }>;
    testAdministration: (id: string) => Promise<unknown>;
    autoConfigure: (id: string, body: Record<string, unknown>) => Promise<unknown>;
    saveAdministration: (id: string, body: Record<string, unknown>) => Promise<unknown>;
    resetAdministration: (id: string) => Promise<{ status: C.GameAdministrationStatusDto }>;
  };
  game: {
    info: R<C.GameInfoDto>;
    saveConfig: (id: string, values: Record<string, string>) => Promise<void>;
    acceptEula: (id: string) => Promise<{ accepted: boolean; restarted: boolean }>;
    searchMods: (id: string, q: { source: number; q: string; page: number }, signal: AbortSignal) => Promise<C.ModSearchDto>;
    installMod: (id: string, body: { source: number; projectId: string; versionId?: string }) => Promise<{ file: string; dir: string; version: string }>;
    installed: (id: string, source: number, signal: AbortSignal) => Promise<C.InstalledModsDto>;
    /** 64x64 PNG as base64 (no data: prefix). The server validates size and signature. */
    setIcon: (id: string, pngBase64: string) => Promise<void>;
  };
  fastdl: {
    status: R<C.FastDlStatusDto>;
    sync: (id: string) => Promise<C.FastDlSyncJobDto>;
    cancel: (id: string) => Promise<{ cancelled: boolean }>;
    retry: (id: string) => Promise<C.FastDlSyncJobDto>;
    manifest: (id: string, q: { page: number; limit: number; search?: string; status?: string }, signal: AbortSignal) => Promise<C.FastDlManifestDto>;
    configureCvar: (id: string) => Promise<C.FastDlCvarResultDto>;
    saveSettings: (id: string, patch: C.FastDlSettingsPatch) => Promise<C.FastDlStatusDto>;
  };
  backups: {
    list: R<C.BackupListDto>;
    create: (id: string, body: { name?: string; ignored?: string; locked?: boolean }) => Promise<C.MutationDto>;
    remove: (id: string, uuid: string) => Promise<C.MutationDto>;
    lock: (id: string, uuid: string) => Promise<C.MutationDto>;
    restore: (id: string, uuid: string, truncate: boolean) => Promise<C.MutationDto>;
    downloadUrl: (id: string, uuid: string) => Promise<string>;
  };
  network: {
    list: R<C.NetworkDto>;
    assign: (id: string) => Promise<C.MutationDto>;
    setNotes: (id: string, allocationId: number, notes: string) => Promise<C.MutationDto>;
    setPrimary: (id: string, allocationId: number) => Promise<C.MutationDto>;
    remove: (id: string, allocationId: number) => Promise<C.MutationDto>;
  };
  databases: {
    list: R<C.DatabaseListDto>;
    create: (id: string, body: { name: string; remote?: string }) => Promise<C.MutationDto>;
    rotate: (id: string, databaseId: string) => Promise<{ password: string | null }>;
    remove: (id: string, databaseId: string) => Promise<C.MutationDto>;
  };
  schedules: {
    list: R<C.ScheduleListDto>;
    save: (id: string, scheduleId: number | null, input: C.ScheduleInput) => Promise<C.MutationDto>;
    remove: (id: string, scheduleId: number) => Promise<C.MutationDto>;
    execute: (id: string, scheduleId: number) => Promise<C.MutationDto>;
    addTask: (id: string, scheduleId: number, input: C.TaskInput) => Promise<C.MutationDto>;
    updateTask: (id: string, scheduleId: number, taskId: number, input: C.TaskInput) => Promise<C.MutationDto>;
    removeTask: (id: string, scheduleId: number, taskId: number) => Promise<C.MutationDto>;
  };
  startup: {
    get: R<C.StartupDto>;
    setVariable: (id: string, key: string, value: string) => Promise<C.MutationDto>;
    setImage: (id: string, image: string) => Promise<C.MutationDto>;
  };
  settings: {
    get: R<C.SettingsDto>;
    rename: (id: string, name: string, description: string) => Promise<C.MutationDto>;
    reinstall: (id: string) => Promise<C.MutationDto>;
    panelActivity: (id: string, page: number, signal: AbortSignal) => Promise<C.PanelActivityDto>;
  };
  members: {
    list: R<C.MembersDto>;
    invite: (id: string, email: string, preset: C.Preset) => Promise<{ invitationId: string }>;
    revoke: (id: string, invitationId: string) => Promise<void>;
    remove: (id: string, memberId: string) => Promise<void>;
    setPreset: (id: string, memberId: string, preset: C.Preset) => Promise<void>;
  };
}
