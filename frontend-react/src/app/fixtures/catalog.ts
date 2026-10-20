import type { Workload } from '../domain/types';

/**
 * Deploy catalog: what each workload can be built from. Typed fixture, not backend data. The integration agent replaces it with the
 * catalog the provisioning API exposes; fields the backend cannot honour yet should be removed rather than faked.
 */
export interface CatalogField { key: string; label: string; type: 'text' | 'number' | 'select' | 'secret' | 'switch'; default: string; required?: boolean; options?: { value: string; label: string }[]; help?: string; secret?: boolean; min?: number; max?: number }
export interface CatalogEngine { id: string; label: string; description: string; versions: string[]; recommended?: boolean }
export interface CatalogPreset { id: string; label: string; description: string; recommendedPlan: string }
export interface CatalogAddon { id: string; label: string; description: string; price: number; planned?: boolean }
export interface WorkloadCatalog { label: string; blurb: string; icon: string; engines: CatalogEngine[]; presets: CatalogPreset[]; addons: CatalogAddon[]; fields: CatalogField[] }

const opt = (...v: string[]) => v.map((x) => ({ value: x, label: x }));

export const CATALOG: Record<Workload, WorkloadCatalog> = {
  minecraft: {
    label: 'Minecraft', blurb: 'Java servers for survival, creative and modded play.', icon: 'layers-01',
    engines: [
      { id: 'paper', label: 'Paper', description: 'Fast and plugin-friendly. The default for most servers.', versions: ['1.21.8', '1.21.4', '1.20.6', '1.19.4'], recommended: true },
      { id: 'purpur', label: 'Purpur', description: 'Paper with extra gameplay settings.', versions: ['1.21.8', '1.21.4', '1.20.6'] },
      { id: 'fabric', label: 'Fabric', description: 'Lightweight mod loader.', versions: ['1.21.8', '1.21.4', '1.20.6'] },
      { id: 'forge', label: 'Forge', description: 'Large library of classic mods.', versions: ['1.20.1', '1.19.2', '1.18.2'] },
      { id: 'vanilla', label: 'Vanilla', description: 'Unmodified Mojang server.', versions: ['1.21.8', '1.21.4', '1.20.6'] },
    ],
    presets: [
      { id: 'survival', label: 'Survival', description: 'Claims, homes and a fair economy.', recommendedPlan: 'flame' },
      { id: 'creative', label: 'Creative build', description: 'WorldEdit and plot worlds.', recommendedPlan: 'spark' },
      { id: 'modpack', label: 'Modded', description: 'Room for a mid-size modpack.', recommendedPlan: 'blaze' },
      { id: 'blank', label: 'Blank', description: 'Clean server, nothing preinstalled.', recommendedPlan: 'spark' },
    ],
    addons: [
      { id: 'backups', label: 'Daily backups', description: 'Keeps 7 days of restore points.', price: 150 },
      { id: 'ip', label: 'Dedicated IP', description: 'Players connect without a port.', price: 200 },
      { id: 'subdomain', label: 'Free subdomain', description: 'yourname.fortless.gg', price: 0 },
      { id: 'discord-sync', label: 'Discord status sync', description: 'Post online status to a Discord channel.', price: 0, planned: true },
    ],
    fields: [
      { key: 'name', label: 'Server name', type: 'text', default: 'My Minecraft server', required: true },
      { key: 'motd', label: 'Message of the day', type: 'text', default: 'A Fortless server', help: 'Shown in the server list.' },
      { key: 'maxPlayers', label: 'Max players', type: 'number', default: '20', min: 1, max: 250 },
      { key: 'difficulty', label: 'Difficulty', type: 'select', default: 'normal', options: opt('peaceful', 'easy', 'normal', 'hard') },
      { key: 'eula', label: 'I accept the Minecraft EULA', type: 'switch', default: 'false', required: true, help: 'Required by Mojang before a server can start.' },
    ],
  },
  cs16: {
    label: 'Counter-Strike 1.6', blurb: 'ReHLDS servers with AMX Mod X and FastDL.', icon: 'flag-01',
    engines: [{ id: 'rehlds', label: 'ReHLDS', description: 'Modern, patched engine. Recommended.', versions: ['3.14', '3.13'], recommended: true }, { id: 'hlds', label: 'HLDS (legacy)', description: 'Original Valve build.', versions: ['8308'] }],
    presets: [
      { id: 'public', label: 'Public deathmatch', description: 'Popular maps, quick rounds.', recommendedPlan: 'spark' },
      { id: 'competitive', label: 'Competitive', description: 'Match mode and fixed rules.', recommendedPlan: 'flame' },
      { id: 'zombie', label: 'Zombie plague', description: 'Mod pack with classes.', recommendedPlan: 'flame' },
      { id: 'gungame', label: 'GunGame', description: 'Progress through weapons.', recommendedPlan: 'spark' },
    ],
    addons: [
      { id: 'amxx', label: 'AMX Mod X pack', description: 'Admin base, map manager and basics.', price: 0 },
      { id: 'fastdl', label: 'FastDL hosting', description: 'Players download maps over HTTP.', price: 100 },
      { id: 'ip', label: 'Dedicated IP', description: 'Standard 27015 port.', price: 200 },
    ],
    fields: [
      { key: 'name', label: 'Server name', type: 'text', default: 'My CS 1.6 server', required: true },
      { key: 'map', label: 'Start map', type: 'select', default: 'de_dust2', options: opt('de_dust2', 'de_inferno', 'cs_italy', 'de_nuke') },
      { key: 'maxPlayers', label: 'Slots', type: 'number', default: '24', min: 2, max: 32 },
      { key: 'rcon', label: 'RCON password', type: 'secret', default: '', required: true, secret: true, help: 'Used to control the server. Never stored in your browser.' },
    ],
  },
  cs2: {
    label: 'Counter-Strike 2', blurb: 'Dedicated CS2 servers with a game server login token.', icon: 'flag-01',
    engines: [{ id: 'cs2', label: 'CS2 dedicated', description: 'Official Valve server.', versions: ['latest'], recommended: true }],
    presets: [
      { id: 'competitive', label: 'Competitive', description: '5v5 with warmup and knife round.', recommendedPlan: 'blaze' },
      { id: 'wingman', label: 'Wingman', description: '2v2 on small maps.', recommendedPlan: 'flame' },
      { id: 'casual', label: 'Casual', description: 'Relaxed rules and buy anywhere.', recommendedPlan: 'flame' },
    ],
    addons: [{ id: 'css', label: 'CounterStrikeSharp', description: 'Plugin framework for CS2.', price: 0 }, { id: 'ip', label: 'Dedicated IP', description: 'Standard port.', price: 200 }],
    fields: [
      { key: 'name', label: 'Server name', type: 'text', default: 'My CS2 server', required: true },
      { key: 'gslt', label: 'Game server login token', type: 'secret', default: '', required: true, secret: true, help: 'Create one at steamcommunity.com/dev/managegameservers. Never stored in your browser.' },
      { key: 'map', label: 'Start map', type: 'select', default: 'de_mirage', options: opt('de_mirage', 'de_inferno', 'de_ancient', 'de_anubis') },
    ],
  },
  'discord-bot': {
    label: 'Discord bot', blurb: 'Run your bot 24/7 from a Git repository.', icon: 'discord',
    engines: [{ id: 'nodejs', label: 'Node.js', description: 'discord.js and friends.', versions: ['22', '20'], recommended: true }, { id: 'python', label: 'Python', description: 'discord.py and friends.', versions: ['3.13', '3.12'] }],
    presets: [{ id: 'blank', label: 'Blank bot', description: 'Start from your own repository.', recommendedPlan: 'spark' }, { id: 'moderation', label: 'Moderation starter', description: 'Kick, ban and logs template.', recommendedPlan: 'spark' }, { id: 'music', label: 'Music starter', description: 'Needs more memory.', recommendedPlan: 'flame' }],
    addons: [{ id: 'backups', label: 'Daily backups', description: 'Keeps 7 days of restore points.', price: 150 }, { id: 'db', label: 'Database', description: 'A small MariaDB next to the bot.', price: 200 }],
    fields: [
      { key: 'name', label: 'Bot name', type: 'text', default: 'my-bot', required: true },
      { key: 'repo', label: 'Git repository', type: 'text', default: '', help: 'Public HTTPS URL. Leave empty to upload files later.' },
      { key: 'branch', label: 'Branch', type: 'text', default: 'main' },
      { key: 'token', label: 'Bot token', type: 'secret', default: '', required: true, secret: true, help: 'Stored encrypted. Never stored in your browser.' },
    ],
  },
  nodejs: {
    label: 'Node.js app', blurb: 'APIs and sites that start with one command.', icon: 'code',
    engines: [{ id: 'node', label: 'Node.js', description: 'LTS runtimes.', versions: ['22', '20'], recommended: true }],
    presets: [{ id: 'blank', label: 'Blank', description: 'Bring your own repository.', recommendedPlan: 'spark' }, { id: 'express', label: 'Express API', description: 'Minimal REST template.', recommendedPlan: 'spark' }, { id: 'next', label: 'Next.js', description: 'Build then start. Needs more RAM.', recommendedPlan: 'flame' }],
    addons: [{ id: 'db', label: 'Database', description: 'PostgreSQL next to the app.', price: 300 }, { id: 'domain', label: 'Custom domain', description: 'Point a domain you own.', price: 0 }, { id: 'backups', label: 'Daily backups', description: 'Keeps 7 days of restore points.', price: 150 }],
    fields: [
      { key: 'name', label: 'App name', type: 'text', default: 'my-app', required: true },
      { key: 'repo', label: 'Git repository', type: 'text', default: '' },
      { key: 'branch', label: 'Branch', type: 'text', default: 'main' },
      { key: 'build', label: 'Build command', type: 'text', default: 'pnpm install && pnpm build' },
      { key: 'start', label: 'Start command', type: 'text', default: 'pnpm start', required: true },
    ],
  },
  python: {
    label: 'Python app', blurb: 'Scripts, scrapers, bots and APIs.', icon: 'terminal',
    engines: [{ id: 'python', label: 'Python', description: 'CPython runtimes.', versions: ['3.13', '3.12'], recommended: true }],
    presets: [{ id: 'blank', label: 'Blank', description: 'Bring your own repository.', recommendedPlan: 'spark' }, { id: 'fastapi', label: 'FastAPI', description: 'API template.', recommendedPlan: 'spark' }],
    addons: [{ id: 'db', label: 'Database', description: 'PostgreSQL next to the app.', price: 300 }, { id: 'backups', label: 'Daily backups', description: 'Keeps 7 days of restore points.', price: 150 }],
    fields: [
      { key: 'name', label: 'App name', type: 'text', default: 'my-script', required: true },
      { key: 'repo', label: 'Git repository', type: 'text', default: '' },
      { key: 'build', label: 'Install command', type: 'text', default: 'pip install -r requirements.txt' },
      { key: 'start', label: 'Start command', type: 'text', default: 'python main.py', required: true },
    ],
  },
  database: {
    label: 'Database', blurb: 'Managed instances with backups and private access.', icon: 'database',
    engines: [{ id: 'postgres', label: 'PostgreSQL', description: 'Relational, extensible.', versions: ['17', '16'], recommended: true }, { id: 'mariadb', label: 'MariaDB', description: 'MySQL compatible.', versions: ['11.4', '10.11'] }, { id: 'redis', label: 'Redis', description: 'In-memory cache and queues.', versions: ['7.4'] }],
    presets: [{ id: 'dev', label: 'Development', description: 'Small, open to your IP only.', recommendedPlan: 'flame' }, { id: 'prod', label: 'Production', description: 'Backups on and private network.', recommendedPlan: 'blaze' }],
    addons: [{ id: 'backups', label: 'Daily backups', description: 'Keeps 14 days of restore points.', price: 150 }],
    fields: [
      { key: 'name', label: 'Database name', type: 'text', default: 'app-db', required: true },
      { key: 'user', label: 'Admin user', type: 'text', default: 'admin', required: true },
      { key: 'password', label: 'Admin password', type: 'secret', default: '', required: true, secret: true, help: 'At least 12 characters. Never stored in your browser.' },
    ],
  },
};
