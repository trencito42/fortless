import type { PlatformCapabilitiesDto, ProviderCapabilities, ServiceDetailDto, VerificationTier } from './contracts';
import type { TabId } from './model';

/**
 * The five questions the view asks before it offers anything, kept apart on purpose:
 *  1. implemented in source   - static, `api-map.ts` (does the route exist in server.ts)
 *  2. reachable at runtime    - `platform.provisioning.enabled`, and typed 503s that arrive later
 *  3. provider capability     - `ServiceDetailDto.providerCapabilities`
 *  4. user authorised         - `ServiceDetailDto.access.permissions` (plus lifecycle: contract ACTIVE and a settled runtime)
 *  5. verified end to end     - `platform.provisioning.verification` tier, never inferred from 1-4
 * "Unavailable" is only ever said for a reason that one of these actually produced.
 */
export type Gate =
  | { open: true }
  | { open: false; level: 2 | 3 | 4; kind: 'hidden' | 'blocked'; reason: string };

export interface AccessInput {
  service: ServiceDetailDto;
  /** Level 2. `undefined` while unknown (not fetched or the call failed): treated as "not proven", never as ready. */
  platform?: PlatformCapabilitiesDto;
}

const PERMS = {
  console: ['websocket.connect'], files: ['file.read'], game: ['file.read-content'], databases: ['database.read'], schedules: ['schedule.read'],
  fastdl: ['file.read'], backups: ['backup.read'], network: ['allocation.read'], startup: ['startup.read'], settings: ['startup.read'], // GET /settings is gated by startup.read in the backend; rename and reinstall are gated per action in the tab
} as const;

/** Mirrors `show` in the shipped pages/services/index.ts, plus a reason instead of a silent hide. */
const CAP: Partial<Record<TabId, keyof ProviderCapabilities>> = {
  console: 'console', players: 'game', files: 'files', game: 'game', databases: 'databases', schedules: 'schedules', backups: 'backups',
  network: 'network', startup: 'startup', settings: 'settings', users: 'users', fastdl: 'files',
};

export const defaultCapabilities = (providerType: string): ProviderCapabilities => {
  const p = providerType === 'PTERODACTYL';
  return { console: p, files: p, game: p, databases: p, schedules: p, backups: p || providerType === 'PROXMOX', network: p || providerType === 'PROXMOX', startup: p, settings: true, users: true, power: providerType !== 'CPANEL' };
};

export function can(service: ServiceDetailDto, permission: string): boolean { return service.access.permissions.includes(permission); }

/** Lifecycle gate used by the shipped app (`serviceState().controllable`): only an ACTIVE contract with a settled runtime. */
export function lifecycleReason(service: ServiceDetailDto): string | null {
  if (service.contractStatus !== 'ACTIVE') return `This service is ${service.contractStatus.toLowerCase().replace('_', ' ')}.`;
  const rs = service.observedState?.runtimeState;
  if (rs === 'INSTALLING') return 'The server is installing. Controls unlock when it finishes.';
  if (rs === 'ERROR') return 'The server reported an error. Check the console or contact support.';
  if (!service.externalId) return 'The server is still provisioning.';
  return null;
}

export function gateFor(tab: TabId, { service, platform }: AccessInput): Gate {
  if (tab === 'overview' || tab === 'activity' || tab === 'allocation') {
    return tab === 'activity' && !can(service, 'activity.read') ? { open: false, level: 4, kind: 'hidden', reason: 'You do not have permission to view activity.' } : { open: true };
  }
  const caps = service.providerCapabilities ?? defaultCapabilities(service.providerType);
  const cap = CAP[tab];
  if (cap && !caps[cap]) return { open: false, level: 3, kind: 'hidden', reason: `${service.providerType} does not support this feature.` };

  if (tab === 'users') {
    if (service.access.kind !== 'ACCOUNT' || !can(service, 'control.start')) return { open: false, level: 4, kind: 'hidden', reason: 'Only the account owner can share this service.' };
  } else if (tab === 'players') {
    if (!can(service, 'player.read') && !can(service, 'control.console')) return { open: false, level: 4, kind: 'hidden', reason: 'You do not have permission to view players.' };
  } else {
    const need = PERMS[tab as keyof typeof PERMS];
    if (need && !need.every((p) => can(service, p))) return { open: false, level: 4, kind: 'hidden', reason: 'You do not have permission to use this tab.' };
  }

  if (tab !== 'users' && platform && !platform.provisioning.enabled) return { open: false, level: 2, kind: 'blocked', reason: 'The infrastructure provider is not configured on this Fortless instance.' };
  const life = lifecycleReason(service);
  if (life) return { open: false, level: 4, kind: 'blocked', reason: life };
  return { open: true };
}

export function tabsFor(input: AccessInput, order: readonly TabId[], hidden: ReadonlySet<TabId> = new Set()): Array<{ id: TabId; gate: Gate }> {
  return order.filter((id) => !hidden.has(id)).map((id) => ({ id, gate: gateFor(id, input) })).filter((t) => t.gate.open || t.gate.kind === 'blocked');
}

export const VERIFICATION_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started', CONFIGURED: 'Configured, not verified', SANDBOX_VERIFIED: 'Verified on a test panel', PRODUCTION_VERIFIED: 'Verified in production',
};
export const verificationLabel = (v: VerificationTier | undefined) => (v ? VERIFICATION_LABEL[v] ?? v : 'Unknown');

/** Typed error codes (contracts.ServiceErrorCode) that mean "this will not fix itself": the view stops retrying and explains. */
export const TERMINAL_CODES = new Set(['PROVIDER_NOT_CONFIGURED', 'KEYMINT_NOT_CONFIGURED', 'CONSOLE_UNSUPPORTED', 'SERVICE_NOT_ACTIVE', 'SERVICE_PROVISIONING', 'FORBIDDEN', 'PANEL_USER_MISSING']);
