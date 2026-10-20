import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { cn } from '@/lib/utils/cn';
import { closeGroupGap } from './group-shape';
import { Icon, type IconName } from '../icons/Icon';

export interface ToggleOption {
  value: string;
  label: string;
  icon?: IconName;
  /** Show only the icon; the label becomes the accessible name. */
  iconOnly?: boolean;
}

export interface ToggleButtonGroupProps {
  'aria-label': string;
  options: ToggleOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Allow several pressed at once (default true). With false it behaves as an optional single choice: prefer SegmentedControl. */
  multiple?: boolean;
  className?: string;
}

/** Independent on/off switches that live together (Bold, Italic; Show CPU, Show RAM). Each toggle exposes aria-pressed. */
export function ToggleButtonGroup({ options, value, defaultValue, onValueChange, multiple = true, className, ...aria }: ToggleButtonGroupProps) {
  return (
    <ToggleGroup
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.([...v])}
      multiple={multiple}
      aria-label={aria['aria-label']}
      className={cn('inline-flex flex-wrap', closeGroupGap, className)}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          aria-label={o.iconOnly ? o.label : undefined}
          className={cn('inline-flex h-ctl-md items-center justify-center gap-2 rounded-full bg-s3 text-[14px] font-bold text-ink2 transition-colors hover:bg-s4 hover:text-ink data-[pressed]:bg-ink data-[pressed]:text-on-ink', o.iconOnly ? 'w-ctl-md' : 'px-4')}
        >
          {o.icon ? <Icon name={o.icon} size={18} /> : null}
          {o.iconOnly ? null : o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
