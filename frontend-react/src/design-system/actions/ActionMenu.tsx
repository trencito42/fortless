import type { ReactElement, ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn } from '@/lib/utils/cn';
import { Button, type ButtonProps } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { popupSurface, positionerStyles } from '../overlays/popup-styles';
import { MenuEntries } from './MenuItems';
import type { MenuEntry } from './menu-types';

export interface ActionMenuProps {
  entries: MenuEntry[];
  /** Custom trigger element (rendered as the trigger itself). Defaults to a "more" icon button. */
  trigger?: ReactElement<Record<string, unknown>>;
  /** Accessible name for the default icon trigger. */
  label?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  children?: ReactNode;
}

/**
 * Menu of related actions behind one control: row actions, overflow, secondary operations.
 * Keyboard: Enter/Space/ArrowDown opens, arrows move, Home/End jump, typeahead, Escape closes and returns focus to the trigger.
 */
export function ActionMenu({ entries, trigger, label = 'More actions', align = 'end', side = 'bottom', className }: ActionMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger ?? <IconButton label={label} icon="more-horizontal" />} />
      <Menu.Portal>
        <Menu.Positioner side={side} align={align} sideOffset={6} collisionPadding={8} className={positionerStyles}>
          <Menu.Popup className={cn(popupSurface, 'min-w-[200px] max-h-[var(--available-height)] overflow-auto', className)}>
            <MenuEntries entries={entries} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export interface DropdownButtonProps extends Omit<ButtonProps, 'onClick' | 'trailingIcon'> {
  entries: MenuEntry[];
  align?: 'start' | 'center' | 'end';
}
/** A labelled button that opens a menu. Use when the menu IS the action ("Add", "Export"), not an extra. */
export function DropdownButton({ entries, align = 'start', children, ...button }: DropdownButtonProps) {
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button {...button} trailingIcon="arrow-down-01" />}>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={6} collisionPadding={8} className={positionerStyles}>
          <Menu.Popup className={cn(popupSurface, 'min-w-[200px] max-h-[var(--available-height)] overflow-auto')}>
            <MenuEntries entries={entries} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
