import type { SVGProps } from 'react';
import { ICON_PATHS, type IconName } from './paths';
import { cn } from '@/lib/utils/cn';

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: IconName;
  /** Pixel size. Default 20. */
  size?: number;
  /** Provide a label to expose the icon to assistive tech. Without it the icon is decorative. */
  label?: string;
}

/** Renders a Petal icon from the generated sprite. Strokes use currentColor, so color comes from the parent text color. */
export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={cn('block shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
      {...rest}
    />
  );
}
