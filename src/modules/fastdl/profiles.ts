import type { FastDlProfile } from './types.js';

export const GOLDSRC_EXTENSIONS = [
  '.bsp',
  '.mdl',
  '.wav',
  '.mp3',
  '.spr',
  '.wad',
  '.tga',
  '.bmp',
  '.txt',
];

export const SOURCE_EXTENSIONS = [
  '.bsp',
  '.mdl',
  '.vtx',
  '.vvd',
  '.phy',
  '.vmt',
  '.vtf',
  '.pcf',
  '.wav',
  '.mp3',
  '.txt',
  '.png',
];

export const COD_EXTENSIONS = [
  '.iwd',
  '.pk3',
  '.ff',
];

export const FASTDL_PROFILES: FastDlProfile[] = [
  // --- GOLDSRC GAMES ---
  {
    slug: 'cs-16',
    name: 'Counter-Strike 1.6',
    engine: 'goldsrc',
    eggNames: [
      'Counter-Strike: 1.6',
      'Counter Strike 1.6',
      'Counter-Strike 1.6',
      'CS 1.6',
      'cstrike',
      'CS16',
    ],
    gameDir: '/cstrike',
    assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx', 'overviews'],
    extensions: GOLDSRC_EXTENSIONS,
    compression: 'bz2',
    configFile: '/cstrike/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
      sv_allowupload: '1',
    },
    description: 'GoldSrc asset sync for CS 1.6 maps, models, sounds, sprites and wads.',
  },
  {
    slug: 'half-life',
    name: 'Half-Life (Deathmatch)',
    engine: 'goldsrc',
    eggNames: [
      'Half-Life',
      'Half-Life: Deathmatch',
      'Half Life',
      'HL1',
      'valve',
    ],
    gameDir: '/valve',
    assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx', 'overviews'],
    extensions: GOLDSRC_EXTENSIONS,
    compression: 'bz2',
    configFile: '/valve/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
      sv_allowupload: '1',
    },
    description: 'GoldSrc asset sync for Half-Life Deathmatch.',
  },
  {
    slug: 'sven-coop',
    name: 'Sven Co-op',
    engine: 'goldsrc',
    eggNames: [
      'Sven Co-op',
      'Sven Coop',
      'SvenCoop',
      'svencoop',
    ],
    gameDir: '/svencoop',
    assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx'],
    extensions: GOLDSRC_EXTENSIONS,
    compression: 'bz2',
    configFile: '/svencoop/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'GoldSrc co-op custom maps, models and sounds.',
  },
  {
    slug: 'day-of-defeat',
    name: 'Day of Defeat',
    engine: 'goldsrc',
    eggNames: [
      'Day of Defeat',
      'DoD',
      'dod',
    ],
    gameDir: '/dod',
    assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx', 'overviews'],
    extensions: GOLDSRC_EXTENSIONS,
    compression: 'bz2',
    configFile: '/dod/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'GoldSrc WWII mod asset sync.',
  },
  {
    slug: 'team-fortress-classic',
    name: 'Team Fortress Classic',
    engine: 'goldsrc',
    eggNames: [
      'Team Fortress Classic',
      'TFC',
      'tfc',
    ],
    gameDir: '/tfc',
    assetDirs: ['maps', 'models', 'sound', 'sprites', 'gfx', 'overviews'],
    extensions: GOLDSRC_EXTENSIONS,
    compression: 'bz2',
    configFile: '/tfc/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'GoldSrc Team Fortress Classic asset sync.',
  },

  // --- SOURCE GAMES ---
  {
    slug: 'cs-source',
    name: 'Counter-Strike: Source',
    engine: 'source',
    eggNames: [
      'Counter-Strike: Source',
      'Counter Strike: Source',
      'CS:S',
      'CSS',
      'Counter-Strike: Global Offensive',
      'Counter Strike: Global Offensive',
      'CS:GO',
      'CSGO',
    ],
    gameDir: '/cstrike',
    assetDirs: ['maps', 'models', 'materials', 'sound', 'resource', 'particles'],
    extensions: SOURCE_EXTENSIONS,
    compression: 'bz2',
    configFile: '/cstrike/cfg/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'Source engine maps, materials, models and sound effects.',
  },
  {
    slug: 'garrys-mod',
    name: "Garry's Mod",
    engine: 'source',
    eggNames: [
      "Garry's Mod",
      'Garrys Mod',
      'GMod',
      'gmod',
      'garrysmod',
    ],
    gameDir: '/garrysmod',
    assetDirs: ['maps', 'models', 'materials', 'sound', 'particles', 'resource'],
    extensions: SOURCE_EXTENSIONS,
    compression: 'bz2',
    configFile: '/garrysmod/cfg/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
      sv_allowupload: '1',
    },
    description: "Source engine sandbox content sync for Garry's Mod servers.",
  },
  {
    slug: 'team-fortress-2',
    name: 'Team Fortress 2',
    engine: 'source',
    eggNames: [
      'Team Fortress 2',
      'TF2',
      'tf2',
      'tf',
    ],
    gameDir: '/tf',
    assetDirs: ['maps', 'models', 'materials', 'sound', 'particles', 'resource'],
    extensions: SOURCE_EXTENSIONS,
    compression: 'bz2',
    configFile: '/tf/cfg/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'Source engine asset sync for TF2 servers.',
  },
  {
    slug: 'left-4-dead-2',
    name: 'Left 4 Dead 2',
    engine: 'source',
    eggNames: [
      'Left 4 Dead 2',
      'Left 4 Dead',
      'L4D2',
      'l4d2',
      'left4dead2',
    ],
    gameDir: '/left4dead2',
    assetDirs: ['maps', 'models', 'materials', 'sound', 'particles'],
    extensions: SOURCE_EXTENSIONS,
    compression: 'bz2',
    configFile: '/left4dead2/cfg/server.cfg',
    cvarTemplate: 'sv_downloadurl "{downloadUrl}"',
    additionalCvars: {
      sv_allowdownload: '1',
    },
    description: 'Source engine asset sync for Left 4 Dead 2 servers.',
  },

  // --- VERIFIED ADDITIONAL GAMES ---
  {
    slug: 'call-of-duty-4',
    name: 'Call of Duty 4: Modern Warfare',
    engine: 'cod',
    eggNames: [
      'Call of Duty 4',
      'Call of Duty 4: Modern Warfare',
      'CoD4',
      'cod4',
    ],
    gameDir: '/main',
    assetDirs: ['main', 'mods'],
    extensions: COD_EXTENSIONS,
    compression: 'raw', // CoD uses raw .iwd / .pk3 files
    configFile: '/main/server.cfg',
    cvarTemplate: 'set sv_wwwBaseURL "{downloadUrl}"',
    additionalCvars: {
      sv_wwwDownload: '1',
      sv_wwwDlDisconnected: '0',
    },
    description: 'Call of Duty HTTP redirection for custom IWD and mod files.',
  },
];

/**
 * Resolves a FastDL profile from the server's egg name.
 * Performs case-insensitive fuzzy and exact matches.
 * Returns null if the game is incompatible.
 */
export function resolveFastDlProfile(eggName: string | null | undefined): FastDlProfile | null {
  if (!eggName || typeof eggName !== 'string') return null;
  const target = eggName.trim().toLowerCase();

  // Explicit incompatible eggs guard
  const incompatibleSubstrings = [
    'minecraft',
    'paper',
    'spigot',
    'forge',
    'bungeecord',
    'velocity',
    'sponge',
    'rust',
    'palworld',
    'terraria',
    'ark',
    'valheim',
    'discord',
    'node',
    'python',
    'generic',
    'voice',
    'teamspeak',
    'cpanel',
  ];
  if (incompatibleSubstrings.some((term) => target.includes(term))) {
    return null;
  }

  // Exact or alias match
  for (const profile of FASTDL_PROFILES) {
    for (const egg of profile.eggNames) {
      const alias = egg.toLowerCase();
      if (target === alias) return profile;
    }
  }

  // Partial match fallback for games with versions or prefixes (e.g. "Source - Counter-Strike: Source")
  for (const profile of FASTDL_PROFILES) {
    for (const egg of profile.eggNames) {
      const alias = egg.toLowerCase();
      if (alias.length >= 4 && (target.includes(alias) || alias.includes(target))) {
        return profile;
      }
    }
  }

  return null;
}

export function getAllFastDlProfiles(): FastDlProfile[] {
  return [...FASTDL_PROFILES];
}
