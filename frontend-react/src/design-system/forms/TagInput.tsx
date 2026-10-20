import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { controlBox } from './control-styles';
import { Icon } from '../icons/Icon';

export interface TagInputProps extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Return a message to reject a tag, or null to accept it. */
  validate?: (tag: string, current: string[]) => string | null;
  placeholder?: string;
  max?: number;
  /** Characters that commit a tag besides Enter. */
  separators?: string[];
  disabled?: boolean;
  className?: string;
}

/** Free-form list of short values: allowed IPs, whitelisted players, tags. Enter or comma adds, Backspace on empty removes the last, paste splits. */
export function TagInput({ label, description, error, hideLabel, value, onValueChange, validate, placeholder = 'Type and press Enter', max, separators = [','], disabled, className }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();

  const add = (raw: string) => {
    const tags = raw.split(new RegExp(`[${separators.map((s) => s.replace(/[\\\]^-]/g, '\\$&')).join('')}\\n]`)).map((t) => t.trim()).filter(Boolean);
    let next = [...value];
    for (const t of tags) {
      if (max !== undefined && next.length >= max) return setMsg(`You can add up to ${max}.`);
      if (next.some((x) => x.toLowerCase() === t.toLowerCase())) { setMsg(`"${t}" is already in the list.`); continue; }
      const problem = validate?.(t, next) ?? null;
      if (problem) { setMsg(problem); continue; }
      next = [...next, t];
      setMsg(null);
      setLive(`Added ${t}`);
    }
    if (next.length !== value.length) onValueChange(next);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || separators.includes(e.key)) {
      if (draft.trim()) { e.preventDefault(); add(draft); }
      else if (e.key === 'Enter') e.preventDefault();
    } else if (e.key === 'Backspace' && !draft && value.length) {
      const last = value[value.length - 1];
      onValueChange(value.slice(0, -1));
      setLive(`Removed ${last ?? ''}`);
    }
  };

  const shownError = error ?? msg ?? undefined;
  return (
    <Field label={label} description={description} error={shownError} hideLabel={hideLabel} disabled={disabled} className={className}>
      {/* The wrapper click only forwards focus to the real input, which is fully keyboard operable. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={cn(controlBox, 'min-h-ctl-md flex-wrap gap-1 py-1.5')} data-invalid={shownError ? true : undefined} data-disabled={disabled || undefined} onClick={() => ref.current?.focus()}>
        {value.map((t) => (
          <span key={t} className="flex h-7 items-center gap-1 rounded-full bg-accent-bg pr-1 pl-3 text-[13px] font-bold text-accent-ink">
            {t}
            <button type="button" disabled={disabled} aria-label={`Remove ${t}`} onClick={(e) => { e.stopPropagation(); onValueChange(value.filter((x) => x !== t)); setLive(`Removed ${t}`); ref.current?.focus(); }} className="grid size-5 place-items-center rounded-full hover:bg-accent/20">
              <Icon name="cancel-01" size={12} />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); if (msg) setMsg(null); }}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add(draft)}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[,\n]/.test(t)) { e.preventDefault(); add(t); } }}
          placeholder={value.length ? '' : placeholder}
          aria-label={typeof label === 'string' ? `${label}: add new` : 'Add new'}
          className="h-7 min-w-28 flex-1 bg-transparent text-[14.5px] font-semibold outline-none placeholder:font-medium placeholder:text-ink3"
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">{live}</span>
    </Field>
  );
}
