import { Select as BaseSelect } from '@base-ui/react/select';
import { cn } from '@/lib/utils/cn';
import { Field, type FieldProps } from './Field';
import { controlBox, controlHeight, type ControlSize } from './control-styles';
import { Icon } from '../icons/Icon';
import { menuItemStyles, menuLabelStyles, popupSurface } from '../overlays/popup-styles';
import type { Option } from './options';

export interface SelectProps extends Pick<FieldProps, 'label' | 'description' | 'error' | 'hideLabel'> {
  options: Option[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  size?: ControlSize;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
}

/**
 * Pick one value from a known list of up to about 15 options. Options with `group` are listed under headings (GroupedSelect).
 * Beyond that, or when users know what they are looking for, use SearchableSelect. For 2 to 5 options consider SegmentedControl or RadioCardGroup.
 */
export function Select({ label, description, error, hideLabel, options, value, defaultValue, onValueChange, placeholder = 'Select an option', size = 'md', disabled, required, name, className }: SelectProps) {
  const groups = new Map<string | undefined, Option[]>();
  for (const o of options) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
  const items = options.map((o) => ({ value: o.value, label: o.label }));

  const renderItem = (o: Option) => (
    <BaseSelect.Item key={o.value} value={o.value} disabled={o.disabled} className={cn(menuItemStyles, 'data-[selected]:text-ink')}>
      <BaseSelect.ItemText className="flex-1">
        {o.label}
        {o.description ? <span className="block text-[12.5px] font-medium text-ink3">{o.description}</span> : null}
      </BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className="text-accent"><Icon name="tick-02" size={16} /></BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );

  return (
    <Field label={label} description={description} error={error} hideLabel={hideLabel} required={required} disabled={disabled} name={name} className={className}>
      <BaseSelect.Root items={items} value={value} defaultValue={defaultValue} onValueChange={(v) => onValueChange?.(v as string | null)} disabled={disabled} required={required} name={name}>
        <BaseSelect.Trigger className={cn(controlBox, controlHeight[size], 'cursor-pointer text-left font-semibold')} data-invalid={error ? true : undefined}>
          <BaseSelect.Value placeholder={placeholder} className="min-w-0 flex-1 truncate data-[placeholder]:font-medium data-[placeholder]:text-ink3" />
          <BaseSelect.Icon className="text-ink3"><Icon name="arrow-down-01" size={18} /></BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner sideOffset={6} collisionPadding={8} alignItemWithTrigger={false} className="z-[70] outline-none">
            <BaseSelect.Popup className={cn(popupSurface, 'w-[var(--anchor-width)] min-w-[200px] max-h-[min(var(--available-height),380px)] overflow-auto')}>
              <BaseSelect.List className="outline-none">
                {Array.from(groups).map(([g, list]) =>
                  g ? (
                    <BaseSelect.Group key={g}>
                      <BaseSelect.GroupLabel className={menuLabelStyles}>{g}</BaseSelect.GroupLabel>
                      {list.map(renderItem)}
                    </BaseSelect.Group>
                  ) : (
                    list.map(renderItem)
                  ),
                )}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </Field>
  );
}
