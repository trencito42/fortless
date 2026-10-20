import { useCallback, useEffect, useRef, useState } from 'react';

export type ResourceState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: string; cause: unknown };

/**
 * Loads one resource through a data port and exposes loading / ready / error plus reload.
 * A newer request or an unmount aborts the previous one, and a late answer from an aborted request is dropped,
 * so switching tabs quickly can never show data for the wrong tab or service.
 * This hook lives in the view layer on purpose: the design system never loads data.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): ResourceState<T> & { reload: () => void; refresh: () => void; setData: (next: T) => void } {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading', data: undefined, error: undefined });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const silent = useRef(false);

  useEffect(() => {
    const ctl = new AbortController();
    const quiet = silent.current; silent.current = false;
    if (!quiet) setState({ status: 'loading', data: undefined, error: undefined });
    loadRef.current(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ status: 'ready', data, error: undefined }); },
      (e: unknown) => { if (quiet) return; if (!ctl.signal.aborted && !(e instanceof DOMException && e.name === 'AbortError')) setState({ status: 'error', data: undefined, error: e instanceof Error ? e.message : 'Something went wrong.', cause: e }); },
    );
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  /** Re-reads without flashing the loading state; a failed background read keeps the data already on screen. */
  const refresh = useCallback(() => { silent.current = true; setNonce((n) => n + 1); }, []);
  const setData = useCallback((next: T) => setState({ status: 'ready', data: next, error: undefined }), []);
  return { ...state, reload, refresh, setData };
}
