import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useResource } from '@/views/shared/useResource';
import type { CustomerApi } from './api';

export type ObservableCustomerApi = CustomerApi & { subscribe(fn: () => void): () => void; version(): number };
type Api = ObservableCustomerApi;
const Ctx = createContext<Api | null>(null);

/** Production provider. Tests and workbenches must pass their fixture adapter explicitly. */
export function DataProvider({ children, api }: { children: ReactNode; api: Api }) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApi(): CustomerApi {
  const a = useContext(Ctx);
  if (!a) throw new Error('DataProvider missing');
  return a;
}

/**
 * Loads data through the adapter. Re-reads silently whenever any mutation changed the store, so lists update after an action
 * without a loading flash, and a failed background read keeps what is on screen.
 */
export function useApiQuery<T>(load: (api: CustomerApi, signal: AbortSignal) => Promise<T>, deps: readonly unknown[] = []) {
  const a = useContext(Ctx);
  if (!a) throw new Error('DataProvider missing');
  const version = useSyncExternalStore(a.subscribe, a.version, a.version);
  const res = useResource((signal) => load(a, signal), [a, ...deps]);
  const first = useRef(true);
  const { refresh } = res;
  useEffect(() => { if (first.current) { first.current = false; return; } refresh(); }, [version, refresh]);
  return res;
}
