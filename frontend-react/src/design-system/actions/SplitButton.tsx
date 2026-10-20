import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn } from '@/lib/utils/cn';
import { closeGroupGap } from './group-shape';
import { Button, type ButtonProps } from '../primitives/Button';
import { Icon } from '../icons/Icon';
import { popupSurface, positionerStyles } from '../overlays/popup-styles';
import { MenuEntries } from './MenuItems';
import type { MenuEntry } from './menu-types';

export interface SplitButtonProps extends Omit<ButtonProps, 'trailingIcon' | 'children'> {
  children: ReactNode;
  /** Related alternatives to the primary action. */
  entries: MenuEntry[];
  /** Accessible name of the chevron button, for example "More restart options". */
  menuLabel: string;
}

/** One primary action plus related alternatives: Restart with "Restart and clear console", Pay with "Pay another way". */
export function SplitButton({ children, entries, menuLabel, variant = 'primary', size = 'md', className, ...button }: SplitButtonProps) {
  return (
    <div className={cn('inline-flex', closeGroupGap, className)}>
      <Button {...button} variant={variant} size={size} >{children}</Button>
      <Menu.Root>
        <Menu.Trigger
          aria-label={menuLabel}
          disabled={button.disabled}
          render={<Button variant={variant} size={size} className={cn('px-0', size === 'sm' ? 'w-ctl-sm' : size === 'lg' ? 'w-ctl-lg' : 'w-ctl-md')} />}
        >
          <Icon name="arrow-down-01" size={18} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={6} collisionPadding={8} className={positionerStyles}>
            <Menu.Popup className={cn(popupSurface, 'min-w-[220px]')}>
              <MenuEntries entries={entries} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
