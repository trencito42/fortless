import { useId, useState, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { bareInput } from './control-styles';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Icon } from '../icons/Icon';

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
  secret?: boolean;
}

export interface KeyValueEditorProps {
  legend: string;
  description?: string;
  rows: KeyValueRow[];
  onRowsChange: (rows: KeyValueRow[]) => void;
  /** Validate a key. Return a message or null. Duplicates are always flagged. */
  validateKey?: (key: string) => string | null;
  validateValue?: (value: string, key: string) => string | null;
  keyLabel?: string;
  valueLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Allow marking a row as secret (masked, with reveal). */
  allowSecret?: boolean;
  /** Keys the user cannot use (reserved by the platform). */
  reservedKeys?: string[];
  /** Parse pasted "KEY=value" lines into rows. */
  pasteLines?: boolean;
  maxRows?: number;
  disabled?: boolean;
  addLabel?: string;
}

let n = 0;
export const newRowId = () => `row-${Date.now().toString(36)}-${n++}`;

export function parseEnvLines(text: string): Omit<KeyValueRow, 'id'>[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return { key: l.slice(0, i).trim().replace(/^export\s+/, ''), value: v };
    });
}

/**
 * Editable key/value rows. Each row validates on its own, duplicates are flagged, secret rows are masked.
 * On narrow screens each row stacks into a labelled card instead of squeezing two inputs side by side.
 */
export function KeyValueEditor({ legend, description, rows, onRowsChange, validateKey, validateValue, keyLabel = 'Key', valueLabel = 'Value', keyPlaceholder = 'KEY', valuePlaceholder = 'value', allowSecret, reservedKeys = [], pasteLines, maxRows = 100, disabled, addLabel = 'Add row' }: KeyValueEditorProps) {
  const uid = useId();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const keyError = (r: KeyValueRow): string | null => {
    if (!r.key) return null;
    if (reservedKeys.includes(r.key)) return `${r.key} is reserved by Fortless.`;
    if (rows.some((o) => o.id !== r.id && o.key === r.key)) return 'This key is already used.';
    return validateKey?.(r.key) ?? null;
  };
  const patch = (id: string, p: Partial<KeyValueRow>) => onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => onRowsChange(rows.filter((r) => r.id !== id));
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, id: string) => {
    if (!pasteLines) return;
    const text = e.clipboardData.getData('text');
    if (!/\n/.test(text) && !/^\s*[A-Za-z_]\w*=/.test(text)) return;
    const parsed = parseEnvLines(text);
    if (parsed.length === 0) return;
    e.preventDefault();
    const target = rows.find((r) => r.id === id);
    const keep = target && !target.key && !target.value ? rows.filter((r) => r.id !== id) : rows;
    onRowsChange([...keep, ...parsed.map((p) => ({ id: newRowId(), ...p }))].slice(0, maxRows));
  };

  return (
    <fieldset className="grid min-w-0 gap-3" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-bold text-ink2">{legend}</legend>
      {description ? <p className="-mt-2 text-[13px] text-ink3">{description}</p> : null}
      {rows.length === 0 ? <p className="rounded-md bg-s2 px-4 py-3 text-[13.5px] font-semibold text-ink3">Nothing here yet.</p> : null}
      <ul className="grid gap-2">
        {rows.map((r, i) => {
          const ke = keyError(r);
          const ve = validateValue?.(r.value, r.key) ?? null;
          const showMask = r.secret && !revealed[r.id];
          return (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-md bg-s2 p-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-start md:bg-transparent md:p-0">
              <div className="grid gap-1">
                <input
                  aria-label={`${keyLabel} ${i + 1}`}
                  aria-invalid={ke ? true : undefined}
                  aria-describedby={ke ? `${uid}-ke-${r.id}` : undefined}
                  value={r.key}
                  placeholder={keyPlaceholder}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  onChange={(e) => patch(r.id, { key: e.target.value })}
                  onPaste={(e) => onPaste(e, r.id)}
                  className={cn(bareInput, 'h-ctl-md w-full flex-none rounded-md bg-s2 px-4 font-mono text-[13.5px] focus-visible:ring-2 focus-visible:ring-accent md:bg-s2', ke && 'ring-2 ring-bad')}
                />
                {ke ? <p id={`${uid}-ke-${r.id}`} className="px-1 text-[12.5px] font-semibold text-bad">{ke}</p> : null}
              </div>
              <div className="grid gap-1">
                <div className={cn('flex h-ctl-md min-w-0 items-center rounded-md bg-s2 pr-1 focus-within:ring-2 focus-within:ring-accent', ve && 'ring-2 ring-bad')}>
                  <input
                    aria-label={`${valueLabel} ${i + 1}`}
                    aria-invalid={ve ? true : undefined}
                    type={showMask ? 'password' : 'text'}
                    value={r.value}
                    placeholder={valuePlaceholder}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    onChange={(e) => patch(r.id, { value: e.target.value })}
                    className={cn(bareInput, 'h-full px-4 font-mono text-[13.5px]')}
                  />
                  {allowSecret ? (
                    <>
                      {r.secret ? (
                        <IconButton label={showMask ? `Reveal ${valueLabel} ${i + 1}` : `Hide ${valueLabel} ${i + 1}`} aria-pressed={!showMask} icon={showMask ? 'view' : 'view-off'} size="sm" onClick={() => setRevealed((s) => ({ ...s, [r.id]: !s[r.id] }))} />
                      ) : null}
                      <IconButton label={r.secret ? `Mark row ${i + 1} as not secret` : `Mark row ${i + 1} as secret`} aria-pressed={!!r.secret} icon="lock" size="sm" variant={r.secret ? 'subtle' : 'ghost'} onClick={() => patch(r.id, { secret: !r.secret })} />
                    </>
                  ) : null}
                </div>
                {ve ? <p className="px-1 text-[12.5px] font-semibold text-bad">{ve}</p> : null}
              </div>
              <IconButton label={`Remove row ${i + 1}`} icon="delete-02" variant="danger" className="justify-self-end" onClick={() => remove(r.id)} />
            </li>
          );
        })}
      </ul>
      <div>
        <Button size="sm" variant="secondary" leadingIcon="add-01" disabled={rows.length >= maxRows} onClick={() => onRowsChange([...rows, { id: newRowId(), key: '', value: '' }])}>
          {addLabel}
        </Button>
        {rows.length >= maxRows ? <span className="ml-3 text-[13px] text-ink3">Limit of {maxRows} reached.</span> : null}
      </div>
    </fieldset>
  );
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** KeyValueEditor specialised for environment variables: POSIX-style names, secret masking, `.env` paste, platform-reserved names. */
export function EnvironmentVariableEditor(props: Omit<KeyValueEditorProps, 'validateKey' | 'allowSecret' | 'pasteLines' | 'keyLabel' | 'valueLabel' | 'keyPlaceholder' | 'valuePlaceholder'>) {
  return (
    <KeyValueEditor
      {...props}
      allowSecret
      pasteLines
      keyLabel="Variable name"
      valueLabel="Variable value"
      keyPlaceholder="DISCORD_TOKEN"
      valuePlaceholder="value"
      validateKey={(k) => (ENV_KEY.test(k) ? null : 'Use letters, numbers and underscores, and do not start with a number.')}
      addLabel="Add variable"
    />
  );
}

export function SecretNote() {
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium text-ink3">
      <Icon name="lock" size={14} /> Secret values are masked here and encrypted on the server.
    </p>
  );
}
