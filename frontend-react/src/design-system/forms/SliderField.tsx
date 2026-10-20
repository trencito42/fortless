import { Slider } from '@base-ui/react/slider';
import { Field, type FieldProps } from './Field';
import { cn } from '@/lib/utils/cn';

export interface SliderFieldProps extends Pick<FieldProps, 'label' | 'description' | 'error'> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Format the visible value, for example (v) => `${v} MB`. */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/** Continuous or stepped value where relative position matters (view distance, memory share). For exact numbers use NumberField. */
export function SliderField({ label, description, error, value, defaultValue, onValueChange, min = 0, max = 100, step = 1, formatValue, disabled, className }: SliderFieldProps) {
  return (
    <Field label={label} description={description} error={error} disabled={disabled} className={className}>
      <Slider.Root
        value={value}
        defaultValue={defaultValue ?? min}
        onValueChange={(v) => onValueChange?.(Array.isArray(v) ? (v[0] ?? min) : v)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="grid gap-2"
      >
        <Slider.Value className="text-[14px] font-extrabold tabular-nums">{(_f: readonly string[], v: readonly number[]) => (formatValue ? formatValue(v[0] ?? min) : String(v[0] ?? min))}</Slider.Value>
        <Slider.Control className="flex h-ctl-md touch-none items-center">
          <Slider.Track className="relative h-2.5 w-full rounded-full bg-s3">
            <Slider.Indicator className="rounded-full bg-accent" />
            <Slider.Thumb aria-label={typeof label === 'string' ? label : undefined} className={cn('size-6 rounded-full bg-accent outline-none ring-4 ring-bg transition-transform active:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[disabled]:opacity-50')} />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </Field>
  );
}
