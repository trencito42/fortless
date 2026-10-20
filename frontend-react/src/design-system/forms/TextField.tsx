import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Input } from '@base-ui/react/input';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { InputGroup } from './InputGroup';
import { bareInput, type ControlSize } from './control-styles';
import { Icon, type IconName } from '../icons/Icon';
import { IconButton } from '../primitives/IconButton';

type InputAttrs = Omit<ComponentPropsWithoutRef<typeof Input>, 'className' | 'size' | 'prefix'>;

export interface TextFieldProps extends InputAttrs, Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  leadingIcon?: IconName;
  size?: ControlSize;
  className?: string;
}

/** Single-line text. Use a more specific field when one exists: NumberField for numbers, SecretField for secrets, Select for fixed options. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, description, error, hideLabel, prefix, suffix, leadingIcon, size, className, required, disabled, readOnly, ...input },
  ref,
) {
  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} className={className}>
      <InputGroup size={size} invalid={!!error} disabled={disabled} readOnly={readOnly} prefix={leadingIcon ? <Icon name={leadingIcon} size={18} /> : prefix} suffix={suffix}>
        <Input ref={ref} required={required} disabled={disabled} readOnly={readOnly} className={bareInput} {...input} />
      </InputGroup>
    </Field>
  );
});

export interface TextareaProps extends Pick<FieldProps, 'label' | 'description' | 'error'>, Omit<ComponentPropsWithoutRef<'textarea'>, 'className'> {
  className?: string;
  /** Show a live character count against maxLength. */
  counter?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, description, error, className, counter, maxLength, value, defaultValue, onChange, required, disabled, ...rest }, ref) {
  const [len, setLen] = useState(String(value ?? defaultValue ?? '').length);
  return (
    <Field label={label} description={description} error={error} required={required} disabled={disabled} className={className}>
      <div className={cn('grid rounded-md bg-s2 transition-shadow focus-within:ring-2 focus-within:ring-accent', error && 'ring-2 ring-bad')}>
        <Input
          render={
            <textarea
              ref={ref}
              rows={4}
              required={required}
              disabled={disabled}
              maxLength={maxLength}
              value={value}
              defaultValue={defaultValue}
              onChange={(e) => {
                setLen(e.target.value.length);
                onChange?.(e);
              }}
              className="min-h-24 w-full resize-y bg-transparent px-4 py-3 text-[14.5px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink3"
              {...rest}
            />
          }
        />
        {counter && maxLength ? <span className="px-4 pb-2 text-right text-xs font-bold text-ink3" aria-hidden="true">{len}/{maxLength}</span> : null}
      </div>
    </Field>
  );
});

export interface SearchFieldProps extends Omit<TextFieldProps, 'type' | 'leadingIcon' | 'suffix' | 'prefix' | 'label' | 'hideLabel'> {
  label?: string;
  onClear?: () => void;
}
/** Search input with a clear button. The label is visually hidden by default; keep it for screen readers. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ label = 'Search', onClear, value, ...rest }, ref) {
  const hasValue = value !== undefined && String(value).length > 0;
  return (
    <TextField
      ref={ref}
      type="search"
      role="searchbox"
      label={label}
      hideLabel
      leadingIcon="search-01"
      value={value}
      suffix={hasValue && onClear ? <IconButton label="Clear search" icon="cancel-01" size="sm" onClick={onClear} /> : undefined}
      {...rest}
    />
  );
});

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'suffix' | 'prefix' | 'leadingIcon'> {
  /** "new-password" for creation, "current-password" for sign-in so password managers behave. */
  autoComplete?: 'new-password' | 'current-password';
}
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField({ autoComplete = 'current-password', ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      ref={ref}
      type={show ? 'text' : 'password'}
      autoComplete={autoComplete}
      suffix={<IconButton label={show ? 'Hide password' : 'Show password'} aria-pressed={show} icon={show ? 'view-off' : 'view'} size="sm" onClick={() => setShow((s) => !s)} />}
      {...rest}
    />
  );
});
