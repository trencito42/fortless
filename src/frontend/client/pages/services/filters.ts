/** The service list filters, remembered between visits and shared by every page that lists services. */
export interface ServiceFilters { state: string; type: string; q: string; showTerminated: boolean }

const KEY = 'fortless.services.filters';
const DEFAULTS: ServiceFilters = { state: 'ALL', type: 'ALL', q: '', showTerminated: false };

export function loadFilters(): ServiceFilters {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<ServiceFilters>;
    return {
      state: ['ALL', 'RUNNING', 'OTHER'].includes(String(raw.state)) ? String(raw.state) : DEFAULTS.state,
      type: typeof raw.type === 'string' ? raw.type.slice(0, 200) : DEFAULTS.type,
      q: typeof raw.q === 'string' ? raw.q.slice(0, 100) : DEFAULTS.q,
      showTerminated: raw.showTerminated === true,
    };
  } catch { return { ...DEFAULTS }; }
}

export function saveFilters(patch: Partial<ServiceFilters>): ServiceFilters {
  const next = { ...loadFilters(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable, filters just reset next visit */ }
  return next;
}

/** Terminated services are hidden unless the viewer asked to see them. */
export const isTerminated = (svc: { contract_status?: string | null; contractStatus?: string | null }): boolean =>
  String(svc.contract_status ?? svc.contractStatus ?? '').toUpperCase() === 'TERMINATED';
export const visibleServices = <T extends { contract_status?: string | null }>(services: T[]): T[] =>
  loadFilters().showTerminated ? services : services.filter((s) => !isTerminated(s));
