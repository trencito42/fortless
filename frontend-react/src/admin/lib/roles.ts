import type { StaffRole } from '../types';
export const ROLE_BLURB: Record<StaffRole, string> = {
  OWNER: 'everything', ADMINISTRATOR: 'all but staff changes', BILLING: 'read-only accounts + catalog', SUPPORT: 'tickets + content', INFRASTRUCTURE: 'services + catalog', AUDITOR: 'read-only everywhere',
};
