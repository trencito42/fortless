import { Input } from '@base-ui/react/input';
import { Field, type FieldProps } from './Field';
import { InputGroup } from './InputGroup';
import { bareInput } from './control-styles';
import { CopyButton } from '../actions/CopyButton';

export interface CopyFieldProps extends Pick<FieldProps, 'label' | 'description' | 'hideLabel'> {
  value: string;
  /** Shown instead of the value when it is missing (for example "Pending"). The copy button is removed. */
  emptyText?: string;
  className?: string;
}

/**
 * Read-only technical value with a copy button: hosts, ports, IDs, SFTP usernames. Monospace, selectable on focus.
 * For anything secret use SecretField, which keeps the value out of the DOM until revealed.
 */
export function CopyField({ label, description, hideLabel, value, emptyText = '—', className }: CopyFieldProps) {
  const has = value !== '';
  return (
    <Field label={label} description={description} hideLabel={hideLabel} className={className}>
      <InputGroup readOnly suffix={has ? <CopyButton label={`Copy ${typeof label === 'string' ? label.toLowerCase() : 'value'}`} value={value} /> : null}>
        <Input readOnly value={has ? value : emptyText} className={`${bareInput} font-mono text-[13.5px]`} onFocus={(e) => e.currentTarget.select()} />
      </InputGroup>
    </Field>
  );
}
