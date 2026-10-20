import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from '../primitives/Button';

export interface RevealButtonProps {
  /** What the button reveals, for example "server address". Used in the accessible name: "Reveal server address". */
  what: string;
  /** Value to show. May be async (fetched only on reveal). The value is not in the DOM until revealed and is dropped when hidden. */
  value: string | (() => string | Promise<string>);
  /** Hide again after this many ms. 0 disables. Default 15000. */
  autoHideMs?: number;
  /** Text shown while hidden. Not derived from the value, so its length leaks nothing. */
  placeholder?: string;
  className?: string;
}

/**
 * Click-to-reveal for values that are fine to show on demand but should not sit on screen: IPs, emails, tokens' last digits.
 * For credentials use SecretField, which adds copy and replace. Failure to fetch is shown inline.
 */
export function RevealButton({ what, value, autoHideMs = 15000, placeholder = '••••••••', className }: RevealButtonProps) {
  const id = useId();
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hide = () => { window.clearTimeout(timer.current); setShown(null); };
  const reveal = async () => {
    if (shown !== null) return hide();
    setBusy(true); setFailure(null);
    try {
      const v = typeof value === 'function' ? await value() : value;
      setShown(v);
      if (autoHideMs > 0) { window.clearTimeout(timer.current); timer.current = window.setTimeout(hide, autoHideMs); }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : `Could not load the ${what}.`);
    } finally { setBusy(false); }
  };

  return (
    <div className={cn('inline-flex max-w-full flex-wrap items-center gap-2', className)}>
      <output id={id} className={cn('min-w-0 break-all font-mono text-[14px] font-semibold', shown === null && 'text-ink3')}>{shown ?? placeholder}</output>
      <Button size="sm" variant="secondary" loading={busy} loadingLabel={`Loading ${what}`} aria-expanded={shown !== null} aria-controls={id} leadingIcon={shown === null ? 'view' : 'view-off'} onClick={reveal}>
        {shown === null ? `Reveal ${what}` : `Hide ${what}`}
      </Button>
      {failure ? <p role="alert" className="basis-full text-[13px] font-semibold text-bad">{failure}</p> : null}
    </div>
  );
}
