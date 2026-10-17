import type Database from 'better-sqlite3';

export const STAFF_ROLES = ['OWNER', 'ADMINISTRATOR', 'BILLING', 'SUPPORT', 'INFRASTRUCTURE', 'AUDITOR'] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export type StaffPermission =
  | 'admin:access'
  | 'accounts:read'
  | 'accounts:manage'
  | 'services:read'
  | 'tickets:read'
  | 'tickets:manage'
  | 'audit:read'
  | 'staff:read'
  | 'staff:manage';

const rolePermissions: Record<StaffRole, readonly StaffPermission[]> = {
  OWNER: ['admin:access', 'accounts:read', 'accounts:manage', 'services:read', 'tickets:read', 'tickets:manage', 'audit:read', 'staff:read', 'staff:manage'],
  ADMINISTRATOR: ['admin:access', 'accounts:read', 'accounts:manage', 'services:read', 'tickets:read', 'tickets:manage', 'audit:read', 'staff:read'],
  BILLING: ['admin:access', 'accounts:read'],
  SUPPORT: ['admin:access', 'accounts:read', 'services:read', 'tickets:read', 'tickets:manage'],
  INFRASTRUCTURE: ['admin:access', 'accounts:read', 'services:read', 'audit:read'],
  AUDITOR: ['admin:access', 'accounts:read', 'services:read', 'tickets:read', 'audit:read', 'staff:read'],
};

export interface StaffAccess {
  role: StaffRole;
  permissions: readonly StaffPermission[];
}

export function getStaffAccess(userId: string, db: Database.Database): StaffAccess | null {
  const membership = db.prepare(`
    SELECT role FROM staff_memberships
    WHERE user_id = ? AND status = 'ACTIVE'
  `).get(userId) as { role: StaffRole } | undefined;
  if (!membership || !STAFF_ROLES.includes(membership.role)) return null;
  return { role: membership.role, permissions: rolePermissions[membership.role] };
}

export function hasStaffPermission(userId: string, permission: StaffPermission, db: Database.Database): boolean {
  return Boolean(getStaffAccess(userId, db)?.permissions.includes(permission));
}
