import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '../icons/Icon';
import { Button } from '../primitives/Button';

export type WizardErrors = Record<string, string>;

export interface WizardContext<T> {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  errors: WizardErrors;
}

export interface WizardStep<T> {
  id: string;
  title: string;
  description?: string;
  /** Short label for the stepper on desktop. Defaults to title. */
  label?: string;
  content: (ctx: WizardContext<T>) => ReactNode;
  /** Return field errors to block Next. Return undefined or {} when the step is valid. */
  validate?: (values: T) => WizardErrors | undefined;
}

export interface FormWizardProps<T> {
  steps: WizardStep<T>[];
  values: T;
  onChange: (values: T) => void;
  /** May be async. A thrown error is shown above the actions and the wizard stays on the last step. */
  onSubmit: (values: T) => void | Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
  /** Review content shown beside the step on wide screens and above the actions on phones. */
  aside?: (values: T) => ReactNode;
  /**
   * When set, the draft (values, current step, furthest step) is kept in sessionStorage under this key
   * and restored on mount through onChange. It is cleared after a successful submit and on Cancel.
   * Every value is written as JSON unless excluded, so list sensitive keys in `persistExclude`.
   */
  persistKey?: string;
  /**
   * Keys that are never written to storage (passwords, bot tokens, API keys). After a reload they come back as whatever
   * the caller's initial `values` hold, so the person types them again.
   */
  persistExclude?: (keyof T)[];
  className?: string;
}

interface Draft<T> { values: T; index: number; reached: number }
const storageKey = (k: string) => `fortless-ui:wizard:${k}`;
function readDraft<T>(key: string | undefined, stepCount: number): Draft<T> | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft<T>;
    if (typeof d.index !== 'number' || typeof d.reached !== 'number' || d.index < 0 || d.index >= stepCount) return null;
    return d;
  } catch { return null; }
}
function writeDraft<T>(key: string | undefined, d: Draft<T> | null, exclude: (keyof T)[] = []) {
  if (!key) return;
  try {
    if (d) {
      const kept = Object.fromEntries(Object.entries(d.values as Record<string, unknown>).filter(([k]) => !exclude.includes(k as keyof T))) as T;
      sessionStorage.setItem(storageKey(key), JSON.stringify({ ...d, values: kept }));
    } else sessionStorage.removeItem(storageKey(key));
  } catch { /* storage unavailable: the wizard still works, the draft is just not kept */ }
}

/**
 * Multi-step form. State is owned by the caller (so it can be persisted or shared with a summary).
 * Next validates the current step; Back never loses data; the stepper only lets people jump back to completed steps.
 */
export function FormWizard<T>({ steps, values, onChange, onSubmit, submitLabel = 'Finish', onCancel, aside, persistKey, persistExclude, className }: FormWizardProps<T>) {
  const [restored] = useState(() => readDraft<T>(persistKey, steps.length));
  const [index, setIndex] = useState(restored?.index ?? 0);
  const [reached, setReached] = useState(restored?.reached ?? 0);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const step = steps[index];

  const restoredRef = useRef(restored);
  useEffect(() => {
    if (restoredRef.current) {
      // Excluded keys keep the caller's initial values, even if an older draft in storage still held them.
      const back = Object.fromEntries(Object.entries(restoredRef.current.values as Record<string, unknown>).filter(([k]) => !(persistExclude ?? []).includes(k as keyof T)));
      onChange({ ...values, ...back } as T);
      restoredRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (restoredRef.current) return; // wait until the restored values have been applied
    writeDraft(persistKey, { values, index, reached }, persistExclude);
    // persistExclude is read at write time; a new array identity each render must not rewrite storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey, values, index, reached]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headingRef.current?.focus();
  }, [index]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const set: WizardContext<T>['set'] = (key, value) => {
    onChange({ ...values, [key]: value });
    if (errors[key as string]) setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };

  const go = (to: number) => { setErrors({}); setSubmitError(null); setIndex(to); setReached((r) => Math.max(r, to)); };
  const next = async () => {
    const found = step.validate?.(values);
    if (found && Object.keys(found).length > 0) { setErrors(found); return; }
    if (!last) { go(index + 1); return; }
    setBusy(true); setSubmitError(null);
    try { await onSubmit(values); writeDraft(persistKey, null); } catch (e) { setSubmitError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  const errorCount = Object.keys(errors).length;
  return (
    <div className={cn('grid gap-5', className)}>
      <nav aria-label="Progress">
        <p className="text-[13.5px] font-bold text-ink3 sm:hidden">Step {index + 1} of {steps.length} · {step.label ?? step.title}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-s3 sm:hidden"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
        <ol className="hidden items-center gap-2 sm:flex">
          {steps.map((s, i) => {
            const done = i < index || (i <= reached && i !== index);
            const canJump = i < index || (i <= reached && i !== index);
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
                <button type="button" disabled={!canJump} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)} className="flex items-center gap-2 rounded-full pr-2 font-bold disabled:cursor-default">
                  <span className={cn('grid size-8 place-items-center rounded-full text-[13px]', i === index ? 'bg-accent text-on-accent' : done ? 'bg-good-bg text-good' : 'bg-s3 text-ink3')}>{done && i !== index ? <Icon name="tick-02" size={16} /> : i + 1}</span>
                  <span className={cn(i === index ? 'text-ink' : 'text-ink3')}>{s.label ?? s.title}</span>
                </button>
                {i < steps.length - 1 ? <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-s3" /> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className={cn('grid gap-5', aside && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        <section aria-labelledby={`wz-${step.id}`} className="grid min-w-0 content-start gap-4 rounded-lg bg-s1 p-5 sm:p-6">
          <header className="grid gap-1">
            <h2 id={`wz-${step.id}`} ref={headingRef} tabIndex={-1} className="text-[22px] leading-tight font-extrabold tracking-[-0.04em] outline-none">{step.title}</h2>
            {step.description ? <p className="text-ink2">{step.description}</p> : null}
          </header>
          {errorCount > 0 ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">{errorCount === 1 ? 'Fix 1 field to continue.' : `Fix ${errorCount} fields to continue.`}</p> : null}
          {step.content({ values, set, errors })}
        </section>
        {aside ? <aside aria-label="Summary" className="grid content-start gap-3 rounded-lg bg-s2 p-5">{aside(values)}</aside> : null}
      </div>

      {submitError ? <p role="alert" className="rounded-md bg-bad-bg px-4 py-2.5 font-semibold text-bad">{submitError}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancel ? <Button variant="ghost" onClick={() => { writeDraft(persistKey, null); onCancel(); }} disabled={busy}>Cancel</Button> : null}
          {index > 0 ? <Button variant="secondary" leadingIcon="arrow-left-01" onClick={() => go(index - 1)} disabled={busy}>Back</Button> : null}
        </div>
        <Button variant="primary" loading={busy} loadingLabel={last ? 'Working' : undefined} trailingIcon={last ? undefined : 'arrow-right-01'} onClick={next}>{last ? submitLabel : 'Continue'}</Button>
      </div>
    </div>
  );
}
