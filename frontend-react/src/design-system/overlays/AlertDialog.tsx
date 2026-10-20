import { useState, type ReactElement, type ReactNode } from 'react';
import { AlertDialog as BaseAlert } from '@base-ui/react/alert-dialog';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface AlertDialogProps {
  /** Omit when controlling `open` yourself (for example from a menu item). */
  trigger?: ReactElement<Record<string, unknown>>;
  /** Controlled mode: the caller owns open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Type this text to enable the confirm button. Use for irreversible actions on named resources. */
  requireText?: string;
  /** May be async. While it runs the dialog stays open with a busy confirm button; a thrown error is shown inside the dialog. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Interrupting confirmation. Unlike Dialog it cannot be dismissed by clicking outside, and focus starts on the safe choice.
 */
export function AlertDialog({ trigger, open: openProp, onOpenChange, title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'default', requireText, onConfirm }: AlertDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = requireText ? typed.trim() !== requireText : false;

  const reset = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    if (!next) {
      setTyped('');
      setError(null);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      setOpen(false);
      setTyped('');
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was changed.');
    }
  };

  return (
    <BaseAlert.Root open={open} onOpenChange={reset}>
      {trigger ? <BaseAlert.Trigger render={trigger} /> : null}
      <BaseAlert.Portal>
        <BaseAlert.Backdrop className="fixed inset-0 z-[60] bg-overlay transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseAlert.Popup className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col gap-4 rounded-t-xl bg-s1 p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-ink outline-none transition-[transform,opacity] duration-300 ease-petal data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full md:inset-auto md:top-1/2 md:left-1/2 md:w-[min(440px,calc(100%-32px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:data-[starting-style]:translate-y-[calc(-50%+12px)] md:data-[starting-style]:opacity-0 md:data-[ending-style]:translate-y-[calc(-50%+12px)] md:data-[ending-style]:opacity-0">
          <div className="flex items-start gap-4">
            {tone === 'danger' ? (
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-bad-bg text-bad"><Icon name="alert-01" size={22} /></span>
            ) : null}
            <div className="grid gap-1.5">
              <BaseAlert.Title className="text-xl leading-tight font-extrabold tracking-[-0.04em]">{title}</BaseAlert.Title>
              <BaseAlert.Description className="text-ink2">{description}</BaseAlert.Description>
            </div>
          </div>
          {requireText ? (
            <label className="grid gap-2 text-[13px] font-bold text-ink2">
              <span>Type <span className="font-mono text-ink">{requireText}</span> to confirm</span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-ctl-md rounded-md bg-s2 px-4 font-mono text-[16px] text-ink outline-none placeholder:text-ink3 focus-visible:ring-2 focus-visible:ring-accent md:text-[14px]"
              />
            </label>
          ) : null}
          {error ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-3 font-semibold text-bad">{error}</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <BaseAlert.Close render={<Button variant="secondary" disabled={busy} />}>{cancelLabel}</BaseAlert.Close>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} loadingLabel="Working" disabled={blocked} onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </BaseAlert.Popup>
      </BaseAlert.Portal>
    </BaseAlert.Root>
  );
}
