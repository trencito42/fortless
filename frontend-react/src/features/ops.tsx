import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Notice } from '@/design-system';

/** What a mutation reports back. 'pending' = the provider did not answer in time, so the outcome is unknown (never retry blindly). */
export type OpResult = void | 'pending';

export const PENDING_TEXT = 'The server did not confirm in time, so the result is unknown. Check the list below before trying again.';
export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'The request failed. Try again.');

/**
 * One mutation at a time per panel, with the outcome announced: failure as an alert, success or "unknown" as status text.
 * The caller decides what to show on success by passing `ok`.
 */
export function useOp() {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const lock = useRef(false);
  const run = useCallback(async (key: string, fn: () => Promise<OpResult>, ok?: string): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true; setBusy(key); setFailure(null); setNote(null);
    try {
      const r = await fn();
      setNote(r === 'pending' ? { tone: 'warn', text: PENDING_TEXT } : ok ? { tone: 'good', text: ok } : null);
      return true;
    } catch (e) { setFailure(errorText(e)); return false; }
    finally { lock.current = false; setBusy(null); }
  }, []);
  const feedback: ReactNode = failure ? <Notice tone="bad">{failure}</Notice> : note ? <Notice tone={note.tone}>{note.text}</Notice> : null;
  return { busy, run, feedback, failure, clear: () => { setFailure(null); setNote(null); } };
}
