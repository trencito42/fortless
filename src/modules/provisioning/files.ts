import crypto from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { validateSafeOutboundUrl } from '../../utils/ssrf.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import { ProviderNetworkError, type PanelFileEntry, type ProviderAdapter } from './adapter.js';
import { ConsoleAccessError, resolveOwnedService, withAccountClientKey } from './console.js';

export const MAX_EDIT_BYTES = 1024 * 1024;

/**
 * Normalises a customer-supplied path to an absolute POSIX path under "/".
 * Wings sandboxes the server root as well, this is the first line of defence and keeps the audit trail clean.
 */
export function normalizeServerPath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 1024 || input.includes('\0') || input.includes('\\')) {
    throw new ConsoleAccessError('Invalid path.', 'INVALID_PATH', 400);
  }
  const parts: string[] = [];
  for (const part of input.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new ConsoleAccessError('Invalid path.', 'INVALID_PATH', 400);
    parts.push(part);
  }
  return '/' + parts.join('/');
}

/** A single file or folder name (no separators). */
export function validateEntryName(input: unknown): string {
  if (typeof input !== 'string' || !input || input.length > 255 || /[\/\\\0]/.test(input) || input === '.' || input === '..') {
    throw new ConsoleAccessError('Invalid file name.', 'INVALID_NAME', 400);
  }
  return input;
}

interface Ctx { serviceId: string; accountId: string; userId: string; role?: string; ipAddress?: string }

function audit(db: Database.Database, ctx: Ctx, action: string, metadata: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', ?, 'service', ?, ?, ?, ?)
  `).run(`aud_${crypto.randomUUID()}`, ctx.accountId, ctx.userId, action, ctx.serviceId, ctx.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`, JSON.stringify(metadata));
}

async function run<T>(
  ctx: Ctx,
  need: string,
  adapterIn: ProviderAdapter | undefined,
  db: Database.Database,
  secret: string,
  fn: (a: import('./adapter.js').PterodactylHttpAdapter, externalId: string, key: string) => Promise<T>
): Promise<T> {
  const { service, adapter } = resolveOwnedService(ctx, adapterIn ?? getProviderAdapter(), db, secret, need);
  return withAccountClientKey(ctx.accountId, adapter, db, secret, (key) => fn(adapter, service.external_id, key));
}

/**
 * NEW-381: a timeout on a mutation is an unknown outcome. The change may have reached Wings, so it is reported as
 * pending (and audited as such) rather than as a failure that invites a blind retry.
 */
async function mutating(
  ctx: Ctx, db: Database.Database, action: string, metadata: Record<string, unknown>, work: () => Promise<void>
): Promise<{ pending: boolean }> {
  try {
    await work();
  } catch (err) {
    if (!(err instanceof ProviderNetworkError)) throw err;
    safeAudit(db, ctx, action, { ...metadata, pending: true });
    return { pending: true };
  }
  safeAudit(db, ctx, action, metadata);
  return { pending: false };
}

/** The audit row never turns a change that already happened into an error response. */
function safeAudit(db: Database.Database, ctx: Ctx, action: string, metadata: Record<string, unknown>): void {
  try { audit(db, ctx, action, metadata); } catch (err) { console.error('[Files] audit write failed for', action, (err as Error).message); }
}

export interface FilesDeps { adapter?: ProviderAdapter; db?: Database.Database; secret?: string }

export function createFilesApi(deps: FilesDeps = {}) {
  const db = () => deps.db ?? getDatabase();
  const secret = () => deps.secret ?? config.PTERODACTYL_KEYMINT_SECRET;

  return {
    async list(ctx: Ctx, dir: unknown): Promise<{ dir: string; entries: PanelFileEntry[] }> {
      const d = normalizeServerPath(dir);
      const entries = await run(ctx, 'file.read', deps.adapter, db(), secret(), (a, id, key) => a.listFiles(id, d, key));
      entries.sort((x, y) => Number(x.isFile) - Number(y.isFile) || x.name.localeCompare(y.name));
      return { dir: d, entries };
    },

    async read(ctx: Ctx, path: unknown): Promise<{ path: string; content: string }> {
      const p = normalizeServerPath(path);
      // NEW-382: the listed size decides before any content is downloaded, so a huge file is never buffered.
      const slash = p.lastIndexOf('/');
      const parent = slash <= 0 ? '/' : p.slice(0, slash);
      const base = p.slice(slash + 1);
      const siblings = await run(ctx, 'file.read-content', deps.adapter, db(), secret(), (a, id, key) => a.listFiles(id, parent, key));
      const listed = siblings.find((e) => e.name === base && e.isFile);
      if (listed && listed.size > MAX_EDIT_BYTES) {
        throw new ConsoleAccessError('File is too large to edit here. Download it instead.', 'FILE_TOO_LARGE', 413);
      }
      const content = await run(ctx, 'file.read-content', deps.adapter, db(), secret(), (a, id, key) => a.readFile(id, p, key));
      if (Buffer.byteLength(content, 'utf8') > MAX_EDIT_BYTES) {
        throw new ConsoleAccessError('File is too large to edit here. Download it instead.', 'FILE_TOO_LARGE', 413);
      }
      return { path: p, content };
    },

    async write(ctx: Ctx, path: unknown, content: unknown): Promise<{ pending: boolean }> {
      const p = normalizeServerPath(path);
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_EDIT_BYTES) {
        throw new ConsoleAccessError('File content is missing or larger than 1 MB.', 'FILE_TOO_LARGE', 413);
      }
      return mutating(ctx, db(), 'service.file.write', { path: p, bytes: Buffer.byteLength(content, 'utf8') },
        () => run(ctx, 'file.update', deps.adapter, db(), secret(), (a, id, key) => a.writeFile(id, p, content, key)));
      try {
        const { triggerAutoSyncOnFileEvent } = await import('../fastdl/service.js');
        triggerAutoSyncOnFileEvent(ctx.serviceId, ctx.accountId, p, db());
      } catch {
        // non-blocking
      }
    },

    async createFolder(ctx: Ctx, dir: unknown, name: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      const n = validateEntryName(name);
      return mutating(ctx, db(), 'service.file.mkdir', { path: `${d === '/' ? '' : d}/${n}` },
        () => run(ctx, 'file.create', deps.adapter, db(), secret(), (a, id, key) => a.createFolder(id, d, n, key)));
    },

    async remove(ctx: Ctx, dir: unknown, names: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      if (!Array.isArray(names) || names.length === 0 || names.length > 100) {
        throw new ConsoleAccessError('Provide between 1 and 100 names.', 'INVALID_NAME', 400);
      }
      const clean = names.map(validateEntryName);
      return mutating(ctx, db(), 'service.file.delete', { dir: d, names: clean },
        () => run(ctx, 'file.delete', deps.adapter, db(), secret(), (a, id, key) => a.deleteFiles(id, d, clean, key)));
      try {
        const { triggerAutoSyncOnFileEvent } = await import('../fastdl/service.js');
        triggerAutoSyncOnFileEvent(ctx.serviceId, ctx.accountId, `${d}/deleted`, db());
      } catch {
        // non-blocking
      }
    },

    async rename(ctx: Ctx, dir: unknown, from: unknown, to: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      const f = validateEntryName(from);
      const t = validateEntryName(to);
      return mutating(ctx, db(), 'service.file.rename', { dir: d, from: f, to: t },
        () => run(ctx, 'file.update', deps.adapter, db(), secret(), (a, id, key) => a.renameFile(id, d, f, t, key)));
    },

    /** A timeout is an unknown outcome: Wings may still finish, so it is reported as pending, never as a failure. */
    async archive(ctx: Ctx, dir: unknown, names: unknown): Promise<{ archive: string | null; pending: boolean }> {
      const d = normalizeServerPath(dir);
      if (!Array.isArray(names) || names.length === 0 || names.length > 100) {
        throw new ConsoleAccessError('Provide between 1 and 100 names.', 'INVALID_NAME', 400);
      }
      const clean = names.map(validateEntryName);
      try {
        const archive = await run(ctx, 'file.archive', deps.adapter, db(), secret(), (a, id, key) => a.compressFiles(id, d, clean, key));
        audit(db(), ctx, 'service.file.archive', { dir: d, names: clean, archive });
        return { archive, pending: false };
      } catch (err) {
        if (!(err instanceof ProviderNetworkError)) throw err;
        audit(db(), ctx, 'service.file.archive', { dir: d, names: clean, pending: true });
        return { archive: null, pending: true };
      }
    },

    async unarchive(ctx: Ctx, dir: unknown, file: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      const f = validateEntryName(file);
      try {
        await run(ctx, 'file.archive', deps.adapter, db(), secret(), (a, id, key) => a.decompressFile(id, d, f, key));
        audit(db(), ctx, 'service.file.unarchive', { dir: d, file: f });
        return { pending: false };
      } catch (err) {
        if (!(err instanceof ProviderNetworkError)) throw err;
        audit(db(), ctx, 'service.file.unarchive', { dir: d, file: f, pending: true });
        return { pending: true };
      }
    },

    async copy(ctx: Ctx, path: unknown): Promise<{ pending: boolean }> {
      const p = normalizeServerPath(path);
      if (p === '/') throw new ConsoleAccessError('Invalid path.', 'INVALID_PATH', 400);
      return mutating(ctx, db(), 'service.file.copy', { path: p },
        () => run(ctx, 'file.create', deps.adapter, db(), secret(), (a, id, key) => a.copyFile(id, p, key)));
    },

    /** Moves an entry to another folder. Wings resolves the relative target and keeps it inside the server root. */
    async move(ctx: Ctx, dir: unknown, name: unknown, destDir: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      const n = validateEntryName(name);
      const dest = normalizeServerPath(destDir);
      const rel = path.posix.relative(d, dest);
      if (rel === '') throw new ConsoleAccessError('The file is already in that folder.', 'SAME_FOLDER', 400);
      if (dest === d + '/' + n || dest.startsWith((d === '/' ? '' : d) + '/' + n + '/')) throw new ConsoleAccessError('A folder cannot be moved into itself.', 'INVALID_PATH', 400);
      return mutating(ctx, db(), 'service.file.move', { dir: d, name: n, to: dest },
        () => run(ctx, 'file.update', deps.adapter, db(), secret(), (a, id, key) => a.renameFile(id, d, n, `${rel}/${n}`, key)));
    },

    async chmod(ctx: Ctx, dir: unknown, names: unknown, mode: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      if (!Array.isArray(names) || names.length === 0 || names.length > 100) throw new ConsoleAccessError('Provide between 1 and 100 names.', 'INVALID_NAME', 400);
      if (typeof mode !== 'string' || !/^[0-7]{3,4}$/.test(mode)) throw new ConsoleAccessError('Permissions must be an octal mode such as 644.', 'INVALID_MODE', 400);
      const clean = names.map(validateEntryName);
      return mutating(ctx, db(), 'service.file.chmod', { dir: d, names: clean, mode },
        () => run(ctx, 'file.update', deps.adapter, db(), secret(), (a, id, key) => a.chmodFiles(id, d, clean, mode, key)));
    },

    /** The node downloads the file. The address must be public https, and a timeout is reported as pending. */
    async pull(ctx: Ctx, dir: unknown, urlInput: unknown, filename: unknown): Promise<{ pending: boolean }> {
      const d = normalizeServerPath(dir);
      if (typeof urlInput !== 'string' || urlInput.length > 2048) throw new ConsoleAccessError('Enter a valid https address.', 'INVALID_URL', 400);
      let url: URL;
      try { url = new URL(urlInput); } catch { throw new ConsoleAccessError('Enter a valid https address.', 'INVALID_URL', 400); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new ConsoleAccessError('Only public https addresses without credentials are allowed.', 'INVALID_URL', 400);
      try { await validateSafeOutboundUrl(url.toString()); } catch { throw new ConsoleAccessError('That address is not allowed.', 'INVALID_URL', 400); }
      const name = filename === undefined || filename === '' ? undefined : validateEntryName(filename);
      try {
        await run(ctx, 'file.create', deps.adapter, db(), secret(), (a, id, key) => a.pullFile(id, d, url.toString(), name, key));
        audit(db(), ctx, 'service.file.pull', { dir: d, host: url.hostname, name: name ?? null });
        try {
          const { triggerAutoSyncOnFileEvent } = await import('../fastdl/service.js');
          triggerAutoSyncOnFileEvent(ctx.serviceId, ctx.accountId, `${d}/${name || 'pulled'}`, db());
        } catch {
          // non-blocking
        }
        return { pending: false };
      } catch (err) {
        if (!(err instanceof ProviderNetworkError)) throw err;
        audit(db(), ctx, 'service.file.pull', { dir: d, host: url.hostname, name: name ?? null, pending: true });
        return { pending: true };
      }
    },

    async signedUrl(ctx: Ctx, kind: 'upload' | 'download', pathOrDir: unknown): Promise<string> {
      const p = normalizeServerPath(pathOrDir);
      const url = await run(ctx, kind === 'upload' ? 'file.create' : 'file.read-content', deps.adapter, db(), secret(), (a, id, key) => a.signedFileUrl(id, kind, p, key));
      audit(db(), ctx, `service.file.${kind}_url`, { path: p });
      return url;
    },
  };
}
