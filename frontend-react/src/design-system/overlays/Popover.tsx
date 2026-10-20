import type { ReactElement, ReactNode } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { PreviewCard } from '@base-ui/react/preview-card';
import { cn } from '@/lib/utils/cn';
import { popupSurface, positionerStyles } from './popup-styles';

export interface PopoverProps {
  trigger: ReactElement<Record<string, unknown>>;
  title?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Controlled mode, for popovers that close themselves after a choice. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
/** Anchored panel with interactive content (filters, quick edits). Focus moves in on open and returns on close. */
export function Popover({ trigger, title, children, side = 'bottom', align = 'start', className, open, onOpenChange }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={8} collisionPadding={8} className={positionerStyles}>
          <BasePopover.Popup className={cn(popupSurface, 'w-[min(360px,calc(100vw-16px))] max-h-[var(--available-height)] overflow-auto p-4', className)}>
            {title ? <BasePopover.Title className="mb-2 text-base font-extrabold tracking-[-0.03em]">{title}</BasePopover.Title> : null}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** Read-only preview on hover or focus. Touch devices follow the link instead, so never hide required information here. */
export function HoverCard({ trigger, children, className }: { trigger: ReactElement<Record<string, unknown>>; children: ReactNode; className?: string }) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={trigger} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8} collisionPadding={8} className={positionerStyles}>
          <PreviewCard.Popup className={cn(popupSurface, 'w-[min(320px,calc(100vw-16px))] p-4', className)}>{children}</PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
