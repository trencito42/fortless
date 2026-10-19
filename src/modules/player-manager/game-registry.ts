import type { AdministrationMethod, AdministrationProtocol, ProtocolType } from './types.js';

export interface GameConfigFileDef {
  path: string;
  type: 'properties' | 'cvar' | 'json';
  rconEnableKey?: string;
  rconPasswordKey: string;
  rconPortKey?: string;
}

export interface GameCapabilityProfile {
  id: string;
  name: string;
  engine: 'java' | 'bedrock' | 'goldsrc' | 'source' | 'unity' | 'citizenfx' | 'custom';
  gameProtocol: ProtocolType;
  defaultProtocol: AdministrationProtocol;
  supportedProtocols: AdministrationProtocol[];
  preferredMethod: AdministrationMethod;
  supportedMethods: AdministrationMethod[];
  nativeConsoleSupported: boolean;
  nativeConsoleCommands?: {
    kick?: (name: string, reason?: string) => string;
    ban?: (name: string, durationMinutes?: number, reason?: string) => string;
    unban?: (name: string) => string;
    whitelistAdd?: (name: string) => string;
    whitelistRemove?: (name: string) => string;
    op?: (name: string) => string;
    deop?: (name: string) => string;
  };
  rconRequired: boolean;
  rconPortStrategy: 'SAME_AS_GAME_PORT' | 'DEDICATED_ALLOCATION' | 'CUSTOM';
  rconDefaultPort?: number;
  configFiles: GameConfigFileDef[];
  startupEnvKeys?: {
    rconPassword?: string;
    rconPort?: string;
  };
  playerQueryMethod: 'MINECRAFT_SLP' | 'A2S' | 'NONE';
  capabilities: {
    kick: boolean;
    ban: boolean;
    unban: boolean;
    reliablePlayerList: boolean;
    whitelist: boolean;
    op: boolean;
    companionSupported: boolean;
  };
  matchEgg(eggName: string | null, dockerImage?: string | null): boolean;
}

export const GAME_PROFILES: GameCapabilityProfile[] = [
  // 1. Minecraft Java Edition
  {
    id: 'minecraft-java',
    name: 'Minecraft: Java Edition',
    engine: 'java',
    gameProtocol: 'minecraft',
    defaultProtocol: 'PTERODACTYL_CONSOLE',
    supportedProtocols: ['PTERODACTYL_CONSOLE', 'MINECRAFT_RCON'],
    preferredMethod: 'NATIVE_CONSOLE',
    supportedMethods: ['AUTOMATIC', 'NATIVE_CONSOLE', 'RCON'],
    nativeConsoleSupported: true,
    nativeConsoleCommands: {
      kick: (name, reason) => reason ? `kick ${name} ${reason}` : `kick ${name}`,
      ban: (name, _duration, reason) => reason ? `ban ${name} ${reason}` : `ban ${name}`,
      unban: (name) => `pardon ${name}`,
      whitelistAdd: (name) => `whitelist add ${name}`,
      whitelistRemove: (name) => `whitelist remove ${name}`,
      op: (name) => `op ${name}`,
      deop: (name) => `deop ${name}`,
    },
    rconRequired: false,
    rconPortStrategy: 'DEDICATED_ALLOCATION',
    rconDefaultPort: 25575,
    configFiles: [
      {
        path: 'server.properties',
        type: 'properties',
        rconEnableKey: 'enable-rcon',
        rconPasswordKey: 'rcon.password',
        rconPortKey: 'rcon.port',
      },
    ],
    playerQueryMethod: 'MINECRAFT_SLP',
    capabilities: {
      kick: true,
      ban: true,
      unban: true,
      reliablePlayerList: false, // SLP is sampled
      whitelist: true,
      op: true,
      companionSupported: true,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return (
        (lower.includes('minecraft') || lower.includes('paper') || lower.includes('purpur') || lower.includes('spigot') || lower.includes('fabric') || lower.includes('forge') || lower.includes('bungeecord') || lower.includes('velocity')) &&
        !lower.includes('bedrock')
      );
    },
  },

  // 2. Minecraft Bedrock Edition
  {
    id: 'minecraft-bedrock',
    name: 'Minecraft: Bedrock Edition',
    engine: 'bedrock',
    gameProtocol: 'minecraft',
    defaultProtocol: 'PTERODACTYL_CONSOLE',
    supportedProtocols: ['PTERODACTYL_CONSOLE'],
    preferredMethod: 'NATIVE_CONSOLE',
    supportedMethods: ['AUTOMATIC', 'NATIVE_CONSOLE'],
    nativeConsoleSupported: true,
    nativeConsoleCommands: {
      kick: (name, reason) => reason ? `kick ${name} ${reason}` : `kick ${name}`,
      whitelistAdd: (name) => `allowlist add ${name}`,
      whitelistRemove: (name) => `allowlist remove ${name}`,
      op: (name) => `op ${name}`,
      deop: (name) => `deop ${name}`,
    },
    rconRequired: false,
    rconPortStrategy: 'DEDICATED_ALLOCATION',
    configFiles: [
      {
        path: 'server.properties',
        type: 'properties',
        rconPasswordKey: 'rcon.password',
      },
    ],
    playerQueryMethod: 'MINECRAFT_SLP',
    capabilities: {
      kick: true,
      ban: false,
      unban: false,
      reliablePlayerList: false,
      whitelist: true,
      op: true,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return lower.includes('bedrock') || lower.includes('pocketmine') || lower.includes('nukkit');
    },
  },

  // 3. Counter-Strike 1.6 & GoldSrc
  {
    id: 'cs16',
    name: 'Counter-Strike 1.6 / ReHLDS',
    engine: 'goldsrc',
    gameProtocol: 'goldsrc',
    defaultProtocol: 'GOLDSRC_RCON',
    supportedProtocols: ['GOLDSRC_RCON'],
    preferredMethod: 'RCON',
    supportedMethods: ['AUTOMATIC', 'RCON'],
    nativeConsoleSupported: false,
    rconRequired: true,
    rconPortStrategy: 'SAME_AS_GAME_PORT',
    configFiles: [
      {
        path: 'cstrike/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
      {
        path: 'valve/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
      {
        path: 'server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
    ],
    playerQueryMethod: 'A2S',
    capabilities: {
      kick: true,
      ban: true,
      unban: true,
      reliablePlayerList: true,
      whitelist: false,
      op: false,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return (
        lower.includes('counter-strike 1.6') ||
        lower.includes('cs 1.6') ||
        lower.includes('half-life 1') ||
        lower.includes('goldsrc') ||
        lower.includes('rehlds') ||
        lower.includes('team fortress classic') ||
        lower.includes('day of defeat')
      );
    },
  },

  // 4. Counter-Strike: Source & Source Engine
  {
    id: 'css',
    name: 'Counter-Strike: Source',
    engine: 'source',
    gameProtocol: 'source',
    defaultProtocol: 'SOURCE_RCON',
    supportedProtocols: ['SOURCE_RCON'],
    preferredMethod: 'RCON',
    supportedMethods: ['AUTOMATIC', 'RCON'],
    nativeConsoleSupported: false,
    rconRequired: true,
    rconPortStrategy: 'SAME_AS_GAME_PORT',
    configFiles: [
      {
        path: 'cstrike/cfg/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
      {
        path: 'cfg/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
    ],
    playerQueryMethod: 'A2S',
    capabilities: {
      kick: true,
      ban: true,
      unban: true,
      reliablePlayerList: true,
      whitelist: false,
      op: false,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return (
        lower.includes('counter-strike: source') ||
        lower.includes('css') ||
        lower.includes('half-life 2') ||
        lower.includes('team fortress 2') ||
        lower.includes('tf2') ||
        lower.includes('left 4 dead') ||
        lower.includes('garry') ||
        lower.includes('gmod')
      );
    },
  },

  // 5. Counter-Strike 2
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    engine: 'source',
    gameProtocol: 'source',
    defaultProtocol: 'SOURCE_RCON',
    supportedProtocols: ['SOURCE_RCON'],
    preferredMethod: 'RCON',
    supportedMethods: ['AUTOMATIC', 'RCON'],
    nativeConsoleSupported: false,
    rconRequired: true,
    rconPortStrategy: 'SAME_AS_GAME_PORT',
    configFiles: [
      {
        path: 'game/csgo/cfg/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
      {
        path: 'csgo/cfg/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
      {
        path: 'cfg/server.cfg',
        type: 'cvar',
        rconPasswordKey: 'rcon_password',
      },
    ],
    playerQueryMethod: 'A2S',
    capabilities: {
      kick: true,
      ban: true,
      unban: true,
      reliablePlayerList: true,
      whitelist: false,
      op: false,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return (
        lower.includes('counter-strike 2') ||
        lower.includes('cs2') ||
        lower.includes('cs:go') ||
        lower.includes('global offensive')
      );
    },
  },

  // 6. Rust
  {
    id: 'rust',
    name: 'Rust Dedicated Server',
    engine: 'unity',
    gameProtocol: 'rust',
    defaultProtocol: 'RUST_WEBRCON',
    supportedProtocols: ['RUST_WEBRCON'],
    preferredMethod: 'RCON',
    supportedMethods: ['AUTOMATIC'],
    nativeConsoleSupported: false,
    rconRequired: true,
    rconPortStrategy: 'DEDICATED_ALLOCATION',
    configFiles: [],
    startupEnvKeys: {
      rconPassword: 'RCON_PASSWORD',
      rconPort: 'RCON_PORT',
    },
    playerQueryMethod: 'A2S',
    capabilities: {
      kick: true,
      ban: true,
      unban: true,
      reliablePlayerList: true,
      whitelist: false,
      op: false,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      return eggName.toLowerCase().includes('rust');
    },
  },

  // 7. FiveM
  {
    id: 'fivem',
    name: 'FiveM (CitizenFX)',
    engine: 'citizenfx',
    gameProtocol: 'unsupported',
    defaultProtocol: 'UNSUPPORTED',
    supportedProtocols: [],
    preferredMethod: 'AUTOMATIC',
    supportedMethods: ['AUTOMATIC'],
    nativeConsoleSupported: false,
    rconRequired: false,
    rconPortStrategy: 'SAME_AS_GAME_PORT',
    configFiles: [],
    playerQueryMethod: 'NONE',
    capabilities: {
      kick: false,
      ban: false,
      unban: false,
      reliablePlayerList: false,
      whitelist: false,
      op: false,
      companionSupported: false,
    },
    matchEgg(eggName) {
      if (!eggName) return false;
      const lower = eggName.toLowerCase();
      return lower.includes('fivem') || lower.includes('cfx');
    },
  },
];

export function getGameCapability(eggOrName: string | null): GameCapabilityProfile | null {
  if (!eggOrName) return null;
  for (const profile of GAME_PROFILES) {
    if (profile.matchEgg(eggOrName)) {
      return profile;
    }
  }
  return null;
}
