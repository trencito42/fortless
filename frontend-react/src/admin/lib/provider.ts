import type { Service } from '../types';
import { mb } from './format';

export interface DiffRow { field: string; business: string; provider: string; ok: boolean }
const h = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Compares the Fortless business record with what the provider panel would report. The provider side is derived from `provider.sync`
 * so every drift case shows a concrete, explainable difference. In production this is a read through the provider adapter, never a write.
 */
export function providerDiff(s: Service): DiffRow[] {
  const bizSuspended = s.lifecycle === 'SUSPENDED' || s.lifecycle === 'PAST_DUE';
  if (s.provider.sync === 'unlinked') return [{ field: 'External server id', business: 'not set', provider: 'cannot look up', ok: false }, { field: 'Correlation tag', business: s.provider.correlationTag, provider: 'search by tag to find a candidate', ok: false }];
  if (s.provider.sync === 'missing_remote') return [{ field: 'Server', business: s.lifecycle === 'TERMINATED' ? 'terminated (expected to be gone)' : `exists (#${s.provider.externalId ?? '—'})`, provider: 'not found (404)', ok: s.lifecycle === 'TERMINATED' }];
  const drift = s.provider.sync === 'drift' ? h(s.id) % 2 : -1;
  return [
    { field: 'Suspended flag', business: bizSuspended ? 'suspended' : 'active', provider: drift === 0 ? (bizSuspended ? 'active' : 'suspended') : bizSuspended ? 'suspended' : 'active', ok: drift !== 0 },
    { field: 'Memory limit', business: mb(s.resources.memoryMb), provider: drift === 1 ? mb(Math.round(s.resources.memoryMb * 1.5)) : mb(s.resources.memoryMb), ok: drift !== 1 },
    { field: 'Disk limit', business: mb(s.resources.diskMb), provider: mb(s.resources.diskMb), ok: true },
    { field: 'CPU limit', business: `${s.resources.cpuPct}%`, provider: `${s.resources.cpuPct}%`, ok: true },
    { field: 'Node', business: s.nodeId, provider: s.nodeId, ok: true },
    { field: 'Allocation', business: `${s.ip}:${s.port}`, provider: `${s.ip}:${s.port}`, ok: true },
  ];
}
export const driftCount = (s: Service) => providerDiff(s).filter((r) => !r.ok).length;
