import { useCallback, useEffect, useState } from 'react';

/** Public status feed: GET /api/v1/status (no authentication, no internal infrastructure detail). */
export type Health = 'OPERATIONAL' | 'DEGRADED' | 'PARTIAL_OUTAGE' | 'MAJOR_OUTAGE' | 'MAINTENANCE';
export interface StatusComponent { id: string; name: string; slug: string; groupName: string; status: Health; orderIndex: number; updatedAt: string }
export interface IncidentUpdate { id: string; status: 'INVESTIGATING' | 'IDENTIFIED' | 'MONITORING' | 'RESOLVED'; message: string; createdAt: string }
export interface Incident { id: string; title: string; impact: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'; status: IncidentUpdate['status']; createdAt: string; updatedAt: string; resolvedAt: string | null; updates: IncidentUpdate[] }
export interface StatusSnapshot { indicator: 'OPERATIONAL' | 'DEGRADED' | 'MAJOR_OUTAGE' | 'MAINTENANCE'; headline: string; components: StatusComponent[]; activeIncidents: Incident[]; pastIncidents: Incident[]; generatedAt: string }

export const HEALTH_LABEL: Record<Health, string> = { OPERATIONAL: 'Operational', DEGRADED: 'Degraded', PARTIAL_OUTAGE: 'Partial outage', MAJOR_OUTAGE: 'Major outage', MAINTENANCE: 'Maintenance' };
export const HEALTH_TONE: Record<Health, 'good' | 'warn' | 'bad' | 'accent'> = { OPERATIONAL: 'good', DEGRADED: 'warn', PARTIAL_OUTAGE: 'warn', MAJOR_OUTAGE: 'bad', MAINTENANCE: 'accent' };

const isSnapshot = (v: unknown): v is StatusSnapshot => !!v && typeof v === 'object' && Array.isArray((v as StatusSnapshot).components) && Array.isArray((v as StatusSnapshot).activeIncidents) && typeof (v as StatusSnapshot).indicator === 'string';

export async function loadStatus(signal?: AbortSignal): Promise<StatusSnapshot> {
  const res = await fetch('/api/v1/status', { headers: { accept: 'application/json' }, signal });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`Status feed returned ${res.status}`);
  const body: unknown = await res.json();
  if (!isSnapshot(body)) throw new Error('Status feed returned an unexpected shape');
  return body;
}

/** `error` means the feed could not be read. The UI must say so rather than imply the platform is healthy. */
export function useStatus() {
  const [state, setState] = useState<{ snap: StatusSnapshot | null; error: boolean; busy: boolean }>({ snap: null, error: false, busy: true });
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState((s) => ({ ...s, busy: true }));
    try { const snap = await loadStatus(signal); setState({ snap, error: false, busy: false }); }
    catch (e) { if ((e as Error).name !== 'AbortError') setState((s) => ({ snap: s.snap, error: true, busy: false })); }
  }, []);
  useEffect(() => { const c = new AbortController(); void refresh(c.signal); return () => c.abort(); }, [refresh]);
  return { ...state, refresh: () => refresh() };
}
