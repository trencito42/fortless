export type ProtocolType = 'goldsrc' | 'source' | 'minecraft' | 'rust' | 'unsupported';
export type AdministrationMethod = 'AUTOMATIC' | 'NATIVE_CONSOLE' | 'RCON';
export type AdministrationProtocol = 'PTERODACTYL_CONSOLE' | 'GOLDSRC_RCON' | 'SOURCE_RCON' | 'MINECRAFT_RCON' | 'RUST_WEBRCON' | 'UNSUPPORTED';

export interface GameAdministrationStatus {
  provider: 'PTERODACTYL';
  gameIdentity: string;
  detectionSource: 'GAME_PROFILE' | 'EGG_NAME_FALLBACK' | 'UNKNOWN';
  gameProtocol: ProtocolType;
  queryMethod: 'MINECRAFT_SLP' | 'A2S' | 'NONE';
  supportedMethods: AdministrationMethod[];
  selectedMethod: AdministrationMethod;
  effectiveProtocol: AdministrationProtocol;
  state: 'AVAILABLE' | 'CONNECTED' | 'SETUP_REQUIRED' | 'DISABLED' | 'UNSUPPORTED' | 'UNREACHABLE';
  queryHost: string | null;
  queryPort: number | null;
  administrationHost: string | null;
  administrationPort: number | null;
  rconEnabled: boolean | null;
  credentialsConfigured: boolean;
  configurationSource: 'FORTLESS_OVERRIDE' | 'DETECTED_FILE' | 'EGG_ENVIRONMENT' | 'NATIVE_PROVIDER' | 'NONE';
  lastSuccessfulTestAt: string | null;
  lastTestError: string | null;
  restartRequired: boolean;
  capabilities: { kick: boolean; ban: boolean; unban: boolean; reliablePlayerList: boolean };
  message: string;
}

export interface ServerInfo {
  name: string;
  map: string;
  folder: string;
  game: string;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: 'dedicated' | 'non-dedicated' | 'proxy';
  environment: 'linux' | 'windows' | 'mac';
  visibility: 'public' | 'private';
  vac: boolean;
  version: string;
  pingMs: number;
  protocol?: number;
}

export interface PlayerInfo {
  index: number;
  name: string;
  score: number;
  duration: number; // seconds connected
  ping?: number;
  steamId?: string;
  ip?: string;
}

export type ServerStatusState = 'ONLINE' | 'OFFLINE' | 'UNSUPPORTED' | 'ERROR';

export interface ServerStatusResult {
  supported: boolean;
  state: ServerStatusState;
  gameType: string;
  adapter: string;
  info?: ServerInfo;
  players: PlayerInfo[];
  playerListReliability?: 'AUTHORITATIVE' | 'SAMPLED' | 'BEST_EFFORT';
  administration?: GameAdministrationStatus;
  error?: string;
}

export type ModerationAction = 'KICK' | 'BAN' | 'UNBAN';

export interface ModerationRecord {
  id: string;
  serviceId: string;
  actorUserId: string;
  action: ModerationAction;
  targetIdentifier: string;
  targetName: string;
  reason: string | null;
  durationMinutes: number | null;
  rconResponse: string | null;
  createdAt: string;
}

export interface ConsoleCommandRecord {
  id: string;
  serviceId: string;
  actorUserId: string;
  actorRole?: string;
  commandHash: string;
  commandRedacted: string;
  delivered: boolean;
  deliveryStatus: string;
  createdAt: string;
}

export interface KickParams {
  targetIdentifier: string;
  targetName: string;
  reason?: string;
}

export interface BanParams {
  targetIdentifier: string;
  targetName: string;
  durationMinutes?: number;
  reason?: string;
}

export interface UnbanParams {
  targetIdentifier: string;
  targetName: string;
}
