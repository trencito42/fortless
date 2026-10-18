import crypto from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import type { PterodactylHttpAdapter, ProviderAdapter } from './adapter.js';
import { ConsoleAccessError, resolveOwnedService } from './console.js';
import { createFilesApi } from './files.js';
import {
  applyProperties, parseProperties, profileForEgg, recommendedImage, validateConfigValues, ProfileError, type GameProfile, type InstallSource,
} from './game-profiles.js';
import { createServerPanelApi } from './server-panel.js';
import { executeServicePowerAction } from './services.js';

interface Ctx { serviceId: string; accountId: string; userId: string; role?: string; ipAddress?: string }
export interface GameToolsDeps { adapter?: ProviderAdapter; db?: Database.Database; secret?: string; fetchFn?: typeof fetch }

const MAX_MOD_BYTES = 100 * 1024 * 1024;
const MAX_ICON_BYTES = 100 * 1024;
const PROJECT_ID = /^[A-Za-z0-9]{8}$/;
const VERSION_ID = /^[A-Za-z0-9]{8}$/;
const JAR = /^[\w. +()\[\]-]{1,150}\.jar$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EGG_CACHE_MS = 10 * 60 * 1000;
const eggCache = new Map<string, { name: string | null; at: number }>();

const fail = (message: string, code: string, status = 400) => new ConsoleAccessError(message, code, status);
const guard = <T>(fn: () => T): T => { try { return fn(); } catch (e) { if (e instanceof ProfileError) throw fail(e.message, e.code, e.statusCode); throw e; } };

export function createGameTools(deps: GameToolsDeps = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;
  const doFetch = () => deps.fetchFn ?? fetch;
  const files = createFilesApi(deps);
  const panel = createServerPanelApi(deps);
  const userAgent = () => config.MODRINTH_USER_AGENT || `fortless-platform (${config.APP_ORIGIN})`;

  /** Resolves the service, checks access, and finds the profile through the panel's egg name (cached briefly). */
  async function context(ctx: Ctx, need: string): Promise<{ profile: GameProfile | null; adapter: PterodactylHttpAdapter; externalId: string }> {
    const { service, adapter } = resolveOwnedService(ctx, deps.adapter ?? getProviderAdapter(), db(), secret(), need);
    const cached = eggCache.get(service.external_id);
    let name: string | null;
    if (cached && Date.now() - cached.at < EGG_CACHE_MS) name = cached.name;
    else { name = await adapter.getServerEggName(service.external_id); eggCache.set(service.external_id, { name, at: Date.now() }); }
    return { profile: profileForEgg(db(), name), adapter, externalId: service.external_id };
  }

  const optional = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { return null; } };

  async function gameVersion(ctx: Ctx, profile: GameProfile): Promise<{ version: string | null; images: string[] }> {
    if (!profile.gameVersionVariable) return { version: null, images: [] };
    const st = await optional(() => panel.startup(ctx));
    const v = st?.variables.find((x: { key: string }) => x.key === profile.gameVersionVariable)?.value ?? null;
    let version = v && v !== 'latest' ? v : null;
    // "latest" hides the real version; Paper records it in version_history.json once the server has run.
    if (!version) {
      const history = await optional(() => files.read(ctx, '/version_history.json'));
      version = history?.content.match(/MC:\s*(\d+\.\d+(?:\.\d+)?)/)?.[1] ?? null;
    }
    return { version, images: st ? Object.values(st.images) : [] };
  }

  const source = (profile: GameProfile, index: unknown): InstallSource => {
    const s = profile.installSources[Number(index)];
    if (!Number.isInteger(Number(index)) || !s) throw fail('Unknown source.', 'INVALID_SOURCE');
    return s;
  };

  const facetsFor = (src: InstallSource, version: string | null): string[][] =>
    src.facets.map((g) => g.map((f) => f.replace('{gameVersion}', version ?? ''))).filter((g) => version !== null || !g.some((f) => f.endsWith(':')));

  async function getJson(url: string): Promise<any> {
    const res = await doFetch()(url, { headers: { 'User-Agent': userAgent(), Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw fail('The mod catalog is temporarily unavailable.', 'PROVIDER_ERROR', 502);
    return res.json();
  }

  return {
    async info(ctx: Ctx) {
      const { profile } = await context(ctx, 'file.read');
      if (!profile) return { profile: null };
      let values: Record<string, string> = {};
      let configExists = false;
      if (profile.configFile) {
        try {
          const f = await files.read(ctx, profile.configFile);
          values = Object.fromEntries(parseProperties(f.content));
          configExists = true;
        } catch (e) { if (e instanceof ConsoleAccessError || (e as { statusCode?: number }).statusCode !== 404) throw e; }
      }
      const { version, images } = await gameVersion(ctx, profile);
      const settings = await optional(() => panel.settings(ctx));
      const recommended = recommendedImage(profile.javaRules, version);
      let eula: 'required' | 'accepted' | 'unavailable' = 'unavailable';
      if (profile.slug === 'minecraft-java') {
        const agreement = await optional(() => files.read(ctx, '/eula.txt'));
        if (agreement) eula = /^\s*eula\s*=\s*true\s*$/im.test(agreement.content) ? 'accepted' : /^\s*eula\s*=\s*false\s*$/im.test(agreement.content) ? 'required' : 'unavailable';
      }
      return {
        profile: {
          slug: profile.slug, name: profile.name, configFile: profile.configFile, configExists, schema: profile.configSchema,
          sources: profile.installSources.map((s, i) => ({ index: i, label: s.label, kind: s.kind, dir: s.dir })), icon: Boolean(profile.iconFile),
        },
        values,
        eula,
        java: { gameVersion: version, recommended, current: settings?.image ?? null, matches: recommended ? recommended === (settings?.image ?? null) : null, available: images },
      };
    },

    async acceptEula(ctx: Ctx) {
      const { profile } = await context(ctx, 'control.restart');
      if (profile?.slug !== 'minecraft-java') throw fail('This server does not require the Minecraft EULA.', 'EULA_NOT_APPLICABLE', 404);
      const agreement = await files.read(ctx, '/eula.txt');
      if (!/^\s*eula\s*=\s*false\s*$/im.test(agreement.content)) throw fail('The Minecraft EULA is not awaiting approval.', 'EULA_NOT_REQUIRED', 409);
      const updated = agreement.content.replace(/^(\s*eula\s*=\s*)false(\s*)$/im, '$1true$2');
      await files.write(ctx, '/eula.txt', updated);
      db().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, ?, ?, 'USER', 'service.game.eula_accepted', 'service', ?, ?, ?, '{}')
      `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`);
      await executeServicePowerAction({ serviceId: ctx.serviceId, accountId: ctx.accountId, userId: ctx.userId, role: ctx.role, action: 'RESTART', ipAddress: ctx.ipAddress }, deps.adapter ?? getProviderAdapter(), db());
      return { accepted: true, restarted: true };
    },

    async saveConfig(ctx: Ctx, input: unknown) {
      const { profile } = await context(ctx, 'file.update');
      if (!profile?.configFile) throw fail('This server has no editable game settings.', 'NO_PROFILE', 404);
      const values = guard(() => validateConfigValues(profile.configSchema, (input as { values?: unknown } | null)?.values));
      if (!Object.keys(values).length) return;
      let current = '';
      try { current = (await files.read(ctx, profile.configFile)).content; } catch (e) { if ((e as { statusCode?: number }).statusCode !== 404) throw e; }
      await files.write(ctx, profile.configFile, applyProperties(current, values));
    },

    async searchMods(ctx: Ctx, input: { source: unknown; q: unknown; page: unknown }) {
      const { profile } = await context(ctx, 'file.read');
      if (!profile) throw fail('No game tools for this server.', 'NO_PROFILE', 404);
      const src = source(profile, input.source);
      const { version } = await gameVersion(ctx, profile);
      const q = typeof input.q === 'string' ? input.q.trim().slice(0, 80) : '';
      const page = Math.min(Math.max(0, Math.floor(Number(input.page)) || 0), 200);
      const url = new URL(`${config.MODRINTH_API_URL}/search`);
      url.searchParams.set('query', q);
      url.searchParams.set('limit', '12');
      url.searchParams.set('offset', String(page * 12));
      url.searchParams.set('facets', JSON.stringify(facetsFor(src, version)));
      const res = await getJson(url.toString());
      return {
        gameVersion: version,
        hits: (res.hits ?? []).map((h: any) => ({
          projectId: String(h.project_id), slug: String(h.slug), title: String(h.title), description: String(h.description ?? '').slice(0, 300), author: String(h.author ?? ''),
          downloads: Number(h.downloads ?? 0), iconUrl: typeof h.icon_url === 'string' && h.icon_url.startsWith('https://') ? h.icon_url : null,
        })),
        total: Number(res.total_hits ?? 0), page,
      };
    },

    /**
     * The jar is downloaded by Fortless, checked against the SHA-512 the catalog published, and only then handed to
     * the server through a signed upload. A file that does not match is never written.
     */
    async installMod(ctx: Ctx, input: { source: unknown; projectId: unknown; versionId?: unknown }) {
      const { profile } = await context(ctx, 'file.create');
      if (!profile) throw fail('No game tools for this server.', 'NO_PROFILE', 404);
      const src = source(profile, input.source);
      if (typeof input.projectId !== 'string' || !PROJECT_ID.test(input.projectId)) throw fail('Invalid project.', 'INVALID_PROJECT');
      if (input.versionId !== undefined && input.versionId !== '' && (typeof input.versionId !== 'string' || !VERSION_ID.test(input.versionId))) throw fail('Invalid version.', 'INVALID_VERSION');
      const { version } = await gameVersion(ctx, profile);

      const vurl = new URL(`${config.MODRINTH_API_URL}/project/${input.projectId}/version`);
      if (src.loaders.length) vurl.searchParams.set('loaders', JSON.stringify(src.loaders));
      if (version) vurl.searchParams.set('game_versions', JSON.stringify([version]));
      const versions = await getJson(vurl.toString());
      const chosen = input.versionId ? (versions as any[]).find((v) => v.id === input.versionId) : (versions as any[])[0];
      if (!chosen) throw fail(version ? `No release of this project supports ${version}.` : 'No compatible release was found.', 'NO_COMPATIBLE_VERSION', 404);
      const file = (chosen.files as any[]).find((f) => f.primary) ?? chosen.files[0];
      const sha512 = String(file?.hashes?.sha512 ?? '').toLowerCase();
      const filename = String(file?.filename ?? '');
      if (!file || !/^[0-9a-f]{128}$/.test(sha512) || !JAR.test(filename)) throw fail('This release has no installable jar.', 'NO_INSTALLABLE_FILE', 422);
      if (Number(file.size) > MAX_MOD_BYTES) throw fail('This file is too large to install.', 'FILE_TOO_LARGE', 413);

      let download: URL;
      try { download = new URL(String(file.url)); } catch { throw fail('The catalog returned an invalid address.', 'PROVIDER_ERROR', 502); }
      const allowed = (u: URL) => u.protocol === 'https:' && src.downloadHosts.includes(u.hostname.toLowerCase());
      if (!allowed(download)) throw fail('The download address is not on the allowed list.', 'DOWNLOAD_NOT_ALLOWED', 422);

      const res = await doFetch()(download.toString(), { headers: { 'User-Agent': userAgent() }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!res.ok || !res.body || !allowed(new URL(res.url || download.toString()))) throw fail('The file could not be downloaded.', 'DOWNLOAD_FAILED', 502);
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.byteLength;
        if (total > MAX_MOD_BYTES) throw fail('This file is too large to install.', 'FILE_TOO_LARGE', 413);
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      if (crypto.createHash('sha512').update(buffer).digest('hex') !== sha512) throw fail('The downloaded file did not match its published checksum, so it was not installed.', 'HASH_MISMATCH', 422);

      const url = await files.signedUrl(ctx, 'upload', src.dir);
      const form = new FormData();
      form.append('files', new Blob([buffer]), filename);
      const up = await doFetch()(`${url}&directory=${encodeURIComponent(src.dir)}`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
      if (!up.ok) throw fail('The server did not accept the file.', 'UPLOAD_FAILED', 502);
      db().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, (SELECT account_id FROM services WHERE id = ?), ?, 'USER', 'service.mod.install', 'service', ?, ?, ?, ?)
      `).run(`aud_${crypto.randomUUID()}`, ctx.serviceId, ctx.userId, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`,
        JSON.stringify({ provider: src.provider, projectId: input.projectId, versionId: chosen.id, file: filename, sha512: sha512.slice(0, 16), dir: src.dir }));
      return { file: filename, dir: src.dir, version: String(chosen.version_number ?? '') };
    },

    async installed(ctx: Ctx, sourceIndex: unknown) {
      const { profile } = await context(ctx, 'file.read');
      if (!profile) throw fail('No game tools for this server.', 'NO_PROFILE', 404);
      const src = source(profile, sourceIndex);
      let entries: Array<{ name: string; isFile: boolean; size: number; modifiedAt: string }> = [];
      try { entries = (await files.list(ctx, src.dir)).entries; } catch (e) { if ((e as { statusCode?: number }).statusCode !== 404) throw e; }
      return { dir: src.dir, files: entries.filter((e) => e.isFile && e.name.toLowerCase().endsWith('.jar')).map((e) => ({ name: e.name, size: e.size, modifiedAt: e.modifiedAt })) };
    },

    /** The icon must be a real 64x64 PNG; it is checked here, not trusted from the browser. */
    async setIcon(ctx: Ctx, input: { png?: unknown }) {
      const { profile } = await context(ctx, 'file.create');
      if (!profile?.iconFile) throw fail('This server has no icon support.', 'NO_PROFILE', 404);
      if (typeof input.png !== 'string' || input.png.length > MAX_ICON_BYTES * 2 || !/^[A-Za-z0-9+/=]+$/.test(input.png)) throw fail('Choose a PNG image.', 'INVALID_ICON');
      const buf = Buffer.from(input.png, 'base64');
      if (buf.length < 33 || buf.length > MAX_ICON_BYTES || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString('ascii', 12, 16) !== 'IHDR') throw fail('The icon must be a PNG image under 100 KB.', 'INVALID_ICON');
      if (buf.readUInt32BE(16) !== 64 || buf.readUInt32BE(20) !== 64) throw fail('The icon must be exactly 64 by 64 pixels.', 'INVALID_ICON');
      const dir = path.posix.dirname(profile.iconFile);
      const url = await files.signedUrl(ctx, 'upload', dir);
      const form = new FormData();
      form.append('files', new Blob([buf], { type: 'image/png' }), path.posix.basename(profile.iconFile));
      const up = await doFetch()(`${url}&directory=${encodeURIComponent(dir)}`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
      if (!up.ok) throw fail('The server did not accept the icon.', 'UPLOAD_FAILED', 502);
      db().prepare(`
        INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
        VALUES (?, (SELECT account_id FROM services WHERE id = ?), ?, 'USER', 'service.game.icon', 'service', ?, ?, ?, '{}')
      `).run(`aud_${crypto.randomUUID()}`, ctx.serviceId, ctx.userId, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`);
    },
  };
}
export const clearEggCache = () => eggCache.clear();
