import type { ReactNode } from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { CheckboxGroup as BaseCheckboxGroup } from '@base-ui/react/checkbox-group';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Field as BaseField } from '@base-ui/react/field';
import { Fieldset } from '@base-ui/react/fieldset';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

const box = 'grid size-[22px] shrink-0 place-items-center rounded-xs bg-s3 text-on-accent transition-colors data-[checked]:bg-accent data-[indeterminate]:bg-accent data-[disabled]:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export interface CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  error?: ReactNode;
  className?: string;
}

/** Independent yes/no or one item in a multi-select set. For a setting that takes effect immediately use Switch. */
export function Checkbox({ label, description, checked, defaultChecked, indeterminate, onCheckedChange, disabled, required, name, value, error, className }: CheckboxProps) {
  return (
    <BaseField.Root invalid={error ? true : undefined} disabled={disabled} className={cn('grid content-start gap-1', className)}>
      <BaseField.Label className="flex min-h-ctl-md cursor-pointer items-start gap-3 py-2 data-[disabled]:cursor-not-allowed">
        <BaseCheckbox.Root checked={checked} defaultChecked={defaultChecked} indeterminate={indeterminate} onCheckedChange={onCheckedChange} disabled={disabled} required={required} name={name} value={value} className={cn(box, 'mt-0.5')}>
          <BaseCheckbox.Indicator keepMounted={false} className="grid place-items-center">
            <Icon name={indeterminate ? 'remove-01' : 'tick-02'} size={16} />
          </BaseCheckbox.Indicator>
        </BaseCheckbox.Root>
        <span className="grid gap-0.5">
          <span className="text-[14.5px] font-semibold text-ink">{label}</span>
          {description ? <span className="text-[13px] font-medium text-ink3">{description}</span> : null}
        </span>
      </BaseField.Label>
      <BaseField.Error match={error ? true : undefined} className="text-[13px] font-semibold text-bad">{error}</BaseField.Error>
    </BaseField.Root>
  );
}

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  icon?: IconName;
  /** Right-aligned detail, for example a price. */
  meta?: ReactNode;
}

export interface CheckboxGroupProps {
  legend: string;
  description?: ReactNode;
  options: ChoiceOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  error?: ReactNode;
  disabled?: boolean;
  className?: string;
}
export function CheckboxGroup({ legend, description, options, value, defaultValue, onValueChange, error, disabled, className }: CheckboxGroupProps) {
  return (
    <Fieldset.Root render={<BaseCheckboxGroup value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} />} className={cn('grid content-start gap-1', className)}>
      <Fieldset.Legend className="text-[13px] font-bold text-ink2">{legend}</Fieldset.Legend>
      {description ? <p className="text-[13px] text-ink3">{description}</p> : null}
      {options.map((o) => (
        <Checkbox key={o.value} value={o.value} label={o.label} description={o.description} disabled={o.disabled} />
      ))}
      {error ? <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : null}
    </Fieldset.Root>
  );
}

export interface RadioGroupProps {
  legend: string;
  description?: ReactNode;
  options: ChoiceOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  error?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
  /** Lay out radio options in a row from sm up. */
  inline?: boolean;
}

const radioDot = 'grid size-[22px] shrink-0 place-items-center rounded-full bg-s3 transition-colors data-[checked]:bg-accent data-[disabled]:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Pick one from 2 to 6 plain options when all of them should be visible. Use RadioCardGroup when options need rich content. */
export function RadioGroup({ legend, description, options, value, defaultValue, onValueChange, error, disabled, required, name, className, inline }: RadioGroupProps) {
  return (
    <Fieldset.Root render={<BaseRadioGroup value={value} defaultValue={defaultValue} onValueChange={(v) => onValueChange?.(String(v))} disabled={disabled} required={required} name={name} />} className={cn('grid content-start gap-1', className)}>
      <Fieldset.Legend className="text-[13px] font-bold text-ink2">{legend}</Fieldset.Legend>
      {description ? <p className="text-[13px] text-ink3">{description}</p> : null}
      <div className={cn('grid gap-x-6', inline && 'sm:flex sm:flex-wrap')}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-ctl-md cursor-pointer items-start gap-3 py-2 data-[disabled]:cursor-not-allowed">
            <Radio.Root value={o.value} disabled={o.disabled} className={cn(radioDot, 'mt-0.5')}>
              <Radio.Indicator keepMounted={false} className="size-2.5 rounded-full bg-on-accent" />
            </Radio.Root>
            <span className="grid gap-0.5">
              <span className="text-[14.5px] font-semibold text-ink">{o.label}</span>
              {o.description ? <span className="text-[13px] font-medium text-ink3">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error ? <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : null}
    </Fieldset.Root>
  );
}

/**
 * Selectable cards for choices that need explanation: software type, plan, region, quick vs custom.
 * Still a radio group underneath: arrow keys move, Tab leaves, screen readers hear the option and its description.
 */
export function RadioCardGroup({ legend, description, options, value, defaultValue, onValueChange, error, disabled, name, className, columns = 2 }: Omit<RadioGroupProps, 'inline' | 'required'> & { columns?: 1 | 2 | 3 | 4 }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <Fieldset.Root render={<BaseRadioGroup value={value} defaultValue={defaultValue} onValueChange={(v) => onValueChange?.(String(v))} disabled={disabled} name={name} />} className={cn('grid content-start gap-2', className)}>
      <Fieldset.Legend className="text-[13px] font-bold text-ink2">{legend}</Fieldset.Legend>
      {description ? <p className="-mt-1 text-[13px] text-ink3">{description}</p> : null}
      <div className={cn('grid gap-2', cols)}>
        {options.map((o) => (
          <Radio.Root
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className="group flex min-h-ctl-lg w-full cursor-pointer items-start gap-3 rounded-lg bg-s2 p-4 text-left outline-none transition-[background-color,box-shadow] hover:bg-s3 data-[checked]:bg-accent-bg data-[checked]:ring-2 data-[checked]:ring-accent focus-visible:ring-2 focus-visible:ring-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
          >
            {o.icon ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-s1 text-ink2 group-data-[checked]:bg-accent group-data-[checked]:text-on-accent"><Icon name={o.icon} size={20} /></span>
            ) : null}
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">{o.label}</span>
              {o.description ? <span className="text-[13px] font-medium text-ink2">{o.description}</span> : null}
            </span>
            {o.meta ? <span className="shrink-0 text-[13px] font-bold text-ink2">{o.meta}</span> : null}
            <Radio.Indicator keepMounted={false} className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><Icon name="tick-02" size={14} /></Radio.Indicator>
          </Radio.Root>
        ))}
      </div>
      {error ? <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : null}
    </Fieldset.Root>
  );
}

/**
 * Multi-select cards (addons, notification channels, game modes). Same visuals as RadioCardGroup, but any number can be on.
 * Still a checkbox group: Space toggles, Tab moves between cards, each card is announced with its description.
 */
export function CheckboxCardGroup({ legend, description, options, value, defaultValue, onValueChange, error, disabled, className, columns = 2 }: CheckboxGroupProps & { columns?: 1 | 2 | 3 | 4 }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <Fieldset.Root render={<BaseCheckboxGroup value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} />} className={cn('grid content-start gap-2', className)}>
      <Fieldset.Legend className="text-[13px] font-bold text-ink2">{legend}</Fieldset.Legend>
      {description ? <p className="-mt-1 text-[13px] text-ink3">{description}</p> : null}
      <div className={cn('grid gap-2', cols)}>
        {options.map((o) => (
          <BaseCheckbox.Root
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className="group flex min-h-ctl-lg w-full cursor-pointer items-start gap-3 rounded-lg bg-s2 p-4 text-left outline-none transition-[background-color,box-shadow] hover:bg-s3 data-[checked]:bg-accent-bg data-[checked]:ring-2 data-[checked]:ring-accent focus-visible:ring-2 focus-visible:ring-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
          >
            {o.icon ? <span className="grid size-10 shrink-0 place-items-center rounded-md bg-s1 text-ink2 group-data-[checked]:bg-accent group-data-[checked]:text-on-accent"><Icon name={o.icon} size={20} /></span> : null}
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">{o.label}</span>
              {o.description ? <span className="text-[13px] font-medium text-ink2">{o.description}</span> : null}
            </span>
            {o.meta ? <span className="shrink-0 text-[13px] font-bold text-ink2">{o.meta}</span> : null}
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-xs bg-s4 text-on-accent group-data-[checked]:bg-accent"><BaseCheckbox.Indicator keepMounted={false}><Icon name="tick-02" size={14} /></BaseCheckbox.Indicator></span>
          </BaseCheckbox.Root>
        ))}
      </div>
      {error ? <p role="alert" className="text-[13px] font-semibold text-bad">{error}</p> : null}
    </Fieldset.Root>
  );
}

export interface SwitchProps {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  className?: string;
  /** Keep the label for assistive tech but do not show it, for example a switch in a table row whose column header already says what it does. */
  hideLabel?: boolean;
}

/** A setting that applies immediately (auto-restart, maintenance mode). For form choices submitted later use Checkbox. */
export function Switch({ label, description, checked, defaultChecked, onCheckedChange, disabled, readOnly, name, className, hideLabel }: SwitchProps) {
  return (
    <BaseField.Root disabled={disabled} className={cn('block', className)}>
      <BaseField.Label className="flex min-h-ctl-md cursor-pointer items-center justify-between gap-4 py-1.5 data-[disabled]:cursor-not-allowed">
        <span className={cn('grid gap-0.5', hideLabel && 'sr-only')}>
          <span className="text-[14.5px] font-semibold text-ink">{label}</span>
          {description ? <span className="text-[13px] font-medium text-ink3">{description}</span> : null}
        </span>
        <BaseSwitch.Root checked={checked} defaultChecked={defaultChecked} onCheckedChange={onCheckedChange} disabled={disabled} readOnly={readOnly} name={name} className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-s4 transition-colors duration-200 outline-none data-[checked]:bg-accent data-[disabled]:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <BaseSwitch.Thumb className="absolute top-[3px] left-[3px] size-6 rounded-full bg-s1 transition-transform duration-200 ease-petal data-[checked]:translate-x-5 data-[checked]:bg-on-accent" />
        </BaseSwitch.Root>
      </BaseField.Label>
    </BaseField.Root>
  );
}
