import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';
import { NavTree, type NavTreeProps } from './NavTree';

export interface MobileNavigationSheetProps extends Omit<NavTreeProps, 'collapsed' | 'touch'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}

/** Full navigation as a bottom sheet for phones. Selecting a destination closes it. */
export function MobileNavigationSheet({ open, onOpenChange, groups, currentId, onNavigate, footer }: MobileNavigationSheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[60] bg-overlay transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <BaseDialog.Popup className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] flex-col rounded-t-xl bg-bg px-3 pt-2 pb-[max(18px,env(safe-area-inset-bottom))] outline-none transition-transform duration-[450ms] ease-[var(--ease)] data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full">
          <BaseDialog.Title className="sr-only">All sections</BaseDialog.Title>
          <div aria-hidden="true" className="mx-auto mt-1 mb-3 h-1.25 w-10 rounded-full bg-s4" />
          <div className="min-h-0 overflow-auto rounded-lg bg-s1 p-2">
            <NavTree groups={groups} currentId={currentId} touch onNavigate={(id) => { onOpenChange(false); onNavigate(id); }} />
          </div>
          {footer ? <div className="px-2 pt-3">{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
