import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Icon } from '../icons/Icon';

export interface ConsoleHandle {
  write: (data: string) => void;
  writeln: (line: string) => void;
  clear: () => void;
  /** Whole scrollback as plain text. */
  getText: () => string;
}

export interface ServerConsoleImplProps {
  onCommand?: (command: string) => void | Promise<void>;
  /** Disables the input and explains why in the placeholder. */
  inputDisabledReason?: string;
  /** Earlier commands (oldest first) offered to the ArrowUp recall list. Redacted entries must be filtered out by the caller. */
  initialHistory?: readonly string[];
  scrollback?: number;
  height: number;
  label: string;
}

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** xterm.js output pane plus a real text input underneath (reliable on phones, works with screen readers and password managers off). */
export const ServerConsoleImpl = forwardRef<ConsoleHandle, ServerConsoleImplProps>(function ServerConsoleImpl({ onCommand, inputDisabledReason, initialHistory, scrollback = 5000, height, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const [value, setValue] = useState('');
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const seeded = useRef(false);
  if (initialHistory?.length && !seeded.current) { seeded.current = true; history.current = [...initialHistory, ...history.current]; }
  const [busy, setBusy] = useState(false);
  const errId = useId();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: 'underline',
      scrollback,
      fontSize: 13,
      lineHeight: 1.35,
      fontFamily: css('--font-mono') || 'monospace',
      theme: { background: css('--con') || '#0b1a2b', foreground: css('--con-ink') || '#c9d8ee', cursor: 'transparent', selectionBackground: '#3b82f655' },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(host.current);
    fit.fit();
    t.textarea?.setAttribute('aria-label', 'Terminal input (read only)');
    term.current = t;
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* host hidden */ } });
    ro.observe(host.current);
    return () => { ro.disconnect(); t.dispose(); term.current = null; };
  }, [scrollback]);

  useImperativeHandle(ref, () => ({
    write: (d) => term.current?.write(d),
    writeln: (l) => term.current?.writeln(l),
    clear: () => term.current?.clear(),
    getText: () => {
      const b = term.current?.buffer.active;
      if (!b) return '';
      const out: string[] = [];
      for (let i = 0; i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? '');
      return out.join('\n').trimEnd();
    },
  }), []);

  const submit = async () => {
    const cmd = value.trim();
    // Without a handler nothing can be sent, so never pretend it was: the input is disabled too.
    if (!cmd || busy || !onCommand) return;
    cursor.current = -1;
    setBusy(true);
    setFailure(null);
    try {
      await onCommand(cmd);
      history.current.push(cmd);
      setValue('');
    } catch (e) {
      // Keep the command in the box so it can be retried, and say what happened.
      setFailure(e instanceof Error ? e.message : 'The command could not be sent.');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = history.current;
      if (!h.length) return;
      cursor.current = cursor.current < 0 ? h.length - 1 : Math.max(0, cursor.current - 1);
      setValue(h[cursor.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = history.current;
      if (cursor.current < 0) return;
      cursor.current += 1;
      if (cursor.current >= h.length) { cursor.current = -1; setValue(''); } else setValue(h[cursor.current] ?? '');
    }
  };

  const noHandler = !onCommand;
  const disabledReason = inputDisabledReason ?? (noHandler ? 'Commands cannot be sent from this console.' : undefined);
  const disabled = !!disabledReason;
  return (
    <div className="grid overflow-hidden rounded-lg bg-con">
      {/* Scrollable terminal output must be focusable for keyboard scrolling. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={host} role="log" aria-label={label} aria-live="off" tabIndex={0} style={{ height }} className="min-w-0 p-3 outline-none focus-visible:ring-2 focus-visible:ring-accent [&_.xterm-viewport]:!bg-transparent" />
      <div className="flex items-center gap-2 bg-white/[0.04] px-3">
        <Icon name="terminal" size={16} className="text-con-dim" />
        <input
          aria-label="Console command"
          autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          value={value}
          disabled={disabled}
          readOnly={busy}
          aria-busy={busy || undefined}
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? errId : undefined}
          onChange={(e) => { setValue(e.target.value); if (failure) setFailure(null); }}
          onKeyDown={onKey}
          placeholder={disabledReason ?? 'Type a command and press Enter'}
          className="h-12 min-w-0 flex-1 bg-transparent font-mono text-[16px] text-con-ink outline-none placeholder:text-con-dim disabled:cursor-not-allowed sm:text-[14px]"
        />
      </div>
      {failure ? <p id={errId} role="alert" className="bg-con px-4 pb-3 text-[13px] font-semibold text-con-bad">{failure}</p> : null}
    </div>
  );
});
