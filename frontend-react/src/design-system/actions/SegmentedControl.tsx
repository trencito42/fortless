import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '../icons/Icon';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  /** Hide the text label on narrow screens and keep the icon (label stays for assistive tech). */
  iconOnlyOnMobile?: boolean;
}

const item = cva(
  'relative inline-flex flex-1 select-none items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap text-ink2 transition-[background-color,color] duration-200 outline-none hover:text-ink data-[checked]:bg-s1 data-[checked]:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
  {
    variants: { size: { sm: 'h-[calc(var(--ctl-sm)-6px)] px-3.5 text-[13px]', md: 'h-[calc(var(--ctl-md)-6px)] px-4 text-[14px]' } },
    defaultVariants: { size: 'md' },
  },
);

export interface SegmentedControlProps<T extends string> {
  /** Required: names the choice, for example "Time range". */
  'aria-label': string;
  options: SegmentOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Choose exactly one option from a small set (2 to 5): a time range, a view mode, Quick vs Custom.
 * Semantics: radiogroup. Arrow keys move and select, Tab leaves the group.
 * For more than five options use Select. For independent actions use ButtonGroup.
 */
export function SegmentedControl<T extends string>({ options, value, defaultValue, onValueChange, size, block, disabled, className, ...aria }: SegmentedControlProps<T>) {
  return (
    <RadioGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as T)}
      disabled={disabled}
      aria-label={aria['aria-label']}
      className={cn('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-s3 p-[3px] [scrollbar-width:none]', block && 'flex w-full', className)}
    >
      {options.map((o) => (
        <Radio.Root key={o.value} value={o.value} disabled={o.disabled} aria-label={o.iconOnlyOnMobile ? o.label : undefined} className={item({ size })}>
          {o.icon ? <Icon name={o.icon} size={size === 'sm' ? 16 : 18} /> : null}
          <span className={cn(o.iconOnlyOnMobile && 'max-sm:sr-only')}>{o.label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
