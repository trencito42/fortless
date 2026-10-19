import type Database from 'better-sqlite3';

/** Pterodactyl permission strings. The panel enforces them too, because a shared user acts with their own panel key. */
export const PERMISSION_PRESETS = {
  // NEW-404: a viewer watches. control.console would let them type commands and file.read-content would expose config
  // files that hold credentials, so neither is part of this preset.
  viewer: ['websocket.connect', 'file.read', 'backup.read', 'allocation.read', 'startup.read', 'database.read', 'schedule.read', 'activity.read'],
  operator: [
    'websocket.connect', 'control.console', 'control.start', 'control.stop', 'control.restart',
    'file.read', 'file.read-content', 'file.create', 'file.update', 'file.delete', 'file.archive',
    'backup.read', 'backup.create', 'backup.download', 'allocation.read', 'startup.read', 'database.read', 'schedule.read', 'activity.read',
  ],
  admin: [
    'websocket.connect', 'control.console', 'control.start', 'control.stop', 'control.restart',
    'file.read', 'file.read-content', 'file.create', 'file.update', 'file.delete', 'file.archive', 'file.sftp',
    'backup.read', 'backup.create', 'backup.delete', 'backup.download', 'backup.restore',
    'allocation.read', 'allocation.create', 'allocation.update', 'allocation.delete',
    'startup.read', 'startup.update', 'startup.docker-image', 'settings.rename', 'settings.reinstall',
    'database.read', 'database.create', 'database.update', 'database.delete', 'database.view_password',
    'schedule.read', 'schedule.create', 'schedule.update', 'schedule.delete', 'activity.read',
  ],
} as const;
export type Preset = keyof typeof PERMISSION_PRESETS;
export const isPreset = (v: unknown): v is Preset => typeof v === 'string' && v in PERMISSION_PRESETS;

/** Account members who are not OWNER or TECH_ADMIN can see a service but not control it. */
const READ_ONLY_ROLE_PERMISSIONS = ['activity.read'];

export interface ServiceAccess {
  service: { id: string; account_id: string; order_item_id: string; external_id: string | null; contract_status: string };
  /** ACCOUNT: the service belongs to the viewer's account. MEMBER: it was shared with the viewer. */
  kind: 'ACCOUNT' | 'MEMBER';
  permissions: Set<string> | 'ALL';
  preset: Preset | null;
}

/**
 * The single place that decides whether a user may touch a service. Returns undefined when they have no access at all,
 * so callers answer 404 and never reveal that a service exists.
 */
export function getServiceAccess(
  db: Database.Database,
  params: { serviceId: string; accountId: string; userId: string; role?: string }
): ServiceAccess | undefined {
  const service = db.prepare('SELECT id, account_id, order_item_id, external_id, contract_status FROM services WHERE id = ?')
    .get(params.serviceId) as ServiceAccess['service'] | undefined;
  if (!service) return undefined;
  // NEW-409: a locked or fraud-flagged owner takes the service out of reach for everyone, shared members included.
  const owner = db.prepare('SELECT status FROM accounts WHERE id = ?').get(service.account_id) as { status: string } | undefined;
  if (!owner || owner.status !== 'ACTIVE') return undefined;

  if (service.account_id === params.accountId) {
    const full = params.role === undefined || params.role === 'OWNER' || params.role === 'TECH_ADMIN';
    return { service, kind: 'ACCOUNT', permissions: full ? 'ALL' : new Set(READ_ONLY_ROLE_PERMISSIONS), preset: null };
  }
  const member = db.prepare('SELECT preset FROM service_members WHERE service_id = ? AND user_id = ?')
    .get(params.serviceId, params.userId) as { preset: Preset } | undefined;
  if (!member || !isPreset(member.preset)) return undefined;
  return { service, kind: 'MEMBER', permissions: new Set(PERMISSION_PRESETS[member.preset]), preset: member.preset };
}

export const allows = (access: ServiceAccess, permission: string): boolean =>
  access.permissions === 'ALL' || access.permissions.has(permission);

export const permissionList = (access: ServiceAccess): string[] =>
  access.permissions === 'ALL' ? Object.values(PERMISSION_PRESETS.admin).slice() : [...access.permissions];
