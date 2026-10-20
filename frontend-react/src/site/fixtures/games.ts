import { CATALOG } from '@/app/fixtures/catalog';
import type { IconName } from '@/design-system';

/**
 * One game page = one entry here. To add a game, copy `minecraft`, change the copy and point `workload` at a catalog entry.
 * Engines and presets are editorial copy about supported software. Plans and prices are never written here: the page reads them from the published catalog.
 */
export interface Game {
  slug: string; workload: keyof typeof CATALOG; name: string; icon: IconName;
  headline: [string, string]; lede: string;
  /** Short, concrete reasons. Each one must be true in the customer app. */
  reasons: { title: string; text: string; icon: IconName; tone: 'blue' | 'lime' | 'night' | 'paper' }[];
  address: string; consoleLines: [string, string][];
  faq: [string, string][];
}

export const GAMES: Game[] = [
  {
    slug: 'minecraft', workload: 'minecraft', name: 'Minecraft', icon: 'layers-01',
    headline: ['Your world,', 'always open.'], lede: 'Pick an engine, pick a starting point and your Minecraft server is running in minutes. Console, files and backups are one click away.',
    reasons: [
      { title: 'Start from a preset', text: 'Survival, creative, modded or blank. Each one suggests the plan that fits it.', icon: 'rocket-01', tone: 'blue' },
      { title: 'Plugins and mods', text: 'Paper, Purpur, Fabric, Forge or Vanilla, with the versions you actually run.', icon: 'package', tone: 'lime' },
      { title: 'Back up before you break it', text: 'Take a restore point, change anything, and roll back in one click.', icon: 'archive-01', tone: 'night' },
      { title: 'Friends join by name', text: 'A free subdomain comes with every server. Add a dedicated IP if you want to skip the port.', icon: 'globe-02', tone: 'paper' },
    ],
    address: 'yourname.fortless.gg',
    consoleLines: [['dim', 'Starting Paper 1.21.8'], ['dim', 'Loading world "survival"'], ['ok', 'Done (4.2s)! For help, type "help"'], ['', 'Ana joined the game']],
    faq: [
      ['Which Minecraft edition is this?', 'Java Edition servers: Paper, Purpur, Fabric, Forge and Vanilla.'],
      ['Can I install plugins or mods?', 'Yes. Upload them from the file manager. Paper and Purpur take plugins, Fabric and Forge take mods.'],
      ['Which plan should I pick?', 'Each preset suggests one. You can change plans later without starting over.'],
      ['Do I have to accept the EULA?', 'Yes. Mojang requires it before a server can start, so the checkout asks you to accept it.'],
      ['Can I move my existing world?', 'Yes. Upload the world folder in the file manager, then choose it in the server settings.'],
    ],
  },
];

export const gameBySlug = (s: string) => GAMES.find((g) => g.slug === s);
