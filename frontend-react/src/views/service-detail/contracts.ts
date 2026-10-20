/**
 * Wire contracts of the Fortless service API, copied from the backend source (trencito42/fortless @ c6bab7e), not invented.
 * Each interface names the file it mirrors. Nothing here is a design-system type: adapters return these shapes and
 * `mappers.ts` turns them into kit props, so a backend change is visible in exactly one place.
 */

// ---- src/modules/provisioning/services.ts ------------------------------------------------------------------------
export type ContractStatus = 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'TERMINATED';
export type RuntimeState = 'RUNNING' | 'STOPPED' | 'INSTALLING' | 'ERROR' | 'OFFLINE' | 'UNKNOWN';

/** getProviderCapabilities(providerType): level 3, what the provider can do at all. */
export interface ProviderCapabilities {
  console: boolean; files: boolean; game: boolean; databases: boolean; schedules: boolean; backups: boolean;
  network: boolean; startup: boolean; settings: boolean; users: boolean; power: boolean;
}

/** `access` of GET /api/v1/services/:id. `permissions` are Pterodactyl permission strings (service-access.ts), level 4. */
export interface ServiceAccessInfo {
  kind: 'ACCOUNT' | 'MEMBER';
  preset: 'viewer' | 'operator' | 'admin' | null;
  permissions: string[];
  sharedBy: string | null;
}

export interface ServiceDetailDto {
  access: ServiceAccessInfo;
  id: string;
  accountId: string;
  orderItemId: string;
  providerType: string;
  providerCapabilities?: ProviderCapabilities;
  externalId: string | null;
  identifier: string | null;
  contractStatus: ContractStatus;
  nodeId: string;
  nodeName: string;
  nodeFqdn: string;
  regionId: string;
  regionName: string;
  regionCode: string;
  planName: string;
  planVersionId: string;
  desiredConfig: { cpuLimitPct: number; memoryLimitMb: number; diskLimitMb: number; startupCommand: string | null } | null;
  observedState: { runtimeState: RuntimeState; lastCheckedAt: string } | null;
  auditTrail: ActivityEventDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEventDto { id: string; action: string; actorType: string; createdAt: string; metadata: string }
/** GET /services/:id/activity?category&range&q&page (listServiceActivity). Page size 15. */
export interface ActivityPageDto { events: ActivityEventDto[]; total: number; page: number; pageSize: number }
export type ActivityCategory = 'all' | 'power' | 'files' | 'backups' | 'network' | 'settings' | 'game' | 'databases' | 'schedules' | 'lifecycle' | 'billing';

export type PowerSignal = 'START' | 'STOP' | 'RESTART' | 'KILL';
/** POST /services/:id/power */
export interface PowerResultDto { success: true; serviceId: string; action: PowerSignal; runtimeState: RuntimeState }

/** GET /services/:id/usage -> PterodactylHttpAdapter.getResourceUsage. `available:false` when the provider cannot answer. */
export type UsageDto = { available: false } | { available: true; usage: { state: string; cpuPct: number; memoryBytes: number; diskBytes: number; uptimeMs: number } };

// ---- src/modules/provisioning/console.ts + frontend console.ts (Wings websocket) ---------------------------------------
/** GET /services/:id/console. Short-lived, server-scoped; the panel API key never reaches the browser. */
export interface ConsoleCredentialsDto { token: string; socket: string }
/** Wings `stats` event payload (JSON string in args[0]). */
export interface WingsStats {
  state?: string; memory_bytes?: number; memory_limit_bytes?: number; cpu_absolute?: number; disk_bytes?: number; uptime?: number;
  network?: { rx_bytes?: number; tx_bytes?: number };
}
/**
 * GET /services/:id/console/history (player-manager/service.ts getCommandHistory, newest first, needs websocket.connect).
 * NOTE: the records carry `commandRedacted`, never `command`. The shipped client (pages/services/console.ts) reads `h.command`,
 * so its server-side history recall yields undefined entries. The new view reads the real field and skips redacted commands.
 */
export interface ConsoleCommandRecordDto { id: string; serviceId: string; actorUserId: string; actorRole?: string; commandHash: string; commandRedacted: string; delivered: boolean; deliveryStatus: string; createdAt: string }
export interface CommandHistoryDto { history: ConsoleCommandRecordDto[] }

// ---- src/modules/provisioning/files.ts + adapter.ts -------------------------------------------------------------------
export interface PanelFileEntryDto { name: string; isFile: boolean; isSymlink: boolean; size: number; mime: string; modifiedAt: string }
export interface FileListDto { dir: string; entries: PanelFileEntryDto[] }
export interface FileContentDto { path: string; content: string }
/** Every mutating file call: `pending: true` means the panel timed out and the outcome is unknown (NEW-381). */
export interface MutationDto { success?: boolean; pending: boolean }
export interface ArchiveDto { archive: string | null; pending: boolean }
export const MAX_EDIT_BYTES = 1024 * 1024;

// ---- src/modules/player-manager/types.ts ------------------------------------------------------------------------------
export type AdministrationMethod = 'AUTOMATIC' | 'NATIVE_CONSOLE' | 'RCON';
export interface GameAdministrationStatusDto {
  provider: 'PTERODACTYL'; gameIdentity: string; detectionSource: 'GAME_PROFILE' | 'EGG_NAME_FALLBACK' | 'UNKNOWN';
  gameProtocol: 'goldsrc' | 'source' | 'minecraft' | 'rust' | 'unsupported'; queryMethod: 'MINECRAFT_SLP' | 'A2S' | 'NONE';
  supportedMethods: AdministrationMethod[]; selectedMethod: AdministrationMethod;
  effectiveProtocol: 'PTERODACTYL_CONSOLE' | 'GOLDSRC_RCON' | 'SOURCE_RCON' | 'MINECRAFT_RCON' | 'RUST_WEBRCON' | 'UNSUPPORTED';
  state: 'AVAILABLE' | 'CONNECTED' | 'SETUP_REQUIRED' | 'DISABLED' | 'UNSUPPORTED' | 'UNREACHABLE';
  queryHost: string | null; queryPort: number | null; administrationHost: string | null; administrationPort: number | null;
  rconEnabled: boolean | null; credentialsConfigured: boolean;
  configurationSource: 'FORTLESS_OVERRIDE' | 'DETECTED_FILE' | 'EGG_ENVIRONMENT' | 'NATIVE_PROVIDER' | 'NONE';
  lastSuccessfulTestAt: string | null; lastTestError: string | null; restartRequired: boolean;
  capabilities: { kick: boolean; ban: boolean; unban: boolean; reliablePlayerList: boolean };
  message: string;
}
export interface ServerInfoDto {
  name: string; map: string; folder: string; game: string; players: number; maxPlayers: number; bots: number;
  serverType: 'dedicated' | 'non-dedicated' | 'proxy'; environment: 'linux' | 'windows' | 'mac'; visibility: 'public' | 'private';
  vac: boolean; version: string; pingMs: number; protocol?: number;
}
export interface PlayerInfoDto { index: number; name: string; score: number; duration: number; ping?: number; steamId?: string; ip?: string }
/** GET /services/:id/players */
export interface ServerStatusDto {
  supported: boolean; state: 'ONLINE' | 'OFFLINE' | 'UNSUPPORTED' | 'ERROR'; gameType: string; adapter: string; info?: ServerInfoDto;
  players: PlayerInfoDto[]; playerListReliability?: 'AUTHORITATIVE' | 'SAMPLED' | 'BEST_EFFORT'; administration?: GameAdministrationStatusDto; error?: string;
}
export interface ModerationRecordDto {
  id: string; serviceId: string; actorUserId: string; action: 'KICK' | 'BAN' | 'UNBAN'; targetIdentifier: string; targetName: string;
  reason: string | null; durationMinutes: number | null; rconResponse: string | null; createdAt: string;
}
export interface ModerationHistoryDto { total: number; records: ModerationRecordDto[] }
export interface KickBody { targetIdentifier: string; targetName: string; reason?: string }
export interface BanBody extends KickBody { durationMinutes?: number }

// ---- src/modules/provisioning/game-profiles.ts + game-tools.ts -------------------------------------------------------
export interface ConfigFieldDto {
  key: string; label: string; type: 'bool' | 'int' | 'enum' | 'string'; group?: string; description?: string; default?: string;
  min?: number; max?: number; maxLength?: number; options?: Array<{ value: string; label: string }>;
}
/** GET /services/:id/game. `profile: null` means no game profile matched this server's egg. */
export type GameInfoDto = { profile: null } | {
  profile: { slug: string; name: string; configFile: string | null; configExists: boolean; schema: ConfigFieldDto[]; sources: Array<{ index: number; label: string; kind: string; dir: string }>; icon: boolean };
  values: Record<string, string>;
  eula: 'required' | 'accepted' | 'unavailable';
  java: { gameVersion: string | null; recommended: string | null; current: string | null; matches: boolean | null; available: string[] };
};
export interface ModHitDto { projectId: string; slug: string; title: string; description: string; author: string; downloads: number; iconUrl: string | null }
export interface ModSearchDto { gameVersion: string | null; hits: ModHitDto[]; total: number; page: number }
export interface InstalledModsDto { dir: string; files: Array<{ name: string; size: number; modifiedAt: string }> }

// ---- src/modules/fastdl/types.ts + service.ts (routes registered at server.ts 2007-2018) ---------------------------------
export type FastDlCompression = 'bz2' | 'raw' | 'both';
export interface FastDlSyncJobDto {
  id: string; serviceId: string; triggerType: 'MANUAL' | 'SCHEDULED' | 'WEBHOOK' | 'FILE_EVENT' | 'RETRY';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalFiles: number; processedFiles: number; syncedFiles: number; deletedFiles: number; failedFiles: number; totalBytes: number;
  currentFile?: string | null; errorMessage?: string | null; startedAt?: string | null; completedAt?: string | null; createdAt: string; updatedAt: string;
}
export interface FastDlStatusDto {
  /** false when the game engine has no FastDL profile: a legitimate "not for this server" state. */
  supported: boolean; reason?: string;
  profile?: { slug: string; name: string; engine: 'goldsrc' | 'source' | 'cod'; gameDir: string; assetDirs: string[]; extensions: string[]; compression: FastDlCompression; configFile: string; cvarTemplate: string; description?: string } | null;
  config?: { enabled: boolean; autoSync: boolean; compressionMode: FastDlCompression; quotaBytes: number; customPublicUrl?: string | null; lastSyncAt?: string | null; cvarConfiguredAt?: string | null; cvarBackupPath?: string | null } | null;
  stats?: { totalFiles: number; totalOriginalBytes: number; totalStoredBytes: number; quotaBytes: number; percentUsed: number; cvarConfigured: boolean };
  activeJob?: FastDlSyncJobDto | null;
  publicDownloadUrl?: string;
}
export interface FastDlManifestItemDto { id: string; serviceId: string; filePath: string; fileSize: number; compressedSize: number; fileHash: string; isCompressed: boolean; storageRelPath: string; status: 'SYNCED' | 'PENDING' | 'FAILED' | 'DELETED'; lastError?: string | null; syncedAt: string }
export interface FastDlManifestDto { items: FastDlManifestItemDto[]; total: number; page: number; limit: number; totalPages: number }
export interface FastDlSettingsPatch { autoSync?: boolean; compressionMode?: FastDlCompression; quotaBytes?: number }
export interface FastDlCvarResultDto { success: boolean; backupPath: string | null; downloadUrl: string }

// ---- src/modules/ai/diagnostics.ts (POST /services/:id/diagnostics, server.ts 2155; 503 AI_NOT_CONFIGURED when the AI adapter is off) --
export interface DiagnosticReportDto { category: string; rootCause: string; confidence: number; severity: 'INFO' | 'WARNING' | 'CRITICAL'; recommendations: string[]; relevantArticleSlugs: string[]; isGuardrailed: true; recommendedArticles: Array<{ slug?: string; title?: string }> }

// ---- src/modules/provisioning/server-panel.ts ---------------------------------------------------------------------------
export interface BackupDto { uuid: string; name: string; bytes: number; createdAt: string; completedAt: string | null; successful: boolean; locked: boolean }
export interface BackupListDto { backups: BackupDto[]; limit: number | null }
export interface AllocationDto { id: number; ip: string; alias: string | null; port: number; notes: string; primary: boolean }
export interface NetworkDto { allocations: AllocationDto[] }
export interface StartupVariableDto { key: string; name: string; description: string; value: string; editable: boolean; rules: string }
export interface StartupDto { command: string; images: Record<string, string>; variables: StartupVariableDto[] }
/** `password` is null unless the viewer holds database.view_password. */
export interface DatabaseDto { id: string; name: string; username: string; host: string; connectionsFrom: string; password: string | null }
export interface DatabaseListDto { databases: DatabaseDto[] }
export interface ScheduleTaskDto { id: number; sequence: number; action: 'command' | 'power' | 'backup' | string; payload: string; offset: number; continueOnFailure: boolean }
export interface ScheduleDto {
  id: number; name: string; cron: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string };
  active: boolean; processing: boolean; onlyWhenOnline: boolean; lastRunAt: string | null; nextRunAt: string | null; tasks: ScheduleTaskDto[];
}
export interface ScheduleListDto { schedules: ScheduleDto[] }
export interface ScheduleInput { name: string; minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string; active: boolean; onlyWhenOnline: boolean }
export interface TaskInput { action: 'command' | 'power' | 'backup'; payload: string; offset: number; continueOnFailure: boolean }
export interface PanelActivityDto {
  events: Array<{ event: string; timestamp: string; api: boolean; actor: string | null }>; page: number; pages: number; total: number;
}
export interface SettingsDto {
  name: string; description: string; identifier: string; uuid: string; node: string; image: string;
  sftp: { host: string; port: number; username: string | null };
}

// ---- src/modules/provisioning/service-members.ts -------------------------------------------------------------------
export type Preset = 'viewer' | 'operator' | 'admin';
export interface MembersDto {
  members: Array<{ id: string; preset: Preset; createdAt: string; name: string; email: string }>;
  invitations: Array<{ id: string; email: string; preset: Preset; expiresAt: string; createdAt: string }>;
}

// ---- errors (filesHandler, ConsoleAccessError) ----------------------------------------------------------------------
/** Every failing service route answers `{ error, code? }`. `code` is the typed reason the view branches on. */
export type ServiceErrorCode =
  | 'PROVIDER_NOT_CONFIGURED' | 'KEYMINT_NOT_CONFIGURED' | 'CONSOLE_UNSUPPORTED' | 'SERVICE_NOT_ACTIVE' | 'SERVICE_PROVISIONING' | 'PANEL_USER_MISSING'
  | 'FORBIDDEN' | 'NOT_FOUND' | 'PANEL_REFUSED' | 'PROVIDER_ERROR' | 'RCON_ERROR' | 'CONFIRMATION_REQUIRED' | 'FILE_TOO_LARGE'
  | 'INVALID_INPUT' | 'INVALID_PATH' | 'INVALID_NAME' | 'INVALID_URL' | 'INVALID_MODE' | 'INSTALL_IN_PROGRESS' | 'INSTALL_BUSY' | 'NO_PROFILE'
  | (string & {});

/** GET /api/v1/platform/capabilities (level 2 + the platform half of level 5). */
export type VerificationTier = 'NOT_STARTED' | 'CONFIGURED' | 'SANDBOX_VERIFIED' | 'PRODUCTION_VERIFIED' | (string & {});
export interface PlatformCapabilitiesDto { provisioning: { enabled: boolean; mode: string; verification: VerificationTier }; panelSso?: { enabled: boolean } }
