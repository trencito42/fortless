import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { config } from '../../config/index.js';
import { getDatabase } from '../../database/index.js';
import { getProviderAdapter } from '../outbox/worker.js';
import {
  PterodactylHttpAdapter,
  ProviderAuthenticationError,
  type ProviderAdapter,
} from './adapter.js';
import { ensureAccountPanelAccess } from './panel-link.js';
import { allows, getServiceAccess, type ServiceAccess } from './service-access.js';

export class ConsoleAccessError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ConsoleAccessError';
  }
}

function keyEncryptionKey(): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(config.SESSION_SECRET), Buffer.from('fortless-panel-key-v1'), Buffer.from('client-api-key'), 32)
  );
}

export function encryptClientKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyEncryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptClientKey(value: string): string {
  const [version, iv, tag, ct] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Stored panel key is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyEncryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

async function mintAndStore(accountId: string, adapter: PterodactylHttpAdapter, db: Database.Database, secret: string): Promise<string> {
  await ensureAccountPanelAccess(accountId, adapter, db);
  const link = db.prepare("SELECT correlation_tag FROM panel_users WHERE account_id = ? AND provider_type = 'PTERODACTYL'")
    .get(accountId) as { correlation_tag: string } | undefined;
  if (!link) throw new ConsoleAccessError('This account has no panel user yet.', 'PANEL_USER_MISSING', 409);

  const key = await adapter.mintAccountClientKey(link.correlation_tag, secret);
  db.prepare(`
    INSERT INTO panel_client_keys (account_id, encrypted_key) VALUES (?, ?)
    ON CONFLICT(account_id) DO UPDATE SET encrypted_key = excluded.encrypted_key, created_at = datetime('now', 'utc')
  `).run(accountId, encryptClientKey(key));
  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_type, action, resource_type, resource_id, correlation_id, metadata)
    VALUES (?, ?, 'SYSTEM', 'panel_client_key.minted', 'account', ?, ?, '{}')
  `).run(`aud_${crypto.randomUUID()}`, accountId, accountId, `corr_${crypto.randomUUID()}`);
  return key;
}

/**
 * Runs `fn` with the account's own panel key (minted on demand, stored encrypted). A revoked or
 * rotated key (provider 401) triggers exactly one re-mint and one retry.
 */
export async function withAccountClientKey<T>(
  accountId: string,
  adapter: PterodactylHttpAdapter,
  db: Database.Database,
  secret: string,
  fn: (key: string) => Promise<T>
): Promise<T> {
  const stored = db.prepare('SELECT encrypted_key FROM panel_client_keys WHERE account_id = ?')
    .get(accountId) as { encrypted_key: string } | undefined;
  let key: string;
  let fresh = false;
  if (stored) {
    try { key = decryptClientKey(stored.encrypted_key); }
    catch { key = await mintAndStore(accountId, adapter, db, secret); fresh = true; }
  } else {
    key = await mintAndStore(accountId, adapter, db, secret);
    fresh = true;
  }
  try {
    return await fn(key);
  } catch (err) {
    if (err instanceof ProviderAuthenticationError && !fresh) {
      return fn(await mintAndStore(accountId, adapter, db, secret));
    }
    throw err;
  }
}

/**
 * Shared gate for every customer action that reaches the panel: the service must belong to the account,
 * be ACTIVE and provisioned, and the provider must support per-account keys.
 */
export function resolveOwnedService(
  params: { serviceId: string; accountId: string; userId: string; role?: string },
  adapter: ProviderAdapter,
  db: Database.Database,
  keymintSecret: string,
  need?: string
): { service: { id: string; account_id: string; external_id: string }; adapter: PterodactylHttpAdapter; access: ServiceAccess } {
  const access = getServiceAccess(db, params);
  if (!access) throw new ConsoleAccessError('Service not found', 'NOT_FOUND', 404);
  if (need && !allows(access, need)) throw new ConsoleAccessError('You do not have permission to do this.', 'FORBIDDEN', 403);
  const service = access.service;
  if (!(adapter instanceof PterodactylHttpAdapter)) {
    throw new ConsoleAccessError('Console is not available for this provider.', 'CONSOLE_UNSUPPORTED', 501);
  }
  if (!keymintSecret) {
    throw new ConsoleAccessError('Per-account panel keys are not configured.', 'KEYMINT_NOT_CONFIGURED', 503);
  }
  if (service.contract_status !== 'ACTIVE') {
    throw new ConsoleAccessError(`Console is unavailable while the service is ${service.contract_status}.`, 'SERVICE_NOT_ACTIVE', 403);
  }
  if (!service.external_id) {
    throw new ConsoleAccessError('Service is still provisioning.', 'SERVICE_PROVISIONING', 409);
  }
  return { service: { id: service.id, account_id: service.account_id, external_id: service.external_id }, adapter, access };
}

/**
 * Returns short-lived Wings websocket credentials for a service the caller's account owns.
 * Tenant isolation is enforced twice: the service must belong to the account here, and the
 * key used is the account's own panel key, which Pterodactyl scopes to that user's servers.
 * The key itself is never returned to the browser.
 */
export async function getServiceConsoleCredentials(
  params: { serviceId: string; accountId: string; userId: string; role?: string; ipAddress?: string },
  adapter: ProviderAdapter = getProviderAdapter(),
  db: Database.Database = getDatabase(),
  keymintSecret: string = config.PTERODACTYL_KEYMINT_SECRET
): Promise<{ token: string; socket: string }> {
  const { service, adapter: ptero } = resolveOwnedService(params, adapter, db, keymintSecret, 'websocket.connect');

  const creds = await withAccountClientKey(params.accountId, ptero, db, keymintSecret,
    (key) => ptero.getWebsocketCredentials(service.external_id, key));

  db.prepare(`
    INSERT INTO audit_events (id, account_id, actor_user_id, actor_type, action, resource_type, resource_id, ip_address, correlation_id, metadata)
    VALUES (?, ?, ?, 'USER', 'service.console_token', 'service', ?, ?, ?, '{}')
  `).run(`aud_${crypto.randomUUID()}`, params.accountId, params.userId, service.id, params.ipAddress || '127.0.0.1', `corr_${crypto.randomUUID()}`);

  return creds;
}
