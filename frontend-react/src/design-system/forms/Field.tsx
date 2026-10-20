import type { ReactNode } from 'react';
import { Field as BaseField } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { cn } from '@/lib/utils/cn';

export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  /** Error message. Presence marks the control invalid and announces the message. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Name used by form submission and Base UI validation. */
  name?: string;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wires label, description and error to whichever control sits inside it (Base UI controls pick this up automatically).
 * Description is read with the control, the error is announced when it appears.
 */
export function Field({ label, description, error, required, disabled, name, hideLabel, className, children }: FieldProps) {
  return (
    <BaseField.Root invalid={error ? true : undefined} disabled={disabled} name={name} className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <BaseField.Label className={cn('text-[13px] font-bold text-ink2', hideLabel && 'sr-only')}>
        {label}
        {required ? <span aria-hidden="true" className="ml-1 text-bad">*</span> : null}
      </BaseField.Label>
      {children}
      {description ? <BaseField.Description className="text-[13px] font-medium text-ink3">{description}</BaseField.Description> : null}
      <BaseField.Error match={error ? true : undefined} className="text-[13px] font-semibold text-bad">{error}</BaseField.Error>
    </BaseField.Root>
  );
}

/** Groups related fields under one legend (radio sets, address blocks). */
export function FieldGroup({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Fieldset.Root className={cn('grid gap-3', className)}>
      <div className="grid gap-0.5">
        <Fieldset.Legend className="text-[15px] font-extrabold tracking-[-0.02em]">{legend}</Fieldset.Legend>
        {description ? <p className="text-[13px] text-ink3">{description}</p> : null}
      </div>
      {children}
    </Fieldset.Root>
  );
}

/** Titled block inside a long form. Prefer several sections or a wizard over one giant form. */
export function FormSection({ title, description, children, aside }: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg bg-s1 p-[18px] md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-8 md:p-6">
      <div className="grid content-start gap-1">
        <h3 className="text-lg font-extrabold tracking-[-0.03em]">{title}</h3>
        {description ? <p className="text-ink2">{description}</p> : null}
        {aside}
      </div>
      <div className="grid min-w-0 gap-4">{children}</div>
    </section>
  );
}
