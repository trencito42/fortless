import net from 'node:net';
import type Database from 'better-sqlite3';
import { generateId } from '../identity/auth.js';
import { normalizeServerPath } from './files.js';

/**
 * A game profile is data, not code: which eggs it applies to (by name), which config file the customer edits and
 * how its fields are validated, which Java image each game version needs, and where mods or plugins come from.
 * Staff manage profiles through the admin API, so adding a game never needs a deploy.
 */
export class ProfileError extends Error {
  constructor(message: string, public readonly code: string = 'INVALID_PROFILE', public readonly statusCode = 400) { super(message); this.name = 'ProfileError'; }
}

export type FieldType = 'bool' | 'int' | 'enum' | 'string';
export interface ConfigField {
  key: string; label: string; type: FieldType; group?: string; description?: string; default?: string;
  min?: number; max?: number; maxLength?: number; options?: Array<{ value: string; label: string }>;
}
export interface JavaRule { minGameVersion: string; image: string }
export interface InstallSource {
  provider: 'modrinth'; label: string; kind: string; dir: string;
  /** Modrinth facets with {gameVersion} replaced, for example [["project_type:plugin"],["categories:paper"],["versions:{gameVersion}"]] */
  facets: string[][]; loaders: string[]; downloadHosts: string[];
}
export interface GameProfile {
  id: string; slug: string; name: string; eggNames: string[]; configFile: string | null; configSchema: ConfigField[];
  gameVersionVariable: string | null; javaRules: JavaRule[]; installSources: InstallSource[]; iconFile: string | null; enabled: boolean;
}

const KEY = /^[A-Za-z0-9_.-]{1,64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
const VERSION = /^\d+(\.\d+){1,2}$/;
const IMAGE = /^[\w./:@-]{1,255}$/;
const HOST = /^[a-z0-9.-]{3,253}$/;
const text = (v: unknown, max: number, field: string): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || v.includes('\0')) throw new ProfileError(`Invalid ${field}.`);
  return v.trim();
};

export function validateProfile(input: unknown): Omit<GameProfile, 'id'> {
  if (!input || typeof input !== 'object') throw new ProfileError('A profile object is required.');
  const p = input as Record<string, unknown>;
  const slug = text(p['slug'], 40, 'slug');
  if (!SLUG.test(slug)) throw new ProfileError('Slug may use lowercase letters, numbers and dashes.');
  const eggNames = Array.isArray(p['eggNames']) ? (p['eggNames'] as unknown[]).map((n) => text(n, 100, 'egg name')) : [];
  if (!eggNames.length || eggNames.length > 20) throw new ProfileError('Provide 1 to 20 egg names.');

  const schemaIn = Array.isArray(p['configSchema']) ? (p['configSchema'] as unknown[]) : [];
  if (schemaIn.length > 100) throw new ProfileError('Too many config fields.');
  const seen = new Set<string>();
  const configSchema = schemaIn.map((f): ConfigField => {
    const o = (f ?? {}) as Record<string, unknown>;
    const key = text(o['key'], 64, 'field key');
    if (!KEY.test(key) || seen.has(key)) throw new ProfileError(`Invalid or duplicate field key "${key}".`);
    seen.add(key);
    const type = o['type'];
    if (type !== 'bool' && type !== 'int' && type !== 'enum' && type !== 'string') throw new ProfileError(`Unknown field type for "${key}".`);
    const field: ConfigField = { key, label: text(o['label'], 100, 'label'), type };
    if (o['group'] !== undefined) field.group = text(o['group'], 60, 'group');
    if (o['description'] !== undefined) field.description = text(o['description'], 300, 'description');
    if (o['default'] !== undefined) field.default = String(o['default']).slice(0, 500);
    if (type === 'int') {
      if (o['min'] !== undefined) field.min = Number(o['min']);
      if (o['max'] !== undefined) field.max = Number(o['max']);
      if ((field.min !== undefined && !Number.isFinite(field.min)) || (field.max !== undefined && !Number.isFinite(field.max))) throw new ProfileError(`Invalid range for "${key}".`);
    }
    if (type === 'string') field.maxLength = Math.min(Math.max(1, Number(o['maxLength'] ?? 200) || 200), 1000);
    if (type === 'enum') {
      const opts = Array.isArray(o['options']) ? (o['options'] as unknown[]) : [];
      if (!opts.length || opts.length > 50) throw new ProfileError(`Field "${key}" needs 1 to 50 options.`);
      field.options = opts.map((x) => { const q = (x ?? {}) as Record<string, unknown>; return { value: text(q['value'], 100, 'option value'), label: text(q['label'] ?? q['value'], 100, 'option label') }; });
    }
    return field;
  });

  const javaRules = (Array.isArray(p['javaRules']) ? (p['javaRules'] as unknown[]) : []).map((r): JavaRule => {
    const o = (r ?? {}) as Record<string, unknown>;
    const v = text(o['minGameVersion'], 20, 'game version');
    const image = text(o['image'], 255, 'image');
    if (!VERSION.test(v) || !IMAGE.test(image)) throw new ProfileError('Invalid Java rule.');
    return { minGameVersion: v, image };
  });

  const installSources = (Array.isArray(p['installSources']) ? (p['installSources'] as unknown[]) : []).map((r): InstallSource => {
    const o = (r ?? {}) as Record<string, unknown>;
    if (o['provider'] !== 'modrinth') throw new ProfileError('Only the modrinth provider is supported.');
    const facets = Array.isArray(o['facets']) ? (o['facets'] as unknown[]).map((g) => (Array.isArray(g) ? (g as unknown[]).map((x) => text(x, 100, 'facet')) : [])) : [];
    if (!facets.length || facets.length > 8 || facets.some((g) => !g.length)) throw new ProfileError('Invalid facets.');
    const hosts = (Array.isArray(o['downloadHosts']) ? (o['downloadHosts'] as unknown[]) : []).map((h) => text(h, 253, 'host').toLowerCase());
    if (!hosts.length || hosts.some((h) => !HOST.test(h))) throw new ProfileError('Provide the allowed download hosts.');
    // NEW-410: only public DNS names; IP literals, bare names and internal suffixes would point the installer inwards.
    const badHost = hosts.find((h) => net.isIP(h) !== 0 || !h.includes('.') || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h) || h.startsWith('.') || h.endsWith('.') || h.includes('..'));
    if (badHost) throw new ProfileError(`"${badHost}" is not an allowed download host. Use a public DNS name such as cdn.modrinth.com.`);
    return {
      provider: 'modrinth', label: text(o['label'], 60, 'label'), kind: text(o['kind'], 30, 'kind'),
      dir: normalizeServerPath(o['dir']), facets, loaders: (Array.isArray(o['loaders']) ? (o['loaders'] as unknown[]) : []).map((l) => text(l, 40, 'loader')), downloadHosts: hosts,
    };
  });

  const configFile = p['configFile'] === undefined || p['configFile'] === null ? null : normalizeServerPath(p['configFile']);
  const versionVar = p['gameVersionVariable'] === undefined || p['gameVersionVariable'] === null ? null : text(p['gameVersionVariable'], 100, 'version variable');
  const iconFile = p['iconFile'] === undefined || p['iconFile'] === null ? null : normalizeServerPath(p['iconFile']);
  return { slug, name: text(p['name'], 100, 'name'), eggNames, configFile, configSchema, gameVersionVariable: versionVar, javaRules, installSources, iconFile, enabled: p['enabled'] !== false };
}

const rowToProfile = (r: any): GameProfile => ({
  id: r.id, slug: r.slug, name: r.name, eggNames: JSON.parse(r.egg_names), configFile: r.config_file, configSchema: JSON.parse(r.config_schema),
  gameVersionVariable: r.game_version_variable, javaRules: JSON.parse(r.java_rules), installSources: JSON.parse(r.install_sources), iconFile: r.icon_file, enabled: Boolean(r.is_enabled),
});

export const listProfiles = (db: Database.Database): GameProfile[] => (db.prepare('SELECT * FROM game_profiles ORDER BY name').all() as any[]).map(rowToProfile);

export function saveProfile(db: Database.Database, input: unknown, id?: string): GameProfile {
  const v = validateProfile(input);
  const clash = db.prepare('SELECT id FROM game_profiles WHERE slug = ? AND id != ?').get(v.slug, id ?? '');
  if (clash) throw new ProfileError('That slug is already used.', 'SLUG_TAKEN', 409);
  const values = [v.slug, v.name, JSON.stringify(v.eggNames), v.configFile, JSON.stringify(v.configSchema), v.gameVersionVariable, JSON.stringify(v.javaRules), JSON.stringify(v.installSources), v.iconFile, v.enabled ? 1 : 0];
  if (id) {
    const r = db.prepare("UPDATE game_profiles SET slug=?, name=?, egg_names=?, config_file=?, config_schema=?, game_version_variable=?, java_rules=?, install_sources=?, icon_file=?, is_enabled=?, updated_at=datetime('now','utc') WHERE id = ?").run(...values, id);
    if (!r.changes) throw new ProfileError('Profile not found', 'NOT_FOUND', 404);
    return rowToProfile(db.prepare('SELECT * FROM game_profiles WHERE id = ?').get(id));
  }
  const newId = generateId('gpr');
  db.prepare('INSERT INTO game_profiles (slug, name, egg_names, config_file, config_schema, game_version_variable, java_rules, install_sources, icon_file, is_enabled, id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...values, newId);
  return rowToProfile(db.prepare('SELECT * FROM game_profiles WHERE id = ?').get(newId));
}

export function deleteProfile(db: Database.Database, id: string): void {
  if (!db.prepare('DELETE FROM game_profiles WHERE id = ?').run(id).changes) throw new ProfileError('Profile not found', 'NOT_FOUND', 404);
}

export function profileForEgg(db: Database.Database, eggName: string | null): GameProfile | null {
  if (!eggName) return null;
  const wanted = eggName.trim().toLowerCase();
  return listProfiles(db).find((p) => p.enabled && p.eggNames.some((n) => n.toLowerCase() === wanted)) ?? null;
}

// ---------- properties files ----------

/** Parses key=value lines, ignoring comments and blank lines. */
export function parseProperties(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) continue;
    const i = t.indexOf('=');
    if (i > 0) out.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return out;
}

/** Updates only the given keys. Comments, order and every other key are preserved; new keys are appended. */
export function applyProperties(content: string, changes: Record<string, string>): string {
  const pending = new Map(Object.entries(changes));
  const lines = content.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) return line;
    const i = t.indexOf('=');
    if (i <= 0) return line;
    const key = t.slice(0, i).trim();
    if (!pending.has(key)) return line;
    const v = pending.get(key)!;
    pending.delete(key);
    return `${key}=${v}`;
  });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [k, v] of pending) lines.push(`${k}=${v}`);
  return lines.join('\n') + '\n';
}

/** Validates customer input against the profile schema. Unknown keys and multi-line values are refused. */
export function validateConfigValues(schema: ConfigField[], values: unknown): Record<string, string> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new ProfileError('Values are required.');
  const out: Record<string, string> = {};
  const byKey = new Map(schema.map((f) => [f.key, f]));
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const f = byKey.get(key);
    if (!f) throw new ProfileError(`"${key}" is not a configurable setting.`);
    const v = typeof raw === 'boolean' ? String(raw) : typeof raw === 'number' ? String(raw) : raw;
    if (typeof v !== 'string' || /[\r\n\0]/.test(v)) throw new ProfileError(`Invalid value for ${f.label}.`);
    if (f.type === 'bool' && v !== 'true' && v !== 'false') throw new ProfileError(`${f.label} must be on or off.`);
    if (f.type === 'int') {
      const n = Number(v);
      if (!/^-?\d{1,12}$/.test(v) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw new ProfileError(`${f.label} must be a whole number${f.min !== undefined ? ` from ${f.min}` : ''}${f.max !== undefined ? ` to ${f.max}` : ''}.`);
    }
    if (f.type === 'enum' && !f.options!.some((o) => o.value === v)) throw new ProfileError(`Choose a valid option for ${f.label}.`);
    if (f.type === 'string' && v.length > (f.maxLength ?? 200)) throw new ProfileError(`${f.label} is too long.`);
    out[key] = v;
  }
  return out;
}

// ---------- java rules ----------

const parts = (v: string) => v.split('.').map((n) => Number(n) || 0);
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}

/** The image the highest matching rule asks for, or null when the version is unknown ("latest" or blank). */
export function recommendedImage(rules: JavaRule[], gameVersion: string | null): string | null {
  if (!gameVersion || !VERSION.test(gameVersion)) return null;
  const sorted = [...rules].sort((a, b) => compareVersions(b.minGameVersion, a.minGameVersion));
  return sorted.find((r) => compareVersions(gameVersion, r.minGameVersion) >= 0)?.image ?? null;
}

/** NEW-410: what changed between two versions of a profile, kept in the audit trail (hosts and folders in full). */
export function describeProfileChange(before: GameProfile | null, after: GameProfile): Record<string, unknown> {
  const fields: Array<keyof GameProfile> = ['name', 'eggNames', 'configFile', 'configSchema', 'gameVersionVariable', 'javaRules', 'installSources', 'iconFile', 'enabled'];
  const changed = before ? fields.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f])) : fields;
  const sources = (p: GameProfile | null) => (p?.installSources ?? []).map((i) => ({ label: i.label, dir: i.dir, downloadHosts: i.downloadHosts, loaders: i.loaders }));
  return { slug: after.slug, changed, installSources: { before: before ? sources(before) : null, after: sources(after) } };
}
