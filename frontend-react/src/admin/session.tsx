import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StaffPermission, StaffRole } from './types';
import { ADMIN_NOW } from './lib/format';

export const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  OWNER: ['admin:access', 'accounts:read', 'accounts:manage', 'services:read', 'services:manage', 'tickets:read', 'tickets:manage', 'audit:read', 'staff:read', 'staff:manage', 'catalog:read', 'catalog:manage', 'content:read', 'content:manage'],
  ADMINISTRATOR: ['admin:access', 'accounts:read', 'accounts:manage', 'services:read', 'services:manage', 'tickets:read', 'tickets:manage', 'audit:read', 'staff:read', 'catalog:read', 'catalog:manage', 'content:read', 'content:manage'],
  BILLING: ['admin:access', 'accounts:read', 'catalog:read'],
  SUPPORT: ['admin:access', 'accounts:read', 'services:read', 'tickets:read', 'tickets:manage', 'catalog:read', 'content:read', 'content:manage'],
  INFRASTRUCTURE: ['admin:access', 'accounts:read', 'services:read', 'services:manage', 'audit:read', 'catalog:read', 'catalog:manage'],
  AUDITOR: ['admin:access', 'accounts:read', 'services:read', 'tickets:read', 'audit:read', 'staff:read', 'catalog:read', 'content:read'],
};
export const ALL_PERMISSIONS = ROLE_PERMISSIONS.OWNER;
export const ROLES = Object.keys(ROLE_PERMISSIONS) as StaffRole[];
export type PreviewState = 'normal' | 'loading' | 'error' | 'empty';
const STEP_UP_WINDOW = 5 * 60_000;
/** Synthetic data is opt-in for component tests. `/admin-preview` is otherwise the real integration staging route. */
export const ADMIN_DEMO = import.meta.env.VITE_ADMIN_DEMO === '1';

interface Session {
  staffId: string; staffName: string; role: StaffRole; permissions: readonly StaffPermission[]; live: boolean; loading: boolean; error?: string;
  setRole: (r: StaffRole) => void; can: (p: StaffPermission) => boolean; stepUpAt: number | null; stepUpValid: boolean; grantStepUp: () => void;
  previewState: PreviewState; setPreviewState: (s: PreviewState) => void;
}
const Ctx = createContext<Session | null>(null);
interface SessionResponse { user?: { id?: unknown; name?: unknown }; staff?: { role?: StaffRole; permissions?: unknown }; session?: { stepUpVerifiedAt?: unknown } }

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<StaffRole>('OWNER');
  const [staff, setStaff] = useState({ id: '', name: '' });
  const [permissions, setPermissions] = useState<readonly StaffPermission[]>(ADMIN_DEMO ? ROLE_PERMISSIONS.OWNER : []);
  const [stepUpAt, setStepUp] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('normal');
  const [loading, setLoading] = useState(!ADMIN_DEMO);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (ADMIN_DEMO) return;
    const controller = new AbortController();
    fetch('/api/v1/admin/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); throw new Error('Session expired.'); }
      const body = await response.json().catch(() => ({})) as SessionResponse & { message?: unknown; error?: unknown };
      if (!response.ok) throw new Error(String(body.message ?? body.error ?? `Admin session failed (${response.status}).`));
      if (!body.user || !body.staff || !Array.isArray(body.staff.permissions)) throw new Error('Admin identity response is invalid.');
      if (typeof body.user.id !== 'string' || typeof body.user.name !== 'string' || !ROLES.includes(body.staff.role as StaffRole)) throw new Error('Admin identity response is invalid.');
      setStaff({ id: body.user.id, name: body.user.name }); setRole(body.staff.role as StaffRole); setPermissions(body.staff.permissions.filter((permission): permission is StaffPermission => typeof permission === 'string' && ALL_PERMISSIONS.includes(permission as StaffPermission)));
      const verified = body.session?.stepUpVerifiedAt; setStepUp(typeof verified === 'string' ? Date.parse(verified) : null);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Admin session unavailable.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const effectivePermissions = ADMIN_DEMO ? ROLE_PERMISSIONS[role] : permissions;
  const can = useCallback((permission: StaffPermission) => effectivePermissions.includes(permission), [effectivePermissions]);
  const grantStepUp = useCallback(() => { if (ADMIN_DEMO) setStepUp(Date.now()); }, []);
  const stepUpValid = stepUpAt != null && Date.now() - stepUpAt < STEP_UP_WINDOW;
  const value = useMemo<Session>(() => ({ staffId: ADMIN_DEMO ? 'stf_01' : staff.id, staffName: ADMIN_DEMO ? 'Maria Ilie' : staff.name, role, permissions: effectivePermissions, live: !ADMIN_DEMO, loading, error, setRole: ADMIN_DEMO ? setRole : () => {}, can, stepUpAt, stepUpValid, grantStepUp, previewState, setPreviewState }), [staff, role, effectivePermissions, loading, error, can, stepUpAt, stepUpValid, grantStepUp, previewState]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSession(): Session { const context = useContext(Ctx); if (!context) throw new Error('SessionProvider missing'); return context; }
export const STEP_UP_MINUTES = STEP_UP_WINDOW / 60_000;
export { ADMIN_NOW };
