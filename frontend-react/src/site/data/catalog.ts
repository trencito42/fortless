import { useEffect, useState } from 'react';

/** Published plans from GET /api/v1/catalog/plans. This is the only source of prices on the public site. */
export interface LivePlan {
  planVersionId: string; productSlug: string; productName: string; planName: string;
  resources: { memoryMb: number; cpuPct: number; diskMb: number; databases: number; backups: number };
  prices: { currency: string; interval: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL'; priceMinorUnits: number; setupFeeMinorUnits: number }[];
}

const valid = (v: unknown): v is LivePlan[] => Array.isArray(v) && v.every((p) => p && typeof p.planVersionId === 'string' && typeof p.productSlug === 'string' && Array.isArray(p.prices) && p.resources && typeof p.resources.memoryMb === 'number');

/** `status: 'error'` means the catalog could not be read; callers must say prices are unavailable instead of inventing any. */
export function useCatalogPlans(productSlug: string) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; plans: LivePlan[] }>({ status: 'loading', plans: [] });
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/v1/catalog/plans', { headers: { accept: 'application/json' }, signal: c.signal })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); const body = (await r.json()) as { plans?: unknown }; if (!valid(body.plans)) throw new Error('shape'); return body.plans; })
      .then((plans) => setState({ status: 'ready', plans: plans.filter((p) => p.productSlug === productSlug) }))
      .catch((e: Error) => { if (e.name !== 'AbortError') setState({ status: 'error', plans: [] }); });
    return () => c.abort();
  }, [productSlug]);
  return state;
}

export const eur = (minor: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
export const gb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
