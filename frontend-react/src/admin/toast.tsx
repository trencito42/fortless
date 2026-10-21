import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, IconButton } from '@/design-system';
import { cn } from '@/lib/utils/cn';

type Tone = 'good' | 'info' | 'warn' | 'bad';
interface ToastItem { id: number; tone: Tone; title: string; description?: string }
const Ctx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

const toneCls: Record<Tone, string> = { good: 'bg-good-bg text-good', info: 'bg-info-bg text-info', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad' };
const toneIcon = { good: 'tick-02', info: 'information-circle', warn: 'alert-01', bad: 'alert-circle' } as const;

/** Polite live region for confirmations. Every simulated action says it is a preview, so nothing reads as a real provider call. */
export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { ...t, id }]);
    window.setTimeout(() => dismiss(id), t.tone === 'bad' ? 9000 : 5500);
  }, [dismiss]);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-3 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[80] grid justify-items-end gap-2 md:inset-x-auto md:right-5 md:bottom-5">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'} className={cn('pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-lg p-3.5 pr-2 shadow-none', toneCls[t.tone])}>
            <Icon name={toneIcon[t.tone]} size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1"><p className="font-extrabold">{t.title}</p>{t.description ? <p className="text-[13.5px] font-medium">{t.description}</p> : null}</div>
            <IconButton label="Dismiss notification" icon="cancel-01" size="sm" variant="ghost" onClick={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
