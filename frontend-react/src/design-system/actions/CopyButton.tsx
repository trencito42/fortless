import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../primitives/IconButton';
import { Button } from '../primitives/Button';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (insecure context, permissions policy). Fall back to a temporary selection.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export interface CopyButtonProps {
  /** Value to copy. Pass a getter for values that should not sit in the DOM (secrets). */
  value: string | (() => string | Promise<string>);
  /** Accessible name, for example "Copy server address". */
  label: string;
  /** Show text next to the icon. */
  text?: string;
  size?: 'sm' | 'md';
  onCopied?: () => void;
  onError?: () => void;
}

/** Copies to the clipboard and confirms by changing icon and announcing "Copied" to screen readers. Failure is shown, not hidden. */
export function CopyButton({ value, label, text, size = 'sm', onCopied, onError }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const run = async () => {
    let ok = false;
    try {
      ok = await copyText(typeof value === 'function' ? await value() : value);
    } catch {
      ok = false;
    }
    setState(ok ? 'ok' : 'fail');
    (ok ? onCopied : onError)?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };
  const icon = state === 'ok' ? 'tick-02' : state === 'fail' ? 'alert-circle' : 'copy-01';
  const status = <span className="sr-only" role="status">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : ''}</span>;

  if (text)
    return (
      <Button size={size} variant={state === 'fail' ? 'danger-subtle' : state === 'ok' ? 'subtle' : 'secondary'} leadingIcon={icon} onClick={run}>
        {state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : text}
        {status}
      </Button>
    );
  return (
    <>
      <IconButton label={label} icon={icon} size={size} variant={state === 'ok' ? 'subtle' : state === 'fail' ? 'danger' : 'ghost'} onClick={run} />
      {status}
    </>
  );
}
