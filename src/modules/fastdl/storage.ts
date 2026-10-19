import fs from 'node:fs';
import path from 'node:path';

export function mimeForAsset(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.bz2': return 'application/x-bzip2';
    case '.bsp': return 'application/octet-stream';
    case '.mdl': return 'application/octet-stream';
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.spr': return 'application/octet-stream';
    case '.wad': return 'application/octet-stream';
    case '.tga': return 'image/x-tga';
    case '.bmp': return 'image/bmp';
    case '.png': return 'image/png';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.vmt': return 'text/plain; charset=utf-8';
    case '.vtf': return 'image/vnd.valve.source.texture';
    case '.pcf': return 'application/octet-stream';
    case '.iwd':
    case '.pk3': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

export class FastDlStorageError extends Error {
  constructor(message: string, public readonly code = 'STORAGE_ERROR', public readonly statusCode = 500) {
    super(message);
    this.name = 'FastDlStorageError';
  }
}

export class FastDlSecurityError extends FastDlStorageError {
  constructor(message: string) {
    super(message, 'SECURITY_VIOLATION', 400);
    this.name = 'FastDlSecurityError';
  }
}

export class FastDlQuotaExceededError extends FastDlStorageError {
  constructor(quotaBytes: number, attemptedBytes: number) {
    super(
      `FastDL storage quota of ${(quotaBytes / (1024 * 1024)).toFixed(1)} MB exceeded (attempted ${((attemptedBytes) / (1024 * 1024)).toFixed(1)} MB).`,
      'QUOTA_EXCEEDED',
      413
    );
    this.name = 'FastDlQuotaExceededError';
  }
}

export interface FastDlStorageBackend {
  write(serviceId: string, relPath: string, data: Buffer, quotaBytes: number): Promise<{ size: number; path: string }>;
  read(serviceId: string, relPath: string): Promise<{ data: Buffer; size: number; mime: string; mtime: Date } | null>;
  delete(serviceId: string, relPath: string): Promise<boolean>;
  deleteServerStorage(serviceId: string): Promise<void>;
  getTotalUsage(serviceId: string): Promise<number>;
  stat(serviceId: string, relPath: string): Promise<{ size: number; mtime: Date } | null>;
  resolveDiskPath(serviceId: string, relPath: string): string;
}

/**
 * Validates and sanitizes paths strictly within the isolated server directory.
 * Prevents traversal attacks, null bytes, backslashes and symlink escapes.
 */
export function sanitizeRelPath(relPath: unknown): string {
  if (typeof relPath !== 'string' || !relPath.trim() || relPath.length > 1024 || relPath.includes('\0')) {
    throw new FastDlSecurityError('Invalid file path.');
  }
  const cleanParts: string[] = [];
  const normalized = relPath.replace(/\\/g, '/');
  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new FastDlSecurityError('Directory traversal is prohibited.');
    cleanParts.push(part);
  }
  if (!cleanParts.length) throw new FastDlSecurityError('Empty file path.');
  return cleanParts.join('/');
}

export function validateServiceIdentifier(serviceId: unknown): string {
  if (typeof serviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(serviceId)) {
    throw new FastDlSecurityError('Invalid service identifier.');
  }
  return serviceId;
}

export class LocalFastDlStorage implements FastDlStorageBackend {
  private baseDir: string;

  constructor(baseDir = './data/fastdl') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  resolveDiskPath(serviceId: string, relPath: string): string {
    const safeSvc = validateServiceIdentifier(serviceId);
    const safeRel = sanitizeRelPath(relPath);
    const serviceRoot = path.resolve(this.baseDir, safeSvc);
    const target = path.resolve(serviceRoot, safeRel);
    if (!target.startsWith(serviceRoot + path.sep) && target !== serviceRoot) {
      throw new FastDlSecurityError('Path escapes service storage root.');
    }
    return target;
  }

  private getServerRoot(serviceId: string): string {
    const safeSvc = validateServiceIdentifier(serviceId);
    return path.resolve(this.baseDir, safeSvc);
  }

  async getTotalUsage(serviceId: string): Promise<number> {
    const root = this.getServerRoot(serviceId);
    if (!fs.existsSync(root)) return 0;

    let total = 0;
    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isSymbolicLink()) continue; // Do not follow symlinks for quota
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const stat = fs.statSync(full);
            total += stat.size;
          }
        }
      } catch {
        // ignore deleted during walk
      }
    };

    walk(root);
    return total;
  }

  async stat(serviceId: string, relPath: string): Promise<{ size: number; mtime: Date } | null> {
    const target = this.resolveDiskPath(serviceId, relPath);
    try {
      if (!fs.existsSync(target)) return null;
      const stat = fs.statSync(target);
      if (!stat.isFile()) return null;
      return { size: stat.size, mtime: stat.mtime };
    } catch {
      return null;
    }
  }

  async write(serviceId: string, relPath: string, data: Buffer, quotaBytes: number): Promise<{ size: number; path: string }> {
    const target = this.resolveDiskPath(serviceId, relPath);
    const currentUsage = await this.getTotalUsage(serviceId);
    const existingStat = await this.stat(serviceId, relPath);
    const existingSize = existingStat?.size ?? 0;
    const projectedUsage = currentUsage - existingSize + data.length;

    if (quotaBytes > 0 && projectedUsage > quotaBytes) {
      throw new FastDlQuotaExceededError(quotaBytes, projectedUsage);
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    return { size: data.length, path: target };
  }

  async read(serviceId: string, relPath: string): Promise<{ data: Buffer; size: number; mime: string; mtime: Date } | null> {
    const target = this.resolveDiskPath(serviceId, relPath);
    if (!fs.existsSync(target)) return null;
    try {
      const stat = fs.statSync(target);
      if (!stat.isFile()) return null;
      const data = fs.readFileSync(target);
      const mimeType = mimeForAsset(target);
      return { data, size: stat.size, mime: mimeType, mtime: stat.mtime };
    } catch {
      return null;
    }
  }

  async delete(serviceId: string, relPath: string): Promise<boolean> {
    const target = this.resolveDiskPath(serviceId, relPath);
    if (!fs.existsSync(target)) return false;
    try {
      fs.unlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  async deleteServerStorage(serviceId: string): Promise<void> {
    const root = this.getServerRoot(serviceId);
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

let defaultStorage: FastDlStorageBackend | null = null;

export function getFastDlStorage(customPath?: string): FastDlStorageBackend {
  if (!defaultStorage || customPath) {
    defaultStorage = new LocalFastDlStorage(customPath || './data/fastdl');
  }
  return defaultStorage;
}
