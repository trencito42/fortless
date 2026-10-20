import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { controlBox, controlHeight, type ControlSize } from './control-styles';

export interface InputGroupProps {
  /** Static text or icon before the input ("https://", a search icon). */
  prefix?: ReactNode;
  /** Static text, unit or action after the input ("MB", a reveal button). */
  suffix?: ReactNode;
  size?: ControlSize;
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  children: ReactNode;
}

const adorn = 'flex shrink-0 items-center text-[14px] font-bold text-ink3';

/** Frames an input with attached prefix/suffix content so units, schemes and actions share one focus ring. */
export function InputGroup({ prefix, suffix, size = 'md', invalid, disabled, readOnly, className, children }: InputGroupProps) {
  return (
    <div className={cn(controlBox, controlHeight[size], suffix ? 'pr-2' : '', className)} data-invalid={invalid || undefined} data-disabled={disabled || undefined} data-readonly={readOnly || undefined}>
      {prefix ? <span className={adorn}>{prefix}</span> : null}
      {children}
      {suffix ? <span className={adorn}>{suffix}</span> : null}
    </div>
  );
}
