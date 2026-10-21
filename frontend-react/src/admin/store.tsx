import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { buildAdminData, type AdminData } from './fixtures';
import type { AuditEvent } from './types';
import { ADMIN_NOW } from './lib/format';
import { useSession } from './session';

type Listener = () => void;
class Store {
  private state: AdminData = buildAdminData();
  private listeners = new Set<Listener>();
  private seq = 0;
  getState = () => this.state;
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  set(fn: (s: AdminData) => AdminData) { this.state = fn(this.state); this.listeners.forEach((l) => l()); }
  nextId(prefix: string) { this.seq += 1; return `${prefix}_prev${this.seq.toString(36)}${Date.now().toString(36).slice(-4)}`; }
  reset() { this.state = buildAdminData(); this.listeners.forEach((l) => l()); }
}

type Keys = { [K in keyof AdminData]: AdminData[K] extends unknown[] ? K : never }[keyof AdminData];
type Item<K extends Keys> = AdminData[K] extends Array<infer T> ? T : never;
const idOf = (x: unknown) => { const o = x as { id?: string; key?: string }; return o.id ?? o.key; };

export interface AdminStoreApi {
  data: AdminData;
  /** Merge `patch` into the record with this id/key. Preview only: nothing leaves the browser. */
  patch<K extends Keys>(key: K, id: string, patch: Partial<Item<K>> | ((current: Item<K>) => Partial<Item<K>>)): void;
  add<K extends Keys>(key: K, item: Item<K>, position?: 'start' | 'end'): void;
  remove<K extends Keys>(key: K, id: string): void;
  update<K extends Keys>(key: K, fn: (items: AdminData[K]) => AdminData[K]): void;
  newId(prefix: string): string;
  /** Appends a clearly marked preview audit event attributed to the acting staff member. */
  audit(action: string, resource: { type: string; id: string; label?: string }, opts?: { accountId?: string | null; reason?: string; before?: Record<string, string>; after?: Record<string, string>; result?: AuditEvent['result'] }): void;
  reset(): void;
}
const Ctx = createContext<{ store: Store } | null>(null);

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Store | null>(null);
  ref.current ??= new Store();
  const value = useMemo(() => ({ store: ref.current! }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminStoreApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('AdminStoreProvider missing');
  const { store } = c;
  const { staffId, staffName } = useSession();
  const data = useSyncExternalStore(store.subscribe, store.getState);
  const patch = useCallback<AdminStoreApi['patch']>((key, id, p) => store.set((s) => ({ ...s, [key]: (s[key] as unknown[]).map((x) => (idOf(x) === id ? { ...(x as object), ...(typeof p === 'function' ? p(x as never) : p) } : x)) }) as AdminData), [store]);
  const add = useCallback<AdminStoreApi['add']>((key, item, position = 'start') => store.set((s) => ({ ...s, [key]: position === 'start' ? [item, ...(s[key] as unknown[])] : [...(s[key] as unknown[]), item] }) as AdminData), [store]);
  const remove = useCallback<AdminStoreApi['remove']>((key, id) => store.set((s) => ({ ...s, [key]: (s[key] as unknown[]).filter((x) => idOf(x) !== id) }) as AdminData), [store]);
  const update = useCallback<AdminStoreApi['update']>((key, fn) => store.set((s) => ({ ...s, [key]: fn(s[key] as never) })), [store]);
  const audit = useCallback<AdminStoreApi['audit']>((action, resource, opts = {}) => {
    const ev: AuditEvent = { id: store.nextId('aud'), at: new Date(Math.max(Date.now(), ADMIN_NOW)).toISOString(), actor: { type: 'STAFF', id: staffId, name: staffName }, accountId: opts.accountId ?? null, action, resource: { type: resource.type, id: resource.id, label: resource.label ?? resource.id }, result: opts.result ?? 'success', ip: '203.0.113.20', correlationId: `cor_${store.nextId('x').slice(-10)}`, preview: true, ...(opts.reason ? { reason: opts.reason } : {}), ...(opts.before ? { before: opts.before } : {}), ...(opts.after ? { after: opts.after } : {}) };
    store.set((s) => ({ ...s, audit: [ev, ...s.audit] }));
  }, [store, staffId, staffName]);
  return useMemo(() => ({ data, patch, add, remove, update, audit, newId: (p: string) => store.nextId(p), reset: () => store.reset() }), [data, patch, add, remove, update, audit, store]);
}
