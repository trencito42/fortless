import type { ReactNode } from 'react';
import { ContextMenu as BaseContext } from '@base-ui/react/context-menu';
import { cn } from '@/lib/utils/cn';
import { popupSurface, positionerStyles } from '../overlays/popup-styles';
import { MenuEntries } from './MenuItems';
import type { MenuEntry } from './menu-types';

/**
 * Right-click or long-press menu. Always mirror these actions somewhere visible (row action menu or toolbar):
 * context menus are a shortcut, not the only way to reach an action.
 */
export function ContextMenu({ entries, children, className }: { entries: MenuEntry[]; children: ReactNode; className?: string }) {
  return (
    <BaseContext.Root>
      <BaseContext.Trigger className={className}>{children}</BaseContext.Trigger>
      <BaseContext.Portal>
        <BaseContext.Positioner className={positionerStyles}>
          <BaseContext.Popup className={cn(popupSurface, 'min-w-[200px]')}>
            <MenuEntries entries={entries} parts={BaseContext} />
          </BaseContext.Popup>
        </BaseContext.Positioner>
      </BaseContext.Portal>
    </BaseContext.Root>
  );
}
