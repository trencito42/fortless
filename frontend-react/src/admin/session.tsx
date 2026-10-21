import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StaffPermission, StaffRole } from './types';
import { ADMIN_NOW } from './lib/format';

/** Copied from src/modules/admin/access.ts. If the backend map changes this must change with it. */
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

interface Session {
  staffId: string; staffName: string; role: StaffRole; setRole: (r: StaffRole) => void; can: (p: StaffPermission) => boolean;
  stepUpAt: number | null; stepUpValid: boolean; grantStepUp: () => void;
  previewState: PreviewState; setPreviewState: (s: PreviewState) => void;
}
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<StaffRole>('OWNER');
  const [stepUpAt, setStepUp] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('normal');
  const [tick, setTick] = useState(0);
  const can = useCallback((p: StaffPermission) => ROLE_PERMISSIONS[role].includes(p), [role]);
  const grantStepUp = useCallback(() => { setStepUp(Date.now()); setTick((t) => t + 1); }, []);
  const stepUpValid = stepUpAt != null && Date.now() - stepUpAt < STEP_UP_WINDOW;
  const value = useMemo<Session>(() => ({ staffId: 'stf_01', staffName: 'Maria Ilie', role, setRole, can, stepUpAt, stepUpValid, grantStepUp, previewState, setPreviewState }), [role, can, stepUpAt, stepUpValid, grantStepUp, previewState, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSession(): Session {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
}
export const STEP_UP_MINUTES = STEP_UP_WINDOW / 60_000;
export { ADMIN_NOW };
