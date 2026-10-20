import type { ReactNode } from 'react';
import { NumberField as BaseNumber } from '@base-ui/react/number-field';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { controlBox, controlHeight, type ControlSize } from './control-styles';
import { Icon } from '../icons/Icon';

export interface NumberFieldProps extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  value?: number | null;
  defaultValue?: number;
  onValueChange?: (value: number | null) => void;
  /** Fires when the user finishes editing (blur, or after pressing a stepper), when the value is final. */
  onValueCommitted?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Step while holding Shift. */
  largeStep?: number;
  /** Unit shown after the number, for example "MB", "players", "s". */
  unit?: string;
  format?: Intl.NumberFormatOptions;
  size?: ControlSize;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
  /** "inline" puts the steppers at the right edge, "split" puts them on both sides (touch friendly). */
  steppers?: 'none' | 'inline' | 'split';
  placeholder?: string;
}

const stepBtn =
  'grid size-[calc(var(--ctl-md)-10px)] shrink-0 place-items-center rounded-full bg-s3 text-ink2 transition-[background-color,transform] hover:bg-s4 hover:text-ink active:scale-90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 touch-manipulation';

/**
 * Number entry with bounds and safe stepping. Typing is clamped on blur, arrow keys step, Shift steps by `largeStep`,
 * and out-of-range values cannot be committed. Use NumberStepper for small counts where +/- is the main interaction.
 */
export function NumberField({ label, description, error, hideLabel, value, defaultValue, onValueChange, onValueCommitted, min, max, step = 1, largeStep, unit, format, size = 'md', disabled, readOnly, required, name, className, steppers = 'inline', placeholder }: NumberFieldProps) {
  const split = steppers === 'split';
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} name={name} className={className}>
      <BaseNumber.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => onValueChange?.(v)}
        onValueCommitted={(v) => onValueCommitted?.(v)}
        min={min}
        max={max}
        step={step}
        largeStep={largeStep}
        format={format}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        name={name}
        className="min-w-0 w-full"
      >
        <BaseNumber.Group className={cn(controlBox, controlHeight[size], 'px-[5px]', !split && 'pl-4')} data-invalid={error ? true : undefined}>
          {split ? (
            <BaseNumber.Decrement aria-label={`Decrease ${typeof label === 'string' ? label : 'value'}`} className={stepBtn}>
              <Icon name="remove-01" size={18} />
            </BaseNumber.Decrement>
          ) : null}
          <BaseNumber.Input
            placeholder={placeholder}
            className={cn('min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold text-ink tabular-nums outline-none placeholder:text-ink3', split && 'text-center')}
          />
          {unit ? <span className="shrink-0 pr-1 text-[13px] font-bold text-ink3" aria-hidden="true">{unit}</span> : null}
          {steppers === 'inline' ? (
            <span className="flex shrink-0 gap-1">
              <BaseNumber.Decrement aria-label={`Decrease ${typeof label === 'string' ? label : 'value'}`} className={stepBtn}><Icon name="remove-01" size={18} /></BaseNumber.Decrement>
              <BaseNumber.Increment aria-label={`Increase ${typeof label === 'string' ? label : 'value'}`} className={stepBtn}><Icon name="add-01" size={18} /></BaseNumber.Increment>
            </span>
          ) : null}
          {split ? (
            <BaseNumber.Increment aria-label={`Increase ${typeof label === 'string' ? label : 'value'}`} className={stepBtn}>
              <Icon name="add-01" size={18} />
            </BaseNumber.Increment>
          ) : null}
        </BaseNumber.Group>
      </BaseNumber.Root>
    </Field>
  );
}

/** Split stepper: big touch-friendly minus and plus around the value. For counts such as max players or replicas. */
export function NumberStepper(props: Omit<NumberFieldProps, 'steppers'>): ReactNode {
  return <NumberField {...props} steppers="split" />;
}
