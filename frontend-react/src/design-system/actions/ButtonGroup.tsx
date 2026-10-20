import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { independentGroupGap } from './group-shape';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Required: describes what the group is for, for example "Power actions". */
  'aria-label': string;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Independent related actions joined into one object (Start, Restart, Stop). Each child is a normal Button with its own
 * variant and handler. This is NOT a selection control: use SegmentedControl when the user picks one option.
 */
export function ButtonGroup({ orientation = 'horizontal', className, ...rest }: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex max-w-full flex-wrap',
        independentGroupGap,
        orientation === 'vertical' && 'flex-col items-start',
        className,
      )}
      {...rest}
    />
  );
}
