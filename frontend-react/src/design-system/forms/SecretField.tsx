import { useEffect, useRef, useState } from 'react';
import { Field, type FieldProps } from './Field';
import { InputGroup } from './InputGroup';
import { bareInput } from './control-styles';
import { CopyButton } from '../actions/CopyButton';
import { IconButton } from '../primitives/IconButton';
import { Button } from '../primitives/Button';

export interface SecretFieldProps extends Pick<FieldProps, 'label' | 'description' | 'error'> {
  /** Plain value, when the client already holds it. Leave undefined when the secret is only stored server-side. */
  value?: string;
  /** Fetches the plain value on demand. The value is held in memory only while revealed and masked again after `autoHideMs`. */
  onReveal?: () => Promise<string>;
  /** Called with a new value when the user replaces the secret. Omit for read-only secrets (API keys shown once). */
  onReplace?: (value: string) => void | Promise<void>;
  autoHideMs?: number;
  /** Shown instead of Reveal and Copy when there is neither a `value` nor an `onReveal`, for example a key that was only shown once. */
  unavailableReason?: string;
  className?: string;
}

const MASK = '••••••••••••';

/**
 * A secret the user can reveal, copy or replace. The plain value is never rendered until revealed, and it is masked again
 * after a timeout. Reveal and copy failures are shown rather than swallowed.
 */
export function SecretField({ label, description, error, value, onReveal, onReplace, autoHideMs = 30000, unavailableReason = 'The value cannot be shown here.', className }: SecretFieldProps) {
  const [plain, setPlain] = useState<string | null>(value ?? null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const timer = useRef<number | undefined>(undefined);
  /** Identifies the current reveal request. Anything that masks, cancels or unmounts bumps it, so a late response is dropped instead of re-exposing the value. */
  const request = useRef(0);
  useEffect(() => () => { window.clearTimeout(timer.current); request.current++; }, []);
  const canRetrieve = (value !== undefined && value !== '') || !!onReveal;

  /** Masks the value. Plaintext that was fetched on demand is dropped from memory too, so it cannot be recovered from component state. */
  const mask = () => {
    window.clearTimeout(timer.current);
    request.current++;
    setBusy(false);
    setShown(false);
    if (value === undefined) setPlain(null);
  };
  const hideLater = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(mask, autoHideMs);
  };
  useEffect(() => {
    const onHide = () => { if (document.hidden) mask(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reveal = async () => {
    if (shown || busy) return mask(); // second click while loading cancels the request
    setLocalError(null);
    const mine = ++request.current;
    try {
      if (plain === null && onReveal) {
        setBusy(true);
        const v = await onReveal();
        if (request.current !== mine) return; // cancelled, masked or unmounted while waiting
        if (!v) throw new Error('No value was returned.');
        setPlain(v);
      }
      setShown(true);
      hideLater();
    } catch (e) {
      if (request.current !== mine) return;
      setLocalError(e instanceof Error ? e.message : 'Could not reveal this value.');
    } finally {
      if (request.current === mine) setBusy(false);
    }
  };

  /** Copy fetches the value just for the clipboard and does not keep it in state unless it is already revealed. */
  const getForCopy = async () => {
    if (plain !== null) return plain;
    if (!onReveal) throw new Error(unavailableReason);
    const v = await onReveal();
    if (!v) throw new Error('No value was returned.');
    return v;
  };

  if (editing)
    return (
      <Field label={label} description="Enter the new value. The old one stops working when you save." error={error ?? localError ?? undefined} className={className}>
        <InputGroup suffix={
          <span className="flex gap-1">
            <Button size="sm" variant="primary" disabled={!draft} onClick={async () => { try { request.current++; setBusy(false); await onReplace?.(draft); setPlain(value === undefined ? null : draft); setShown(false); setDraft(''); setEditing(false); } catch (e) { setLocalError(e instanceof Error ? e.message : 'Could not save the new value.'); } }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(''); }}>Cancel</Button>
          </span>
        }>
          <input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} className={bareInput} aria-label={`New ${typeof label === 'string' ? label : 'value'}`} />
        </InputGroup>
      </Field>
    );

  return (
    <Field label={label} description={description} error={error ?? localError ?? undefined} className={className}>
      <InputGroup
        readOnly
        suffix={
          <span className="flex items-center gap-0.5">
            {canRetrieve ? (
              <>
                <IconButton label={busy ? 'Cancel reveal' : shown ? 'Hide value' : 'Reveal value'} aria-pressed={busy ? undefined : shown} icon={busy ? 'cancel-01' : shown ? 'view-off' : 'view'} size="sm" onClick={reveal} />
                <CopyButton label="Copy value" value={getForCopy} onError={() => setLocalError('Copy failed. Reveal the value and copy it manually.')} />
              </>
            ) : null}
            {onReplace ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Replace</Button> : null}
          </span>
        }
      >
        <input readOnly value={!canRetrieve ? '' : shown && plain !== null ? plain : MASK} placeholder={canRetrieve ? undefined : unavailableReason} aria-label={typeof label === 'string' ? label : 'Secret value'} className={`${bareInput} font-mono`} onFocus={(e) => e.currentTarget.select()} />
      </InputGroup>
    </Field>
  );
}
