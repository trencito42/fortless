export type ProtocolType = 'goldsrc' | 'source' | 'minecraft' | 'rust' | 'unsupported';

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
