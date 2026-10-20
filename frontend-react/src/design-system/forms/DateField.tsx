import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Input } from '@base-ui/react/input';
import { Field, type FieldProps } from './Field';
import { InputGroup } from './InputGroup';
import { bareInput } from './control-styles';
import { Icon } from '../icons/Icon';

interface Props extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'>, Omit<ComponentPropsWithoutRef<typeof Input>, 'className' | 'type' | 'size'> {
  className?: string;
}

/**
 * Date and time use the platform controls: native pickers are accessible, localised and touch friendly on every device.
 * A custom calendar popover is a later addition if a product need appears (date ranges with presets).
 */
export const DateField = forwardRef<HTMLInputElement, Props>(function DateField({ label, description, error, hideLabel, className, required, disabled, readOnly, ...rest }, ref) {
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <InputGroup invalid={!!error} disabled={disabled} readOnly={readOnly} prefix={<Icon name="calendar-01" size={18} />}>
        <Input ref={ref} type="date" required={required} disabled={disabled} readOnly={readOnly} className={bareInput} {...rest} />
      </InputGroup>
    </Field>
  );
});

export const TimeField = forwardRef<HTMLInputElement, Props>(function TimeField({ label, description, error, hideLabel, className, required, disabled, readOnly, ...rest }, ref) {
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <InputGroup invalid={!!error} disabled={disabled} readOnly={readOnly} prefix={<Icon name="clock-01" size={18} />}>
        <Input ref={ref} type="time" required={required} disabled={disabled} readOnly={readOnly} className={bareInput} {...rest} />
      </InputGroup>
    </Field>
  );
});
